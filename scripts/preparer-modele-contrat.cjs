// Prépare le modèle Word fourni pour la génération de contrats.
// Le DOCX source n'est jamais modifié. On ne remplace que les champs variables ;
// les clauses, l'entête, le logo et les styles sont conservés.
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'CONTRAT DE TRAVAIL SALFA.docx');
const outDir = path.join(root, 'src', 'assets');
const outDocx = path.join(outDir, 'contrat-salfa-modele.docx');
const outLogo = path.join(outDir, 'logo-contrat-salfa.png');

const files = unzipSync(new Uint8Array(fs.readFileSync(source)));
let xml = strFromU8(files['word/document.xml']);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outLogo, files['word/media/image1.png']);

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function textOf(p) {
  return [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .join('').replace(/\s+/g, ' ').trim();
}
function run(text, { bold = false, underline = false, italic = false, size = 22 } = {}) {
  const props = `<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${underline ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  // Les jetons restent dans un seul w:t pour pouvoir être remplacés sans les découper.
  return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}
function replaceParagraph(prefix, runs, { append = false, after = '', pPrOverride = null } = {}) {
  let found = 0;
  xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    if (textOf(p).startsWith(prefix)) {
      found++;
      const pPr = pPrOverride ?? (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
      const open = p.match(/^<w:p\b[^>]*>/)[0];
      const oldRuns = append ? p.replace(/^<w:p\b[^>]*>/, '').replace(/<\/w:p>$/, '').replace((p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0], '') : '';
      return `${open}${pPr}${oldRuns}${runs}</w:p>${after}`;
    }
    return p;
  });
  if (found !== 1) throw new Error(`Champ du modèle introuvable ou ambigu : ${prefix} (${found})`);
}
function field(label, token, { labelBold = true } = {}) {
  return run(label, { bold: labelBold }) + run(token);
}

// Mention de projet uniquement lorsque des champs restent à compléter.
const mentionParagraph = `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr>${run('{{mention_projet}}', { bold: true, italic: true, size: 18 })}</w:p>`;
replaceParagraph('CONTRAT DE TRAVAIL', '', { append: true, after: mentionParagraph });
replaceParagraph('Entre la SAMPAN’ASA', run('Entre la SAMPAN’ASA LOTERANA MOMBA NY FAHASALAMANA (SALFA), dénommée, l’employeur, représenté par ') + run('{{representant}}'));
replaceParagraph('Mr/Mme/Mlle', field('Mr/Mme/Mlle : ', '{{identite}}'));
replaceParagraph('Né(e) le', field('Né(e) le : ', '{{date_naissance}}') + run(' à ') + run('{{lieu_naissance}}'));
replaceParagraph('Fils / Fille de', field('Fils / Fille de : ', '{{pere}}') + run(' et de : ') + run('{{mere}}'));
replaceParagraph('Titulaire de la CIN', field('Titulaire de la CIN N° : ', '{{cin}}'));
replaceParagraph('Délivrée le', field('Délivrée le : ', '{{date_cin}}') + run(' à ') + run('{{lieu_cin}}'));
replaceParagraph('Situation Matrimoniale', field('Situation Matrimoniale : ', '{{situation_matrimoniale}}'));
replaceParagraph('Demeurant à', field('Demeurant à : ', '{{adresse}}'));
replaceParagraph('Article 1: SERVICE', run(' {{service}}'), { append: true });
replaceParagraph('Article 2: NATURE', run(' {{nature_duree}}'), { append: true });
replaceParagraph('L’employé est engagé', field('L’employé est engagé en qualité de : ', '{{qualite}}'));
replaceParagraph('Lieu d’embauche', field('Lieu d’embauche : ', '{{lieu_embauche}}'));
replaceParagraph('Lieu d’exécution', field('Lieu d’exécution du travail en dehors de toute mission : ', '{{lieu_travail}}'));
replaceParagraph('Classification professionnelle', field('Classification professionnelle : ', '{{classification}}'));
replaceParagraph('Salaire de base mensuel', field('Salaire de base mensuel : ', '{{salaire_base}}'));
replaceParagraph('b1- Indemnité', field('b1- Indemnité de Logement : ', '{{indemnite_logement}}'));
replaceParagraph('b2- Indemnité', field('b2- Indemnité de Rendement : ', '{{indemnite_rendement}}'));
replaceParagraph('b3- Indemnité', field('b3- Indemnité de Responsabilité : ', '{{indemnite_responsabilite}}'));
replaceParagraph('Article11:', run('Article 11 : ce présent contrat prend effet à compter du ') + run('{{date_effet}}') + run('.'));
replaceParagraph('Fait ', run('Fait à ') + run('{{lieu_signature}}') + run(', le ') + run('{{date_signature}}') + run('.'));
replaceParagraph('L’employé(e),', '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/><w:u w:val="single"/></w:rPr><w:t>L’employé(e)</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/><w:u w:val="single"/></w:rPr><w:t>L’employeur</w:t></w:r>', {
  pPrOverride: '<w:pPr><w:tabs><w:tab w:val="right" w:pos="9922"/></w:tabs><w:spacing w:before="120"/><w:jc w:val="left"/></w:pPr>',
});

files['word/document.xml'] = strToU8(xml);
fs.writeFileSync(outDocx, zipSync(files, { level: 6 }));
console.log(`Modèle préparé : ${path.relative(root, outDocx)} (${fs.statSync(outDocx).size} octets)`);
console.log(`Logo extrait : ${path.relative(root, outLogo)}`);
