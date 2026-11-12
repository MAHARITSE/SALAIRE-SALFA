// Thème d'écran : identité CAISSE-SALFA, connexion et documents imprimés isolés.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-theme-'));

try {
  const outfile = path.join(tmp, 'theme.cjs');
  esbuild.buildSync({
    stdin: {
      contents: `
        export { ApplicationHeader, PageHeading } from './src/components/ApplicationHeader';
        export { LoginModal } from './src/components/LoginModal';
        export { createElement } from 'react';
        export { renderToStaticMarkup } from 'react-dom/server';`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', outfile,
    loader: { '.png': 'dataurl' }, logLevel: 'silent',
    define: { 'import.meta.env.VITE_BACKEND': '"local"' },
  });
  const m = require(outfile);
  const render = (component, props) => m.renderToStaticMarkup(m.createElement(component, props));
  const header = render(m.ApplicationHeader, {
    navigation: m.createElement('nav', { 'aria-label': 'Navigation principale' }, 'NAVIGATION EXISTANTE'),
    actions: m.createElement('button', { type: 'button' }, 'ACTION RESTAURÉE'),
  });
  assert.match(header, /NAVIGATION EXISTANTE/);
  assert.match(header, /ACTION RESTAURÉE/);
  assert.match(header, /<time[^>]+dateTime="\d{4}-\d{2}-\d{2}"/);
  assert.match(header, /no-print/);
  assert.doesNotMatch(header, /caisse-header-top|GESTION DE PAIE|caisse-profile|Exercice|Administration/);
  const titres = {
    salaries: 'Salariés &amp; état de paie', bulletins: 'Bulletins de paie',
    rapports: 'Rapports &amp; exports', conges: 'Congés &amp; permissions',
  };
  for (const [onglet, titre] of Object.entries(titres)) {
    const page = render(m.PageHeading, { onglet });
    assert.match(page, /<h1/);
    assert.match(page, /^<section/, 'ne pas utiliser un div direct de main : les anciens styles d’impression le forceraient à rester visible');
    assert.ok(page.includes(titre), `titre de ${onglet}`);
    assert.match(page, /no-print/);
  }
  const login = render(m.LoginModal, { theme: 'light', toggleTheme() {}, onSuccess() {} });
  assert.match(login, /CLINIQUE SALFA TANAMBAO/);
  assert.match(login, /login-card/);
  assert.match(login, /bg-brand-700/);
  assert.doesNotMatch(login, /theme-caisse|caisse-header|caisse-card/);
  assert.doesNotMatch(login, /admin123|comptable123/);

  const css = fs.readFileSync('src/theme-caisse.css', 'utf8');
  const ast = postcss.parse(css);
  ast.walkRules(rule => {
    assert.ok(rule.selector.split(',').every(selector => selector.includes('.theme-caisse')), `sélecteur limité à la session : ${rule.selector}`);
    let parent = rule.parent;
    let ecranUniquement = false;
    while (parent) {
      if (parent.type === 'atrule' && parent.name === 'media' && /^screen(?:\s|$)/.test(parent.params)) ecranUniquement = true;
      parent = parent.parent;
    }
    assert.ok(ecranUniquement, `le thème ne doit pas modifier l'impression : ${rule.selector}`);
  });
  for (const couleur of ['#0e6351', '#147861', '#eff8f5', '#f5f7f9', '#090e17']) assert.ok(css.includes(couleur));
  assert.match(css, /max-width: 479px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.caisse-navigation\s*\{[^}]*overflow-x: auto/s);
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /user && !loggingOut \? 'theme-caisse' : ''/, 'aucun thème caisse avant la connexion');
  assert.match(app, /PageHeading onglet=\{estAdmin \? activeTab : 'conges'\}/);
  for (const onglet of Object.keys(titres)) {
    assert.ok(app.includes(`setActiveTab('${onglet}')`), `navigation ${onglet} conservée`);
  }
  console.log('Thème Caisse : bandeau retiré, titres et navigation conservés, connexion isolée, styles limités à l’écran, responsive et focus : OK');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
