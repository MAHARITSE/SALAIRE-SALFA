const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-bulletins-recherche-'));
try {
  const outfile = path.join(tmp, 'recherche.cjs');
  esbuild.buildSync({ entryPoints: ['src/bulletin/recherche.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  const { filtrerPaiesBulletins: filtrer, selectionnerPaieVisible: selection } = require(outfile);
  const paies = [
    { id: 1, numero_matricule: 12, nom_prenoms: 'ÉMILE TEST', jobs: 'Réception', categorie: '3A', net: 100000 },
    { id: 2, numero_matricule: 69, nom_prenoms: 'PERSONNE JOSOA', jobs: 'Aumônier', categorie: '2B', net: 200000 },
    { id: 3, numero_matricule: 70, nom_prenoms: 'AUTRE JOSOA', jobs: 'Infirmier', categorie: '3A', net: 300000 },
  ];
  const avant = JSON.stringify(paies);
  assert.strictEqual(selection(filtrer(paies, 'JOSOA'), 1), paies[1], 'une ancienne sélection hors filtre est remplacée dès le rendu');
  assert.strictEqual(selection(filtrer(paies, 'JOSOA'), 3), paies[2], 'conserve une sélection manuelle encore visible');
  for (const recherche of ['69', 'aumonier', 'personne josóa', 'JOSOA PERSONNE', '2b']) {
    assert.deepEqual(filtrer(paies, recherche), [paies[1]], `filtre ${recherche}`);
    assert.strictEqual(selection(filtrer(paies, recherche), 1), paies[1]);
  }
  assert.deepEqual(filtrer(paies, 'emile reception'), [paies[0]], 'accents et mots multiples');
  assert.strictEqual(selection(filtrer(paies, 'aucun résultat'), 2), null, 'aucun aperçu ni sortie sur un salarié invisible');
  assert.strictEqual(selection([], 2), null, 'période vide ou en chargement');
  assert.strictEqual(selection(filtrer(paies, ''), null), paies[0]);
  assert.strictEqual(selection(filtrer(paies, ''), 3), paies[2]);
  assert.strictEqual(selection(filtrer([paies[2]], ''), 1), paies[2], 'changement de période');
  assert.equal(JSON.stringify(paies), avant, 'aucune mutation des montants ni des fiches');
  const ui = fs.readFileSync('src/components/tabs/BulletinsTab.tsx', 'utf8');
  assert.match(ui, /const selectedPaie = selectionnerPaieVisible\(filtered, selectedPaieId\)/);
  assert.match(ui, /loading \? \[\] : filtrerPaiesBulletins/);
  assert.match(ui, /downloadSingleBulletinPDF\(selectedPaie, optionsIndividuel\)/);
  assert.match(ui, /downloadPayrollBookletPDF\(filtered, mois, annee\)/);
  assert.match(ui, /printMode === 'tous' \? filtered : selectedPaie \? \[selectedPaie\] : \[\]/);
  console.log('Bulletins : sélection automatiquement limitée à la recherche, aucun résultat, multi-résultats, accents, période et sorties sans mutation : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
