// npm install ; node scripts/test-header.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const { jsPDF } = require('jspdf');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-entete-test-'));
try {
  function bundle(entry, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'cjs', outfile, loader: { '.png': 'dataurl' }, alias: { 'jspdf-autotable': 'jspdf-autotable/es' }, logLevel: 'silent' });
    return require(outfile);
  }
  const storage = new Map();
  global.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) };
  const h = bundle('src/bulletin/header.ts', 'header');
  const initial = h.loadBulletinHeader();
  assert.equal(initial.mode, 'image');
  assert.match(initial.image, /^data:image\/png;base64,/);
  const modified = { ...initial, image: initial.logoLeft, fullImage: initial.logoLeft, lines: ['Test', ...initial.lines.slice(1)] };
  h.saveBulletinHeader(modified);
  assert.deepEqual(h.loadBulletinHeader(), modified);
  storage.set('salfa_bulletin_entete_v1', '{invalid');
  assert.deepEqual(h.loadBulletinHeader(), initial);
  h.saveBulletinHeader(modified);
  const { drawBulletinPage } = bundle('src/pdf/bulletinsPdf.ts', 'pdf');
  const seed = require('../src/data/salfa_data.json');
  const paies = seed.paies.filter(p => p.annee === 2026 && p.mois === 'OCTOBRE');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const images = [];
  const originalAddImage = doc.addImage.bind(doc);
  doc.addImage = (...args) => { images.push(args); return originalAddImage(...args); };
  for (let i = 0; i < paies.length; i++) {
    if (i) doc.addPage('a4', 'landscape');
    drawBulletinPage(doc, paies[i]);
    assert.equal(doc.internal.getNumberOfPages(), i + 1, 'un bulletin doit tenir sur une seule page');
  }
  assert.equal(images.length, paies.length * 2);
  for (const [img, , x, y, w, ht] of images) {
    assert.equal(img, modified.image, "l'entête enregistré doit être utilisé dans chaque exemplaire");
    assert.ok(x >= 30 && x + w <= 289 && y >= 6 && ht <= 26, 'image dans la zone imprimable');
  }
  console.log('Entête persistant, 3 cm de reliure et PDF en lot : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
