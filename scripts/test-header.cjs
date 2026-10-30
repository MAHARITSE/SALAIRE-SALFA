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

  // --- Entête indépendant pour les fiches de congé + PDF Fiche d'absence (7h45, 10 andro / 10 jour(s), sans pied) ---
  const initialCongeHdr = h.loadCongeHeader();
  assert.equal(initialCongeHdr.mode, 'image', 'entête congé indépendant de l’entête bulletin déjà modifié');
  assert.notEqual(initialCongeHdr.image, modified.image, 'la modification du bulletin n’écrase pas l’entête congé');
  const customCongeHdr = {
    ...initialCongeHdr,
    image: initialCongeHdr.logoRight,
    fullImage: initialCongeHdr.logoRight,
    lines: ['ENTETE CONGE TEST', ...initialCongeHdr.lines.slice(1)],
  };
  h.saveCongeHeader(customCongeHdr);
  assert.deepEqual(h.loadCongeHeader(), customCongeHdr, 'entête congé sauvegardé séparément');
  assert.deepEqual(h.loadBulletinHeader(), modified, 'entête bulletin préservé intact');

  const { drawFicheAbsencePage } = bundle('src/pdf/congesPdf.ts', 'congesPdf');
  const docConge = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const congeImages = [];
  const congeTexts = [];
  const origAddImgConge = docConge.addImage.bind(docConge);
  const origTextConge = docConge.text.bind(docConge);
  docConge.addImage = (...args) => { congeImages.push(args); return origAddImgConge(...args); };
  docConge.text = (txt, ...rest) => {
    if (Array.isArray(txt)) congeTexts.push(...txt.map(String));
    else congeTexts.push(String(txt));
    return origTextConge(txt, ...rest);
  };
  drawFicheAbsencePage(docConge, {
    id: 612,
    employe_id: 1,
    numero_matricule: 12,
    nom_prenoms: 'TEST CONGE SALARIE',
    fonction: 'Infirmier',
    service: 'Médecine',
    contact: '034 00 000 00',
    categorie: 'CONGE',
    motif_code: '',
    motif_libelle: 'Congé',
    imputation: 'CONGE',
    annee: 2026,
    date_demande: '2026-10-30',
    date_debut: '2026-11-02',
    heure_debut: '',
    date_fin: '2026-11-12',
    date_retour: '2026-11-13',
    heure_fin: '',
    jours_demandes: 10,
    jours_valides: null,
    remplacant: '',
    titre_periode: 'Titre 2026',
    justificatif: '',
    observations: '',
    statut: 'SOUMIS',
    visa_chef_par: '',
    visa_chef_le: '',
    visa_medecin_par: '',
    visa_medecin_le: '',
    visa_gestionnaire_par: '',
    visa_gestionnaire_le: '',
    motif_refus: '',
    ajustement_type: '',
    saisie_par: 'admin',
    date_saisie: '2026-10-30T08:00:00Z',
    date_modification: '2026-10-30T08:00:00Z',
  });
  assert.equal(congeImages.length, 1, 'une image d’entête dessinée sur la fiche de congé');
  assert.equal(congeImages[0][0], customCongeHdr.image, 'la fiche de congé utilise bien l’entête congé personnalisé');
  const joinedPdfText = congeTexts.join(' | ');
  assert.ok(joinedPdfText.includes('Congé - 10 andro / 10 jour(s)'), `Fangatahana attendu dans le PDF : ${joinedPdfText}`);
  const count745 = congeTexts.filter((t) => t.trim() === '@ 07 Ora 45 mn').length;
  assert.equal(count745, 2, 'Ora (heure de départ) et Ora (heure de reprise) valent toutes deux @ 07 Ora 45 mn (7h45) par défaut pour un Congé');
  assert.ok(!joinedPdfText.includes('Situation :') && !joinedPdfText.includes('Fiche n°') && !joinedPdfText.includes('Saisie le'), 'pied de page supprimé du PDF de congé');

  console.log('Entête persistant (bulletin + congé), 3 cm de reliure et PDF : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
