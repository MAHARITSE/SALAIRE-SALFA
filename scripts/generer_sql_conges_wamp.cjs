#!/usr/bin/env node
/**
 * Génère le fichier SQL d'importation MySQL/MariaDB (WAMP) pour les congés & permissions
 * à partir du classeur Excel « CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb ».
 *
 * Produit :
 *   1. wamp/sql/salfa_conges_excel.sql
 *      -> Script SQL autonome compatible MySQL 5.7+ / 8.x et MariaDB 10.2+ / 11.x (WampServer).
 *      -> Importe toutes les fiches d'absence (congés annuels & permissions) dans salfa_paie.salfa_state
 *         SANS écraser les bulletins de paie (paies), les comparaisons, les paramètres (config_json,
 *         header_json) ni les comptes utilisateurs (salfa_users).
 *      -> Résout dynamiquement chaque salarié par numero_matricule (et ajoute automatiquement les
 *         fiches salariés d'archive 2022–2025 éventuellement absentes de store_json).
 *   2. src/data/salfa_conges_historique.json
 *      -> Fiches d'absence des anciens salariés 2022–2025 (utilisées aussi par generer_sql_wamp.py).
 *   3. Mise à jour synchronisée de src/data/salfa_data.json (congés des salariés 2026).
 *
 * Usage :
 *   node scripts/generer_sql_conges_wamp.cjs [chemin_classeur.xlsb]
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXCEL = path.join(ROOT, 'CONTROL DE CONGE SALFA TOLIARA 2024-2025.xlsb');
const DATA_2026_PATH = path.join(ROOT, 'src', 'data', 'salfa_data.json');
const DATA_HIST_PATH = path.join(ROOT, 'src', 'data', 'salfa_historique.json');
const OUT_HIST_CONGES_PATH = path.join(ROOT, 'src', 'data', 'salfa_conges_historique.json');
const OUT_SQL_DIR = path.join(ROOT, 'wamp', 'sql');
const OUT_SQL_PATH = path.join(OUT_SQL_DIR, 'salfa_conges_excel.sql');

// Taille maximale d'un morceau CONCAT SQL (~80 Ko) pour éviter toute erreur max_allowed_packet dans phpMyAdmin.
const TAILLE_MORCEAU = 80_000;

/** Charge les modules TypeScript de calcul/import des congés via esbuild en mémoire. */
function chargerMoteurConges() {
  const compile = (entry) => {
    const res = esbuild.buildSync({
      entryPoints: [path.join(ROOT, entry)],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      external: ['xlsx'],
      logLevel: 'silent',
    });
    const m = new Module(entry);
    m.paths = Module._nodeModulePaths(ROOT);
    m._compile(res.outputFiles[0].text, path.join(ROOT, entry));
    return m.exports;
  };
  return {
    congesMod: compile('src/local/conges.ts'),
    importMod: compile('src/local/importConges.ts'),
  };
}

/** Échappe une chaîne pour un littéral SQL '...' compatible tous modes SQL ('' + \\ si nécessaire). */
function sqlEscape(texte) {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
}

/** Génère les instructions SET @var = '...' puis CONCAT par morceaux de TAILLE_MORCEAU octets. */
function emettreVariableMorcelee(nomVar, contenuBrut) {
  const lignes = [];
  const morceaux = [];
  for (let i = 0; i < contenuBrut.length; i += TAILLE_MORCEAU) {
    morceaux.push(contenuBrut.slice(i, i + TAILLE_MORCEAU));
  }
  if (morceaux.length === 0) {
    lignes.push(`SET ${nomVar} = '';`);
    return lignes;
  }
  lignes.push(`SET ${nomVar} = '${sqlEscape(morceaux[0])}';`);
  for (let idx = 1; idx < morceaux.length; idx++) {
    lignes.push(`SET ${nomVar} = CONCAT(${nomVar}, '${sqlEscape(morceaux[idx])}');`);
  }
  return lignes;
}

