// Rapprochement LISTE DE PERSONNEL, persistance, confidentialité et contrat.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-personnel-'));
const storage = new Map();
global.localStorage = {
  getItem: k => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: k => storage.delete(k),
};
try {
  function bundle(entry, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.png': 'dataurl' }, logLevel: 'silent' });
    return require(outfile);
  }
  const script = require('./completer-personnel.cjs');
  const XLSX = require('xlsx');
  const wb = XLSX.readFile('LISTE DE PERSONNEL.xlsx', { cellDates: true });
  const feuil1 = script.lireFeuil1(wb);
  const finale = script.lireListeFinale(wb);
  assert.equal(feuil1.length, 41);
  assert.equal(finale.length, 42);
  const seed = require('../src/data/salfa_data.json');
  const res = script.rapprocherPersonnel(seed.employes, feuil1, finale);
  assert.equal(res.entries.length, 35);
  assert.ok(res.nonRapproches.length >= 16);
  assert.ok(res.conflits.length >= 20);
  const copie = JSON.parse(JSON.stringify(seed.employes));
  const avant = JSON.stringify(copie);
  script.appliquerAuxFiches(copie, res.entries);
  script.appliquerAuxFiches(copie, res.entries);
  const stats = script.appliquerAuxFiches(copie, res.entries);
  assert.equal(stats.champs, 0, 'le rapprochement est idempotent et n’écrase pas les saisies');
  assert.ok(JSON.stringify(copie).length >= avant.length);

  const personnel = bundle('src/local/personnel.ts', 'personnel');
  const fiche = { numero_matricule: 1, nom_prenoms: 'TEST', cin: '', service: 'SAISIE MANUELLE' };
  personnel.appliquerPersonnelAuxFiches([fiche]);
  assert.ok(fiche.cin, 'CIN complété si vide');
  assert.equal(fiche.service, 'SAISIE MANUELLE', 'une saisie existante n’est pas écrasée');

  const api = bundle('src/api-local.ts', 'api');
  const contrat = bundle('src/contrat/model.ts', 'contrat');
  (async () => {
    await api.apiLogin('admin', 'admin123');
    const ok = await api.createEmploye({ numero_matricule: 99990, nom_prenoms: 'TEST PERSONNEL', cin: '123456789012', service: 'LABO', base_aj: 1000 });
    assert.equal(ok, true);
    let emp = (await api.fetchEmployes()).find(e => e.numero_matricule === 99990);
    assert.equal(emp.cin, '123456789012');
    assert.equal(emp.service, 'LABO');
    assert.equal(await api.updateEmploye(emp.id, { ...emp, adresse: 'Toliara', service: '' }), true);
    emp = (await api.fetchEmployes()).find(e => e.numero_matricule === 99990);
    assert.equal(emp.adresse, 'Toliara');
    assert.equal(emp.service, '');
    const rapport = await api.completerPersonnel();
    assert.equal(rapport.success, true);
    assert.ok(rapport.rapport.rapproches >= 35);

    const initial = contrat.initialiserContratDepuisEmploye(emp);
    assert.equal(initial.cin, '123456789012');
    assert.equal(initial.adresse, 'Toliara');

    await api.apiLogin('comptable', 'comptable123');
    const empComptable = (await api.fetchEmployes()).find(e => e.numero_matricule === 1);
    assert.equal(empComptable.cin, '', 'CIN masqué au Comptable');
    assert.equal(empComptable.adresse, '', 'adresse masquée au Comptable');
    assert.equal(empComptable.service, '', 'service masqué au Comptable');
    await assert.rejects(() => api.completerPersonnel(), /Accès refusé/);

    const schema = fs.readFileSync('wamp/api/schema.php', 'utf8');
    const index = fs.readFileSync('wamp/api/index.php', 'utf8');
    for (const col of personnel.CHAMPS_PERSONNEL) {
      assert.ok(schema.includes(`\`${col}\``), `colonne MySQL ${col}`);
    }
    assert.ok(schema.includes('ALTER TABLE `salfa_employes` ADD COLUMN'), 'migration automatique des colonnes personnel');
    assert.ok(index.includes("'completerPersonnel'"), 'action WAMP completerPersonnel autorisée');
    assert.ok(index.includes('$champPersonnel'), 'snapshot WAMP masque les données personnel au Comptable');
    console.log('Personnel : rapprochement, persistance, confidentialité, contrat et schéma WAMP : OK');
  })().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
} catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
