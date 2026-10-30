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

  // --- Vérification taille +1, alignement exact des titres/deux-points et impression 1 seule page sans page vide ---
  const docSingle = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const textCalls = [];
  const lineCalls = [];
  const fontSizes = [];
  const origDocText = docSingle.text.bind(docSingle);
  const origDocLine = docSingle.line.bind(docSingle);
  const origSetFontSize = docSingle.setFontSize.bind(docSingle);
  docSingle.text = (txt, x, y, opts) => {
    textCalls.push({ txt: Array.isArray(txt) ? txt.join(' ') : String(txt), x, y, opts });
    return origDocText(txt, x, y, opts);
  };
  docSingle.line = (x1, y1, x2, y2) => {
    lineCalls.push({ x1, y1, x2, y2 });
    return origDocLine(x1, y1, x2, y2);
  };
  docSingle.setFontSize = (sz) => {
    fontSizes.push(sz);
    return origSetFontSize(sz);
  };
  const mat1 = paies.find((r) => Number(r.numero_matricule) === 1) || paies[0];
  drawBulletinPage(docSingle, mat1);
  assert.equal(docSingle.internal.getNumberOfPages(), 1, '1 salarié = strictement 1 seule page PDF');
  assert.ok(fontSizes.includes(11) && fontSizes.includes(9) && fontSizes.includes(8.8) && fontSizes.includes(10.8), 'tailles de police du bulletin augmentées de +1');
  const maxY = Math.max(...textCalls.map((c) => c.y));
  assert.ok(maxY <= 202, `tout le contenu du bulletin tient largement dans la hauteur A4 paysage (maxY=${maxY.toFixed(1)}mm <= 202mm)`);

  // Sur l'exemplaire gauche (x = 30), les 5 titres et les 5 « : » ont exactement le même alignement X
  const leftLabels = textCalls.filter((c) => c.x === 30 && ['Employé', 'Fonction', 'N° Matricule', 'Embauche', 'Classification'].includes(c.txt));
  assert.equal(leftLabels.length, 5, '5 intitulés alignés à gauche sur x=30');
  const leftColons = textCalls.filter((c) => c.txt === ':' && c.x > 30 && c.x < 90);
  assert.equal(leftColons.length, 5, '5 deux-points séparés sur l’exemplaire gauche');
  assert.equal(new Set(leftColons.map((c) => c.x.toFixed(2))).size, 1, 'les 5 « : » sont parfaitement alignés sur la même verticale');
  const idUnderlines = lineCalls.filter((l) => l.x1 === 30 && Math.abs(l.y1 - l.y2) < 0.001 && Math.abs((l.x2 - l.x1) - 24.5) < 0.01);
  assert.equal(idUnderlines.length, 5, 'les 5 soulignements ont exactement la même longueur jusqu’aux deux-points');

  const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
  assert.ok(css.includes('font: 13px/1.35 Calibri') && css.includes('font: 9.2pt/1.2 Calibri'), 'police du bulletin augmentée de +1 à l’écran (13px) et à l’impression (9.2pt)');
  assert.ok(css.includes('.bul-id-lbl-txt') && css.includes('.bul-id-colon'), 'alignement CSS flex des titres soulignés et des deux-points');
  assert.ok(css.includes('min-height: 0 !important;') && css.includes('.bulletin-print-sheet + .bulletin-print-sheet'), 'suppression de la 2e page vide lors de l’impression d’une seule personne');
  const srcBul = fs.readFileSync(path.join(process.cwd(), 'src/components/tabs/BulletinsTab.tsx'), 'utf8');
  assert.equal(srcBul.includes('Employé&nbsp;'), false, 'plus aucun alignement approximatif par &nbsp; dans BulletinsTab');

  console.log('Entête persistant (bulletin + congé), 3 cm de reliure et PDF : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
