// node scripts/test-decharge.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-decharge-test-'));
try {
  const css = fs.readFileSync('src/index.css', 'utf8');
  const rule = css.match(/\.bulletin-decharge-page\s*\{([^}]*page:\s*bulletin-decharge[^}]*)\}/s)?.[1];
  assert.ok(rule, 'règle de pagination des décharges présente');
  assert.match(rule, /break-before:\s*page;/, 'les décharges commencent sur une nouvelle page');
  assert.match(rule, /page-break-before:\s*always;/, 'compatibilité des sauts avant les décharges');
  assert.match(rule, /break-after:\s*auto;/, 'aucun saut forcé après la dernière décharge');
  assert.match(rule, /page-break-after:\s*auto;/, 'aucun saut final avec les anciens moteurs');
  assert.doesNotMatch(rule, /(?:break-after:\s*page|page-break-after:\s*always)/);
  assert.match(css, /body:has\(\.bulletin-decharge-page\)\s*\{\s*page:\s*bulletin-decharge;/, 'le document ne revient pas au format anonyme après la décharge');

  // Le vrai générateur PDF doit lui aussi terminer sur une décharge, sans page vide.
  // L'interception de save() évite de télécharger un fichier pendant le test.
  const outfile = path.join(tmp, 'pdf.cjs');
  esbuild.buildSync({
    stdin: {
      contents: `
        import { jsPDF } from 'jspdf';
        import { downloadPayrollBookletPDF } from './src/pdf/bulletinsPdf';
        let document;
        jsPDF.API.save = function () { document = this; return this; };
        export function generer(paies) {
          document = undefined;
          downloadPayrollBookletPDF(paies, 'OCTOBRE', 2026);
          return document;
        }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, platform: 'browser', format: 'cjs', outfile,
    loader: { '.png': 'dataurl' }, alias: { 'jspdf-autotable': 'jspdf-autotable/es' }, logLevel: 'silent',
  });
  const { generer } = require(outfile);
  const sample = require('../src/data/salfa_data.json').paies[0];
  assert.equal(generer([]), undefined, 'aucun livret vide généré');
  for (const count of [0, 1, 24, 25, 48]) {
    const paies = Array.from({ length: Math.max(1, count) }, (_, i) => ({
      ...sample, id: i + 1, numero_matricule: i + 1,
      nom_prenoms: `SALARIE TEST ${i + 1}`, especes: count ? 6000 : 5000,
    }));
    const doc = generer(paies);
    const dischargeCount = Math.max(1, Math.ceil(count / 24));
    const firstDischarge = 1 + paies.length + 1 + 1; // couverture, bulletins, reliure, décharge
    assert.equal(doc.internal.getNumberOfPages(), firstDischarge + dischargeCount - 1, `${count} espèces éligibles : pas de page supplémentaire`);
    for (let page = firstDischarge; page <= doc.internal.getNumberOfPages(); page++) {
      assert.match(doc.internal.pages[page].join('\n'), /FICHE DECHARGE MOIS DE OCTOBRE 2026/, `la page ${page} est une décharge remplie`);
      assert.ok(doc.getPageWidth(page) < doc.getPageHeight(page), 'décharge A4 portrait');
    }
    const bindingPage = doc.internal.pages[firstDischarge - 1].join('\n');
    assert.doesNotMatch(bindingPage, /\b(?:Tj|TJ)\b/, 'la page blanche de reliure AVANT la décharge reste conservée');
  }
  console.log('Décharge : sauts avant seulement et fin de PDF sans page vide (0, 1, 24, 25, 48 lignes) : OK');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
