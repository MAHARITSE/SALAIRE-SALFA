// npm install ; node scripts/test-roles.cjs
// Vérifie la séparation stricte des droits d'accès :
// - Administrateur : accès complet à toutes les fonctionnalités (Paie & Congés)
// - Comptable      : accès exclusif aux Permissions & Congés (aucun accès paie ni salaires)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-roles-'));

(async () => {
  try {
    const storage = new Map();
    global.localStorage = {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    };

    const outApp = path.join(tmp, 'app.cjs');
    esbuild.buildSync({
      stdin: {
        contents: `
          export { ongletsAutorisesPourRole, estRoleAdmin } from './src/local/roles';
          export * from './src/api-local';
        `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: outApp,
      loader: { '.png': 'dataurl' },
      logLevel: 'silent',
    });

    const m = require(outApp);

    // 1. Onglets autorisés dans l'interface (Salariés & Saisie + État de paie unifiés en onglet 1)
    assert.deepEqual(
      m.ongletsAutorisesPourRole('Administrateur'),
      ['salaries', 'bulletins', 'rapports', 'conges'],
      "L'Administrateur doit voir les 4 onglets unifiés"
    );
    assert.deepEqual(
      m.ongletsAutorisesPourRole('Comptable'),
      ['conges'],
      'Le Comptable ne doit voir que Permissions & Congés'
    );

    // 2. Connexion en tant que Comptable
    const userComptable = await m.apiLogin('comptable', 'comptable123');
    assert.ok(userComptable);
    assert.equal(userComptable.role, 'Comptable');

    // Le Comptable récupère les salariés pour les fiches d'absence MAIS sans aucun salaire ni RIB
    const empsComptable = await m.fetchEmployes(false, '');
    assert.ok(empsComptable.length >= 46);
    const emp1Comptable = empsComptable.find((e) => e.numero_matricule === 1);
    assert.equal(emp1Comptable.nom_prenoms, 'TSIAMBANY JOELSON');
    assert.equal(emp1Comptable.base_aj, 0, 'Le salaire de base ne doit pas être exposé au Comptable');
    assert.equal(emp1Comptable.rib, '', 'Le RIB ne doit pas être exposé au Comptable');

    // Toutes les fonctionnalités de Paie / Gestion salariale sont refusées au Comptable
    const appelsInterdits = [
      () => m.fetchPaiesMois(2026, 'OCTOBRE'),
      () => m.fetchEmployePaies(emp1Comptable.id),
      () => m.createEmploye({ numero_matricule: 999, nom_prenoms: 'TEST' }),
      () => m.updateEmploye(emp1Comptable.id, { numero_matricule: 1, nom_prenoms: 'TEST' }),
      () => m.toggleActifEmploye(emp1Comptable.id, false),
      () => m.initPaieEmploye(emp1Comptable.id, 2026, 'NOVEMBRE'),
      () => m.initMoisPaie(2026, 'NOVEMBRE'),
      () => m.savePaieSaisie(1, 10000, 0),
      () => m.savePaieReglement(1, 'virement', 100000),
      () => m.cloturerMois(2026, 'OCTOBRE'),
      () => m.deverrouillerMois(2026, 'OCTOBRE', 'Comptable'),
      () => m.fetchComparaison(2026, 'OCTOBRE', 'SEPTEMBRE', false),
      () => m.fetchPeriodes(),
      () => m.fetchAnneesBase('paie'),
      () => m.enregistrerSaisieLot(2026, 'OCTOBRE', []),
      () => m.importerClasseur({ employes: [], paies: [], feuillesReconnues: [], feuillesIgnorees: [], periodes: [], avertissements: [] }, { mode: 'fusion', importPaies: false, ecraserPaies: false }),
      () => m.fetchUtilisateurs(),
      () => m.creerUtilisateur({ username: 'hacker', nom_complet: 'H', role: 'Administrateur', password: 'abcd' }),
      () => m.changerMotDePasseUtilisateur(1, 'nouveau'),
      () => m.toggleActifUtilisateur(1, false),
      () => m.supprimerUtilisateur(1),
    ];

    for (const appel of appelsInterdits) {
      await assert.rejects(appel, /Accès refusé/, 'Toute API de paie doit être refusée au Comptable');
    }

    // Toutes les fonctionnalités de Permissions & Congés restent accessibles au Comptable
    const anneesCongesComptable = await m.fetchAnneesBase('conges');
    assert.ok(anneesCongesComptable.includes(2026) && !anneesCongesComptable.includes(2000), 'fetchAnneesBase(conges) retourne uniquement les années utilisées dans la base');
    const situation = await m.fetchSituationConges(2026, false);
    assert.ok(situation.length >= 46);
    const etat = await m.fetchEtatConges(2026);
    assert.deepEqual(etat.annees, [2024, 2025, 2026]);
    assert.ok(etat.parcours.length >= 46);
    const jours = await m.calculerJoursAbsence('2026-10-12', '2026-10-14');
    assert.equal(jours, 3);
    assert.equal(await m.calculerJoursAbsence('2026-06-05', '2026-06-05'), 1);
    assert.equal(await m.calculerJoursAbsence('2026-06-05', '2026-06-06'), 2);

    const metaComptable = { utilisateur: userComptable.nom_complet, role: userComptable.role };
    const cr = await m.creerConge(
      {
        employe_id: emp1Comptable.id,
        categorie: 'PERMISSION',
        motif_code: 'Tera-bady',
        date_debut: '2026-11-02',
        date_fin: '2026-11-04',
        jours_demandes: 2,
      },
      metaComptable
    );
    assert.equal(cr.success, true);

    const suppr = await m.supprimerConge(cr.id, metaComptable);
    assert.equal(suppr.success, true);

    // 3. Déconnexion puis connexion en tant qu'Administrateur -> accès complet rétabli
    m.apiLogoutLocal();
    const userAdmin = await m.apiLogin('admin', 'admin123');
    assert.ok(userAdmin);
    assert.equal(userAdmin.role, 'Administrateur');

    const empsAdmin = await m.fetchEmployes(false, '');
    assert.equal(empsAdmin.find((e) => e.numero_matricule === 1).base_aj, 271600);

    const paiesAdmin = await m.fetchPaiesMois(2026, 'OCTOBRE');
    assert.ok(paiesAdmin.employes.length >= 46);
    const periodesAdmin = await m.fetchPeriodes();
    assert.ok(periodesAdmin.length >= 10);

    // 4. Saisie directe de VIREMENT & ESPÈCES (changement ou répartition de mode de paiement)
    const pMat1 = paiesAdmin.employes.find((p) => p.numero_matricule === 1);
    assert.ok(pMat1);
    const netOrig = pMat1.net;
    // Répartition partielle : 150 000 Ar en virement, reste en espèces
    const rSplit = await m.savePaieReglement(pMat1.id, 'virement', 150000);
    assert.equal(rSplit.success, true);
    assert.equal(rSplit.updated.virement, 150000);
    assert.equal(Math.round((rSplit.updated.virement + rSplit.updated.especes) * 100), Math.round(netOrig * 100));

    // Conservation du mode/répartition personnalisé lors d'une modification d'AVANCE
    const rAv = await m.savePaieSaisie(pMat1.id, pMat1.avance + 10000, pMat1.med);
    assert.equal(rAv.success, true);
    assert.ok(rAv.updated.virement > 0 && rAv.updated.especes > 0);
    assert.equal(rAv.updated.especes, rSplit.updated.especes);
    assert.equal(Math.round((rAv.updated.virement + rAv.updated.especes) * 100), Math.round(rAv.updated.net * 100));

    // Passage intégral en ESPECES (virement = 0)
    const rFullEsp = await m.savePaieReglement(pMat1.id, 'virement', 0);
    assert.equal(rFullEsp.success, true);
    assert.equal(rFullEsp.updated.virement, 0);
    assert.equal(rFullEsp.updated.especes, rFullEsp.updated.net);

    // 5. Gestion des utilisateurs et changement de mot de passe (réservé à l'Administrateur)
    const usersInit = await m.fetchUtilisateurs();
    assert.equal(usersInit.length, 2);

    // Impossible de supprimer ou désactiver son propre compte en cours de session
    const selfDel = await m.supprimerUtilisateur(userAdmin.id);
    assert.equal(selfDel.success, false);
    const selfDis = await m.toggleActifUtilisateur(userAdmin.id, false);
    assert.equal(selfDis.success, false);

    // Création d'un nouvel utilisateur Comptable
    const addRes = await m.creerUtilisateur({
      username: 'comptable2',
      nom_complet: 'Deuxième Comptable SALFA',
      role: 'Comptable',
      password: 'secret2026',
    });
    assert.equal(addRes.success, true);
    assert.equal(addRes.user.username, 'comptable2');

    // Apparaît dans la liste publique de connexion SANS mot de passe affiché
    const publics = await m.fetchComptesConnexion();
    const pubC2 = publics.find((c) => c.username === 'comptable2');
    assert.ok(pubC2);
    assert.equal(pubC2.motDePasseDemo, undefined);

    // Changement de mot de passe de comptable2 par l'Administrateur
    const pwdRes = await m.changerMotDePasseUtilisateur(addRes.user.id, 'nouveauPass99');
    assert.equal(pwdRes.success, true);

    // Test de connexion avec l'ancien mot de passe (échec) puis le nouveau (succès)
    m.apiLogoutLocal();
    const badLogin = await m.apiLogin('comptable2', 'secret2026');
    assert.equal(badLogin, null);
    const okLogin = await m.apiLogin('comptable2', 'nouveauPass99');
    assert.ok(okLogin);
    assert.equal(okLogin.role, 'Comptable');

    // Retour Admin et suppression du compte de test
    m.apiLogoutLocal();
    await m.apiLogin('admin', 'admin123');
    const delC2 = await m.supprimerUtilisateur(addRes.user.id);
    assert.equal(delC2.success, true);

    // 6. Personnes inactives : mise en inactif via modification fiche salarié + date_inactif + Administration
    const tousInit = await m.fetchEmployes(false, '');
    const mat4 = tousInit.find((e) => e.numero_matricule === 4);
    const mat42 = tousInit.find((e) => e.numero_matricule === 42);
    assert.equal(mat4.actif, 0);
    assert.equal(mat4.date_inactif, '2026-08-01');
    assert.equal(mat42.actif, 0);
    assert.equal(mat42.date_inactif, '2026-06-01');

    // Mise en inactif d'un salarié actif via updateEmploye (modale de modification)
    const empActif = tousInit.find((e) => e.numero_matricule === 1);
    const okInact = await m.updateEmploye(empActif.id, {
      ...empActif,
      actif: 0,
      date_inactif: '2026-10-15',
    });
    assert.equal(okInact, true);
    const apresInact = (await m.fetchEmployes(false, '')).find((e) => e.id === empActif.id);
    assert.equal(apresInact.actif, 0);
    assert.equal(apresInact.date_inactif, '2026-10-15');
    // Son bulletin du mois ouvert OCTOBRE 2026 est retiré automatiquement
    const paiesOctApres = await m.fetchPaiesMois(2026, 'OCTOBRE');
    assert.equal(paiesOctApres.employes.some((p) => p.employe_id === empActif.id), false);

    // Réactivation depuis Administration -> Personnes inactives
    const okReact = await m.toggleActifEmploye(empActif.id, true);
    assert.equal(okReact, true);
    const apresReact = (await m.fetchEmployes(false, '')).find((e) => e.id === empActif.id);
    assert.equal(apresReact.actif, 1);
    assert.equal(apresReact.date_inactif, '');

    // Vérification Années de la base + Ajout d'année + Barre des 12 mois sans l'année
    const anneesPaieInit = await m.fetchAnneesBase('paie');
    assert.deepEqual(anneesPaieInit, [2026], 'Seules les années présentes dans la base de paie sont proposées par défaut');
    assert.equal((await m.ajouterAnneeBase(1800)).success, false, 'Année hors bornes refusée');
    const resAjout2027 = await m.ajouterAnneeBase(2027);
    assert.equal(resAjout2027.success, true, 'Ajout de l’année 2027 accepté');
    assert.deepEqual(await m.fetchAnneesBase('paie'), [2026, 2027], 'L’année 2027 ajoutée apparaît immédiatement dans les années de la base');

    // =========================================================================
    // TEST SUITE CHRONOLOGIQUE DE L'ÉTAT (Ouvrir / Initialiser le mois)
    // =========================================================================
    // Dernier état initialisé = OCTOBRE 2026 -> prochain chronologique = NOVEMBRE 2026
    const suiteAvantDec = await m.fetchSuiteChronologiquePaie(2026, 'DECEMBRE');
    assert.equal(suiteAvantDec.peutOuvrirCible, false, 'DECEMBRE 2026 ne peut pas être ouvert avant NOVEMBRE 2026');
    assert.deepEqual(suiteAvantDec.dernierMoisEtat, { annee: 2026, mois: 'OCTOBRE' });
    assert.deepEqual(suiteAvantDec.prochainMoisChronologique, { annee: 2026, mois: 'NOVEMBRE' });

    const sautDecInterdit = await m.initMoisPaie(2026, 'DECEMBRE');
    assert.equal(sautDecInterdit.success, false, 'Saut chronologique refusé (DECEMBRE 2026 avant NOVEMBRE 2026)');
    assert.equal(sautDecInterdit.code, 'HORS_SUITE_CHRONOLOGIQUE');
    assert.equal(sautDecInterdit.prochainMois, 'NOVEMBRE');
    assert.equal(sautDecInterdit.prochaineAnnee, 2026);
    assert.equal((await m.fetchPaiesMois(2026, 'DECEMBRE')).employes.length, 0, 'Aucun bulletin créé hors suite chronologique');

    const sautJanInterdit = await m.initMoisPaie(2027, 'JANVIER');
    assert.equal(sautJanInterdit.success, false, 'Saut chronologique refusé (JANVIER 2027 avant NOVEMBRE & DECEMBRE 2026)');

    // Ouverture chronologique : NOVEMBRE 2026 -> DECEMBRE 2026 -> JANVIER 2027, puis refus de MARS 2027 avant FEVRIER 2027
    const initNov2026 = await m.initMoisPaie(2026, 'NOVEMBRE');
    assert.equal(initNov2026.success, true, 'NOVEMBRE 2026 s’ouvre juste après OCTOBRE 2026');
    assert.ok(initNov2026.initializedCount > 0);

    const initDec2026 = await m.initMoisPaie(2026, 'DECEMBRE');
    assert.equal(initDec2026.success, true, 'DECEMBRE 2026 s’ouvre juste après NOVEMBRE 2026');
    assert.ok(initDec2026.initializedCount > 0);

    const initJan2027 = await m.initMoisPaie(2027, 'JANVIER');
    assert.equal(initJan2027.success, true, 'JANVIER 2027 s’ouvre juste après DECEMBRE 2026');
    assert.ok(initJan2027.initializedCount > 0);

    const sautMars2027 = await m.initMoisPaie(2027, 'MARS');
    assert.equal(sautMars2027.success, false, 'MARS 2027 refusé tant que FEVRIER 2027 n’est pas ouvert');
    assert.equal(sautMars2027.prochainMois, 'FEVRIER');
    assert.equal(sautMars2027.prochaineAnnee, 2027);

    // =========================================================================
    // TEST FUSION DE DOUBLONS SALARIÉS (cas réel Mat 54 vs Mat 61 LUCIENNE RAZAFITENDRY MICHELINE)
    // =========================================================================
    const tousEmpsAvant = await m.fetchEmployes(false);
    const emp54 = tousEmpsAvant.find((e) => Number(e.numero_matricule) === 54);
    assert.ok(emp54, 'Mat 54 LUCIENNE RAZAFITENDRY MICHELINE présent');

    // Créer le doublon Mat 61 (même nom & même CNaPS 992413003084, sans RIB, avec AOUT 2024 clôturé + NOVEMBRE 2026 en doublon)
    const okCreate61 = await m.createEmploye({
      numero_matricule: 6100,
      nom_prenoms: emp54.nom_prenoms,
      numero_cnaps: emp54.numero_cnaps,
      categorie: emp54.categorie,
      jobs: emp54.jobs,
      date_embauche: emp54.date_embauche,
      base_aj: emp54.base_aj,
      logement_transport: emp54.logement_transport,
      rendement: emp54.rendement,
      responsabilite_representation: 0,
      rib: '',
      mode_paiement: 'ESPECES',
      actif: 1,
    });
    assert.equal(okCreate61, true, 'Création du doublon test réussie');
    const emp61 = (await m.fetchEmployes(false)).find((e) => Number(e.numero_matricule) === 6100);
    assert.ok(emp61);

    // Ajouter sur le doublon : un bulletin historique exclusif (AOUT 2024 clôturé) + un bulletin en collision (NOVEMBRE 2026 ouvert) + un congé 2024
    await m.initPaieEmploye(emp61.id, 2024, 'AOUT');
    await m.cloturerMois(2024, 'AOUT', true);
    await m.initPaieEmploye(emp61.id, 2026, 'NOVEMBRE');
    const paieNov61 = (await m.fetchPaiesMois(2026, 'NOVEMBRE')).employes.find((p) => p.employe_id === emp61.id);
    assert.ok(paieNov61);
    await m.savePaieSaisie(paieNov61.id, 25000, 0);
    await m.creerConge({
      employe_id: emp61.id,
      categorie: 'CONGE',
      motif_code: 'CONGE_ANNUEL',
      date_debut: '2024-08-05',
      date_fin: '2024-08-08',
      jours_demandes: 4,
      statut: 'VALIDE',
    });

    // Détection automatique : Mat 54 (avec RIB et plus de bulletins) est suggéré comme fiche principale à conserver
    const groupesDbl = await m.fetchDoublonsEmployes();
    const grpLucienne = groupesDbl.find(
      (g) =>
        Number(g.cibleSuggeree.employe.id) === Number(emp54.id) &&
        g.doublons.some((d) => Number(d.employe.id) === Number(emp61.id))
    );
    assert.ok(grpLucienne, 'Le doublon LUCIENNE RAZAFITENDRY MICHELINE est détecté automatiquement avec Mat 54 comme cible suggérée');

    const apercu = await m.apercevoirFusionEmployes(emp54.id, emp61.id);
    assert.ok(apercu);
    assert.deepEqual(apercu.periodesTransferees, ['AOUT 2024']);
    assert.equal(apercu.periodesEnDoublon.some((d) => d.periode === 'NOVEMBRE 2026' && d.avanceSource === 25000), true);

    // Un Comptable ne doit pas pouvoir fusionner de salariés
    const sessionComptableTmp = await m.apiLogin('comptable', 'comptable123');
    assert.ok(sessionComptableTmp);
    await assert.rejects(() => m.fusionnerEmployes(emp54.id, emp61.id), /Accès refusé/);
    await m.apiLogin('admin', 'admin123');

    // Exécuter la fusion (avec cumul de l'avance du mois ouvert NOVEMBRE 2026)
    const resFusion = await m.fusionnerEmployes(emp54.id, emp61.id, { cumulerRetenuesMoisOuverts: true });
    assert.equal(resFusion.success, true, 'La fusion de Mat 6100 dans Mat 54 réussit');
    assert.equal(resFusion.paiesTransferees, 1, 'AOUT 2024 transféré vers Mat 54');
    assert.equal(resFusion.paiesDoublonsSupprimees, 1, 'Doublon NOVEMBRE 2026 supprimé');
    assert.ok(resFusion.congesTransferes >= 1, 'Congé rattaché à Mat 54');

    // Vérifier qu'il ne reste plus qu'une seule fiche (Mat 54) avec AOUT 2024 verrouillé + NOVEMBRE 2026 dédoublonné
    assert.equal((await m.fetchEmployes(false)).some((e) => Number(e.id) === Number(emp61.id)), false, 'La fiche doublon a été supprimée');
    const hist54 = await m.fetchEmployePaies(emp54.id);
    const aout2024Rattache = hist54.find((p) => p.annee === 2024 && p.mois === 'AOUT');
    assert.ok(aout2024Rattache && Number(aout2024Rattache.verrouille) === 1, 'AOUT 2024 clôturé est rattaché intact à Mat 54');
    const nov2026Apres = (await m.fetchPaiesMois(2026, 'NOVEMBRE')).employes.filter(
      (p) => p.nom_prenoms === emp54.nom_prenoms
    );
    assert.equal(nov2026Apres.length, 1, 'Un seul bulletin subsiste sur NOVEMBRE 2026 après fusion');
    assert.ok(Number(nov2026Apres[0].avance) >= 25000, 'L’avance saisie sur le doublon ouvert a été reportée sur Mat 54');

    // Vérification de non-régression UI
    const srcTab = fs.readFileSync(path.join(process.cwd(), 'src/components/tabs/SalariesSaisieTab.tsx'), 'utf8');
    assert.equal(srcTab.includes('Vue synthèse'), false, 'Le bouton Vue synthèse doit être supprimé');
    assert.equal(srcTab.includes('Salariés sans bulletin sur'), false, 'La section Salariés sans bulletin doit être supprimée');
    assert.equal(srcTab.includes('FusionEmployesModal'), true, 'La modale de fusion salariés est branchée dans SalariesSaisieTab');
    assert.equal(srcTab.includes('fetchSuiteChronologiquePaie'), true, 'La suite chronologique est branchée dans SalariesSaisieTab');
    const blocMois = srcTab.slice(srcTab.indexOf('Mois initialisés :'), srcTab.indexOf('EtatImpression'));
    assert.equal(blocMois.includes('{p.mois} {p.annee}'), false, 'Mois initialisés ne doit plus afficher l’année sur chaque bouton');
    assert.equal(blocMois.includes('periodes.map'), false, 'Mois initialisés ne boucle plus sur toutes les années mélangées');
    assert.equal(blocMois.includes('MOIS_LISTE.map((m) =>'), true, 'Mois initialisés affiche uniquement les 12 mois de l’année filtrés sur Période');
    const srcYear = fs.readFileSync(path.join(process.cwd(), 'src/components/YearSelect.tsx'), 'utf8');
    assert.equal(srcYear.includes('fetchAnneesBase'), true, 'YearSelect charge uniquement les années utilisées dans la base');
    assert.equal(srcYear.includes('ajouterAnneeBase'), true, 'YearSelect intègre le bouton d’ajout d’année');
    const srcForm = fs.readFileSync(path.join(process.cwd(), 'src/components/EmployeModalForm.tsx'), 'utf8');
    assert.equal(srcForm.includes('Rendre cette personne inactive'), true);
    assert.equal(srcForm.includes('Date de mise en inactif'), true);
    assert.equal(srcForm.includes('>Base<'), true, 'EmployeModalForm affiche Base au lieu de BASE AJ');
    assert.equal(srcForm.includes('BASE AJ'), false, 'Aucun libellé BASE AJ restant dans EmployeModalForm');
    assert.equal(srcTab.includes("label: 'Base'"), true, 'Colonne Base dans SalariesSaisieTab');
    assert.equal(srcTab.includes('BASE AJ'), false, 'Aucun libellé BASE AJ dans SalariesSaisieTab');
    assert.equal(srcTab.includes("key: 'rap'") || srcTab.includes("label: 'RAP'"), false, 'Colonne RAP supprimée de SalariesSaisieTab');
    assert.equal(srcTab.includes('selectedPaieId') && srcTab.includes('aria-selected={isSelected}'), true, 'Sélection remarquable au clic sur une ligne du tableau salaire');
    const srcRapports = fs.readFileSync(path.join(process.cwd(), 'src/components/tabs/RapportsTab.tsx'), 'utf8');
    assert.equal(srcRapports.includes('>Base<') && srcRapports.includes('"Base"'), true, 'Colonne Base dans RapportsTab');
    assert.equal(srcRapports.includes('BASE AJ') || srcRapports.includes('"RAP"') || srcRapports.includes('p.rap'), false, 'Aucun BASE AJ ni RAP dans RapportsTab');
    assert.equal('rap' in nov2026Apres[0], false, 'Les nouveaux bulletins initialisés ne portent plus le champ rap');
    assert.ok(nov2026Apres[0].virement !== undefined && nov2026Apres[0].especes !== undefined, 'Virement et espèces restent calculés normalement');
    const srcApp = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.equal(srcApp.includes('Personnes inactives'), true);
    assert.equal(srcApp.includes('InactifsModal'), true);

    // Non-régression : modification d'un salarié (nom, catégorie ajoutée, fonction, salaire) propagée à la base et à l'interface
    const empModTest = (await m.fetchEmployes(true)).find((e) => Number(e.id) === Number(emp54.id));
    assert.ok(empModTest, 'Salarié Mat 54 présent pour le test de modification');
    const paieClotureeAvant = (await m.fetchEmployePaies(empModTest.id)).find((p) => Number(p.verrouille) === 1);
    const paieOuverteAvant = (await m.fetchPaiesMois(2026, 'NOVEMBRE')).employes.find((p) => Number(p.employe_id) === Number(empModTest.id));
    assert.ok(paieOuverteAvant, 'Bulletin ouvert NOVEMBRE 2026 présent avant modification');
    const avanceAvantMod = Number(paieOuverteAvant.avance || 0);
    const netClotureAvant = paieClotureeAvant ? Number(paieClotureeAvant.net || 0) : null;

    const okUpdateEmp = await m.updateEmploye(
      empModTest.id,
      {
        ...empModTest,
        nom_prenoms: 'LUCIENNE RAZAFITENDRY MODIFIEE',
        categorie: 'CAT-TEST-5A',
        jobs: 'INFIRMIERE MAJOR',
        numero_cnaps: '999888777001',
        base_aj: Number(empModTest.base_aj || 300000) + 50000,
      },
      { annee: 2026, mois: 'NOVEMBRE' }
    );
    assert.equal(okUpdateEmp, true, 'updateEmploye enregistre les modifications');

    // 1) Fiche salarié mise à jour en base (salfa_employes)
    const empModApres = (await m.fetchEmployes(false)).find((e) => Number(e.id) === Number(empModTest.id));
    assert.equal(empModApres.nom_prenoms, 'LUCIENNE RAZAFITENDRY MODIFIEE');
    assert.equal(empModApres.categorie, 'CAT-TEST-5A');
    assert.equal(empModApres.jobs, 'INFIRMIERE MAJOR');
    assert.equal(empModApres.numero_cnaps, '999888777001');

    // 2) État de paie & Bulletins du mois ouvert mis à jour immédiatement (nom + catégorie + recalcul salarial en préservant l'avance)
    const paieOuverteApres = (await m.fetchPaiesMois(2026, 'NOVEMBRE')).employes.find((p) => Number(p.employe_id) === Number(empModTest.id));
    assert.equal(paieOuverteApres.nom_prenoms, 'LUCIENNE RAZAFITENDRY MODIFIEE', 'Nom mis à jour sur le tableau salaire');
    assert.equal(paieOuverteApres.categorie, 'CAT-TEST-5A', 'Catégorie ajoutée visible immédiatement sur le tableau salaire et le bulletin');
    assert.equal(paieOuverteApres.jobs, 'INFIRMIERE MAJOR', 'Fonction mise à jour sur le tableau salaire');
    assert.equal(paieOuverteApres.numero_cnaps, '999888777001', 'N° CNaPS mis à jour sur le bulletin');
    assert.equal(Number(paieOuverteApres.base_aj), Number(empModTest.base_aj || 300000) + 50000, 'Salaire de base recalculé sur le mois ouvert');
    assert.equal(Number(paieOuverteApres.avance), avanceAvantMod, 'L’avance saisie du mois ouvert est préservée');

    // 3) Mois clôturés : identité / catégorie synchronisée sans jamais altérer le net clôturé
    if (paieClotureeAvant) {
      const paieClotureeApres = (await m.fetchEmployePaies(empModTest.id)).find((p) => Number(p.id) === Number(paieClotureeAvant.id));
      assert.equal(paieClotureeApres.nom_prenoms, 'LUCIENNE RAZAFITENDRY MODIFIEE');
      assert.equal(paieClotureeApres.categorie, 'CAT-TEST-5A');
      assert.equal(Number(paieClotureeApres.net), netClotureAvant, 'Le net du mois clôturé reste strictement figé');
    }

    // 4) Congés & Permissions : nom et fonction mis à jour sans jamais altérer conge.categorie (CONGE / PERMISSION)
    const congesEmpApres = (await m.fetchConges({})).filter((c) => Number(c.employe_id) === Number(empModTest.id));
    assert.ok(congesEmpApres.length >= 1);
    assert.equal(congesEmpApres.every((c) => c.nom_prenoms === 'LUCIENNE RAZAFITENDRY MODIFIEE'), true, 'Nom propagé aux congés');
    assert.equal(
      congesEmpApres.every((c) => ['CONGE', 'PERMISSION', 'EXAMEN', 'AJUSTEMENT'].includes(c.categorie)),
      true,
      'Le type de congé (conge.categorie) n’est jamais écrasé par la classification salarié'
    );

    m.apiLogoutLocal();
    console.log('Contrôle des droits Administrateur (accès complet) vs Comptable (Permissions & Congés uniquement) : OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
