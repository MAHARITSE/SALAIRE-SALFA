// npm install ; node scripts/test-bulletin.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const XLSX = require('xlsx');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-bulletin-test-'));
try {
  function bundle(entry, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
    return require(outfile);
  }
  const {
    construireBulletin,
    montantEnLettres,
    montantEnLettresBulletin,
    formatMontantBulletin,
    formatEmbaucheBulletin,
    formatCnapsBulletin,
    formatCongesRestantsBulletin,
  } = bundle('src/bulletin/model.ts', 'model');
  const seed = require('../src/data/salfa_data.json');
  const p = seed.paies.find(p => p.annee === 2026 && p.mois === 'OCTOBRE' && p.numero_matricule === 47);
  const b = construireBulletin(p);
  const xls = XLSX.readFile('SALAIRE SALFA 2026.xlsm');
  const ws = xls.Sheets.BULLETIN;
  const close = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} ≠ ${b}`);
  close(b.lignes.find(r => r.libelle === 'TOTAL').gain, ws.E22.v);
  close(b.gains, ws.E29.v); close(b.retenues, ws.F29.v); close(b.net, ws.F30.v);
  assert.equal(b.netEnregistre, 1838800);
  assert.equal(b.ecartNet, true);
  assert.equal(montantEnLettres(b.net), 'un million huit cent trente-huit mille huit cent quarante-neuf ariary et quatre-vingt-six centimes');
  assert.equal(montantEnLettres(0), 'zéro ariary');
  assert.equal(montantEnLettres(81.01), 'quatre-vingt-un ariary et un centime');
  assert.equal(
    montantEnLettresBulletin(400035.84),
    'Quatre Cents Mille Trente-Cinq Ariary Quatre-Vingt-Quatre'
  );
  assert.equal(
    montantEnLettresBulletin(1838849.86),
    'Un Million Huit Cent Trente-Huit Mille Huit Cent Quarante-Neuf Ariary Quatre-Vingt-Six'
  );
  assert.equal(formatMontantBulletin(0), '-');
  assert.equal(formatEmbaucheBulletin('1992-01-01'), 'janv.-92');
  assert.equal(formatCnapsBulletin('863892'), '863 892');
  assert.equal(formatCongesRestantsBulletin(85), '85');
  assert.equal(formatCongesRestantsBulletin(undefined), '........');
  const storage = new Map();
  global.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const api = bundle('src/api-local.ts', 'api');
  (async () => {
    const avant = await api.fetchPaiesMois(2026, 'OCTOBRE');
    assert.equal(avant.employes.length, 48);
    // Le relevé source fournit un solde restant de 30 j pour Mat 47 en 2026.
    assert.equal(avant.employes.find(p => p.numero_matricule === 47).conge_restant, 30);
    assert.equal((await api.fetchPaiesMois(2027, 'OCTOBRE')).employes.length, 0);
    const emp = (await api.fetchEmployes(true)).find(e => e.numero_matricule === 47);
    await api.initPaieEmploye(emp.id, 2027, 'OCTOBRE');
    assert.equal((await api.fetchPaiesMois(2027, 'OCTOBRE')).employes.length, 1);
    assert.equal((await api.fetchPaiesMois(2026, 'OCTOBRE')).employes.length, 48);
    console.log('Bulletin Excel et séparation annuelle : OK');
  })().catch(e => { console.error(e); process.exitCode = 1; });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
