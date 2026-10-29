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

    // Vérification de non-régression UI
    const srcTab = fs.readFileSync(path.join(process.cwd(), 'src/components/tabs/SalariesSaisieTab.tsx'), 'utf8');
    assert.equal(srcTab.includes('Vue synthèse'), false, 'Le bouton Vue synthèse doit être supprimé');
    assert.equal(srcTab.includes('Salariés sans bulletin sur'), false, 'La section Salariés sans bulletin doit être supprimée');
    const srcForm = fs.readFileSync(path.join(process.cwd(), 'src/components/EmployeModalForm.tsx'), 'utf8');
    assert.equal(srcForm.includes('Rendre cette personne inactive'), true);
    assert.equal(srcForm.includes('Date de mise en inactif'), true);
    const srcApp = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.equal(srcApp.includes('Personnes inactives'), true);
    assert.equal(srcApp.includes('InactifsModal'), true);

    m.apiLogoutLocal();
    console.log('Contrôle des droits Administrateur (accès complet) vs Comptable (Permissions & Congés uniquement) : OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
