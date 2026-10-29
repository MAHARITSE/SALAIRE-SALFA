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
  let needsDbConfig = false;
  global.window = { alert: message => alerts.push(message) };
  global.fetch = async (url, options) => {
    const action = new URL(url, 'http://test/').searchParams.get('action');
    let status = 200, data = {};
    if (action === 'login') {
      if (needsDbConfig) {
        status = 503;
        data = { error: 'Connexion MySQL WAMP requise.', code: 'NEEDS_DB_CONFIG', canConfigure: true };
      } else {
        data = { csrf: 'token', user: { id: 1, username: 'test', nom_complet: 'Test', role: 'Administrateur', actif: 1 } };
      }
    }
    else if (action === 'setup_db') {
      const body = JSON.parse(options.body);
      assert.equal(body.db, 'salfa_paie');
      needsDbConfig = false;
      data = { success: true, message: 'Serveur WAMP configuré.' };
    }
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
  // Test auto-diagnostic / configuration MySQL WAMP depuis la fenêtre de connexion
  needsDbConfig = true;
  await client.remoteLogout();
  let capturedErr = null;
  try { await client.remoteLogin('admin', 'admin123'); } catch (e) { capturedErr = e; }
  assert.ok(capturedErr && capturedErr.code === 'NEEDS_DB_CONFIG' && capturedErr.canConfigure === true, 'code NEEDS_DB_CONFIG propagé au formulaire de connexion');
  const setupRes = await client.remoteSetupDb({ host: '127.0.0.1', port: 3306, db: 'salfa_paie', user: 'root', pass: '' });
  assert.equal(setupRes.success, true);
  await client.remoteLogin('test', 'motdepasse');
  assert.equal(client.getStore().employes.length, 1);

  // Vérification structurelle de wamp/api/index.php, wamp/api/schema.php et des fichiers SQL relationnels
  const php = fs.readFileSync(path.join(process.cwd(), 'wamp/api/index.php'), 'utf8');
  const schemaPhp = fs.readFileSync(path.join(process.cwd(), 'wamp/api/schema.php'), 'utf8');
  assert.ok(php.includes('function openPdoWithAutoCreateDb'), 'auto-création DB présente dans index.php');
  assert.ok(schemaPhp.includes('function ensureSalfaInitialized'), 'auto-initialisation des tables relationnelles dans schema.php');
  assert.ok(schemaPhp.includes('CREATE TABLE IF NOT EXISTS `salfa_employes`'), 'table relationnelle salfa_employes');
  assert.ok(schemaPhp.includes('CREATE TABLE IF NOT EXISTS `salfa_paies`'), 'table relationnelle salfa_paies');
  assert.ok(schemaPhp.includes('CREATE TABLE IF NOT EXISTS `salfa_conges`'), 'table relationnelle salfa_conges');
  assert.ok(schemaPhp.includes('DROP TABLE IF EXISTS `salfa_state`'), 'suppression automatique de l’ancienne table JSON salfa_state');
  assert.ok(!php.includes('store_json') && !php.includes('config_json') && !php.includes('header_json'), 'aucune écriture JSON MySQL dans index.php');
  assert.ok(php.includes("$action === 'setup_db'"), 'endpoint setup_db présent dans index.php');
  assert.ok(php.includes("'saisirSoldeAnnee'"), 'action saisirSoldeAnnee autorisée pour Comptable dans index.php');
  assert.ok(!php.includes('Serveur non configuré. Consultez le guide WAMP.'), 'ancien message bloquant supprimé');

  for (const sqlRel of ['wamp/sql/salfa_donnees_excel_2022-2026.sql', 'wamp/sql/salfa_conges_excel.sql']) {
    const sqlTxt = fs.readFileSync(path.join(process.cwd(), sqlRel), 'utf8');
    assert.ok(!sqlTxt.includes('store_json') && !sqlTxt.includes('config_json') && !sqlTxt.includes('header_json'), `${sqlRel} ne contient aucune colonne JSON`);
    assert.ok(sqlTxt.includes('DROP TABLE IF EXISTS `salfa_state`;'), `${sqlRel} supprime l’ancienne table salfa_state`);
    assert.ok(sqlTxt.includes('INSERT IGNORE INTO `salfa_users`') && sqlTxt.includes("'admin'") && sqlTxt.includes("'comptable'"), `${sqlRel} inclut les utilisateurs par défaut`);
    assert.ok(sqlTxt.includes('INSERT INTO `salfa_conges`'), `${sqlRel} insère les congés en lignes et colonnes`);
  }

  console.log('Mode WAMP : tables relationnelles MySQL (zéro JSON), utilisateurs SQL par défaut, auto-config, conflit et déconnexion : OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