/** Construit la liste complète des 70 salariés SALFA (50 de 2026 + 20 archivés 2022–2025). */
function construireEmployesComplets(data2026, dataHist) {
  const tous = data2026.employes.map((e) => ({ ...e }));
  const parMat = new Map(tous.map((e) => [Number(e.numero_matricule), e]));
  let maxId = tous.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);

  for (const ancien of dataHist.employes || []) {
    const mat = Number(ancien.numero_matricule);
    if (!parMat.has(mat)) {
      maxId += 1;
      const fiche = {
        ...ancien,
        id: maxId,
        actif: 0,
        conge_maternite: ancien.conge_maternite ?? 0,
      };
      tous.push(fiche);
      parMat.set(mat, fiche);
    }
  }
  return { tous, parMat };
}

/** Convertit les lignes extraites du classeur Excel en fiches normalisées de congé/permission. */
function convertirLignesEnFiches(lignesSource, parMat, congesMod, existantsInitiaux = [], nextIdInitial = 0, horodatage = '2026-10-29 08:25:54') {
  const { normaliserConge, LIBELLES_CATEGORIE } = congesMod;
  const cfgImport = {
    droitAnnuelConges: 30,
    droitAnnuelPermissions: 10,
    nbAnneesCumul: 3,
  };

  const fiches = [...existantsInitiaux];
  let nextId = nextIdInitial;
  const clesVues = new Set(
    fiches.map((c) => `${Number(c.numero_matricule)}|${c.date_debut}|${c.categorie}|${Number(c.jours_demandes)}`)
  );

  for (const l of lignesSource) {
    if (!l.numero_matricule) continue;
    const emp = parMat.get(Number(l.numero_matricule));
    if (!emp) continue;

    const jours = Math.round(Number(l.jours || 0) * 100) / 100;
    if (!(jours > 0)) continue;
    const annee = Number(l.annee) || Number(String(l.date_debut || '').slice(0, 4)) || 2026;
    const debut = l.date_debut || `${annee}-01-01`;
    const cle = `${Number(emp.numero_matricule)}|${debut}|${l.categorie}|${jours}`;
    if (clesVues.has(cle)) continue;
    clesVues.add(cle);

    // Règle SALFA / Code du Travail malgache : fenêtre glissante de 3 ans [annee-2 .. annee].
    const anneeMinImport = annee - (cfgImport.nbAnneesCumul - 1);
    const titreImport = l.titre_annee ? Math.max(anneeMinImport, Number(l.titre_annee)) : null;

    nextId += 1;
    const fiche = normaliserConge(
      {
        id: nextId,
        employe_id: Number(emp.id),
        numero_matricule: Number(emp.numero_matricule) || 0,
        nom_prenoms: emp.nom_prenoms,
        fonction: emp.jobs || l.fonction || '',
        contact: l.contact || '',
        categorie: l.categorie,
        motif_code: l.motif_code || '',
        motif_libelle: l.motif || (LIBELLES_CATEGORIE && LIBELLES_CATEGORIE[l.categorie]) || l.categorie,
        imputation: l.imputation,
        annee,
        titre_periode: titreImport ? `Titre ${titreImport}` : '',
        date_debut: debut,
        date_demande: debut,
        jours_demandes: jours,
        statut: 'VALIDE',
        observations: 'Reprise du contrôle des congés importé.',
        saisie_par: 'Import Excel',
        date_saisie: horodatage,
        date_modification: horodatage,
      },
      cfgImport
    );
    fiches.push(fiche);
  }

  return fiches;
}

/**
 * Simule fidèlement l'exécution du script SQL sur différents états de base MySQL
 * afin de garantir la validité JSON et la conformité avec wamp/api/validation.php (validStore).
 */
