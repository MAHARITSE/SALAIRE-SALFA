const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-login-caisse-'));
try {
  for (const wamp of [false, true]) {
    const outfile = path.join(tmp, wamp ? 'wamp.cjs' : 'local.cjs');
    esbuild.buildSync({
      stdin: { contents: `export { DEFAULT_APP_ICON, setCachedFavicon } from './src/local/favicon';
        export { LoginModal } from './src/components/LoginModal';
        export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.png': 'dataurl' }, logLevel: 'silent',
      define: { 'import.meta.env.VITE_BACKEND': JSON.stringify(wamp ? 'wamp' : 'local') },
    });
    const m = require(outfile);
    for (const theme of ['light', 'dark']) {
      const html = m.renderToStaticMarkup(m.createElement(m.LoginModal, { theme, onSuccess() {}, toggleTheme() {} }));
      assert.match(html, /login-page/);
      assert.match(html, /login-card/);
      assert.match(html, /max-w-md/);
      assert.match(html, /bg-brand-700/);
      assert.match(html, /dark:bg-brand-600/);
      assert.match(html, /dark:bg-slate-950/);
      assert.match(html, /CLINIQUE SALFA TANAMBAO/);
      assert.match(html, /Connexion à la Paie et Congé/);
      assert.match(html, /<img[^>]+alt="Icône de l’application"/);
      assert.ok(html.includes(m.DEFAULT_APP_ICON), 'icône SALFA par défaut');
      assert.doesNotMatch(html, /lucide-heart-pulse/);
      assert.match(html, /<main[^>]+aria-labelledby="connexion-title"/);
      assert.match(html, /<h1 id="connexion-title"/);
      assert.match(html, /<label for="login-username"/);
      assert.match(html, /<label for="login-password"/);
      assert.match(html, /id="login-username"[^>]+name="username"[^>]+type="text"[^>]+autoComplete="username"[^>]+required=""[^>]+value=""/);
      assert.match(html, /id="login-password"[^>]+name="password"[^>]+type="password"[^>]+autoComplete="current-password"[^>]+required=""[^>]+value=""/);
      assert.match(html, /aria-label="Afficher le mot de passe"/);
      assert.match(html, /aria-controls="login-password"/);
      assert.match(html, /aria-label="Changer thème"/);
      assert.match(html, /Se connecter/);
      assert.match(html, /1 heure sans contact/);
      assert.match(html, wamp ? /Version réseau/ : /Mode local/);
      assert.doesNotMatch(html, /admin123|comptable123|admin1234|Comptes de démonstration/);
      assert.doesNotMatch(html, /modal-mobile|backdrop-blur|bg-salfa-dark/);
      assert.equal((html.match(/<form\b/g) || []).length, 1, 'un seul formulaire, sans formulaire imbriqué');
    }
    const cache = new Map();
    global.localStorage = { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v), removeItem: k => cache.delete(k) };
    const personnalisee = 'data:image/png;base64,SU5DT05F';
    m.setCachedFavicon(personnalisee);
    const customHtml = m.renderToStaticMarkup(m.createElement(m.LoginModal, { theme: 'light', onSuccess() {}, toggleTheme() {} }));
    assert.ok(customHtml.includes(`src="${personnalisee}"`), 'icône personnalisée disponible avant connexion, local et WAMP');
    delete global.localStorage;
  }
  const source = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');
  assert.match(source, /apiLogin\(username, password\)/);
  assert.match(source, /remoteSetupDb\(/);
  assert.match(source, /err\?\.canConfigure !== false/);
  assert.match(source, /WAMP && needsDbSetup/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /disabled=\{loading\}/);
  assert.match(source, /disabled=\{savingDb\}/);
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /useState<ThemeMode>\(\(\) => getStoredTheme\(\)/, 'le premier rendu utilise la préférence au lieu de l’écraser sous StrictMode');
  console.log('Connexion style Caisse : carte verte claire/sombre, champs vides accessibles, visibilité du mot de passe, champs initialement vides et WAMP sans démo, authentification et configuration WAMP conservées : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
