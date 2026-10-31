// npm install ; node scripts/test-workbook.cjs
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-test-'));
try {
  function bundle(source, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({ entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
    return require(outfile);
  }
  const seed = require('../src/data/salfa_data.json');
  const { parseWorkbook } = bundle('src/local/importExcel.ts', 'import');
  const bytes = fs.readFileSync('SALAIRE SALFA 2026.xlsm');
  const result = parseWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'classeur.xlsm');
  assert.equal(result.employes.length, 50);
  assert.equal(result.paies.length, 470);
  assert.equal(result.periodes.length, 10);
  assert.equal(seed.employes.filter(e => e.actif).length, 48);
  assert.equal(seed.employes.length, 50);
  assert.equal(seed.paies.length, 470);
  const ecarts = [];
  for (const row of result.paies) {
    const reference = seed.paies.find(p => p.numero_matricule === row.numero_matricule && p.mois === row.mois && p.annee === row.annee);
    assert.ok(reference);
    for (const key of Object.keys(row)) {
      if (!isDeepStrictEqual(row[key], reference[key])) ecarts.push({ periode: `${row.mois} ${row.annee}`, matricule: row.numero_matricule, champ: key, classeur: row[key], donneesInitiales: reference[key] });
    }
    assert.equal(seed.employes.find(e => e.id === reference.employe_id).numero_matricule, row.numero_matricule);
  }
  assert.ok(result.avertissements.some(w => w.includes('OCTOBRE')));
  const key = 'salfa_paie_store_v1';
  const old = { meta: {}, employes: [{ id: 4, numero_matricule: 1, nom_prenoms: 'Modification conservée', actif: 1 }], paies: [{ id: 5, employe_id: 4, numero_matricule: 1, annee: 2026, mois: 'JANVIER', net: 123, verrouille: 1 }], utilisateurs: [] };
  const storage = new Map([[key, JSON.stringify(old)]]);
  global.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const store = bundle('src/local/store.ts', 'store');
  const migrated = store.loadStore();
  assert.equal(migrated.employes.length, 50);
  assert.equal(migrated.employes.find(e => e.numero_matricule === 1).nom_prenoms, 'Modification conservée');
  assert.equal(migrated.paies.filter(p => p.mois === 'JANVIER').length, 1);
  assert.equal(migrated.paies.find(p => p.mois === 'JANVIER').net, 123);
  assert.equal(migrated.paies.filter(p => p.mois === 'OCTOBRE').length, 48);
  assert.equal(new Set(migrated.paies.map(p => p.id)).size, migrated.paies.length);
  for (const p of migrated.paies) assert.equal(migrated.employes.find(e => e.id === p.employe_id).numero_matricule, p.numero_matricule);
  store.resetStore();
  assert.equal(store.loadStore().paies.length, 470);
  store.loadStore().employes[0].nom_prenoms = 'Modifié';
  store.loadStore().paies.pop();
  store.resetStore();
  assert.equal(store.loadStore().employes[0].nom_prenoms, seed.employes[0].nom_prenoms);
  assert.equal(store.loadStore().paies.length, 470);
  console.log('Migration et réinitialisation du stockage : OK');
  assert.deepEqual(ecarts, [], 'Les valeurs Excel et les données initiales divergent (aucune correction financière automatique).');
  console.log('Classeur et données initiales : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
