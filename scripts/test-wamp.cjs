// npm install ; node scripts/test-wamp.cjs
// Teste l'adaptateur réseau avec serveur simulé, sans données réelles ni MySQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const esbuild = require('esbuild');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-wamp-test-'));
(async () => {
  const outfile = path.join(temp, 'client.cjs');
  esbuild.buildSync({ stdin: { contents: "export * from './src/wampClient'; export {getStore} from './src/local/store';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.png': 'dataurl' }, logLevel: 'silent' });
  const client = require(outfile);
  const copy = v => JSON.parse(JSON.stringify(v));
  let revision = 0;
  let store = { meta: { source_version: 'classeur-2026-10' }, bareme_anciennete: {}, employes: [], paies: [], comparaison_net: [], utilisateurs: [] };
  const alerts = [];
  let failLogout = false;
  global.window = { alert: message => alerts.push(message) };
  global.fetch = async (url, options) => {
    const action = new URL(url, 'http://test/').searchParams.get('action');
    let status = 200, data = {};
    if (action === 'login') data = { csrf: 'token', user: { id: 1, username: 'test', nom_complet: 'Test', role: 'Administrateur', actif: 1 } };
    else if (action === 'logout') { assert.equal(options.headers['X-Salfa-CSRF'], 'token'); if (failLogout) { status = 503; data = {error: 'Serveur indisponible'}; } else data = {success: true}; }
    else if (action === 'snapshot') data = { revision, store: copy(store), config: null, header: null };
    else if (action === 'save') {
      const body = JSON.parse(options.body);
      if (body.revision !== revision) { status = 409; data = { error: 'Données modifiées sur un autre poste.' }; }
      else { store = copy(body.store); data = { revision: ++revision }; }
    }
    return { ok: status === 200, status, json: async () => data };
  };
  await client.remoteLogin('test', 'motdepasse');
  assert.equal(client.getStore().employes.length, 0);
  const ok = await client.remoteWrite('createEmploye', async () => { client.getStore().employes.push({ id: 1, numero_matricule: 1 }); return true; }, false);
  assert.equal(ok, true); assert.equal(store.employes.length, 1);
  // Une écriture concurrente rend la révision du poste obsolète.
  revision++;
  const conflict = await client.remoteWrite('createEmploye', async () => { client.getStore().employes.push({ id: 2, numero_matricule: 2 }); return true; }, false);
  assert.equal(conflict, false); assert.equal(store.employes.length, 1); assert.equal(client.getStore().employes.length, 1); assert.ok(alerts.length);
  const blocked = await client.remoteWrite('createEmploye', async () => { throw new Error('ne doit pas être appelée'); }, false);
  assert.equal(blocked, false);
  failLogout = true;
  await assert.rejects(client.remoteLogout(), /Serveur indisponible/);
  assert.equal(client.getStore().employes.length, 1, 'une déconnexion échouée conserve la session pour réessayer');
  failLogout = false;
  await client.remoteLogout();
  assert.throws(() => client.getStore(), /Session serveur absente/);
  await client.remoteLogin('test', 'motdepasse');
  assert.equal(client.getStore().employes.length, 1, 'les données restent sur le serveur après déconnexion');
  console.log('Mode WAMP : stockage vide, transaction simulée, conflit et déconnexion : OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
