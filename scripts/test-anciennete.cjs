// node scripts/test-anciennete.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-anciennete-'));
const storage = new Map();
global.localStorage = {
  getItem: k => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: k => storage.delete(k),
};
function bundle(entry, name) {
  const outfile = path.join(tmp, name + '.cjs');
  esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  return require(outfile);
}
(async () => {
  const { calculerAnciennete: anc, evaluerBaseRevalorisee: evaluer } = bundle('src/local/calcul.ts', 'calcul');
  assert.equal(anc('2020-12-15', 2026, 'JANVIER'), 5);
  assert.equal(anc('2020-12-15', 2026, 'NOVEMBRE'), 5);
  assert.equal(anc('2020-12-15', 2026, 'DECEMBRE'), 6);
  assert.equal(anc('15/12/2020', 2026, 12), 6);
  assert.equal(anc('2020-01-31', 2026, 1), 6, 'le jour ne retarde pas le changement dans le mois anniversaire');
  assert.equal(anc('2024-02-29', 2026, 'février'), 2);
  assert.equal(anc('2020-08-31', 2026, 'AOÛT'), 6);
  for (const date of ['', 'invalide', '2020', '2020-13-15', '2020-00-01', '31/02/2020', '2027-01-01']) {
    assert.equal(anc(date, 2026, 6), 0, date);
  }
  for (const mois of [0, 13, NaN, 'INVALIDE']) assert.equal(anc('2020-06-01', 2026, mois), 0);
  const now = new Date();
  assert.equal(anc('2020-12-15'), Math.max(0, now.getFullYear() - 2020 - (now.getMonth() < 11 ? 1 : 0)));
  assert.equal(evaluer(300000, '2020-12-15', 2026, 11).base_revalorisee, 354000);
  assert.equal(evaluer(300000, '2020-12-15', 2026, 12).base_revalorisee, 381000);

  const api = bundle('src/api-local.ts', 'api');
  assert.equal(await api.createEmploye({ numero_matricule: 99999, nom_prenoms: 'TEST ANCIENNETE', date_embauche: '2020-12-15', base_aj: 300000 }), true);
  const emp = (await api.fetchEmployes()).find(e => e.numero_matricule === 99999);
  assert.ok(emp);
  for (const [mois, attendu] of [['JANVIER', 5], ['NOVEMBRE', 5], ['DECEMBRE', 6]]) {
    assert.equal((await api.initPaieEmploye(emp.id, 2026, mois)).created, true);
    const paie = (await api.fetchPaiesMois(2026, mois)).employes.find(p => p.employe_id === emp.id);
    assert.equal(paie.nombre_annees, attendu, mois);
    assert.equal(paie.anciennete2, 0, 'pas de nouvelle prime automatique');
  }
  await api.cloturerMois(2026, 'JANVIER');
  assert.equal(await api.updateEmploye(emp.id, { ...emp, date_embauche: '2020-11-30' }), true);
  const novembre = (await api.fetchPaiesMois(2026, 'NOVEMBRE')).employes.find(p => p.employe_id === emp.id);
  assert.equal(novembre.nombre_annees, 6, 'la correction de date utilise le mois du bulletin ouvert');
  const janvier = (await api.fetchPaiesMois(2026, 'JANVIER')).employes.find(p => p.employe_id === emp.id);
  assert.equal(janvier.nombre_annees, 5, 'le bulletin verrouillé reste inchangé');
  console.log('Ancienneté au mois anniversaire : calcul, barème, création et mise à jour des bulletins OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
