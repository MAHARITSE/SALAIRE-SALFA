const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-controles-'));
try {
  const outfile = path.join(tmp, 'controles.cjs');
  esbuild.buildSync({
    stdin: { contents: `export * from './src/components/ControlesFlottants';
      export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent',
  });
  const m = require(outfile);
  let valeur = null;
  global.localStorage = { getItem: () => valeur };
  assert.equal(m.lireTailleAffichage(), 16);
  for (const invalide of ['NaN', '-20', '999', '16px', '0']) {
    valeur = invalide; assert.equal(m.lireTailleAffichage(), 16);
  }
  for (const niveau of m.NIVEAUX_TAILLE) {
    valeur = String(niveau); assert.equal(m.lireTailleAffichage(), niveau);
  }
  global.localStorage = { getItem() { throw new Error('Stockage bloqué'); } };
  assert.equal(m.lireTailleAffichage(), 16);
  global.localStorage = { getItem: () => '16' };
  for (const theme of ['light', 'dark']) {
    const html = m.renderToStaticMarkup(m.createElement(m.ControlesFlottants, {
      theme, toggleTheme() {},
    }));
    assert.match(html, /no-print/);
    assert.match(html, /<style media="screen">:root \{ font-size: 16px; \}/);
    assert.equal((html.match(/<button\b/g) || []).length, 4, 'zoom et thème uniquement');
    assert.doesNotMatch(html, /Bell|cloche|Compte et administration/);
    assert.match(html, /Réduire la taille de police/);
    assert.match(html, /Augmenter la taille de police/);
    assert.match(html, /réinitialiser à 100%/);
    assert.match(html, theme === 'dark' ? /Activer le mode clair/ : /Activer le mode sombre/);
  }
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.doesNotMatch(app, /<Bell\b/);
  assert.match(app, /aria-label=\{estAdmin \? 'Administration'/);
  assert.match(app, /role="menuitem"/);
  assert.match(app, /onClick=\{handleLogout\}/);
  console.log('Contrôles flottants : tailles bornées et validées, stockage facultatif, thème, menu conservé, taille limitée à l’écran : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
