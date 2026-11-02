// npm install ; node scripts/test-contrat.cjs
// Vérifie le générateur de contrats : préremplissage, validation, Word, PDF,
// conservation des clauses fournies et isolation de l'impression.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const { unzipSync, strFromU8 } = require('fflate');
const { jsPDF } = require('jspdf');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-contrat-'));
try {
  function bundle(entry, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({
      entryPoints: [entry], bundle: true, platform: 'browser', format: 'cjs', outfile,
      loader: { '.png': 'dataurl' }, logLevel: 'silent',
    });
    return require(outfile);
  }

  const model = bundle('src/contrat/model.ts', 'model');
  const docx = bundle('src/contrat/docx-core.ts', 'docx');
  const pdf = bundle('src/contrat/pdf.ts', 'pdf');

  const emp = {
    id: 1, numero_matricule: 1, nom_prenoms: 'SALARIE TEST', numero_cnaps: '123456',
    categorie: '2B', jobs: 'Infirmier', date_embauche: '2020-01-15', nombre_annees: 6,
    enfant_a_charge: 0, base_aj: 271600, logement_transport: 30000, rendement: 50000,
    responsabilite_representation: 20000, rib: '', mode_paiement: 'ESPECES', actif: 1,
  };

  // 1. Préremplissage sans invention et sans ventilation automatique des rubriques groupées.
  const initial = model.initialiserContratDepuisEmploye(emp);
  assert.equal(initial.nom_prenoms, 'SALARIE TEST');
  assert.equal(initial.qualite, 'Infirmier');
  assert.equal(initial.classification, '2B');
  assert.equal(initial.salaire_base, '271600');
  assert.equal(initial.indemnite_rendement, '50000');
  assert.equal(initial.indemnite_logement, '', 'logement/transport groupé ne doit pas être copié comme logement seul');
  assert.equal(initial.indemnite_responsabilite, '', 'responsabilité/représentation groupée ne doit pas être copiée comme responsabilité seule');
  assert.equal(initial.service, '');
  assert.equal(initial.nature_contrat, '');
  assert.equal(initial.date_effet, '', 'la date d’effet ne doit pas être déduite automatiquement');
  assert.equal(initial.representant, model.REPRESENTANT_DEFAUT);

  const validationInitiale = model.validerContrat(initial);
  assert.equal(validationInitiale.complets, false);
  assert.ok(validationInitiale.champsManquants.includes('service'));
  assert.ok(validationInitiale.champsManquants.includes('nature_contrat'));
  const projetInitial = model.construireContrat(initial);
  assert.equal(projetInitial.mentionProjet, model.MENTION_PROJET_CONTRAT);
  assert.equal(model.PLACEHOLDER_CONTRAT, '-', 'une information manquante doit être représentée par un tiret simple');
  assert.equal(projetInitial.blocs.find(b => b.type === 'champ' && b.label === 'Titulaire de la CIN N° :').valeur, '-');
  assert.equal(projetInitial.blocs.find(b => b.type === 'article' && b.numero === 1).valeur, '-');
  const signatureProjet = projetInitial.blocs.find(b => b.type === 'signature');
  assert.equal(signatureProjet.lieu, '-');
  assert.equal(signatureProjet.date, '-');

  // 2. Montants et dates.
  assert.equal(model.parseMontantContrat('1 234,56'), 1234.56);
  assert.equal(model.parseMontantContrat('0'), 0);
  assert.equal(model.parseMontantContrat(''), undefined);
  assert.equal(model.parseMontantContrat('-5'), null);
  assert.equal(model.parseMontantContrat('12,345'), null);
  assert.match(model.formaterMontantContrat('271600'), /271.600,00 Ar/);
  assert.equal(model.formaterMontantContrat(''), '-');
  assert.equal(model.formaterMontantContrat('0'), '-');
  assert.equal(model.formaterDateContrat('2020-01-15'), '15/01/2020');
  assert.equal(model.formaterDateContrat(''), '-');

  const complet = {
    ...initial,
    date_naissance: '1990-05-10', lieu_naissance: 'Toliara', pere: 'Père Test', mere: 'Mère Test',
    cin: '101 000 000 000', date_cin: '2010-06-01', lieu_cin: 'Toliara',
    situation_matrimoniale: 'Célibataire', adresse: 'Lot II M 12 Toliara',
    service: 'Médecine', nature_contrat: 'CDI', duree_contrat: '',
    lieu_embauche: 'Toliara', lieu_travail: 'Dispensaire Tanambao Toliara',
    indemnite_logement: '20000', indemnite_responsabilite: '10000',
    date_effet: '2020-01-15', lieu_signature: 'Toliara', date_signature: '2020-01-10',
  };
  const validationComplete = model.validerContrat(complet);
  assert.deepEqual(validationComplete.erreurs, []);
  assert.equal(validationComplete.complets, true, 'un CDI explicitement choisi n’exige pas de durée saisie');
  const contratComplet = model.construireContrat(complet);
  assert.equal(contratComplet.mentionProjet, '');
  assert.ok(contratComplet.blocs.some(b => b.type === 'article' && b.numero === 2 && String(b.valeur).includes('Durée indéterminée')));

  const invalide = { ...complet, salaire_base: '-1', date_naissance: '1990-02-30' };
  const validationInvalide = model.validerContrat(invalide);
  assert.equal(validationInvalide.complets, false);
  assert.ok(validationInvalide.erreurs.some(e => e.includes('Salaire de base')));
  assert.ok(validationInvalide.erreurs.some(e => e.includes('Date de naissance')));

  // Le tiret remplace l’ancien libellé, mais ne doit pas faire passer une information manquante pour saisie.
  const avecTirets = { ...complet, service: '-', date_naissance: '-', indemnite_logement: '-' };
  const validationTirets = model.validerContrat(avecTirets);
  assert.equal(validationTirets.complets, false);
  assert.ok(validationTirets.champsManquants.includes('service'));
  assert.ok(validationTirets.champsManquants.includes('date_naissance'));
  assert.ok(!validationTirets.champsManquants.includes('indemnite_logement'), 'un montant à « - » reste un zéro valide');
  assert.deepEqual(validationTirets.erreurs, []);
  assert.equal(model.formaterDateContrat('-'), '-');

  // 3. Word : le modèle préparé conserve les clauses et tous les jetons sont remplacés.
  const modeleBytes = new Uint8Array(fs.readFileSync('src/assets/contrat-salfa-modele.docx'));
  const valeurs = model.valeursModeleContrat(contratComplet);
  const sortie = docx.remplirModeleDocx(modeleBytes, valeurs);
  const fichiers = unzipSync(sortie);
  const xml = strFromU8(fichiers['word/document.xml']);
  const texteDocx = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
    .join('').replace(/\s+/g, ' ');
  assert.ok(!xml.includes('{{'), 'aucun jeton ne doit rester dans le DOCX généré');
  assert.ok(texteDocx.includes('SALARIE TEST'));
  assert.ok(texteDocx.includes('CLAUSE DE MOBILITÉ'));
  assert.ok(texteDocx.includes('La jouissance du congé payé annuel respecte les modalités imposées par le code du travail.'));
  assert.ok(texteDocx.includes('La retraite de l’employé qui a atteint ses 60 ans met fin automatiquement au contrat de travail.'));
  assert.ok(!texteDocx.includes(model.MENTION_PROJET_CONTRAT), 'la mention projet doit disparaître quand le contrat est complet');
  assert.ok(fichiers['word/media/image1.png'], 'le logo du modèle doit être conservé');

  const projetValeurs = model.valeursModeleContrat(projetInitial);
  for (const cle of ['cin', 'date_naissance', 'lieu_naissance', 'pere', 'mere', 'service', 'nature_duree', 'lieu_embauche', 'lieu_travail', 'indemnite_logement', 'indemnite_responsabilite', 'date_effet', 'lieu_signature', 'date_signature']) {
    assert.equal(projetValeurs[cle], '-', `le champ Word manquant ${cle} doit afficher un tiret`);
  }
  const sortieProjet = docx.remplirModeleDocx(modeleBytes, projetValeurs);
  const xmlProjet = strFromU8(unzipSync(sortieProjet)['word/document.xml']);
  assert.ok(xmlProjet.includes(model.MENTION_PROJET_CONTRAT));
  assert.ok(xmlProjet.includes('>-</w:t>'), 'le DOCX projet doit contenir des tirets pour les champs manquants');
  assert.ok(!xmlProjet.includes('À compléter'), 'le DOCX projet ne doit plus afficher l’ancien libellé de champ manquant');

  const echappe = docx.remplirModeleDocx(modeleBytes, {
    ...valeurs,
    adresse: 'A & B <test> "guillemets"',
  });
  const xmlEchappe = strFromU8(unzipSync(echappe)['word/document.xml']);
  assert.ok(xmlEchappe.includes('A &amp; B &lt;test&gt; &quot;guillemets&quot;'));

  // 4. PDF : pagination, clauses, mention projet et absence de débordement.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const textes = [];
  const origText = doc.text.bind(doc);
  doc.text = (txt, x, y, opts) => {
    const s = Array.isArray(txt) ? txt.join(' ') : String(txt);
    textes.push({ s, x, y });
    return origText(txt, x, y, opts);
  };
  pdf.drawContratPdf(doc, projetInitial);
  assert.ok(doc.internal.getNumberOfPages() >= 2, 'le contrat doit tenir sur plusieurs pages A4 portrait');
  const joint = textes.map(t => t.s).join(' ').replace(/\s+/g, ' ');
  assert.ok(joint.includes('CONTRAT DE TRAVAIL'));
  assert.ok(joint.includes(model.MENTION_PROJET_CONTRAT.replace('—', '-')) || joint.includes(model.MENTION_PROJET_CONTRAT));
  assert.ok(joint.includes('La jouissance du congé payé annuel'));
  assert.ok(joint.includes('Le tribunal compétent est celui du lieu d’exécution du travail'.replace('’', "'")));
  assert.ok(textes.some(t => t.s === '-'), 'le PDF projet doit afficher des tirets pour les champs manquants');
  assert.ok(!joint.includes('À compléter'), 'le PDF projet ne doit plus afficher l’ancien libellé de champ manquant');
  for (const t of textes) {
    assert.ok(t.y >= 0 && t.y <= 297, `texte hors page verticalement : ${t.s} à ${t.y}`);
    assert.ok(t.x >= 0 && t.x <= 210, `texte hors page horizontalement : ${t.s} à ${t.x}`);
  }
  assert.match(model.nomFichierContrat(emp, projetInitial, 'pdf'), /_PROJET\.pdf$/);
  assert.match(model.nomFichierContrat(emp, contratComplet, 'docx'), /^CONTRAT_SALFA_MAT_1_SALARIE_TEST\.docx$/);

  // 5. Intégration UI : entrée admin et impression isolée.
  const tab = fs.readFileSync('src/components/tabs/SalariesSaisieTab.tsx', 'utf8');
  const modal = fs.readFileSync('src/components/ContratTravailModal.tsx', 'utf8');
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.ok(tab.includes('ContratTravailModal'));
  assert.ok(tab.includes('userRole={effectiveRole}'));
  assert.ok(modal.includes('estRoleAdmin(props.userRole)'));
  assert.ok(modal.includes('<option value="">{PLACEHOLDER_CONTRAT}</option>'), 'la nature du contrat utilise le même tiret pour le choix vide');
  assert.ok(!modal.includes('À compléter'), 'l’éditeur de contrat ne doit plus afficher l’ancien libellé de champ manquant');
  assert.ok(modal.includes('createPortal'));
  assert.ok(css.includes('body:has(.contrat-print) #root { display: none !important; }'));
  assert.ok(css.includes('@page contrat-impression { size: A4 portrait;'));

  console.log('Contrats de travail : préremplissage, validation, Word, PDF et impression OK');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
