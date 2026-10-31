// node scripts/test-reperes-tri.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-reperes-tri-'));
try {
  const outfile = path.join(tmp, 'test.cjs');
  esbuild.buildSync({
    stdin: {
      contents: `export * from './src/local/tableSort';
        export { changementAncienneteDuMois } from './src/local/calcul';
        export { setRemoteConfig } from './src/local/config';
        export { SortableHeader } from './src/components/SortableHeader';
        export { AncienneteBadge, AncienneteLegende } from './src/components/AncienneteRepere';
        export { renderToStaticMarkup } from 'react-dom/server';
        export { createElement } from 'react';`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent',
  });
  const m = require(outfile);
  m.setRemoteConfig(null);
  const c = m.changementAncienneteDuMois;
  assert.equal(c('2020-12-15', 2026, 'NOVEMBRE'), null);
  assert.deepEqual(c('2020-12-15', 2026, 'DECEMBRE'), { avant: 5, annees: 6, indiceAvant: 1.18, indice: 1.27, changementPalier: true });
  assert.equal(c('2020-12-15', 2027, 'JANVIER'), null, 'ne pas laisser le bleu le mois suivant');
  assert.equal(c('2020-12-15', 2025, 12).changementPalier, false, 'anniversaire sans changement de palier signalé distinctement');
  assert.equal(c('2020-01-31', 2026, 'JANVIER').annees, 6, 'janvier compare décembre de l’année précédente');
  assert.equal(c('2000-12-15', 2026, 12).changementPalier, false, 'plafond du barème');
  for (const date of ['', 'invalide', '2026-12-15', '2027-12-15', '31/02/2020']) assert.equal(c(date, 2026, 12), null);
  assert.equal(c('15/12/2020', 2026, 12).annees, 6);
  assert.equal(c('2020-12-15', 2026, 'INVALIDE'), null);
  m.setRemoteConfig({ baremeAnciennete: [{ min: 0, max: 5, indice: 1 }, { min: 6, max: 100, indice: 1.5 }] });
  assert.equal(c('2020-12-15', 2026, 12).indice, 1.5, 'respecte le barème administrateur');

  let state = m.nextSort(null, 'montant');
  assert.deepEqual(state, { key: 'montant', direction: 'asc' });
  state = m.nextSort(state, 'montant');
  assert.deepEqual(state, { key: 'montant', direction: 'desc' });
  assert.equal(m.nextSort(state, 'montant'), null);
  assert.deepEqual(m.nextSort(state, 'nom'), { key: 'nom', direction: 'asc' });
  const rows = [
    { id: 1, montant: 1000, nom: 'Émile', date: '01/02/2026' },
    { id: 2, montant: 20, nom: 'alice 10', date: '2025-12-31' },
    { id: 3, montant: -5, nom: 'Alice 2', date: '15/01/2026' },
    { id: 4, montant: 20, nom: 'zoé', date: '' },
    { id: 5, montant: null, nom: '', date: '' },
  ];
  const original = JSON.stringify(rows);
  const accessors = { montant: r => r.montant, nom: r => r.nom, date: r => m.dateSortValue(r.date) };
  const ids = (key, direction = 'asc') => m.sortTableRows(rows, { key, direction }, accessors).map(r => r.id);
  assert.deepEqual(ids('montant'), [3, 2, 4, 1, 5]);
  assert.deepEqual(ids('montant', 'desc'), [1, 2, 4, 3, 5], 'égalités stables, vide en fin');
  assert.deepEqual(ids('nom'), [3, 2, 1, 4, 5], 'tri français naturel');
  assert.deepEqual(ids('date'), [2, 3, 1, 4, 5], 'tri chronologique, pas JJ/MM');
  assert.equal(JSON.stringify(rows), original, 'tri sans mutation');
  assert.strictEqual(m.sortTableRows(rows, null, accessors), rows);
  assert.strictEqual(m.sortTableRows(rows, { key: 'inconnue', direction: 'asc' }, accessors), rows);

  let selected;
  const th = m.SortableHeader({ column: 'nom', sort: { state: null, toggle: key => { selected = key; } }, children: 'Nom' });
  th.props.children.props.onClick();
  assert.equal(selected, 'nom', 'le bouton déclenche le tri de la bonne colonne');
  assert.equal(th.props['aria-sort'], 'none');
  const html = m.renderToStaticMarkup(m.createElement(m.SortableHeader, { column: 'nom', sort: { state: { key: 'nom', direction: 'desc' }, toggle: () => {} } }, 'Nom'));
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /type="button"/);
  assert.match(html, /ordre initial/);
  const badge = m.renderToStaticMarkup(m.createElement(m.AncienneteBadge, { changement: c('2020-12-15', 2026, 12) }));
  assert.match(badge, /Nouveau palier/);
  assert.match(badge, /6 ans/);
  assert.match(badge, /prime saisie n’est pas modifiée automatiquement/);
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.match(css, /tr\[data-anciennete="true"\]:not\(\[aria-selected="true"\]\) > td/);
  assert.match(css, /background-color: #7dd3fc !important/, 'bleu ciel soutenu y compris cellules figées');
  console.log('Repères ancienneté, barème paramétrable, tri stable numérique / français / dates et en-têtes accessibles : OK');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
