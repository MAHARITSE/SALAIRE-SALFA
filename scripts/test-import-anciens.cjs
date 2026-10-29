// npm install ; node scripts/test-import-anciens.cjs
// Teste l'analyse intelligente des anciens classeurs Excel SALFA (placement
// automatique et manuel de chaque champ, mode archive historique, protection
// des mois clôturés) et la saisie indépendante Avances / Médicaments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const XLSX = require('xlsx');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salfa-ancien-import-'));

(async () => {
  try {
    function bundle(entry, name) {
      const outfile = path.join(tmp, name + '.cjs');
      esbuild.buildSync({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        logLevel: 'silent',
      });
      return require(outfile);
    }

    const {
      analyserClasseurDetaille,
      detectAnneeFichier,
    } = bundle('src/local/importExcel.ts', 'importExcel');

    // 1. Détection de l'année dans le nom des anciens fichiers
    assert.equal(detectAnneeFichier('SALAIRE SALFA 2023.xls'), 2023);
    assert.equal(detectAnneeFichier('PAIE_SALFA_2021-2022.xlsb'), 2022);
    assert.equal(detectAnneeFichier('classeur.xlsm'), null);

    // 2. Analyse de l'ancienne structure réelle SALFA (« JANVIER aVANT » : BASE + BASE AJ + Ancienneté en Ar)
    const bytes = fs.readFileSync('SALAIRE SALFA 2026.xlsm');
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const resAncien = analyserClasseurDetaille(buf, 'SALAIRE SALFA 2025.xlsm', {
      anneeDefaut: 2025,
      overrides: {
        'LISTE SALARIE': { incluse: false },
        JANVIER: { incluse: false },
        FEVRIER: { incluse: false },
        MARS: { incluse: false },
        AVRIL: { incluse: false },
        MAI: { incluse: false },
        JUIN: { incluse: false },
        JUILLET: { incluse: false },
        AOUT: { incluse: false },
        SEPTEMBRE: { incluse: false },
        OCTOBRE: { incluse: false },
        'JANVIER aVANT': { incluse: true, type: 'etat', mois: 'DECEMBRE', annee: 2025 },
      },
    });

    const feuilleAncienne = resAncien.feuillesDetail.find((f) => f.nom === 'JANVIER aVANT');
    assert.ok(feuilleAncienne && feuilleAncienne.incluse);
    assert.equal(feuilleAncienne.nbLignes, 46);
    assert.equal(feuilleAncienne.coherence.brutBaseOk, 46);
    assert.equal(feuilleAncienne.coherence.accessoiresOk, 46);
    assert.equal(feuilleAncienne.coherence.netOk, 46);

    // Vérification du placement exact de chaque champ piège de l'ancien format
    const p1 = resAncien.paies.find((p) => p.numero_matricule === 1 && p.annee === 2025 && p.mois === 'DECEMBRE');
    assert.ok(p1);
    assert.equal(p1.base_aj, 271600, 'BASE AJ (271600) doit être retenue et non BASE (203000)');
    assert.equal(p1.nombre_annees, 34, "Nombre d'années doit rester 34");
    assert.equal(p1.anciennete2, 142100, "La colonne « Ancienneté » en Ar doit aller dans anciennete2 (Prime d'ancienneté)");
    assert.equal(p1.resp_repres, 44000, 'RESP REPRES dans le bloc base');
    assert.equal(p1.repr_rec, 64416, 'Repr° réc° dans le bloc accessoires');
    assert.equal(p1.accessoir, 256516);
    assert.equal(p1.net, 629700);

    // 3. Test d'un ancien classeur simplifié (.xlsb) avec en-têtes variés, colonnes sans titre et réaffectation manuelle
    const aoaOld = [
      ['DISPENSAIRE SALFA TANAMBAO — ETAT DE SALAIRE MARS 2022'],
      ['Anarana sy Fanampiny', '', '', 'Karama fototra', 'BRUT', 'CNaPS', 'IRSA', 'Acompte', 'Fanafody', 'Karama raisina', '', 'Note interne'],
      ['TSIAMBANY JOELSON', '2B', 'Réceptionniste', 210000, 210000, 2100, 3000, 50000, 12000, 142900, '00008 00710 05001008589 13', 999999],
      ['TOVONARY PASCAL', '3A', 'Aide Labo', 220000, 220000, 2200, 3000, 30000, 8000, 176800, '', 888888],
      ['ANCIEN PARTI EN 2022', '1B', 'Gardien', 180000, 180000, 1800, 2500, 0, 5000, 170700, '', 0],
    ];
    const wbOld = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOld, XLSX.utils.aoa_to_sheet(aoaOld), 'Feuil_Mars');
    const xlsbBuf = XLSX.write(wbOld, { type: 'buffer', bookType: 'xlsb' });
    const oldAb = xlsbBuf.buffer.slice(xlsbBuf.byteOffset, xlsbBuf.byteOffset + xlsbBuf.byteLength);

    const existants = [
      { numero_matricule: 1, nom_prenoms: 'TSIAMBANY JOELSON' },
      { numero_matricule: 3, nom_prenoms: 'TOVONARY PASCAL' },
    ];
    const analyseXlsb = analyserClasseurDetaille(oldAb, 'SALAIRE_2022.xlsb', {
      employesExistants: existants,
      overrides: { Feuil_Mars: { incluse: true } },
    });
    assert.equal(analyseXlsb.anneeDetecteeFichier, 2022);
    assert.equal(analyseXlsb.paies.length, 3);
    const marsJoelson = analyseXlsb.paies.find((p) => p.numero_matricule === 1);
    assert.ok(marsJoelson, 'Matricule retrouvé par nom exact');
    assert.equal(marsJoelson.mois, 'MARS');
    assert.equal(marsJoelson.annee, 2022);
    assert.equal(marsJoelson.categorie, '2B', 'Catégorie détectée par contenu sans en-tête');
    assert.equal(marsJoelson.jobs, 'Réceptionniste', 'Fonction détectée par contenu sans en-tête');
    assert.equal(marsJoelson.rib, '00008 00710 05001008589 13', 'RIB détecté par format bancaire sans en-tête');
    assert.equal(marsJoelson.salaire_brut, 210000, 'BRUT placé avant IRSA reconnu comme salaire_brut');
    assert.equal(marsJoelson.salaire_net, 204900, 'Salaire net après CNaPS et IRSA calculé');
    assert.equal(marsJoelson.avance, 50000);
    assert.equal(marsJoelson.med, 12000);
    assert.equal(marsJoelson.net, 142900);

    // Test de réaffectation manuelle d'une colonne par l'utilisateur avant import
    const analyseOverrideCol = analyserClasseurDetaille(oldAb, 'SALAIRE_2022.xlsb', {
      employesExistants: existants,
      overrides: {
        Feuil_Mars: {
          incluse: true,
          colonnes: { 11: 'prime_de_garde' }, // affecte « Note interne » à Prime de garde
        },
      },
    });
    assert.equal(analyseOverrideCol.paies.find((p) => p.numero_matricule === 1).prime_de_garde, 999999);

    // 4. Import en mode Archive historique (ne pas écraser les barèmes 2026 + protection mois clôturés) + Saisie indépendante
    const storage = new Map();
    global.localStorage = {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    };
    const api = bundle('src/api-local.ts', 'apiLocal');

    const avantImport = await api.fetchEmployes(false, '');
    const joelson2026 = avantImport.find((e) => e.numero_matricule === 1);
    assert.equal(joelson2026.base_aj, 271600);

    const rapArchive = await api.importerClasseur(analyseXlsb, {
      mode: 'fusion',
      importPaies: true,
      ecraserPaies: true,
      mettreAJourFiches: false,
      nouveauxCommeInactifs: true,
    });
    assert.equal(rapArchive.paiesAjoutees, 3);
    assert.equal(rapArchive.employesAjoutes, 1);

    const apresArchive = await api.fetchEmployes(false, '');
    assert.equal(
      apresArchive.find((e) => e.numero_matricule === 1).base_aj,
      271600,
      'Le salaire de base 2026 ne doit pas être écrasé par une archive de 2022'
    );
    const ancienParti = apresArchive.find((e) => e.nom_prenoms === 'ANCIEN PARTI EN 2022');
    assert.ok(ancienParti);
    assert.equal(ancienParti.actif, 0, "Un ancien salarié d'archive doit être créé comme inactif (Départ)");

    // Protection d'une période clôturée lors d'un réimport
    await api.cloturerMois(2022, 'MARS');
    const rapVerrouille = await api.importerClasseur(analyseOverrideCol, {
      mode: 'fusion',
      importPaies: true,
      ecraserPaies: true,
      mettreAJourFiches: false,
      nouveauxCommeInactifs: true,
    });
    assert.equal(rapVerrouille.paiesMisesAJour, 0);
    assert.deepEqual(rapVerrouille.periodesVerrouilleesIgnorees, ['MARS 2022']);

    // 5. Saisie indépendante : Avances seules puis Médicaments seuls (sans jamais toucher l'autre colonne)
    let oct = (await api.fetchPaiesMois(2026, 'OCTOBRE')).employes;
    const emp1 = oct.find((p) => p.numero_matricule === 1);
    const medOrig = emp1.med;

    // Lot 1 : Avance uniquement
    const rAv = await api.enregistrerSaisieLot(2026, 'OCTOBRE', [
      { paieId: emp1.id, avanceInitiale: emp1.avance, medInitial: emp1.med, avance: 175000 },
    ]);
    assert.equal(rAv.success, true);
    oct = (await api.fetchPaiesMois(2026, 'OCTOBRE')).employes;
    const apresAv = oct.find((p) => p.id === emp1.id);
    assert.equal(apresAv.avance, 175000);
    assert.equal(apresAv.med, medOrig, 'La saisie Avance ne doit jamais modifier MED');

    // Lot 2 : Médicament uniquement
    const rMed = await api.enregistrerSaisieLot(2026, 'OCTOBRE', [
      { paieId: apresAv.id, avanceInitiale: apresAv.avance, medInitial: apresAv.med, med: 42500 },
    ]);
    assert.equal(rMed.success, true);
    oct = (await api.fetchPaiesMois(2026, 'OCTOBRE')).employes;
    const apresMed = oct.find((p) => p.id === emp1.id);
    assert.equal(apresMed.avance, 175000, 'La saisie Médicament ne doit jamais modifier Avance');
    assert.equal(apresMed.med, 42500);

    console.log('Analyse intelligente des anciens classeurs, placement des champs, mode archive & saisies indépendantes : OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
