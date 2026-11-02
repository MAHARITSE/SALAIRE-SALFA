// Affichage comptable unifié : zéro = « - », alignement à droite, format XLSX.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const XLSX = require('xlsx');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-montants-'));
try {
  function bundle(entry, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
    return require(outfile);
  }
  const m = bundle('src/local/montants.ts', 'montants');
  assert.equal(m.formatMontant(0), '-');
  assert.equal(m.formatMontant(null), '-');
  assert.equal(m.formatMontant(undefined), '-');
  assert.equal(m.formatMontant(''), '-');
  assert.equal(m.formatMontant(0.004), '-');
  assert.equal(m.formatMontant(1234.5), '1\u202f234,50');
  assert.equal(m.formatMontant(1234.5, { unite: true }), '1\u202f234,50 Ar');
  assert.equal(m.formatMontant(0, { unite: true }), '-');
  assert.equal(m.formatMontantSaisie(0), '-');
  assert.equal(m.formatMontantEdition(0), '');
  assert.equal(m.parseMontantSaisie('-'), 0);
  assert.equal(m.parseMontantSaisie('1 234,56'), 1234.56);
  assert.equal(m.parseMontantSaisie(''), 0);

  const excel = bundle('src/local/excelFormat.ts', 'excel');
  const ws = XLSX.utils.aoa_to_sheet([['Base', 'Nom'], [0, 'A'], [1234.5, 'B']]);
  excel.formaterColonnesMonetairesExcel(ws, [0], 1);
  assert.equal(ws.A2.z, m.FORMAT_EXCEL_MONTANT);
  assert.equal(ws.A3.z, m.FORMAT_EXCEL_MONTANT);
  assert.equal(ws.B2.z, undefined);

  const bulletin = bundle('src/bulletin/model.ts', 'bulletin');
  assert.equal(bulletin.formatMontant(0), '-');
  assert.equal(bulletin.formatMontantBulletin(0), '-');
  const contrat = bundle('src/contrat/model.ts', 'contrat');
  assert.equal(contrat.formaterMontantContrat('0'), '-');
  assert.equal(contrat.formaterMontantContrat('-'), '-');
  assert.equal(contrat.parseMontantContrat('-'), 0);
  assert.match(contrat.formaterMontantContrat('271600'), /271.600,00 Ar/);

  for (const file of [
    'src/components/tabs/SalariesSaisieTab.tsx',
    'src/components/tabs/RapportsTab.tsx',
    'src/components/EmployeModalForm.tsx',
    'src/components/MonetaryInput.tsx',
    'src/pdf/bulletinsPdf.ts',
  ]) {
    const txt = fs.readFileSync(file, 'utf8');
    assert.ok(!txt.includes("'0,00'"), `${file} ne doit plus afficher 0,00`);
    assert.ok(txt.includes('text-right') || txt.includes('money-cell') || txt.includes("align: 'right'"), `${file} aligne les montants à droite`);
  }
  console.log('Montants : zéro « - », alignement à droite, exports XLSX et contrat : OK');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