function verifierSimulationEtats({ congesModele, parMat, tousEmployes, data2026, baremeAnciennete }) {
  const validerStoreCommePhp = (store) => {
    assert.equal(typeof store, 'object');
    for (const k of ['employes', 'paies', 'comparaison_net', 'conges']) {
      assert.ok(Array.isArray(store[k]), `${k} doit être un tableau JSON`);
    }
    const empIds = new Set();
    const empMats = new Set();
    for (const e of store.employes) {
      assert.ok(Number.isInteger(e.id) && e.id > 0, `employe.id entier positif requis (${e.id})`);
      assert.ok(!empIds.has(e.id), `employe.id dupliqué interdit (${e.id})`);
      empIds.add(e.id);
      empMats.add(Number(e.numero_matricule));
      assert.ok(Object.keys(e).length <= 40, 'employe <= 40 clés');
    }
    const congeIds = new Set();
    for (const c of store.conges) {
      assert.ok(Number.isInteger(c.id) && c.id > 0, `conge.id entier positif requis (${c.id})`);
      assert.ok(!congeIds.has(c.id), `conge.id dupliqué interdit (${c.id})`);
      congeIds.add(c.id);
      assert.ok(Number.isInteger(c.employe_id) && empIds.has(c.employe_id), `conge.employe_id (${c.employe_id}, mat=${c.numero_matricule}) doit exister dans store.employes`);
      assert.ok(Object.keys(c).length <= 40, 'conge <= 40 clés');
    }
    return { nbEmp: empIds.size, nbConges: congeIds.size, nbMats: empMats.size };
  };

  const executerLogiqueSql = (storeInitial) => {
    let store = JSON.parse(JSON.stringify(storeInitial));
    if (!Array.isArray(store.employes) || store.employes.length === 0) {
      store.employes = JSON.parse(JSON.stringify(tousEmployes));
      store.bareme_anciennete = JSON.parse(JSON.stringify(baremeAnciennete));
    }

    let matsCsv = store.employes.map((e) => String(e.numero_matricule)).join(',');
    let idsList = store.employes.map((e) => Number(e.id));
    let idsCsv = idsList.map(String).join(',');

    let nextEmpId = Math.max(idsList.length ? idsList[idsList.length - 1] : 0, idsList.length);
    const matsRequis = Array.from(new Set(congesModele.map((c) => Number(c.numero_matricule)))).sort((a, b) => a - b);

    for (const mat of matsRequis) {
      const pos = matsCsv ? matsCsv.split(',').indexOf(String(mat)) + 1 : 0;
      if (pos > 0) {
        nextEmpId = Math.max(nextEmpId, idsList[pos - 1]);
      }
    }

    let extraEmps = '';
    for (const mat of matsRequis) {
      const pos = matsCsv ? matsCsv.split(',').indexOf(String(mat)) + 1 : 0;
      if (pos === 0) {
        nextEmpId += 1;
        if (idsCsv.split(',').includes(String(nextEmpId))) nextEmpId += 1000;
        const modele = JSON.stringify({ ...parMat.get(mat), id: '__EMP_ID__' }).replace('"__EMP_ID__"', String(nextEmpId));
        extraEmps += `,${modele}`;
      }
    }

    if (extraEmps.length > 0) {
      const empsActuels = JSON.stringify(store.employes);
      const empsFusion = `${empsActuels.slice(0, -1)}${extraEmps}]`;
      store.employes = JSON.parse(empsFusion);
      matsCsv = store.employes.map((e) => String(e.numero_matricule)).join(',');
      idsList = store.employes.map((e) => Number(e.id));
    }

    let congesJson = JSON.stringify(congesModele);
    for (const mat of matsRequis) {
      const pos = matsCsv.split(',').indexOf(String(mat)) + 1;
      assert.ok(pos > 0, `Matricule ${mat} introuvable après fusion`);
      const empId = idsList[pos - 1];
      congesJson = congesJson.split(`"__MAT_${mat}__"`).join(String(empId));
    }
    assert.ok(!congesJson.includes('__MAT_'), 'Aucun jeton __MAT_ ne doit subsister');
    store.conges = JSON.parse(congesJson);
    store.meta = { ...(store.meta || {}), conges_version: 'controle-2026-10', conges_loi_3ans: 3 };
    return store;
  };

  // Cas 1 : Base vide issue de setup.php
  const s1 = executerLogiqueSql({
    meta: { source_version: 'classeur-2026-10' },
    bareme_anciennete: {},
    employes: [],
    paies: [],
    comparaison_net: [],
    conges: [],
    utilisateurs: [],
  });
  const r1 = validerStoreCommePhp(s1);
  assert.equal(r1.nbEmp, tousEmployes.length);
  assert.equal(r1.nbConges, congesModele.length);

  // Cas 2 : Base complète 2022–2026 avec paies existantes
  const s2 = executerLogiqueSql({
    meta: { source_version: 'classeur-2026-10' },
    bareme_anciennete: baremeAnciennete,
    employes: tousEmployes,
    paies: data2026.paies.slice(0, 25),
    comparaison_net: data2026.comparaison_net,
    conges: [],
    utilisateurs: [],
  });
  const r2 = validerStoreCommePhp(s2);
  assert.equal(r2.nbEmp, tousEmployes.length);
  assert.equal(s2.paies.length, 25, 'les bulletins de paie existants sont intégralement préservés');
  assert.equal(r2.nbConges, congesModele.length);

  // Cas 3 : Base initialisée par import navigateur 2026 uniquement (48 actifs aux IDs décalés + désordonnés)
  const actifsDecales = data2026.employes
    .filter((e) => Number(e.actif) === 1)
    .reverse()
    .map((e, idx) => ({ ...e, id: idx + 10 }));
  const s3 = executerLogiqueSql({
    meta: { source_version: 'classeur-2026-10' },
    bareme_anciennete: baremeAnciennete,
    employes: actifsDecales,
    paies: [{ id: 1, employe_id: actifsDecales[0].id, mois: 'OCTOBRE', annee: 2026 }],
    comparaison_net: [],
    conges: [],
    utilisateurs: [],
  });
  const r3 = validerStoreCommePhp(s3);
  assert.equal(r3.nbConges, congesModele.length);
  for (const c of s3.conges) {
    const empTrouve = s3.employes.find((e) => e.id === c.employe_id);
    assert.ok(empTrouve, `employe_id=${c.employe_id} résolu`);
    assert.equal(Number(empTrouve.numero_matricule), Number(c.numero_matricule), 'correspondance matricule <-> employe_id exacte');
  }
}

