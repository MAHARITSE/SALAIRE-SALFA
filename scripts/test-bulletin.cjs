// npm install ; node scripts/test-bulletin.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const XLSX = require('xlsx');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-bulletin-test-'));
try {
  function bundle(entry, name) {
    const outfile = path.join(tmp, name + '.cjs');
    esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
    return require(outfile);
  }
  const {
    construireBulletin,
    montantEnLettres,
    montantEnLettresBulletin,
    formatMontantBulletin,
    formatEmbaucheBulletin,
    formatCnapsBulletin,
    formatCongesRestantsBulletin,
  } = bundle('src/bulletin/model.ts', 'model');
  const seed = require('../src/data/salfa_data.json');
  const bulletinTab = fs.readFileSync('src/components/tabs/BulletinsTab.tsx', 'utf8');
  assert.doesNotMatch(bulletinTab, /ChoixRetenuesIndividuel|deduireAvance|deduireMed|Sans Avance ni Médicament/, 'l’état individuel ne propose plus de choix pour ces retenues');
  const p = seed.paies.find(p => p.annee === 2026 && p.mois === 'OCTOBRE' && p.numero_matricule === 47);
  const b = construireBulletin(p);
  const xls = XLSX.readFile('SALAIRE SALFA 2026.xlsm');
  const ws = xls.Sheets.BULLETIN;
  const close = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} ≠ ${b}`);
  close(b.lignes.find(r => r.libelle === 'TOTAL').gain, ws.E22.v);
  close(b.gains, ws.E29.v); close(b.retenues, ws.F29.v); close(b.net, ws.F30.v);
  assert.equal(b.netEnregistre, 1838800);
  assert.equal(b.ecartNet, true);
  assert.equal(montantEnLettres(b.net), 'un million huit cent trente-huit mille huit cent quarante-neuf ariary et quatre-vingt-six centimes');
  assert.equal(montantEnLettres(0), 'zéro ariary');
  assert.equal(montantEnLettres(81.01), 'quatre-vingt-un ariary et un centime');
  assert.equal(
    montantEnLettresBulletin(400035.84),
    'Quatre Cents Mille Trente-Cinq Ariary Quatre-Vingt-Quatre'
  );
  assert.equal(
    montantEnLettresBulletin(1838849.86),
    'Un Million Huit Cent Trente-Huit Mille Huit Cent Quarante-Neuf Ariary Quatre-Vingt-Six'
  );
  assert.equal(formatMontantBulletin(0), '-');
  assert.equal(formatEmbaucheBulletin('1992-01-01'), 'janv.-92');
  assert.equal(formatCnapsBulletin('863892'), '863 892');
  assert.equal(formatCongesRestantsBulletin(85), '85');
  assert.equal(formatCongesRestantsBulletin(undefined), '........');

  // Choix à l'impression d'un état individuel : déduire ou non les médicaments et avances
  const pAvecAvanceMed = seed.paies.find(
    (r) => r.annee === 2026 && r.mois === 'JANVIER' && r.numero_matricule === 3
  );
  assert.ok(pAvecAvanceMed && pAvecAvanceMed.avance > 0 && pAvecAvanceMed.med > 0, 'Salarié Mat 3 JANVIER 2026 avec avance et médicament');
  const bAvecTout = construireBulletin(pAvecAvanceMed);
  const bSansRien = construireBulletin(pAvecAvanceMed, { deduireAvance: false, deduireMed: false });
  const bSansAvance = construireBulletin(pAvecAvanceMed, { deduireAvance: false, deduireMed: true });
  const bSansMed = construireBulletin(pAvecAvanceMed, { deduireAvance: true, deduireMed: false });

  assert.equal(bSansRien.avance, 0, 'Avance ramenée à 0 sur l’état individuel sans déduction');
  assert.equal(bSansRien.med, 0, 'Médicament ramené à 0 sur l’état individuel sans déduction');
  assert.equal(formatMontantBulletin(bSansRien.avance), '-');
  assert.equal(formatMontantBulletin(bSansRien.med), '-');
  close(bSansRien.retenues, Number(pAvecAvanceMed.cnaps) + Number(pAvecAvanceMed.irsa));
  close(bSansRien.net - bAvecTout.net, Number(pAvecAvanceMed.avance) + Number(pAvecAvanceMed.med));
  close(bSansAvance.net - bAvecTout.net, Number(pAvecAvanceMed.avance));
  close(bSansMed.net - bAvecTout.net, Number(pAvecAvanceMed.med));
  assert.equal(bSansRien.especes > bAvecTout.especes, true, 'Le règlement espèces reflète le net hors avance/médicament');
  assert.equal(pAvecAvanceMed.avance, 300000, 'La donnée source en base n’est jamais modifiée');
  assert.equal(pAvecAvanceMed.med, 51500, 'La donnée médicament en base n’est jamais modifiée');

  const pVirementMed = seed.paies.find(
    (r) => r.annee === 2026 && r.mois === 'JANVIER' && r.numero_matricule === 13
  );
  const bVirAvec = construireBulletin(pVirementMed);
  const bVirSans = construireBulletin(pVirementMed, { deduireAvance: false, deduireMed: false });
  assert.equal(bVirSans.virement > bVirAvec.virement, true, 'Pour un salarié payé par virement, le virement reflète le net hors retenue');
  assert.equal(bVirSans.especes, bVirAvec.especes, 'La part espèces plafonnée reste inchangée');
  const storage = new Map();
  global.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const api = bundle('src/api-local.ts', 'api');
  (async () => {
    const avant = await api.fetchPaiesMois(2026, 'OCTOBRE');
    assert.equal(avant.employes.length, 48);
    // Mat 47 conserve 25 + 30 + 30 jours sur ses titres non prescrits (2024–2026).
    assert.equal(avant.employes.find(p => p.numero_matricule === 47).conge_restant, 85);
    assert.equal((await api.fetchPaiesMois(2027, 'OCTOBRE')).employes.length, 0);
    const emp = (await api.fetchEmployes(true)).find(e => e.numero_matricule === 47);
    await api.initPaieEmploye(emp.id, 2027, 'OCTOBRE');
    assert.equal((await api.fetchPaiesMois(2027, 'OCTOBRE')).employes.length, 1);
    assert.equal((await api.fetchPaiesMois(2026, 'OCTOBRE')).employes.length, 48);
    console.log('Bulletin Excel et séparation annuelle : OK');
  })().catch(e => { console.error(e); process.exitCode = 1; });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
