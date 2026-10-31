// Régressions reproduites lors de l'audit du 31/10/2026.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-audit-'));
let fail = false;
const storage = new Map();
global.localStorage = {
  getItem: k => storage.get(k) || null,
  setItem: (k, v) => { if (fail) throw Error('quota simulé'); storage.set(k, v); },
  removeItem: k => storage.delete(k),
};
function bundle(contents, name) {
  const file = path.join(tmp, name + '.cjs');
  esbuild.buildSync({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: file, logLevel: 'silent' });
  return require(file);
}
(async () => {
  const m = bundle(`export * from './src/api-local'; export * from './src/local/calcul'; export * from './src/local/config'; export {getStore} from './src/local/store'; export {parseDate} from './src/local/conges';`, 'api');
  // Les zéros doivent survivre à une sauvegarde et à un rechargement du module.
  m.saveConfig({ cnapsSalariale: 0, cnapsPatronale: 0, tauxMaternite: 0, plafondEspeces: 0 });
  const loaded = bundle(`export * from './src/local/config';`, 'reloaded');
  assert.equal(loaded.loadConfig().cnapsSalariale, 0);
  assert.equal(loaded.loadConfig().cnapsPatronale, 0);
  assert.equal(loaded.loadConfig().tauxMaternite, 0);
  assert.equal(m.calculerPaieEmploye({ base_aj: 300000, conge_maternite: 1 }).salaire_brut, 0);
  const fullTransfer = m.calculerPaieEmploye({ base_aj: 300000, rib: '123456789' });
  assert.equal(fullTransfer.especes, 0, 'plafond espèces 0 = tout par virement');
  assert.equal(fullTransfer.virement, fullTransfer.net);
  const oldCfg = JSON.stringify(m.loadConfig());
  fail = true;
  assert.throws(() => m.saveConfig({ tauxMaternite: 80 }), /non enregistrés/);
  assert.throws(() => m.resetConfig(), /non enregistrés/);
  assert.equal(JSON.stringify(m.loadConfig()), oldCfg, 'un échec ne doit pas publier un paramètre non enregistré');
  fail = false;
  m.resetConfig();
  const imported = (await m.fetchPaiesMois(2026, 'AOUT')).employes.find(p => p.numero_matricule === 28);
  const editedImported = await m.savePaieSaisie(imported.id, Number(imported.avance || 0) + 100, Number(imported.med || 0));
  assert.equal(editedImported.success, true);
  for (const key of ['salaire_brut', 'cnaps', 'patronal', 'salaire_imposable', 'irsa', 'salaire_net', 'accessoir', 'brut']) assert.equal(editedImported.updated[key], imported[key], `retenue seule : ${key} importé préservé`);
  assert.equal(editedImported.updated.net, Math.floor(Math.max(0, imported.brut - imported.avance - 100 - imported.med) / 100) * 100);
  const mother = { conge_maternite: true, date_debut_maternite: '2026-11-15' };
  assert.equal(m.estEmployeEnCongeMaternite(mother, 2026, 'OCTOBRE'), false);
  assert.equal(m.estEmployeEnCongeMaternite(mother, 2026, 'NOVEMBRE'), true);
  assert.equal(m.estEmployeEnCongeMaternite(mother, 2027, 'JANVIER'), true);
  assert.equal(m.estEmployeEnCongeMaternite(mother, 2027, 'FEVRIER'), false);
  assert.equal(m.estEnCongeMaternite('2026-13-01', 2027, 'JANVIER'), false);
  for (const date of ['2026-02-31', '2026-13-01', '2026-00-01', '2026-04-31']) assert.equal(m.parseDate(date), null);
  assert.ok(m.parseDate('2024-02-29'));
  assert.equal(await m.createEmploye({ numero_matricule: NaN, nom_prenoms: 'INVALIDE' }), false);
  assert.equal(await m.createEmploye({ numero_matricule: -1, nom_prenoms: 'INVALIDE' }), false);
  assert.equal(await m.createEmploye({ numero_matricule: 99999, nom_prenoms: 'TEST AUDIT', base_aj: 300000, ...mother }), true);
  const emp = (await m.fetchEmployes()).find(e => e.numero_matricule === 99999);
  assert.equal((await m.initPaieEmploye(emp.id, 2026, 'PAS_UN_MOIS')).success, false);
  assert.equal((await m.initPaieEmploye(emp.id, NaN, 'NOVEMBRE')).success, false);
  assert.equal((await m.initPaieEmploye(emp.id, 2026, 'NOVEMBRE')).created, true);
  assert.equal((await m.initPaieEmploye(emp.id, 2027, 'FEVRIER')).created, true);
  let row = (await m.fetchPaiesMois(2027, 'FEVRIER')).employes.find(p => p.employe_id === emp.id);
  assert.equal(row.salaire_brut, 300000, 'fin réelle de la réduction maternité');
  for (const val of [-1, NaN, Infinity, row.net + 1]) assert.equal((await m.savePaieReglement(row.id, 'virement', val)).success, false);
  assert.equal((await m.savePaieReglement(row.id, 'virement', row.net)).success, true);
  assert.equal((await m.savePaieSaisie(row.id, -1, 0)).success, false);
  assert.equal((await m.savePaieSaisie(row.id, NaN, 0)).success, false);
  assert.equal(await m.cloturerMois(2026, 'NOVEMBRE', true), true);
  // Même une autre fiche ne peut être ajoutée à une période clôturée.
  const otherEmp = (await m.fetchEmployes()).find(e => e.id !== emp.id);
  assert.equal((await m.initPaieEmploye(otherEmp.id, 2026, 'NOVEMBRE')).success, false);
  assert.equal(await m.cloturerMois(2026, 'PAS_UN_MOIS', true), false);
  assert.equal(await m.cloturerMois(2099, 'JANVIER', true), false, 'pas de fausse clôture sans bulletin');
  // Erreurs de quota : statut refusé ET état mémoire/disque inchangé pour chaque écriture.
  const quotaCases = [
    ['savePaieSaisie', () => m.savePaieSaisie(row.id, 50, 0), r => r.success],
    ['savePaieReglement', () => m.savePaieReglement(row.id, 'especes', 100), r => r.success],
    ['cloturerMois', () => m.cloturerMois(2027, 'FEVRIER', true), r => r],
    ['deverrouillerMois', () => m.deverrouillerMois(2026, 'NOVEMBRE', 'Administrateur'), r => r],
    ['initPaieEmploye', () => m.initPaieEmploye(emp.id, 2027, 'MARS'), r => r.success],
    ['initMoisPaie', () => m.initMoisPaie(2027, 'MARS', { inclureTousActifs: true }), r => r.success],
    ['toggleActifEmploye', () => m.toggleActifEmploye(emp.id, false, '2026-01-01'), r => r],
    ['updateEmploye', () => m.updateEmploye(emp.id, { ...emp, nom_prenoms: 'NON ENREGISTRE' }), r => r],
  ];
  const originalError = console.error;
  let quotaLogs = 0;
  console.error = (...args) => { if (String(args[0]).includes('Sauvegarde impossible')) quotaLogs++; else originalError(...args); };
  try {
    for (const [name, operation, success] of quotaCases) {
      const memory = JSON.stringify(m.getStore());
      const disk = storage.get('salfa_paie_store_v1');
      fail = true;
      assert.equal(success(await operation()), false, name);
      fail = false;
      assert.equal(JSON.stringify(m.getStore()), memory, `${name} : mémoire restaurée`);
      assert.equal(storage.get('salfa_paie_store_v1'), disk, `${name} : disque préservé`);
    }
  } finally { fail = false; console.error = originalError; }
  assert.equal(quotaLogs, quotaCases.length, 'toutes les opérations ont bien atteint le scénario d’échec de stockage');
  // L'import ne doit pas annoncer un succès ni conserver sa mutation après un quota.
  const beforeImport = JSON.stringify(m.getStore());
  const oldConsole = console.error;
  console.error = () => {};
  try {
    fail = true;
    await assert.rejects(m.importerClasseur({ employes: [{ numero_matricule: 99998, nom_prenoms: 'NON ENREGISTRE' }], paies: [] }, { mode: 'fusion', importPaies: true, ecraserPaies: true }), /non enregistré/);
    assert.equal(JSON.stringify(m.getStore()), beforeImport);
    const failedConges = await m.importerConges([], { mode: 'remplacement', ajusterSoldes: false });
    assert.ok(failedConges.messages.includes('Import non sauvegardé.'));
    assert.equal(JSON.stringify(m.getStore()), beforeImport);
  } finally { fail = false; console.error = oldConsole; }
  const closed = m.getStore().paies.filter(p => Number(p.verrouille) === 1).map(p => ({ ...p }));
  const conges = JSON.stringify(m.getStore().conges);
  await m.importerClasseur({ employes: [], paies: [] }, { mode: 'remplacement', importPaies: true, ecraserPaies: true });
  assert.deepEqual(m.getStore().paies, closed, 'le remplacement préserve les bulletins clôturés');
  assert.equal(JSON.stringify(m.getStore().conges), conges, 'les congés ne sont pas supprimés indirectement');
  for (const ligne of [...m.getStore().paies, ...m.getStore().conges]) assert.ok(m.getStore().employes.some(e => Number(e.id) === Number(ligne.employe_id)), 'aucune référence orpheline');
  console.log('Audit : paramètres à zéro, maternité bornée, règlements, périodes clôturées, dates, imports protégés et 10 scénarios de quota : OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
