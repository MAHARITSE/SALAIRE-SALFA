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
  esbuild.buildSync({
    stdin: {
      contents: [
        "export * from './src/wampClient';",
        "export {getStore} from './src/local/store';",
        "export {loadConfig, saveConfig, resetConfig} from './src/local/config';",
        "export {applyAppFavicon, getCachedFavicon, PRESET_APP_ICONS} from './src/local/favicon';",
        "export {getDerniereSauvegardeSql, setDerniereSauvegardeSql} from './src/local/sqlBackup';",
        "export * as localApi from './src/api-local';",
      ].join('\n'),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    loader: { '.png': 'dataurl' },
    logLevel: 'silent',
  });
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
      else {
        store = copy(body.store);
        const nextRev = ++revision;
        data = { revision: nextRev };
        if (body.action === 'cloturerMois') {
          data.backup = {
            filename: 'salfa_paie_cloture_2026_OCTOBRE_20261029_120000.sql',
            size: 12345,
            created_at: '2026-10-29T12:00:00Z',
            motif: 'Clôture de caisse / paie validée',
            sql: '-- Sauvegarde SQL relationnelle forcée clôture\nCREATE DATABASE IF NOT EXISTS `salfa_paie`;\nDROP TABLE IF EXISTS `salfa_state`;\n',
          };
        }
      }
    }
    else if (action === 'sql_backups_list') {
      data = { backups: [{ filename: 'salfa_paie_cloture_2026_OCTOBRE_20261029_120000.sql', size: 12345, createdAt: '2026-10-29T12:00:00Z', source: 'serveur-wamp' }] };
    }
    else if (action === 'sql_backup_export') {
      data = {
        success: true,
        filename: 'salfa_paie_sauvegarde_20261029_120500.sql',
        size: 54321,
        createdAt: '2026-10-29T12:05:00Z',
        motif: 'administration-manuel',
        sql: '-- Export SQL manuel WAMP\nCREATE DATABASE IF NOT EXISTS `salfa_paie`;\nDROP TABLE IF EXISTS `salfa_state`;\n',
      };
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
  assert.ok(schemaPhp.includes('CREATE TABLE IF NOT EXISTS `salfa_annees`'), 'table relationnelle salfa_annees pour les années ajoutées');
  assert.ok(php.includes("'ajouterAnnee'"), 'action ajouterAnnee prise en charge dans index.php');
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
    assert.ok(sqlTxt.includes('`icone_app` LONGTEXT NULL'), `${sqlRel} inclut la colonne icone_app dans salfa_config`);
    assert.ok(sqlTxt.includes('`plafond_cumul_conge` DOUBLE NOT NULL DEFAULT 30'), `${sqlRel} plafonne les congés à 30 j/an`);
    assert.ok(sqlTxt.includes('`report_autorise` TINYINT NOT NULL DEFAULT 0'), `${sqlRel} désactive le report cumulé inter-annuel`);
  }

  // Vérification des endpoints PHP de sauvegarde SQL forcée à la clôture + icône application
  assert.ok(php.includes("($input['action'] ?? '') === 'cloturerMois'"), 'clôture détectée dans index.php pour sauvegarde SQL forcée');
  assert.ok(php.includes('saveSqlBackupOnDisk'), 'sauvegarde SQL sur disque présente dans index.php');
  assert.ok(php.includes("$action === 'sql_backups_list'"), 'endpoint sql_backups_list présent dans index.php');
  assert.ok(php.includes("$action === 'sql_backup_export'"), 'endpoint sql_backup_export présent dans index.php');
  assert.ok(php.includes("$action === 'sql_backup_download'"), 'endpoint sql_backup_download présent dans index.php');
  assert.ok(schemaPhp.includes('`icone_app` LONGTEXT NULL'), 'colonne icone_app présente dans schema.php');
  assert.ok(schemaPhp.includes('function generateRelationalSqlDump'), 'générateur de dump SQL relationnel présent dans schema.php');

  // Test sauvegarde SQL forcée lors de remoteWrite('cloturerMois') en mode WAMP
  const localStorageMap = new Map();
  global.localStorage = {
    getItem: k => (localStorageMap.has(k) ? localStorageMap.get(k) : null),
    setItem: (k, v) => localStorageMap.set(k, String(v)),
    removeItem: k => localStorageMap.delete(k),
  };
  client.setDerniereSauvegardeSql(null);
  const clotureWampRes = await client.remoteWrite('cloturerMois', async () => {
    client.getStore().paies.push({ id: 1, employe_id: 1, numero_matricule: 1, annee: 2026, mois: 'OCTOBRE', verrouille: 1 });
    return true;
  }, false);
  assert.equal(clotureWampRes, true);
  const lastWampBkp = client.getDerniereSauvegardeSql();
  assert.ok(lastWampBkp && lastWampBkp.type === 'CLOTURE' && lastWampBkp.server_saved === true, 'clôture WAMP enregistre et déclenche la sauvegarde SQL forcée');
  assert.match(lastWampBkp.filename, /cloture_2026_OCTOBRE/i);

  const expWamp = await client.remoteExportSqlBackup({ type: 'MANUELLE', telecharger: false });
  assert.equal(expWamp.success, true);
  assert.match(expWamp.filename, /\.sql$/);
  const histWamp = await client.remoteListSqlBackups();
  assert.ok(histWamp.length >= 1, 'historique des sauvegardes SQL WAMP récupéré');

  await client.remoteLogout();

  // Test en mode local (bundle isolé hors session WAMP) : icône application (favicon) + export SQL relationnel + sauvegarde SQL forcée à la clôture
  const outfileLocal = path.join(temp, 'local.cjs');
  esbuild.buildSync({
    stdin: {
      contents: [
        "export {loadConfig, saveConfig, resetConfig} from './src/local/config';",
        "export {applyAppFavicon, getCachedFavicon, PRESET_APP_ICONS} from './src/local/favicon';",
        "export {getDerniereSauvegardeSql, setDerniereSauvegardeSql} from './src/local/sqlBackup';",
        "export * as localApi from './src/api-local';",
      ].join('\n'),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outfileLocal,
    loader: { '.png': 'dataurl' },
    logLevel: 'silent',
  });
  const localMod = require(outfileLocal);
  localStorageMap.clear();
  const linksCreated = [];
  global.document = {
    getElementById: id => linksCreated.find(el => el.id === id) || null,
    querySelectorAll: () => linksCreated,
    createElement: tag => {
      const el = { tagName: tag, rel: '', type: '', href: '', id: '' };
      return el;
    },
    head: { appendChild: el => linksCreated.push(el) },
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  assert.ok(fs.existsSync(path.join(process.cwd(), 'public/favicon.png')), 'public/favicon.png présent pour remplacer l’icône WampServer');
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="salfa-favicon"') && indexHtml.includes('favicon.png'), 'index.html déclare le favicon SALFA');

  assert.ok(localMod.PRESET_APP_ICONS.length >= 2, 'icônes officielles SALFA/FLM disponibles dans Administration');
  const testIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const curCfg = localMod.loadConfig();
  localMod.saveConfig({ ...curCfg, iconeApp: testIcon });
  assert.equal(localMod.loadConfig().iconeApp, testIcon, 'iconeApp persistée dans la configuration');
  localMod.applyAppFavicon(testIcon);
  assert.equal(localMod.getCachedFavicon(), testIcon, 'icône mise en cache pour démarrage instantané');
  assert.ok(linksCreated.length >= 2 && linksCreated[0].href === testIcon, 'balises <link rel="icon"> mises à jour dans document.head');
  const afterResetCfg = localMod.resetConfig();
  assert.equal(afterResetCfg.iconeApp, testIcon, 'resetConfig des barèmes préserve l’icône personnalisée');

  // Test ajout d'année + sauvegarde SQL manuelle (Administration -> Sauvegarde SQL) en mode local
  const addYearLocal = await localMod.localApi.ajouterAnneeBase(2027);
  assert.equal(addYearLocal.success, true, 'ajout année 2027 en mode local');
  const manualSql = await localMod.localApi.exporterSauvegardeSqlLocale({ telecharger: false, motif: 'test-admin' });
  assert.equal(manualSql.success, true);
  assert.ok(manualSql.sql.includes('CREATE TABLE IF NOT EXISTS `salfa_employes`'), 'dump SQL relationnel complet');
  assert.ok(manualSql.sql.includes('CREATE TABLE IF NOT EXISTS `salfa_annees`'), 'table relationnelle salfa_annees incluse dans le dump SQL');
  assert.ok(manualSql.sql.includes('INSERT INTO `salfa_annees`') && manualSql.sql.includes('(2027,'), 'année 2027 exportée en ligne/colonne dans salfa_annees');
  assert.ok(manualSql.sql.includes('DROP TABLE IF EXISTS `salfa_state`;'), 'dump SQL supprime salfa_state');
  assert.ok(!manualSql.sql.includes('store_json') && !manualSql.sql.includes('config_json'), 'zéro JSON dans le dump SQL');
  assert.ok(manualSql.sql.includes('INSERT IGNORE INTO `salfa_users`'), 'utilisateurs par défaut inclus dans le dump SQL');
  assert.ok(manualSql.sql.includes('data:image/png;base64,'), 'icone_app incluse dans salfa_config du dump SQL');

  // Test clôture de paie/caisse -> sauvegarde SQL forcée automatique en mode local
  localMod.setDerniereSauvegardeSql(null);
  const clotureLocal = await localMod.localApi.cloturerMois(2026, 'OCTOBRE');
  assert.equal(clotureLocal, true, 'clôture OCTOBRE 2026 validée');
  const bkpLocal = localMod.getDerniereSauvegardeSql();
  assert.ok(bkpLocal && bkpLocal.type === 'CLOTURE', 'clôture force automatiquement la sauvegarde SQL');
  assert.match(bkpLocal.filename, /CLOTURE.*OCTOBRE_2026|OCTOBRE.*2026/i);
  const histLocal = await localMod.localApi.fetchHistoriqueSauvegardesSqlLocale();
  assert.ok(histLocal.some(h => h.type === 'CLOTURE'), 'sauvegarde forcée enregistrée dans le journal SQL');

  // Vérification WAMP PHP pour la fusion de salariés en doublon (bulletins clôturés rattachés + ordre FK)
  const phpIndex = fs.readFileSync(path.join(process.cwd(), 'wamp/api/index.php'), 'utf8');
  const phpVal = fs.readFileSync(path.join(process.cwd(), 'wamp/api/validation.php'), 'utf8');
  const phpSchema = fs.readFileSync(path.join(process.cwd(), 'wamp/api/schema.php'), 'utf8');
  assert.ok(phpIndex.includes("'fusionnerEmployes'"), 'wamp/api/index.php autorise fusionnerEmployes pour Administrateur');
  assert.ok(phpVal.includes("$action === 'fusionnerEmployes'"), 'wamp/api/validation.php gère le rattachement des bulletins clôturés lors de la fusion');
  assert.ok(phpIndex.includes("'congeHeader'") && phpIndex.includes('writeHeaderTable($db, $value, 2)'), 'wamp/api/index.php enregistre l’entête congé dans salfa_entete (id = 2)');
  assert.ok(phpSchema.includes("'congeHeader' => loadRelationalHeader($db, 2)"), 'wamp/api/schema.php charge congeHeader depuis salfa_entete (id = 2)');
  assert.ok(manualSql.sql.includes('(1, ') && manualSql.sql.includes('(2, ') && manualSql.sql.includes('INSERT INTO `salfa_entete`'), 'dump SQL exporte les deux lignes relationnelles (1 = bulletin, 2 = congé) de salfa_entete');

  console.log('Mode WAMP, Sauvegarde SQL forcée à la clôture & Icône application : OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(temp, { recursive: true, force: true }));
