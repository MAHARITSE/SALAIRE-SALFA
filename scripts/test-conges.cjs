// Test du module Congés & Permissions : droits de la FICHE D'ABSENCE, soldes
// en cascade du CONTRÔLE DES CONGÉS, circuit de visas et import Excel.
// npm install ; node scripts/test-conges.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const XLSX = require('xlsx');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-conges-'));
function bundle(source, name) {
  const outfile = path.join(tmp, name + '.cjs');
  esbuild.buildSync({ entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.png': 'dataurl' }, logLevel: 'silent' });
  return require(outfile);
}

// ------------------------------------------------------------------------------
// 1. Moteur pur : droits, jours ouvrables, solde en cascade, présentation
// ------------------------------------------------------------------------------
const C = bundle('src/local/conges.ts', 'conges');

const cfg = C.DEFAULT_CONGES_CONFIG;
assert.equal(cfg.joursCongeParAn, 30, 'congés : 30 andro isan-taona');
assert.equal(cfg.plafondCumulConge, 90, 'cumul maximal de 90 jours');
assert.equal(cfg.joursPermissionParAn, 10, 'permission : 10 andro isan-taona');

// Le référentiel reprend la fiche d'absence, ligne par ligne.
const table = {
  'Tera-bady': 3, 'Didim-poitra zanaka': 1, 'Fanambadiana mpiasa': 3,
  'Fanambadiana zanaka': 2, 'Fanambadiana iray tampo': 1,
  'Hopitaly vady': 3, 'Hopitaly zanaka': 3, 'Hopitaly RAD niteraka': 3,
  'Hopitaly rafozana': 3, 'Hopitaly iray tampo': 1,
  'Fahafatesana vady': 3, 'Fahafatesana zanaka': 3, 'Fahafatesana RAD niteraka': 3,
  'Fahafatesana rafozana': 3, 'Fahafatesana iray tampo': 3,
};
for (const [code, jours] of Object.entries(table)) {
  const motif = C.trouverMotif(code);
  assert.ok(motif, `motif ${code} prévu par la fiche`);
  assert.equal(motif.jours, jours, `motif ${code} : ${jours} jour(s)`);
  assert.equal(motif.categorie, 'PERMISSION');
}
for (const code of ['Consultation medicale', 'Dentaire', 'Pre-natale']) {
  const motif = C.trouverMotif(code);
  assert.ok(motif && motif.categorie === 'EXAMEN_MEDICAL', `examen ${code}`);
  assert.equal(motif.avisMedecin, true, `examen ${code} : visa du médecin`);
}
assert.equal(C.MOTIFS_ABSENCE.filter((m) => m.categorie === 'PERMISSION').length, 15, 'quinze motifs de permission');
assert.match(C.trouverMotif('Didim-poitra zanaka').libelleFr, /Circoncision/i, 'didim-poitra = circoncision');
assert.match(C.trouverMotif('Hopitaly RAD niteraka').libelleFr, /père ou de la mère/i, 'RAD niteraka = parents');
assert.match(C.trouverMotif('Fahafatesana rafozana').libelleFr, /beau-parent/i, 'rafozana = beau-parent');
assert.ok(C.aBesoinMedecin({ categorie: 'PERMISSION', motif_code: 'Hopitaly zanaka' }), 'hospitalisation : avis médecin');
assert.ok(!C.aBesoinMedecin({ categorie: 'PERMISSION', motif_code: 'Tera-bady' }), 'tera-bady : pas de médecin');
assert.equal(C.calculerDateFin('2026-06-05', 1, cfg), '2026-06-05', '05/06/2026 pour 1 congé -> fin demandée 05/06/2026');
assert.equal(C.calculerDateRetour('2026-06-05', 1, cfg), '2026-06-06', '05/06/2026 au 05/06/2026 -> Daty fiverenana miasa 06/06/2026');
assert.equal(C.calculerDateFin('2026-06-05', 2, cfg), '2026-06-06', '05/06/2026 pour 2 congés -> fin demandée 06/06/2026');
assert.equal(C.calculerDateRetour('2026-06-05', 2, cfg), '2026-06-07', '05/06/2026 au 06/06/2026 -> Daty fiverenana miasa 07/06/2026');
assert.equal(C.calculerDateFin('2026-11-02', 3, cfg), '2026-11-04', '02/11 au 04/11 = 3 jours');
assert.equal(C.calculerDateRetour('2026-11-02', 3, cfg), '2026-11-05', 'date de reprise le lendemain de la fin demandée');
assert.deepEqual(C.decomposerTitreActif(85, 2026, 30, 2022), { titreActif: 2024, resteTitreActif: 25 }, 'décomposition FIFO SALFA par Titre/Année');

// Période incluse Du … au … : 05/06 au 05/06 = 1 j, 05/06 au 06/06 = 2 j, options dimanche/samedi/férié respectées.
assert.equal(C.joursDemandesPour({ date_debut: '2026-06-05', date_fin: '2026-06-05' }, cfg), 1, '05/06/2026 au 05/06/2026 = 1 congé');
assert.equal(C.joursDemandesPour({ date_debut: '2026-06-05', date_fin: '2026-06-06' }, cfg), 2, '05/06/2026 au 06/06/2026 = 2 congés');
assert.equal(C.compterJoursOuvrables('2026-01-05', '2026-01-08', { exclureDimanche: true, exclureSamedi: false, feries: new Set() }), 4, 'lun→jeu inclus = 4 j');
assert.equal(C.compterJoursOuvrables('2026-01-05', '2026-01-11', { exclureDimanche: true, exclureSamedi: false, feries: new Set() }), 6, 'un dimanche traversé est ignoré si exclureDimanche');
assert.equal(C.compterJoursOuvrables('2026-01-05', '', { exclureDimanche: true, exclureSamedi: false, feries: new Set() }), 1, 'une journée sans date de fin');
assert.equal(C.compterJoursOuvrables('2026-01-05', '2026-01-04', { exclureDimanche: true, exclureSamedi: false, feries: new Set() }), 0, 'fin antérieure au départ');
assert.equal(C.compterJoursOuvrables('2026-05-18', '2026-05-19', { exclureDimanche: true, exclureSamedi: true, feries: new Set(['2026-05-19']) }), 1, 'samedi et férié exclus');
assert.equal(C.joursDemandesPour({ date_debut: '2026-01-05', date_fin: '2026-01-18' }, { ...cfg, exclureDimanche: true }), 12, 'deux semaines du lundi au samedi');

// Un salarié, trois exercices, avec report plafonné et dépassement négatif.
const employes = [
  { id: 1, numero_matricule: 1, nom_prenoms: 'RAKOTO Jean', jobs: 'Infirmier', date_embauche: '2020-01-01', actif: 1 },
  { id: 2, numero_matricule: 2, nom_prenoms: 'RASOA Marie', jobs: 'Sage femme', date_embauche: '2024-06-01', actif: 1 },
  { id: 3, numero_matricule: 3, nom_prenoms: 'BEN Ali', jobs: 'Coursier', date_embauche: '1995-01-01', actif: 1 },
];
let compteur = 0;
const fiche = (employeId, annee, debut, jours, extra = {}) => C.normaliserConge({
  id: ++compteur, employe_id: employeId, numero_matricule: employeId, annee,
  date_debut: debut, date_demande: debut, jours_demandes: jours, statut: 'VALIDE', ...extra,
});

const conges = [
  // Salarié 1 : solde vidé en 2024, 15 j en 2025 (reste 15), report + 30 en 2026 = 45
  // intégralement consommés, puis 36 j en 2027 pour 30 : le dépassement est reporté.
  fiche(1, 2024, '2024-05-06', 30),
  fiche(1, 2025, '2025-03-03', 15),
  fiche(1, 2026, '2026-02-02', 45),
  fiche(1, 2027, '2027-01-11', 36),
  // Permissions : 3 puis 2 jours sur 10 en 2026.
  fiche(1, 2026, '2026-04-06', 3, { categorie: 'PERMISSION', motif_code: 'Tera-bady', imputation: 'PERMISSION' }),
  fiche(1, 2026, '2026-05-04', 2, { categorie: 'PERMISSION', motif_code: 'Fahafatesana zanaka', imputation: 'PERMISSION' }),
  // Demande en attente : visible, non déduite.
  fiche(1, 2026, '2026-09-07', 5, { statut: 'SOUMIS' }),
  // Examen médical : jours affichés, aucun droit entamé.
  fiche(1, 2026, '2026-06-01', 1, { categorie: 'EXAMEN_MEDICAL', motif_code: 'Dentaire', imputation: 'AUCUNE' }),
  // Salarié 2 : embauché en 2024, aucune ouverture de droit avant.
  fiche(2, 2024, '2024-09-02', 10),
  // Refusée : jamais comptée.
  fiche(2, 2025, '2025-01-06', 20, { statut: 'REFUSE', motif_refus: 'Service saturé' }),
  // Salarié 3 : rien saisi, solde théorique plafonné.
];

const etat = C.construireEtat(employes, conges, cfg, { annee: 2027, nbAnnees: 4 });
assert.deepEqual(etat.annees, [2024, 2025, 2026, 2027], 'fenêtre de quatre colonnes d’années');
const p1 = etat.parcours.find((p) => p.employe_id === 1);
assert.deepEqual(Object.keys(p1.bilans).map(Number), [2024, 2025, 2026, 2027]);
assert.equal(p1.bilans[2024].ouverture, 30, 'droit de 30 jours en 2024');
assert.equal(p1.bilans[2024].fin, 0, 'tout le droit de 2024 est consommé');
assert.equal(p1.bilans[2025].ouverture, 30, 'sans report, le droit de 2025 repart de 30');
assert.equal(p1.bilans[2025].fin, 15, '15 jours consommés en 2025');
assert.equal(p1.bilans[2026].ouverture, 45, 'report 15 + droit 30');
assert.equal(p1.bilans[2026].pris, 45, '45 jours validés en 2026');
assert.equal(p1.bilans[2026].attente, 5, '5 jours réservés par la demande en attente');
assert.equal(p1.bilans[2026].fin, 0, 'solde épuisé en fin 2026');
assert.equal(p1.bilans[2026].permPris, 5, 'cinq jours de permission consommés');
assert.equal(p1.bilans[2026].permFin, 5, 'reste 5 jours de permission');
assert.equal(p1.bilans[2026].examenPris, 1, 'jour d’examen médical suivi sans décompte');
assert.equal(p1.bilans[2027].ouverture, 30, 'report nul + droit 2027');
assert.equal(p1.bilans[2027].fin, -6, 'trente-six jours consommés sur trente : dépassement');
// Le dépassement de 2027 (45 - 36 = 9, puis un reliquat négatif l'année suivante) se
// retrouve dans l'ouverture de 2028 : report 9 - dépassement, droit 30.
const solde2028 = C.calculerSoldes(employes, [...conges, fiche(1, 2028, '2028-01-10', 15)], cfg, 2028);
assert.equal(solde2028.find((s) => s.employe_id === 1).ouverture, 24, 'report de fin 2027 + droit 2028');

// Le plafond de 90 jours borne le cumul, même sans aucune saisie.
const p3 = etat.parcours.find((p) => p.employe_id === 3);
assert.equal(p3.bilans[2027].ouverture, 90, 'cumul plafonné à 90 jours');

// Le salarié embauché en 2024 n’a aucun droit ouvert avant son entrée.
const p2 = etat.parcours.find((p) => p.employe_id === 2);
assert.equal(p2.bilans[2024].ouverture, 30, 'droit ouvert dès l’année d’entrée');
assert.equal(p2.bilans[2024].fin, 20, '10 jours consommés');
assert.equal(p2.bilans[2025].pris, 0, 'la demande refusée n’est pas déduite');

// Une ligne par demande, solde affiché avant déduction (comme le classeur).
const lignesConge1 = p1.lignes.filter((l) => l.type === 'DEMANDE' && l.annee === 2026 && l.jours_conge > 0);
assert.equal(lignesConge1.length, 2, 'une ligne par demande, y compris celle en attente');
assert.equal(lignesConge1[0].solde_par_annee[2026], 45, 'le classeur porte le solde avant la demande');
assert.equal(lignesConge1[0].jours_conge, 45);
assert.equal(lignesConge1[0].situation, 'Validée');
assert.equal(lignesConge1[1].jours_conge, 5, 'la demande en attente est affichée avec ses jours');
assert.equal(lignesConge1[1].solde_par_annee[2026], 0, 'mais ne déduit pas le solde');
assert.equal(lignesConge1[1].situation, 'En attente');
const permissions2026 = p1.lignes.filter((l) => l.perm_jours > 0);
assert.deepEqual(permissions2026.map((l) => [l.perm_droit, l.perm_jours, l.perm_restant]), [[10, 3, 7], [10, 2, 5]], 'bloc permission : droit, jours, restant');
const soldesFinaux = p1.lignes.filter((l) => l.type === 'SOLDE_FINAL');
assert.equal(soldesFinaux.length, 1, 'une seule ligne de solde par salarié');
assert.deepEqual(soldesFinaux[0].solde_par_annee, { 2024: 0, 2025: 15, 2026: 0, 2027: -6 }, 'le solde de fin de chaque année');
assert.equal(p2.lignes.filter((l) => l.type === 'SOLDE_FINAL')[0].motif.includes('aucune demande'), false);
assert.equal(p3.lignes.length, 1, 'un salarié sans demande ne pèse qu’une ligne dans l’état');

// Soldes de saisie et contrôle de dépassement.
const soldes = C.calculerSoldes(employes, conges, cfg, 2026);
const s1 = soldes.find((s) => s.employe_id === 1);
assert.equal(s1.ouverture, 45);
assert.equal(s1.pris, 45);
assert.equal(s1.attente, 5);
assert.equal(s1.restant, 0, 'le solde 2026 est entièrement consommé');
assert.equal(s1.permRestant, 5);
assert.equal(s1.nbDemandes, 5);
const controle = C.controleSolde(employes, conges, cfg, 1, 2026, { imputation: 'CONGE', jours_demandes: 20 });
assert.equal(controle.disponible, 0, 'le solde 2026 est épuisé');
assert.equal(controle.apresDemande, -20, 'vingt jours dépasseraient le solde');
assert.equal(controle.suffisant, false);
assert.equal(C.controleSolde(employes, conges, cfg, 1, 2026, { imputation: 'PERMISSION', jours_demandes: 5 }).suffisant, true, 'permission encore disponible');
assert.equal(C.controleSolde(employes, conges, cfg, 1, 2026, { imputation: 'AUCUNE', jours_demandes: 99 }).suffisant, true, 'examen médical jamais bloquant');

// Un ajustement de droit (entrée en cours d'année, régularisation) module l'ouverture.
const avecAjustement = C.calculerSoldes([employes[2]], [...conges, C.normaliserConge({
  id: 99, employe_id: 3, annee: 2027, categorie: 'AJUSTEMENT', ajustement_type: 'DROIT',
  jours_demandes: -14, statut: 'VALIDE',
})], cfg, 2027);
assert.equal(avecAjustement[0].ajust, -14, 'ajustement signé conservé');
assert.equal(avecAjustement[0].ouverture, 16, 'droit 2027 réduit de quatorze jours');

// Rapprochement des noms d'un contrôle (le fichier ne porte pas de matricule).
assert.equal(C.retrouverEmploye('Rakoto\tjean', employes).id, 1, 'nom rapproché malgré les accents et tabulations');
assert.equal(C.retrouverEmploye('RASOA Nirina Marie', employes).id, 2, 'jeton commun suffisant');
assert.equal(C.retrouverEmploye('INCONNU Pascal', employes), null, 'aucune correspondance inventée');

// ------------------------------------------------------------------------------
// 2. API locale : saisie, circuit de visas, rôle du comptable, import
// ------------------------------------------------------------------------------
(async () => {
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const api = bundle('src/api-local.ts', 'api');

  const tousEmployes = await api.fetchEmployes(true);
  // Vérifier la reprise embarquée du fichier réel « CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb » (oct. 2026)
  const sitInitiale = await api.fetchSituationConges(2026, false);
  const verifReels = [
    [1, 2026, 24],
    [3, 2026, 30],
    [6, 2026, -3],
    [34, 2025, 28],
    [43, 2026, 17],
    [47, 2024, 16],
    [48, 2025, 9],
    [60, 2026, 23],
    [63, 2026, 28],
    [64, 2025, 4],
    [67, 2025, 20],
  ];
  for (const [mat, expTitre, expReste] of verifReels) {
    const s = sitInitiale.find((x) => x.numero_matricule === mat);
    assert.ok(s, `salarié matricule ${mat} présent`);
    assert.equal(s.titreActif, expTitre, `Mat ${mat} : Titre actif ${expTitre}`);
    assert.equal(s.resteTitreActif, expReste, `Mat ${mat} : reste ${expReste} j sur Titre ${expTitre}`);
  }

  // Vérification exacte de TINAHINY TSIBARA (05/06/2026 -> 05/06/2026 au 05/06/2026 = 1 congé, reprise 06/06/2026)
  const tinahiny2026 = (await api.fetchConges({ annee: 2026 })).find((c) => /TINAHINY/i.test(c.nom_prenoms) && c.date_debut === '2026-06-05');
  assert.ok(tinahiny2026, 'fiche TINAHINY TSIBARA du 05/06/2026 présente');
  assert.equal(tinahiny2026.jours_demandes, 1, '1 jour demandé le 05/06/2026');
  assert.equal(tinahiny2026.date_fin, '2026-06-05', 'fin demandée = 05/06/2026 (05/06/2026 au 05/06/2026)');
  assert.equal(tinahiny2026.date_retour, '2026-06-06', 'Daty fiverenana miasa ajustée automatiquement au 06/06/2026');

  // Utiliser un salarié embauché en 2026 sans congé antérieur pour tester tout le circuit de saisie
  const employe = tousEmployes.find((e) => e.numero_matricule === 68) || tousEmployes[tousEmployes.length - 1];
  assert.ok(employe, 'données embarquées disponibles');
  const meta = { utilisateur: 'comptable', role: 'Comptable' };

  // Exemple 1 & 2 du client : 05/06/2026 au 05/06/2026 -> 1 congé (reprise 06/06/2026), puis 05/06/2026 au 06/06/2026 -> 2 congés (reprise 07/06/2026)
  const ex1 = await api.creerConge({
    employe_id: employe.id, categorie: 'CONGE', annee: 2026,
    date_demande: '2026-06-01', date_debut: '2026-06-05', date_fin: '2026-06-05',
    imputation: 'CONGE', titre_periode: 'Titre 2025', statut: 'SOUMIS',
  }, meta);
  assert.equal(ex1.success, true);
  let [ficheEx] = await api.fetchConges({ annee: 2026, employeId: employe.id });
  assert.equal(ficheEx.jours_demandes, 1, '05/06/2026 au 05/06/2026 = 1 congé');
  assert.equal(ficheEx.date_fin, '2026-06-05');
  assert.equal(ficheEx.date_retour, '2026-06-06', 'prise de service le lendemain 06/06/2026');

  await api.modifierConge(ficheEx.id, { date_debut: '2026-06-05', date_fin: '2026-06-06' }, meta);
  [ficheEx] = await api.fetchConges({ annee: 2026, employeId: employe.id });
  assert.equal(ficheEx.jours_demandes, 2, '05/06/2026 au 06/06/2026 = 2 congés');
  assert.equal(ficheEx.date_fin, '2026-06-06');
  assert.equal(ficheEx.date_retour, '2026-06-07', 'prise de service le lendemain 07/06/2026');
  await api.supprimerConge(ficheEx.id, meta);

  // Saisie depuis une fiche d'absence : le nombre de jours suit les dates incluses.
  const cree = await api.creerConge({
    employe_id: employe.id, categorie: 'CONGE', annee: 2026,
    date_demande: '2026-10-01', date_debut: '2026-10-05', date_fin: '2026-10-16',
    imputation: 'CONGE', service: 'Dispensaire', contact: 'Toliara 034 00 000',
    remplacant: 'RASOA Marie', titre_periode: 'Congé 2026', statut: 'SOUMIS',
  }, meta);
  assert.equal(cree.success, true, JSON.stringify(cree));
  const liste1 = await api.fetchConges({ annee: 2026, employeId: employe.id });
  assert.equal(liste1.length, 1);
  assert.equal(liste1[0].jours_demandes, 12, 'douze jours inclus du 05/10 au 16/10');
  assert.equal(liste1[0].date_retour, '2026-10-17', 'Daty fiverenana miasa le 17/10');
  assert.equal(liste1[0].statut, 'SOUMIS');
  assert.equal(liste1[0].nom_prenoms, employe.nom_prenoms, 'le nom est repris de la fiche salarié');

  // Refus motivé obligatoire, validation impossible sans visa médecin pour un motif médical.
  assert.equal((await api.deciderConge(liste1[0].id, 'REFUSE', meta)).success, false, 'motif de refus requis');
  const hospitalisation = await api.creerConge({
    employe_id: employe.id, categorie: 'PERMISSION', motif_code: 'Hopitaly zanaka',
    annee: 2026, date_debut: '2026-11-02', date_fin: '2026-11-04',
    imputation: 'PERMISSION', statut: 'SOUMIS',
  }, meta);
  assert.equal(hospitalisation.success, true);
  const idHosp = hospitalisation.id;
  assert.equal((await api.deciderConge(idHosp, 'VALIDE', meta)).success, false, 'visa du médecin chef requis');
  assert.equal((await api.deciderConge(idHosp, 'AVIS_CHF', meta)).success, true);
  let [hosp] = await api.fetchConges({ annee: 2026, employeId: employe.id, statut: 'AVIS_CHF' });
  assert.equal(hosp.id, idHosp);
  assert.equal(hosp.jours_demandes, 3, 'trois jours inclus du 02/11 au 04/11');
  assert.equal(hosp.date_retour, '2026-11-05', 'Daty fiverenana miasa le 05/11');
  assert.equal(hosp.motif_libelle, '4* — Zanaka', 'libellé malgache de la fiche conservé');
  assert.equal((await api.deciderConge(idHosp, 'VALIDE', meta)).success, false, 'il faut ensuite le visa du médecin');
  assert.equal((await api.deciderConge(idHosp, 'AVIS_MEDECIN', meta)).success, true);
  assert.equal((await api.deciderConge(idHosp, 'VALIDE', meta)).success, true, 'validation par le gestionnaire');
  [hosp] = await api.fetchConges({ annee: 2026, employeId: employe.id, inclureRefuses: true });
  assert.equal(hosp.statut, 'VALIDE');
  assert.equal(hosp.visa_gestionnaire_par, 'comptable', 'la fiche garde la trace du gestionnaire');

  // Le solde est bien entamé de trois jours de permission.
  const situation = await api.fetchSituationConges(2026, true);
  const sal = situation.find((s) => s.employe_id === employe.id);
  assert.equal(sal.permPris, 3, 'permission consommée');
  assert.equal(sal.permRestant, 7, 'reste sept jours de permission');

  // Ajustement du droit saisi par le gestionnaire, puis état complet.
  assert.equal((await api.creerConge({ employe_id: employe.id, categorie: 'AJUSTEMENT', annee: 2026, jours_demandes: 0 }, meta)).success, false, 'un ajustement sans jour est refusé');
  await api.creerConge({ employe_id: employe.id, categorie: 'AJUSTEMENT', ajustement_type: 'DROIT', annee: 2026, jours_demandes: 5, motif_libelle: 'Report dossier 2025' }, meta);
  const situation2 = (await api.fetchSituationConges(2026, true)).find((s) => s.employe_id === employe.id);
  assert.equal(situation2.droit, 30, 'droit de base inchangé');
  assert.equal(situation2.ajust, 5, 'l’ajustement est bien rattaché à l’année');
  assert.equal(situation2.ouverture, sal.droit + 5 + sal.report, 'ajustement de +5 jours appliqué à l’ouverture');

  // L'état imprimé reprend le salarié, la période demandée (Du … au …) et Daty fiverenana miasa (prise de service).
  const etatApi = await api.fetchEtatConges(2026, { nbAnnees: 3 });
  const parcoursApi = etatApi.parcours.find((p) => p.employe_id === employe.id);
  assert.ok(parcoursApi.lignes.length >= 3, 'une ligne par demande plus le solde de fin d’année');
  const lignePermEtat = parcoursApi.lignes.find((l) => l.perm_jours === 3);
  assert.ok(lignePermEtat, 'la permission apparaît dans le bloc permission');
  assert.equal(lignePermEtat.date_fin, '2026-11-04', 'fin de permission = 04/11/2026');
  assert.equal(lignePermEtat.date_retour, '2026-11-05', 'Daty fiverenana miasa dans l’état = 05/11/2026 (jour après la fin demandée)');

  const parcoursTinahiny = etatApi.parcours.find((p) => /TINAHINY/i.test(p.nom_prenoms));
  assert.ok(parcoursTinahiny, 'TINAHINY TSIBARA présente dans l’état');
  const ligneTinahiny0506 = parcoursTinahiny.lignes.find((l) => l.date_conge === '2026-06-05');
  assert.ok(ligneTinahiny0506, 'ligne du 05/06/2026 présente dans l’état');
  assert.equal(ligneTinahiny0506.jours_conge, 1, '1 congé le 05/06/2026');
  assert.equal(ligneTinahiny0506.date_fin, '2026-06-05', 'fin demandée = 05/06/2026');
  assert.equal(ligneTinahiny0506.date_retour, '2026-06-06', 'Daty fiverenana miasa dans l’état = 06/06/2026');

  const etatUiOut = path.join(tmp, 'etatUi.cjs');
  esbuild.buildSync({ entryPoints: ['src/components/conges/EtatConges.tsx'], bundle: true, platform: 'browser', format: 'cjs', outfile: etatUiOut, loader: { '.png': 'dataurl' }, logLevel: 'silent' });
  const EtatUi = require(etatUiOut);
  assert.ok(EtatUi.colonnesEtat([2025, 2026]).colonnes.some((c) => c.cle === 'date_retour' && c.label === 'Daty fiverenana miasa'), 'colonne Daty fiverenana miasa dans l’état');
  assert.equal(EtatUi.valeurCellule(ligneTinahiny0506, 'date_conge', parcoursTinahiny, [2025, 2026]), '05/06/2026 au 05/06/2026');
  assert.equal(EtatUi.valeurCellule(ligneTinahiny0506, 'date_retour', parcoursTinahiny, [2025, 2026]), '06/06/2026');

  // Suppression : le comptable ne touche pas une fiche validée, l'administrateur si.
  const idValidee = hosp.id;
  assert.equal((await api.supprimerConge(idValidee, meta)).success, false, 'fiche validée protégée');
  assert.equal((await api.supprimerConge(idValidee, { utilisateur: 'admin', role: 'Administrateur' })).success, true);
  assert.equal((await api.fetchConges({ annee: 2026, employeId: employe.id })).length, 2, 'il reste la demande en cours et l’ajustement');

  // Réouverture d'une fiche validée réservée à l'administrateur.
  const [solde] = await api.fetchConges({ annee: 2026, employeId: employe.id, statut: 'SOUMIS' });
  await api.deciderConge(solde.id, 'AVIS_CHF', meta);
  await api.deciderConge(solde.id, 'VALIDE', meta);
  assert.equal((await api.deciderConge(solde.id, 'REOUVRIR', meta)).success, false, 'comptable non autorisé');
  assert.equal((await api.deciderConge(solde.id, 'REOUVRIR', { utilisateur: 'admin', role: 'Administrateur' })).success, true);
  const [rouverte] = await api.fetchConges({ annee: 2026, employeId: employe.id, statut: 'SOUMIS' });
  assert.equal(rouverte.statut, 'SOUMIS');

  // Dépassement : signalé par défaut, bloqué si l'administrateur resserre la règle.
  const trop = await api.creerConge({ employe_id: employe.id, categorie: 'CONGE', annee: 2026, date_debut: '2026-12-01', jours_demandes: 500, statut: 'VALIDE' }, meta);
  assert.equal(trop.success, true, 'la demande passe avec un rappel');
  assert.ok(/dépassé/i.test(trop.avertissement || ''), trop.avertissement || 'avertissement attendu');
  await api.supprimerConge(trop.id, { utilisateur: 'admin', role: 'Administrateur' });
  const libre = await api.creerConge({ employe_id: employe.id, categorie: 'CONGE', annee: 2026, date_debut: '2026-12-01', jours_demandes: 500, statut: 'SOUMIS' }, meta);
  assert.equal(libre.success, true, 'une demande en attente reste enregistrée pour avis');
  const { saveConfig, loadConfig } = bundle('src/local/config.ts', 'config');
  saveConfig({ ...loadConfig(), congies: { ...loadConfig().congies, bloquerDepassement: true } });
  const apiSevere = bundle('src/api-local.ts', 'apiSevere');
  const bloque = await apiSevere.creerConge({ employe_id: employe.id, categorie: 'CONGE', annee: 2026, date_debut: '2026-12-01', jours_demandes: 500, statut: 'VALIDE' }, meta);
  assert.equal(bloque.success, false, 'réglage « bloquer le dépassement » refusé à la validation');
  assert.ok(/dépassé/i.test(bloque.message || ''), bloque.message);
  saveConfig({ ...loadConfig(), congies: { ...loadConfig().congies, bloquerDepassement: false } });

  // Import d'un contrôle des congés : le .xlsx reproduit la trame du classeur.
  const aoa = [
    ['CONTRÔLE DES CONGES ET PERMISSIONS '],
    [null, null, null, null, null, null, null, 'PERMISSION'],
    ['NOM ET PRENOMS', 'FONCTION', null, null, null, 'Jours', 'Date', 'Droit dans', 'Jours', 'Date', 'Droit', 'MOTIFS DU '],
    [null, null, 2025, 2026, 2027, ' Demandés', null, " l'Année ", ' Demandés', null, 'Restant', 'PERMISSION'],
    [employe.nom_prenoms, employe.jobs, 30, null, null, 10, '2026-03-02', 10, 3, '2026-04-06', 7, 'Mariage '],
    [null, null, 20, null, null, 12, '2026-06-01', null, null, null, null, null],
    ['INCONNU Gérard', 'Agent', null, 30, null, 5, '2026-07-06', null, null, null, null, null],
    ['TOTAUX'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '2026');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const donnees = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const { analyserControleConges } = bundle('src/local/importConges.ts', 'importConges');
  const personnel = await api.fetchEmployes();
  const analyse = analyserControleConges(donnees, 'controle.xlsx', personnel);
  assert.ok(analyse.feuilles.some((f) => f.reconnue && f.nbLignes >= 2), 'feuilles reconnues : ' + JSON.stringify(analyse.feuilles));
  assert.equal(analyse.lignes.length, 4, 'quatre lignes lues, dont un nom sans correspondance');
  assert.equal(analyse.lignes.filter((l) => l.employe_id === null).length, 1, 'le nom inconnu est conservé pour signalement');
  assert.equal(analyse.lignes.filter((l) => l.categorie === 'CONGE' && l.employe_id !== null).length, 2, 'deux congés sur les lignes du salarié reconnu');
  assert.equal(analyse.lignes.filter((l) => l.categorie === 'PERMISSION')[0].jours, 3, 'jours de permission lus');
  assert.equal(analyse.lignes.filter((l) => l.categorie === 'PERMISSION')[0].motif, 'Mariage', 'motif du permission repris');
  assert.ok(analyse.avertissements.some((a) => /INCONNU/.test(a)), 'les noms sans correspondance sont signalés');

  const importAvant = (await api.fetchConges({ annee: 2026 })).length;
  const rapport = await api.importerConges(
    analyse.lignes.filter((l) => l.employe_id !== null),
    { mode: 'fusion', ajusterSoldes: false }
  );
  assert.equal(rapport.importees >= 3, true, JSON.stringify(rapport));
  const importApres = (await api.fetchConges({ annee: 2026 })).length;
  assert.equal(importApres, importAvant + rapport.importees, 'les lignes importées sont ajoutées');
  const rapport2 = await api.importerConges(
    analyse.lignes.filter((l) => l.employe_id !== null),
    { mode: 'fusion', ajusterSoldes: false }
  );
  assert.equal(rapport2.ignores > 0 && rapport2.importees === 0, true, 'un second import ne duplique pas les mêmes lignes');
  const enRegistres = await api.fetchConges({ annee: 2026, statut: 'VALIDE' });
  assert.ok(enRegistres.every((c) => c.saisie_par === 'Import Excel' || c.statut === 'VALIDE'));

  // Lecture directe du binaire réel .xlsb + génération PDF A4 portrait et paysage
  const xlsbBytes = fs.readFileSync('CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb');
  const xlsbAnalyse = analyserControleConges(
    xlsbBytes.buffer.slice(xlsbBytes.byteOffset, xlsbBytes.byteOffset + xlsbBytes.byteLength),
    'CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb',
    personnel
  );
  assert.equal(xlsbAnalyse.feuilles.find((f) => f.nom === '2026').reconnue, true);
  assert.equal(xlsbAnalyse.feuilles.find((f) => f.nom === '2025').archiveProbable, true);
  const matches2026 = new Set(xlsbAnalyse.lignes.filter((l) => l.feuille === '2026' && l.employe_id !== null).map((l) => l.employe_id));
  assert.equal(matches2026.size, 45, 'les 45 salariés SALFA 2026 présents dans le contrôle .xlsb (dont LUCILLE MARGUERITE) sont reconnus');
  // Vérifier le nettoyage des saisies atypiques du classeur .xlsb
  const lLydia = xlsbAnalyse.lignes.find((l) => l.feuille === '2026' && /VOAHANGIARISOA/i.test(l.nom) && l.date_debut === '2023-07-17');
  assert.ok(lLydia, 'date saisie « 17/07§2023 » normalisée en 2023-07-17');
  const lRalaivao = xlsbAnalyse.lignes.find((l) => l.feuille === '2026' && /RALAIVAO/i.test(l.nom) && l.categorie === 'PERMISSION' && l.date_debut === '2026-07-05');
  assert.ok(lRalaivao && lRalaivao.motif_code === 'Tera-bady', '« TERA-BADY05/07/2026 » séparé en date 2026-07-05 + motif Tera-bady');
  const lZafihaingo = xlsbAnalyse.lignes.find((l) => l.feuille === '2026' && /ZAFIHAINGO/i.test(l.nom) && l.categorie === 'PERMISSION');
  assert.equal(lZafihaingo.motif, '15/09/2025', 'cellule Date dans MOTIFS formatée proprement en JJ/MM/AAAA');
  const lDidim = xlsbAnalyse.lignes.find((l) => l.feuille === '2026' && /RANDRIANANTOANDRO/i.test(l.nom) && l.categorie === 'PERMISSION');
  assert.equal(lDidim.motif_code, 'Didim-poitra zanaka', '« DIDI-MPOITRA » reconnu comme Didim-poitra zanaka');

  const { jsPDF } = require('jspdf');
  const pdfOut = path.join(tmp, 'congesPdf.cjs');
  esbuild.buildSync({
    entryPoints: ['src/pdf/congesPdf.ts'], bundle: true, platform: 'browser', format: 'cjs',
    outfile: pdfOut, loader: { '.png': 'dataurl' }, alias: { 'jspdf-autotable': 'jspdf-autotable/es' }, logLevel: 'silent',
  });
  const congesPdf = require(pdfOut);
  const docFiche = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  congesPdf.drawFicheAbsencePage(docFiche, enRegistres[0], {
    annee: 2026, droitConge: 30, report: 30, soldeAvant: 60, soldeApres: 50,
    permDroit: 10, permAvant: 10, permApres: 10, titreAvant: 2025, resteTitreAvant: 30, titreApres: 2025, resteTitreApres: 20,
  });
  assert.equal(docFiche.internal.getNumberOfPages(), 1, 'la fiche d’absence tient sur une seule page A4 portrait');
  const docEtat = congesPdf.buildEtatCongesPDF(await api.fetchEtatConges(2026), 2026);
  assert.ok(docEtat.internal.getNumberOfPages() >= 1, 'état PDF A4 paysage généré sur les 3 dernières années');

  // ----------------------------------------------------------------------------
  // 4. Loi malgache (Code du Travail) : cumul limité aux 3 dernières années
  // ----------------------------------------------------------------------------
  assert.equal(C.DEFAULT_CONGES_CONFIG.nbAnneesCumul, 3, '3 dernières années successives par défaut');
  assert.equal(C.DEFAULT_CONGES_CONFIG.plafondCumulConge, 90, 'plafond légal 3 × 30 = 90 jours');
  assert.equal(C.sanitizeCongesConfig({ joursCongeParAn: 30, nbAnneesCumul: 3, plafondCumulConge: 150 }).plafondCumulConge, 90, 'plafond borné à 3 × 30 = 90 j');
  assert.deepEqual(C.anneesSuccessives(2026), [2024, 2025, 2026], 'les 3 dernières années en 2026 = [2024, 2025, 2026]');

  const dec85 = C.decomposerDroitsSuccessifs(85, 2026, 30, 2020, 3);
  assert.deepEqual(dec85.droitsParTitre, { 2024: 25, 2025: 30, 2026: 30 });
  assert.equal(dec85.titreActif, 2024);
  const dec120 = C.decomposerDroitsSuccessifs(120, 2026, 30, 1995, 3);
  assert.deepEqual(dec120.droitsParTitre, { 2024: 30, 2025: 30, 2026: 30 }, 'aucun droit antérieur à 2024 en 2026');
  assert.equal(dec120.titreActif, 2024, 'titre actif jamais antérieur à N-2');

  // Prescription triennale sur un salarié sans prise de congé sur 4 exercices :
  // en 4e année (2027), les 30 j de 2024 sont prescrits, report = 60 j (2025+2026), ouverture = 90 j.
  assert.equal(p3.bilans[2027].prescrits, 30, 'les 30 jours de 2024 sont prescrits à l’ouverture de 2027');
  assert.equal(p3.bilans[2027].report, 60, 'seules les 2 années précédentes (2025 et 2026) sont reportées en 2027');
  assert.equal(p3.bilans[2027].ouverture, 90, 'cumul plafonné aux 3 dernières années (2025, 2026, 2027 = 90 j)');

  // Par défaut, fetchEtatConges retourne exactement les 3 dernières années [2024, 2025, 2026].
  const etatDefaut2026 = await api.fetchEtatConges(2026);
  assert.deepEqual(etatDefaut2026.annees, [2024, 2025, 2026], 'état par défaut = les 3 dernières années');

  // Tous les salariés SALFA en 2026 respectent le plafond de 90 j et les titres [2024..2026].
  const sit2026Verif = await api.fetchSituationConges(2026, false);
  for (const s of sit2026Verif) {
    assert.ok(s.ouverture <= 90, `Mat ${s.numero_matricule} : ouverture ${s.ouverture} <= 90 j`);
    assert.ok(s.restant <= 90, `Mat ${s.numero_matricule} : restant ${s.restant} <= 90 j`);
    assert.ok(s.titreActif >= 2024 && s.titreActif <= 2026, `Mat ${s.numero_matricule} : titre actif ${s.titreActif} dans [2024..2026]`);
  }
  const vazison = sit2026Verif.find((s) => s.numero_matricule === 20);
  const raharilalaintsoa = sit2026Verif.find((s) => s.numero_matricule === 32);
  assert.equal(vazison.ouverture, 61, 'Mat 20 : sans cumul avant 2024 (30-13=17, 47-16=31), ouverture 2026 = 61 j');
  assert.equal(vazison.restant, 38, 'Mat 20 : 61 - 23 = 38 j restants sur [2024..2026]');
  assert.equal(raharilalaintsoa.ouverture, 65, 'Mat 32 : sans cumul avant 2024 (30-12=18, 48-13=35), ouverture 2026 = 65 j');
  assert.equal(raharilalaintsoa.restant, 43, 'Mat 32 : 65 - 22 = 43 j restants sur [2024..2026]');

  // Toute tentative de demander un congé en 2026 sur un titre prescrit (< 2024) est refusée.
  const refusPrescrit = await api.creerConge({
    employe_id: employe.id,
    categorie: 'CONGE',
    annee: 2026,
    date_demande: '2026-07-01',
    date_debut: '2026-07-10',
    date_fin: '2026-07-11',
    imputation: 'CONGE',
    titre_periode: 'Titre 2023',
    statut: 'SOUMIS',
  }, meta);
  assert.equal(refusPrescrit.success, false, 'un titre 2023 est refusé en 2026 (au-delà des 3 dernières années)');
  assert.match(refusPrescrit.message || '', /prescrit|derniers exercices/i);

  // Les fiches d'absence voyagent avec la sauvegarde JSON du store.
  const brut = JSON.parse(storage.get('salfa_paie_store_v1'));
  assert.ok(Array.isArray(brut.conges) && brut.conges.length, 'conges persistés dans le store');
  assert.equal(brut.conges.every((c) => typeof c.employe_id === 'number' && c.statut), true);

  // Synchronisation Congés -> État de paie mensuel, Bulletins de paie & État des Congés
  const paiesJan = await api.fetchPaiesMois(2026, 'JANVIER');
  const mat1Jan = paiesJan.employes.find((p) => p.numero_matricule === 1);
  assert.equal(mat1Jan.conge_pris_mois, 7, 'Mat 1 : 7 j pris en JANVIER 2026');
  assert.equal(mat1Jan.conge_restant, 42, 'Mat 1 : 42 j restants fin JANVIER 2026');

  const paiesJuin = await api.fetchPaiesMois(2026, 'JUIN');
  const mat47Juin = paiesJuin.employes.find((p) => p.numero_matricule === 47);
  assert.equal(mat47Juin.conge_pris_mois, 2, 'Mat 47 : 2 j en JUIN sur le congé chevauchant 29/06->03/07');
  assert.equal(mat47Juin.conge_restant, 79, 'Mat 47 : 79 j restants fin JUIN 2026 (81 - 2)');

  const paiesJuil = await api.fetchPaiesMois(2026, 'JUILLET');
  const mat47Juil = paiesJuil.employes.find((p) => p.numero_matricule === 47);
  assert.equal(mat47Juil.conge_pris_mois, 3, 'Mat 47 : 3 j en JUILLET sur le congé chevauchant 29/06->03/07');
  assert.equal(mat47Juil.conge_restant, 76, 'Mat 47 : 76 j restants fin JUILLET 2026 (90 - 3 - 6 - 5 sans cumul avant 2024)');

  const paiesOct = await api.fetchPaiesMois(2026, 'OCTOBRE');
  const mat1Oct = paiesOct.employes.find((p) => p.numero_matricule === 1);
  const mat47Oct = paiesOct.employes.find((p) => p.numero_matricule === 47);
  assert.equal(mat1Oct.conge_pris_mois, 0);
  assert.equal(mat1Oct.conge_restant, 24);
  assert.equal(mat1Oct.conge_titre_actif, 2026);
  assert.equal(mat1Oct.conge_reste_titre, 24);
  assert.equal(mat47Oct.conge_restant, 76);
  assert.equal(mat47Oct.conge_titre_actif, 2024);
  assert.equal(mat47Oct.conge_reste_titre, 16);
  assert.ok(paiesOct.totaux.total_conge_restant > 0, 'Total des congés restants calculé sur l’état de paie');

  // Vérification de l'État des Congés (colonnes CONGÉ remplies sur DEMANDE et SOLDE_FINAL)
  const EC = bundle('src/components/conges/EtatConges.tsx', 'etatConges');
  const etat2026 = await api.fetchEtatConges(2026);
  const { colonnes: colsEtat } = EC.colonnesEtat(etat2026.annees);
  assert.ok(colsEtat.some((c) => c.cle === 'conge_restant'), 'Colonne Congé Restant présente dans l’État des Congés');
  const parcMat1 = etat2026.parcours.find((p) => p.numero_matricule === 1);
  const sfMat1 = parcMat1.lignes.find((l) => l.type === 'SOLDE_FINAL');
  assert.equal(EC.valeurCellule(sfMat1, 'jours_conge', parcMat1, etat2026.annees), '25', 'SOLDE_FINAL Mat 1 : 25 j pris en 2026');
  assert.equal(EC.valeurCellule(sfMat1, 'conge_restant', parcMat1, etat2026.annees), '24', 'SOLDE_FINAL Mat 1 : 24 j restants');
  assert.match(String(EC.valeurCellule(sfMat1, 'date_conge', parcMat1, etat2026.annees)), /Titre 2026 \(24 j\)/);

  // ----------------------------------------------------------------------------
  // 6. Règle 1re case d'année : plafonnée à 30 j (pas de cumul avant 2024 / 1re année),
  //    peut être < 30 j en cas d'avance consommée (ex. en 2027 sur 2025), et saisie directe.
  // ----------------------------------------------------------------------------
  for (const p of etat2026.parcours) {
    const ouv24 = p.bilans[2024] ? p.bilans[2024].ouverture : 0;
    assert.ok(ouv24 <= 30, `Mat ${p.numero_matricule} : 1re case 2024 (${ouv24} j) <= 30 j`);
  }
  assert.equal(EC.premiereAnneeEditable(parcMat1, etat2026.annees), 2024, 'Mat 1 : 1re case éditable = 2024');
  const parcMat63 = etat2026.parcours.find((p) => p.numero_matricule === 63);
  assert.equal(EC.premiereAnneeEditable(parcMat63, etat2026.annees), 2025, 'Mat 63 (embauchée en 2025) : 1re case ouverte = 2025');

  // En 2027 ([2025, 2026, 2027]), la 1re case (2025) ne dépasse jamais 30 j,
  // mais est < 30 j pour un salarié ayant consommé une avance en 2024 (ex. Mat 13 = 29 j, Mat 14 = 27 j).
  const etat2027 = await api.fetchEtatConges(2027);
  assert.deepEqual(etat2027.annees, [2025, 2026, 2027], 'en 2027, la liste des années est [2025, 2026, 2027]');
  for (const p of etat2027.parcours) {
    const ouv25 = p.bilans[2025] ? p.bilans[2025].ouverture : 0;
    assert.ok(ouv25 <= 30, `Mat ${p.numero_matricule} en 2027 : 1re case 2025 (${ouv25} j) <= 30 j`);
  }
  const parc13_2027 = etat2027.parcours.find((p) => p.numero_matricule === 13);
  const parc14_2027 = etat2027.parcours.find((p) => p.numero_matricule === 14);
  assert.equal(parc13_2027.bilans[2025].ouverture, 29, 'Mat 13 en 2027 : 1re case 2025 = 29 j (< 30 j suite à avance consommée)');
  assert.equal(parc14_2027.bilans[2025].ouverture, 27, 'Mat 14 en 2027 : 1re case 2025 = 27 j (< 30 j suite à avance consommée)');

  // Contrôle total de saisie dans le tableau 2024 / 2025 / 2026 (ouverture, solde final, valeurs > 30 j ou < 0 j, et modification en ligne)
  assert.deepEqual(EC.anneesEditables(parcMat1, etat2026.annees), [2024, 2025, 2026], 'toutes les années 2024/2025/2026 sont éditables');
  assert.deepEqual(EC.anneesEditables(parcMat63, etat2026.annees), [2024, 2025, 2026], 'toutes les années 2024/2025/2026 sont éditables même pour embauche 2025');

  // 1) Saisie directe sur 2024 (22 j, puis > 30 j et < 0 j autorisés)
  const resSaisie22 = await api.saisirOuverturePremiereAnnee(parcMat1.employe_id, 2024, 22, meta);
  assert.equal(resSaisie22.success, true, 'saisie de 22 j en 2024 acceptée pour le comptable');
  const etatApres22 = await api.fetchEtatConges(2026);
  const mat1Apres22 = etatApres22.parcours.find((p) => p.numero_matricule === 1);
  assert.equal(mat1Apres22.bilans[2024].ouverture, 22, 'ouverture 2024 mise à 22 j');
  assert.equal(mat1Apres22.bilans[2024].ouvertureSaisie, true, 'marqueur de saisie manuelle 2024 actif');
  assert.equal(mat1Apres22.bilans[2024].fin, 2, '22 - 20 = 2 j fin 2024');
  assert.equal(mat1Apres22.bilans[2025].ouverture, 32, '2 + 30 = 32 j ouverture 2025');
  assert.equal(mat1Apres22.bilans[2026].fin, 16, 'solde fin 2026 répercuté à 16 j (41 - 25)');
  assert.equal((await api.fetchPaiesMois(2026, 'OCTOBRE')).employes.find((p) => p.numero_matricule === 1).conge_restant, 16, 'bulletin/état de paie synchronisé à 16 j');

  assert.equal((await api.saisirOuverturePremiereAnnee(parcMat1.employe_id, 2024, 35, meta)).success, true, '> 30 j autorisé en contrôle total');
  assert.equal((await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1).bilans[2024].ouverture, 35);
  assert.equal((await api.saisirOuverturePremiereAnnee(parcMat1.employe_id, 2024, -2, meta)).success, true, '< 0 j autorisé en contrôle total');
  assert.equal((await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1).bilans[2024].ouverture, -2);
  assert.equal((await api.saisirOuverturePremiereAnnee(parcMat1.employe_id, 2024, null, meta)).success, true, 'réinitialisation 2024 acceptée');

  // 2) Saisie directe sur 2025 (OUVERTURE et SOLDE_FINAL)
  assert.equal((await api.saisirSoldeAnnee(parcMat1.employe_id, 2025, 50, meta, 'OUVERTURE')).success, true, 'saisie ouverture 2025 acceptée');
  let mat1_2025 = (await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1);
  assert.equal(mat1_2025.bilans[2025].ouverture, 50, 'ouverture 2025 fixée à 50 j');
  assert.equal(mat1_2025.bilans[2025].ouvertureSaisie, true);
  assert.equal(mat1_2025.bilans[2025].fin, 29, '50 - 21 = 29 j fin 2025');
  assert.equal(mat1_2025.bilans[2026].ouverture, 59, '29 + 30 = 59 j ouverture 2026');
  assert.equal(mat1_2025.bilans[2026].fin, 34, '59 - 25 = 34 j fin 2026');

  assert.equal((await api.saisirSoldeAnnee(parcMat1.employe_id, 2025, 30, meta, 'SOLDE_FINAL')).success, true, 'saisie solde final 2025 acceptée');
  mat1_2025 = (await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1);
  assert.equal(mat1_2025.bilans[2025].fin, 30, 'solde final 2025 fixé exactement à 30 j');
  assert.equal(mat1_2025.bilans[2026].ouverture, 60, '30 + 30 = 60 j ouverture 2026');
  assert.equal((await api.saisirSoldeAnnee(parcMat1.employe_id, 2025, null, meta)).success, true, 'réinitialisation 2025 acceptée');

  // 3) Saisie directe sur 2026 (OUVERTURE et SOLDE_FINAL)
  assert.equal((await api.saisirSoldeAnnee(parcMat1.employe_id, 2026, 45, meta, 'OUVERTURE')).success, true, 'saisie ouverture 2026 acceptée');
  let mat1_2026 = (await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1);
  assert.equal(mat1_2026.bilans[2026].ouverture, 45, 'ouverture 2026 fixée à 45 j');
  assert.equal(mat1_2026.bilans[2026].fin, 20, '45 - 25 = 20 j fin 2026');

  assert.equal((await api.saisirSoldeAnnee(parcMat1.employe_id, 2026, 18, meta, 'SOLDE_FINAL')).success, true, 'saisie solde final 2026 acceptée');
  mat1_2026 = (await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1);
  assert.equal(mat1_2026.bilans[2026].fin, 18, 'solde final 2026 fixé exactement à 18 j');
  assert.equal((await api.fetchPaiesMois(2026, 'OCTOBRE')).employes.find((p) => p.numero_matricule === 1).conge_restant, 18, 'bulletin synchronisé à 18 j');
  assert.equal((await api.saisirSoldeAnnee(parcMat1.employe_id, 2026, null, meta)).success, true, 'réinitialisation 2026 acceptée');

  // 4) Saisie 2024 sur un salarié embauché en 2025 (aucun blocage) + reset
  assert.equal((await api.saisirSoldeAnnee(parcMat63.employe_id, 2024, 10, meta, 'OUVERTURE')).success, true, 'saisie 2024 acceptée même pour embauche 2025');
  assert.equal((await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 63).bilans[2024].ouverture, 10);
  assert.equal((await api.saisirSoldeAnnee(parcMat63.employe_id, 2024, null, meta)).success, true);

  // 5) Modification en ligne des jours demandés sur une fiche validée
  const premiereDemandeMat1 = parcMat1.lignes.find((l) => l.type === 'DEMANDE' && l.annee === 2026 && l.categorie === 'CONGE');
  const joursOrigMat1 = premiereDemandeMat1.jours_conge;
  assert.equal((await api.modifierConge(premiereDemandeMat1.conge_id, { jours_demandes: joursOrigMat1 + 2 }, meta)).success, true);
  assert.equal((await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1).soldeActuel, 22, 'solde recalculé immédiatement après édition en ligne des jours');
  assert.equal((await api.modifierConge(premiereDemandeMat1.conge_id, { jours_demandes: joursOrigMat1 }, meta)).success, true);

  const mat1Reset = (await api.fetchEtatConges(2026)).parcours.find((p) => p.numero_matricule === 1);
  assert.equal(mat1Reset.bilans[2024].ouverture, 30, 'retour à 30 j automatiques');
  assert.equal(mat1Reset.bilans[2024].ouvertureSaisie, false);
  assert.equal(mat1Reset.soldeActuel, 24, 'solde 2026 revenu à 24 j');

  // ----------------------------------------------------------------------------
  // 7. Vérification du script SQL WAMP des congés (wamp/sql/salfa_conges_excel.sql)
  // ----------------------------------------------------------------------------
  const sqlConges = fs.readFileSync('wamp/sql/salfa_conges_excel.sql', 'utf8');
  assert.ok(sqlConges.includes('CREATE DATABASE IF NOT EXISTS `salfa_paie`'), 'création base salfa_paie');
  assert.ok(sqlConges.includes('START TRANSACTION;') && sqlConges.includes('COMMIT;'), 'transaction atomique');
  assert.ok(!/\bDROP\s+(TABLE|DATABASE)\b/i.test(sqlConges), 'aucun DROP destructif (droits minimaux WAMP)');
  assert.ok(!/\bDELETE\s+FROM\b/i.test(sqlConges), 'aucun DELETE (conservation des données)');
  let jsonReconstruit = '';
  for (const ligneSql of sqlConges.split('\n')) {
    const mSql = ligneSql.match(/^SET @conges_json = (?:CONCAT\(@conges_json, )?'(.*)'\)?;$/);
    if (mSql) jsonReconstruit += mSql[1].replace(/''/g, "'").replace(/\\\\/g, '\\');
  }
  const congesDuSql = JSON.parse(jsonReconstruit);
  assert.equal(congesDuSql.length, 610, '610 fiches (527 salariés 2026 + 83 anciens 2022–2025) dans salfa_conges_excel.sql');
  assert.ok(congesDuSql.every((c) => /^__MAT_\d+__$/.test(c.employe_id)), 'jetons dynamiques __MAT_<M>__ prêts pour résolution MySQL');

  console.log('Congés & Permissions : tests OK');
})().catch((e) => {
  console.error('ÉCHEC —', e && e.stack ? e.stack : e);
  process.exit(1);
});
