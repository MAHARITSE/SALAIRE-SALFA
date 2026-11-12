const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-sql-menu-'));
try {
  for (const wamp of [false, true]) {
    const outfile = path.join(tmp, `${wamp}.cjs`);
    esbuild.buildSync({
      stdin: { contents: `export {SauvegardeSqlModal} from './src/components/SauvegardeSqlModal';
        export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';`, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent', loader: { '.png': 'dataurl' },
      define: { 'import.meta.env.VITE_BACKEND': JSON.stringify(wamp ? 'wamp' : 'local') },
    });
    const m = require(outfile);
    const html = m.renderToStaticMarkup(m.createElement(m.SauvegardeSqlModal, { onClose() {} }));
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /Télécharger la sauvegarde SQL/);
    assert.match(html, /Dernières sauvegardes/);
    if (wamp) {
      assert.match(html, /type="file" accept=".sql"/);
      assert.match(html, /Saisissez RESTAURER/);
      assert.match(html, /comptes et mots de passe actuels sont conservés/);
      assert.match(html, /disabled=""[^>]*>.*?Restaurer la sauvegarde SQL/s);
    } else {
      assert.doesNotMatch(html, /type="file"/);
      assert.match(html, /version finale WAMP/);
    }
  }
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.doesNotMatch(app, /ImportExcelModal|Importer Excel|showImportModal/);
  assert.match(app, /showSqlModal && estAdmin/);
  assert.match(app, /Sauvegarde et restauration SQL/);
  const php = fs.readFileSync('wamp/api/index.php', 'utf8');
  const restore = php.slice(php.indexOf("if ($action === 'sql_backup_restore'"), php.indexOf("if ($action === 'sql_backups_list'"));
  assert.match(restore, /Administrateur/);
  assert.match(restore, /FOR UPDATE/);
  assert.match(restore, /server_saved/);
  assert.match(restore, /rollBack/);
  assert(restore.indexOf('saveSqlBackupOnDisk') < restore.indexOf('salfaApplyRestore'));
  console.log('Menu SQL : import Excel retiré, accès administrateur, export local/WAMP, restauration WAMP explicitement confirmée, sauvegarde de sécurité et transaction : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