function main() {
  const cheminExcel = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_EXCEL;
  if (!fs.existsSync(cheminExcel)) {
    throw new Error(`Classeur Excel introuvable : ${cheminExcel}`);
  }

  const data2026 = JSON.parse(fs.readFileSync(DATA_2026_PATH, 'utf8'));
  const dataHist = JSON.parse(fs.readFileSync(DATA_HIST_PATH, 'utf8'));
  const { congesMod, importMod } = chargerMoteurConges();

  const { tous: tousEmployes, parMat: parMatTous } = construireEmployesComplets(data2026, dataHist);
  const parMat2026 = new Map(data2026.employes.map((e) => [Number(e.numero_matricule), e]));

  const bufExcel = fs.readFileSync(cheminExcel);
  const analyse = importMod.analyserControleConges(bufExcel, path.basename(cheminExcel), tousEmployes);

  // Sélectionner les feuilles actives non vides (exclut les archives probables comme '2025' déjà reprise dans '2026').
  let feuillesRetenues = analyse.feuilles.filter((f) => f.reconnue && !f.archiveProbable && f.nbLignes > 0).map((f) => f.nom);
  if (feuillesRetenues.length === 0) {
    feuillesRetenues = analyse.feuilles.filter((f) => f.reconnue && f.nbLignes > 0).map((f) => f.nom);
  }
  const setFeuilles = new Set(feuillesRetenues);
  const lignesRetenues = analyse.lignes.filter((l) => setFeuilles.has(l.feuille));

  // 1) Fiches des 50 salariés 2026 (pour salfa_data.json), numérotées 1..N1
  const lignes2026 = lignesRetenues.filter((l) => l.numero_matricule && parMat2026.has(Number(l.numero_matricule)));
  const fiches2026 = convertirLignesEnFiches(lignes2026, parMat2026, congesMod, [], 0);

  // 2) Fiches complémentaires des anciens salariés 2022–2025, numérotées (N1+1)..N2
  const lignesAnciens = lignesRetenues.filter(
    (l) => l.numero_matricule && !parMat2026.has(Number(l.numero_matricule)) && parMatTous.has(Number(l.numero_matricule))
  );
  const fichesToutes = convertirLignesEnFiches(
    lignesAnciens,
    parMatTous,
    congesMod,
    fiches2026.map((c) => ({ ...c, employe_id: Number(parMatTous.get(Number(c.numero_matricule)).id) })),
    fiches2026.length
  );
  const fichesAnciensSeuls = fichesToutes.slice(fiches2026.length);
  assert.ok(fichesToutes.length > 0, 'Aucune fiche de congé reconnue dans le classeur Excel');

  // Mise à jour synchronisée de src/data/salfa_data.json et src/data/salfa_conges_historique.json
  data2026.meta = {
    ...(data2026.meta || {}),
    conges_version: 'controle-2026-10',
    conges_loi_3ans: 3,
  };
  data2026.conges = fiches2026;
  fs.writeFileSync(DATA_2026_PATH, JSON.stringify(data2026, null, 2) + '\n', 'utf8');
  fs.writeFileSync(
    OUT_HIST_CONGES_PATH,
    JSON.stringify(
      {
        meta: {
          source_excel: path.basename(cheminExcel),
          feuilles: feuillesRetenues,
          conges_version: 'controle-2026-10',
          nb_conges_anciens: fichesAnciensSeuls.length,
        },
        conges: fichesAnciensSeuls,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  // Modèle JSON des congés avec jeton "__MAT_<M>__" pour résolution dynamique de employe_id dans MySQL/MariaDB
  const congesModele = fichesToutes.map((c) => ({
    ...c,
    employe_id: `__MAT_${Number(c.numero_matricule)}__`,
  }));

  // Vérification complète par simulation avant écriture du fichier SQL
  verifierSimulationEtats({
    congesModele,
    parMat: parMatTous,
    tousEmployes,
    data2026,
    baremeAnciennete: data2026.bareme_anciennete || {},
  });

  const matsPresents = Array.from(new Set(fichesToutes.map((c) => Number(c.numero_matricule)))).sort((a, b) => a - b);
  const nbCongesAnnuels = fichesToutes.filter((c) => c.categorie === 'CONGE').length;
  const nbPermissions = fichesToutes.filter((c) => c.categorie === 'PERMISSION').length;
  const anneesCouvertes = Array.from(new Set(fichesToutes.map((c) => Number(c.annee)))).sort((a, b) => a - b);

  const storeVideJson = JSON.stringify({
    meta: {
      source_version: 'classeur-2026-10',
      conges_version: 'controle-2026-10',
      conges_loi_3ans: 3,
    },
    bareme_anciennete: {},
    employes: [],
    paies: [],
    comparaison_net: [],
    conges: [],
    utilisateurs: [],
  });
  const tousEmployesJson = JSON.stringify(tousEmployes);
  const baremeJson = JSON.stringify(data2026.bareme_anciennete || {});
  const congesModeleJson = JSON.stringify(congesModele);

  const sql = [
    '-- ============================================================================',
    '-- SALFA TOLIARA — Gestion des Salaires & Congés (Version WAMP / MySQL)',
    '-- Script SQL dédié : Importation des Congés & Permissions depuis Excel',
    '-- ============================================================================',
    `-- Fichier source : ${path.basename(cheminExcel)} (feuille(s) : ${feuillesRetenues.join(', ')})`,
    `-- Contenu importé :`,
    `--   * ${fichesToutes.length} fiches d'absence approuvées (${nbCongesAnnuels} congés annuels + ${nbPermissions} permissions)`,
    `--   * ${matsPresents.length} salariés SALFA reconnus (${fiches2026.length} fiches personnel 2026 + ${fichesAnciensSeuls.length} fiches anciens 2022–2025)`,
    `--   * Période couverte : ${anneesCouvertes[0]} à ${anneesCouvertes[anneesCouvertes.length - 1]} (règle légale des 3 ans activée)`,
    '--',
    '-- Garanties de sécurité :',
    '--   * NE SUPPRIME PAS et N\'ÉCRASE PAS vos bulletins de paie (paies), comparaisons,',
    '--     paramètres (config_json, header_json) ni vos comptes utilisateurs (salfa_users).',
    '--   * Résout automatiquement chaque salarié par son numéro matricule (employe_id exact)',
    '--     et ajoute les éventuelles fiches salariés manquantes (anciens 2022–2025).',
    '--   * Compatible MySQL 5.7+ / 8.x et MariaDB 10.2+ / 11.x sous WampServer.',
    '--   * Découpé en blocs de 80 Ko (aucune erreur max_allowed_packet dans phpMyAdmin).',
    '--',
    '-- Utilisation :',
    '--   Option A (phpMyAdmin) : Sélectionner `salfa_paie` -> onglet « Importer » -> choisir ce fichier -> Exécuter.',
    '--   Option B (Console MySQL) : mysql -u root -p --default-character-set=utf8mb4 < salfa_conges_excel.sql',
    '-- ============================================================================',
    '',
    'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;',
    "SET time_zone = '+00:00';",
    '',
    'CREATE DATABASE IF NOT EXISTS `salfa_paie`',
    '  CHARACTER SET utf8mb4',
    '  COLLATE utf8mb4_unicode_ci;',
    '',
    'USE `salfa_paie`;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_users` (',
    '  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,',
    '  `username` VARCHAR(80) NOT NULL UNIQUE,',
    '  `nom_complet` VARCHAR(160) NOT NULL,',
    '  `role` VARCHAR(32) NOT NULL,',
    '  `actif` TINYINT NOT NULL DEFAULT 1,',
    '  `password_hash` VARCHAR(255) NOT NULL',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_state` (',
    '  `id` TINYINT NOT NULL PRIMARY KEY,',
    '  `revision` BIGINT NOT NULL,',
    '  `store_json` LONGTEXT NOT NULL,',
    '  `config_json` LONGTEXT NULL,',
    '  `header_json` LONGTEXT NULL',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'START TRANSACTION;',
    '',
    '-- 1) Garantir l\'existence de la ligne d\'état id = 1 sans toucher aux données existantes',
    `INSERT IGNORE INTO \`salfa_state\` (\`id\`, \`revision\`, \`store_json\`, \`config_json\`, \`header_json\`)`,
    `VALUES (1, 0, '${sqlEscape(storeVideJson)}', NULL, NULL);`,
    '',
    '-- 2) Garantir $.meta et initialiser les 70 salariés SALFA si $.employes est encore vide',
    'UPDATE `salfa_state`',
    "SET `store_json` = JSON_SET(`store_json`, '$.meta', JSON_EXTRACT('{\"source_version\":\"classeur-2026-10\"}', '$'))",
    "WHERE `id` = 1 AND JSON_EXTRACT(`store_json`, '$.meta') IS NULL;",
    ...emettreVariableMorcelee('@salfa_all_emps', tousEmployesJson),
    `SET @salfa_bareme = '${sqlEscape(baremeJson)}';`,
    'UPDATE `salfa_state`',
    'SET `store_json` = JSON_SET(',
    '  `store_json`,',
    "  '$.employes', JSON_EXTRACT(@salfa_all_emps, '$'),",
    "  '$.bareme_anciennete', JSON_EXTRACT(@salfa_bareme, '$')",
    ')',
    "WHERE `id` = 1 AND COALESCE(JSON_LENGTH(`store_json`, '$.employes'), 0) = 0;",
    'SET @salfa_all_emps = NULL;',
    'SET @salfa_bareme = NULL;',
    '',
    '-- 3) Compléter uniquement les fiches salariés éventuellement absentes (ex. anciens salariés 2022–2025)',
    "SET @emps_json = (SELECT JSON_EXTRACT(`store_json`, '$.employes') FROM `salfa_state` WHERE `id` = 1);",
    "SET @mats_csv = REPLACE(REPLACE(REPLACE(COALESCE(JSON_EXTRACT(@emps_json, '$[*].numero_matricule'), '[]'), '[', ''), ']', ''), ' ', '');",
    "SET @ids_json = COALESCE(JSON_EXTRACT(@emps_json, '$[*].id'), '[]');",
    "SET @ids_csv = REPLACE(REPLACE(REPLACE(@ids_json, '[', ''), ']', ''), ' ', '');",
    "SET @nb_emps = COALESCE(JSON_LENGTH(@ids_json), 0);",
    "SET @next_emp_id = GREATEST(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@ids_json, CONCAT('$[', IF(@nb_emps > 0, @nb_emps - 1, 0), ']'))) AS UNSIGNED), 0), @nb_emps);",
    "SET @extra_emps = '';",
  ];

  // S'assurer d'abord que @next_emp_id dépasse tout id déjà utilisé par les matricules connus
  for (const mat of matsPresents) {
    sql.push(
      `SET @pos_m = FIND_IN_SET('${mat}', @mats_csv);`,
      `SET @next_emp_id = IF(@pos_m > 0, GREATEST(@next_emp_id, CAST(JSON_UNQUOTE(JSON_EXTRACT(@ids_json, CONCAT('$[', IF(@pos_m > 0, @pos_m - 1, 0), ']'))) AS UNSIGNED)), @next_emp_id);`
    );
  }

  // Ajouter les fiches salariés absentes de $.employes
  for (const mat of matsPresents) {
    const modeleEmp = JSON.stringify({ ...parMatTous.get(mat), id: '__EMP_ID__' });
    sql.push(
      `SET @manque_m = (FIND_IN_SET('${mat}', @mats_csv) = 0);`,
      'SET @next_emp_id = @next_emp_id + IF(@manque_m, 1, 0);',
      'SET @next_emp_id = IF(@manque_m AND FIND_IN_SET(CAST(@next_emp_id AS CHAR), @ids_csv) > 0, @next_emp_id + 1000, @next_emp_id);',
      `SET @extra_emps = IF(@manque_m, CONCAT(@extra_emps, ',', REPLACE('${sqlEscape(modeleEmp)}', '"__EMP_ID__"', CAST(@next_emp_id AS CHAR))), @extra_emps);`
    );
  }

  sql.push(
    'UPDATE `salfa_state`',
    'SET `store_json` = JSON_SET(',
    '  `store_json`,',
    "  '$.employes', JSON_EXTRACT(CONCAT(LEFT(TRIM(@emps_json), CHAR_LENGTH(TRIM(@emps_json)) - 1), @extra_emps, ']'), '$')",
    ')',
    'WHERE `id` = 1 AND CHAR_LENGTH(@extra_emps) > 0;',
    '',
    '-- 4) Recharger la table de correspondance (numero_matricule -> employe_id réel en base)',
    "SET @emps_json = (SELECT JSON_EXTRACT(`store_json`, '$.employes') FROM `salfa_state` WHERE `id` = 1);",
    "SET @mats_csv = REPLACE(REPLACE(REPLACE(COALESCE(JSON_EXTRACT(@emps_json, '$[*].numero_matricule'), '[]'), '[', ''), ']', ''), ' ', '');",
    "SET @ids_json = COALESCE(JSON_EXTRACT(@emps_json, '$[*].id'), '[]');",
    "SET @extra_emps = NULL;",
    '',
    '-- 5) Charger les fiches de congés & permissions par blocs de 80 Ko et associer les employe_id',
    ...emettreVariableMorcelee('@conges_json', congesModeleJson)
  );

  for (const mat of matsPresents) {
    sql.push(
      `SET @pos_m = FIND_IN_SET('${mat}', @mats_csv);`,
      `SET @emp_id_m = CAST(JSON_UNQUOTE(JSON_EXTRACT(@ids_json, CONCAT('$[', IF(@pos_m > 0, @pos_m - 1, 0), ']'))) AS UNSIGNED);`,
      `SET @conges_json = IF(@pos_m > 0, REPLACE(@conges_json, '"__MAT_${mat}__"', CAST(@emp_id_m AS CHAR)), @conges_json);`
    );
  }

  sql.push(
    '',
    '-- 6) Enregistrer les congés dans salfa_state sans toucher aux paies ni aux paramètres',
    'UPDATE `salfa_state`',
    'SET',
    '  `store_json` = JSON_SET(',
    '    `store_json`,',
    "    '$.conges', JSON_EXTRACT(@conges_json, '$'),",
    "    '$.meta.conges_version', 'controle-2026-10',",
    "    '$.meta.conges_loi_3ans', 3",
    '  ),',
    '  `revision` = `revision` + 1',
    'WHERE `id` = 1 AND JSON_VALID(@conges_json) = 1;',
    '',
    'SET @conges_json = NULL;',
    'SET @emps_json = NULL;',
    'SET @mats_csv = NULL;',
    'SET @ids_json = NULL;',
    'SET @ids_csv = NULL;',
    '',
    'COMMIT;',
    '',
    '-- Vérification rapide après import (affichée dans phpMyAdmin / console MySQL) :',
    'SELECT',
    '  `id`,',
    '  `revision`,',
    '  JSON_VALID(`store_json`) AS `json_valide`,',
    "  JSON_TYPE(JSON_EXTRACT(`store_json`, '$.conges')) AS `type_conges`,",
    "  JSON_LENGTH(`store_json`, '$.employes') AS `nb_employes`,",
    "  JSON_LENGTH(`store_json`, '$.paies') AS `nb_paies_conservees`,",
    "  JSON_LENGTH(`store_json`, '$.conges') AS `nb_conges_importes`",
    'FROM `salfa_state`',
    'WHERE `id` = 1;',
    ''
  );

  fs.mkdirSync(OUT_SQL_DIR, { recursive: true });
  const sqlFinal = sql.join('\n');
  fs.writeFileSync(OUT_SQL_PATH, sqlFinal, 'utf8');

  // Vérification aller-retour des morceaux SQL de @conges_json
  const regexMorceau = /^SET @conges_json = (?:CONCAT\(@conges_json, )?'(.*)'\)?;$/;
  let reconstruit = '';
  for (const ligne of sql) {
    const m = ligne.match(regexMorceau);
    if (!m) continue;
    const unescaped = m[1]
      .replace(/\\Z/g, '\x1a')
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
      .replace(/\\0/g, '\0')
      .replace(/''/g, "'")
      .replace(/\\\\/g, '\\');
    reconstruit += unescaped;
  }
  assert.equal(reconstruit, congesModeleJson, 'Aller-retour SQL -> JSON de @conges_json strictement identique');

  const tailleKo = (Buffer.byteLength(sqlFinal, 'utf8') / 1024).toFixed(1);
  console.log(`Fichier SQL congés généré : ${OUT_SQL_PATH}`);
  console.log(`  Taille : ${tailleKo} Ko`);
  console.log(`  Feuille(s) retenue(s) : ${feuillesRetenues.join(', ')}`);
  console.log(`  Salariés reconnus : ${matsPresents.length} (${fiches2026.length} fiches 2026 + ${fichesAnciensSeuls.length} fiches anciens 2022–2025)`);
  console.log(`  Total fiches importées : ${fichesToutes.length} (${nbCongesAnnuels} congés annuels, ${nbPermissions} permissions)`);
  console.log(`  Vérification simulation WAMP & aller-retour JSON : OK`);
}

main();
