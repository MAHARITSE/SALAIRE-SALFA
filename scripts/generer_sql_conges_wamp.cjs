#!/usr/bin/env node
/**
 * Génère le SQL WAMP des soldes de congés depuis le dernier classeur Excel SALFA.
 * Le classeur actuel est un relevé de soldes restants par salarié et par année
 * (2024–2026); ses cases vides sont importées comme 0 jour. Les anciens classeurs
 * détaillés (.xlsb) restent acceptés en argument explicite.
 *
 * Produit :
 *   1. wamp/sql/salfa_conges_excel.sql (SQL relationnel MySQL/MariaDB)
 *   2. src/data/salfa_data.json (soldes annuels utilisés comme ouvertures exactes)
 *   3. Préserve src/data/salfa_conges_historique.json pour les anciens salariés
 *
 * Usage : node scripts/generer_sql_conges_wamp.cjs [chemin_classeur.xlsx|xlsb]
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { lireSnapshotConges } = require('./controle_conges_snapshot.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXCEL = path.join(ROOT, 'CONTROLE CONGE A JOUR SALFA 2026.xlsx');
const DATA_2026_PATH = path.join(ROOT, 'src', 'data', 'salfa_data.json');
const DATA_HIST_PATH = path.join(ROOT, 'src', 'data', 'salfa_historique.json');
const OUT_HIST_CONGES_PATH = path.join(ROOT, 'src', 'data', 'salfa_conges_historique.json');
const OUT_SQL_DIR = path.join(ROOT, 'wamp', 'sql');
const OUT_SQL_PATH = path.join(OUT_SQL_DIR, 'salfa_conges_excel.sql');
const CONGES_VERSION = 'controle-solde-2026-10-30';
const HORODATAGE_IMPORT = '2026-10-30 12:25:14';

// Hashs bcrypt compatibles PHP password_verify()
const HASH_ADMIN = '$2y$10$YX/zKbv4VMuSaS3ddJB5MuBWGfTgOr6aIf7L4PEsva5y2hyHw0j/G'; // admin123
const HASH_COMPTABLE = '$2y$10$xFu0Kw7V7YsnIfrwPjOr1.C6.CfWtRq4Wyo.w/PX8cG36QN2.ezou'; // comptable123

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

function sqlStr(val, maxLen = 0) {
  let s = String(val ?? '');
  if (maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen);
  return (
    "'" +
    s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/\0/g, '\\0')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\x1a/g, '\\Z') +
    "'"
  );
}

function sqlNum(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const n = Number(val);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 10000) / 10000);
}

function sqlInt(val) {
  const n = Math.trunc(Number(val) || 0);
  return String(n);
}

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

function horodatageSnapshot(snapshot) {
  if (snapshot.dateModification instanceof Date && Number.isFinite(snapshot.dateModification.getTime())) {
    return snapshot.dateModification.toISOString().slice(0, 19).replace('T', ' ');
  }
  return HORODATAGE_IMPORT;
}

function convertirSoldesEnFiches(snapshot, congesMod, horodatage) {
  const fiches = [];
  let id = 0;
  for (const ligne of snapshot.lignes) {
    const emp = ligne.employe;
    for (const solde of ligne.soldes) {
      id += 1;
      fiches.push(congesMod.normaliserConge({
        id,
        employe_id: Number(emp.id),
        numero_matricule: Number(emp.numero_matricule) || 0,
        nom_prenoms: emp.nom_prenoms,
        fonction: emp.jobs || '',
        categorie: 'AJUSTEMENT',
        ajustement_type: 'OUVERTURE',
        imputation: 'AUCUNE',
        annee: solde.annee,
        date_demande: `${solde.annee}-01-01`,
        date_debut: `${solde.annee}-01-01`,
        jours_demandes: solde.jours,
        jours_valides: null,
        titre_periode: `Titre ${solde.annee}`,
        motif_libelle: `Solde restant importé — Titre ${solde.annee}`,
        observations: `Solde restant repris de ${snapshot.fichier}; les cases vides du classeur sont importées à 0 jour.`,
        statut: 'VALIDE',
        saisie_par: 'Import Excel',
        date_saisie: horodatage,
        date_modification: horodatage,
      }));
    }
  }
  return fiches;
}

function chargerCongesHistoriques(parMatTous, matriculesCourants, congesMod, premierId) {
  if (!fs.existsSync(OUT_HIST_CONGES_PATH)) return [];
  const doc = JSON.parse(fs.readFileSync(OUT_HIST_CONGES_PATH, 'utf8'));
  let id = premierId;
  const fiches = [];
  for (const brut of doc.conges || []) {
    const mat = Number(brut.numero_matricule) || 0;
    if (!mat || matriculesCourants.has(mat)) continue;
    const emp = parMatTous.get(mat);
    if (!emp) throw new Error(`Salarié historique matricule ${mat} absent du référentiel employé.`);
    id += 1;
    fiches.push(congesMod.normaliserConge({
      ...brut,
      id,
      employe_id: Number(emp.id),
      numero_matricule: mat,
    }));
  }
  return fiches;
}

function ddlTablesRelationnelles() {
  return [
    '-- Suppression de l\'ancienne table JSON (plus aucun stockage JSON dans MySQL)',
    'DROP TABLE IF EXISTS `salfa_state`;',
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
    'CREATE TABLE IF NOT EXISTS `salfa_revision` (',
    '  `id` TINYINT NOT NULL PRIMARY KEY,',
    '  `revision` BIGINT NOT NULL DEFAULT 1,',
    "  `source_file` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2026.xlsm',",
    "  `entreprise` VARCHAR(160) NOT NULL DEFAULT 'SALFA TANAMBAO',",
    "  `titre` VARCHAR(255) NOT NULL DEFAULT 'FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN''OLONA (Bulletin de paie individuel)',",
    '  `annee` INT NOT NULL DEFAULT 2026,',
    "  `source_version` VARCHAR(60) NOT NULL DEFAULT 'classeur-2026-10',",
    "  `source_historique` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2022-2025',",
    "  `conges_version` VARCHAR(60) NOT NULL DEFAULT '" + CONGES_VERSION + "',",
    '  `conges_loi_3ans` INT NOT NULL DEFAULT 3,',
    "  `date_modification` VARCHAR(32) NOT NULL DEFAULT ''",
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_employes` (',
    '  `id` INT NOT NULL PRIMARY KEY,',
    '  `numero_matricule` INT NOT NULL UNIQUE,',
    '  `nom_prenoms` VARCHAR(160) NOT NULL,',
    "  `numero_cnaps` VARCHAR(60) NOT NULL DEFAULT '',",
    "  `categorie` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `jobs` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `date_embauche` VARCHAR(20) NOT NULL DEFAULT '',",
    '  `nombre_annees` INT NOT NULL DEFAULT 0,',
    '  `enfant_a_charge` INT NOT NULL DEFAULT 0,',
    '  `base_aj` DOUBLE NOT NULL DEFAULT 0,',
    '  `logement_transport` DOUBLE NOT NULL DEFAULT 0,',
    '  `rendement` DOUBLE NOT NULL DEFAULT 0,',
    '  `responsabilite_representation` DOUBLE NOT NULL DEFAULT 0,',
    "  `rib` VARCHAR(80) NOT NULL DEFAULT '',",
    "  `mode_paiement` VARCHAR(32) NOT NULL DEFAULT 'ESPECES',",
    '  `actif` TINYINT NOT NULL DEFAULT 1,',
    "  `date_inactif` VARCHAR(20) NOT NULL DEFAULT '',",
    '  `conge_maternite` TINYINT NOT NULL DEFAULT 0,',
    "  `date_debut_maternite` VARCHAR(20) NOT NULL DEFAULT '',",
    "  `date_creation` VARCHAR(32) NOT NULL DEFAULT ''",
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_paies` (',
    '  `id` INT NOT NULL PRIMARY KEY,',
    '  `employe_id` INT NOT NULL,',
    '  `numero_matricule` INT NOT NULL,',
    '  `annee` INT NOT NULL,',
    '  `mois` VARCHAR(20) NOT NULL,',
    "  `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `numero_cnaps` VARCHAR(60) NOT NULL DEFAULT '',",
    "  `categorie` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `jobs` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `date_embauche` VARCHAR(20) NOT NULL DEFAULT '',",
    '  `nombre_annees` INT NOT NULL DEFAULT 0,',
    '  `enfant_a_charge` INT NOT NULL DEFAULT 0,',
    '  `base_aj` DOUBLE NOT NULL DEFAULT 0,',
    '  `logt_trsp` DOUBLE NOT NULL DEFAULT 0,',
    '  `rendement` DOUBLE NOT NULL DEFAULT 0,',
    '  `resp_repres` DOUBLE NOT NULL DEFAULT 0,',
    '  `salaire_brut` DOUBLE NOT NULL DEFAULT 0,',
    '  `cnaps` DOUBLE NOT NULL DEFAULT 0,',
    '  `patronal` DOUBLE NOT NULL DEFAULT 0,',
    '  `salaire_imposable` DOUBLE NOT NULL DEFAULT 0,',
    '  `irsa` DOUBLE NOT NULL DEFAULT 0,',
    '  `salaire_net` DOUBLE NOT NULL DEFAULT 0,',
    '  `augmentation_divers` DOUBLE NOT NULL DEFAULT 0,',
    '  `prime_de_garde` DOUBLE NOT NULL DEFAULT 0,',
    '  `anciennete2` DOUBLE NOT NULL DEFAULT 0,',
    '  `risque` DOUBLE NOT NULL DEFAULT 0,',
    '  `repr_rec` DOUBLE NOT NULL DEFAULT 0,',
    '  `accessoir` DOUBLE NOT NULL DEFAULT 0,',
    '  `brut` DOUBLE NOT NULL DEFAULT 0,',
    '  `avance` DOUBLE NOT NULL DEFAULT 0,',
    '  `med` DOUBLE NOT NULL DEFAULT 0,',
    '  `net` DOUBLE NOT NULL DEFAULT 0,',
    '  `virement` DOUBLE NULL DEFAULT NULL,',
    '  `especes` DOUBLE NULL DEFAULT NULL,',
    "  `rib` VARCHAR(80) NOT NULL DEFAULT '',",
    '  `verrouille` TINYINT NOT NULL DEFAULT 0,',
    '  `conge_maternite` TINYINT NOT NULL DEFAULT 0,',
    "  `date_debut_maternite` VARCHAR(20) NOT NULL DEFAULT '',",
    "  `date_modification` VARCHAR(32) NOT NULL DEFAULT '',",
    '  UNIQUE KEY `uq_paie_periode` (`employe_id`, `annee`, `mois`),',
    '  KEY `idx_paie_annee_mois` (`annee`, `mois`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_conges` (',
    '  `id` INT NOT NULL PRIMARY KEY,',
    '  `employe_id` INT NOT NULL,',
    '  `numero_matricule` INT NOT NULL DEFAULT 0,',
    "  `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `fonction` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `service` VARCHAR(120) NOT NULL DEFAULT '',",
    "  `contact` VARCHAR(120) NOT NULL DEFAULT '',",
    "  `categorie` VARCHAR(32) NOT NULL DEFAULT 'CONGE',",
    "  `motif_code` VARCHAR(40) NOT NULL DEFAULT '',",
    "  `motif_libelle` VARCHAR(255) NOT NULL DEFAULT '',",
    "  `imputation` VARCHAR(32) NOT NULL DEFAULT 'CONGE',",
    '  `annee` INT NOT NULL,',
    "  `date_demande` VARCHAR(20) NOT NULL DEFAULT '',",
    "  `date_debut` VARCHAR(20) NOT NULL DEFAULT '',",
    "  `heure_debut` VARCHAR(16) NOT NULL DEFAULT '',",
    "  `date_fin` VARCHAR(20) NOT NULL DEFAULT '',",
    "  `date_retour` VARCHAR(20) NOT NULL DEFAULT '',",
    "  `heure_fin` VARCHAR(16) NOT NULL DEFAULT '',",
    '  `jours_demandes` DOUBLE NOT NULL DEFAULT 0,',
    '  `jours_valides` DOUBLE NULL DEFAULT NULL,',
    "  `remplacant` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `titre_periode` VARCHAR(80) NOT NULL DEFAULT '',",
    "  `justificatif` VARCHAR(255) NOT NULL DEFAULT '',",
    '  `observations` TEXT NOT NULL,',
    "  `statut` VARCHAR(32) NOT NULL DEFAULT 'VALIDE',",
    "  `visa_chef_par` VARCHAR(120) NOT NULL DEFAULT '',",
    "  `visa_chef_le` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `visa_medecin_par` VARCHAR(120) NOT NULL DEFAULT '',",
    "  `visa_medecin_le` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `visa_gestionnaire_par` VARCHAR(120) NOT NULL DEFAULT '',",
    "  `visa_gestionnaire_le` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `motif_refus` VARCHAR(255) NOT NULL DEFAULT '',",
    "  `ajustement_type` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `saisie_par` VARCHAR(80) NOT NULL DEFAULT '',",
    "  `date_saisie` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `date_modification` VARCHAR(32) NOT NULL DEFAULT '',",
    '  KEY `idx_conge_employe_annee` (`employe_id`, `annee`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_comparaison_net` (',
    '  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,',
    '  `numero_matricule` INT NOT NULL,',
    "  `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',",
    "  `categorie` VARCHAR(32) NOT NULL DEFAULT '',",
    "  `jobs` VARCHAR(160) NOT NULL DEFAULT '',",
    '  `net_actuel` DOUBLE NOT NULL DEFAULT 0,',
    '  `net_avant` DOUBLE NOT NULL DEFAULT 0,',
    '  `ecart` DOUBLE NOT NULL DEFAULT 0,',
    '  KEY `idx_comp_matricule` (`numero_matricule`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_config` (',
    '  `id` TINYINT NOT NULL PRIMARY KEY,',
    '  `configuree` TINYINT NOT NULL DEFAULT 0,',
    '  `cnaps_salariale` DOUBLE NOT NULL DEFAULT 1.0,',
    '  `cnaps_patronale` DOUBLE NOT NULL DEFAULT 13.0,',
    '  `deduction_enfant` DOUBLE NOT NULL DEFAULT 2000,',
    '  `min_irsa` DOUBLE NOT NULL DEFAULT 3000,',
    '  `arrondi_irsa_base` INT NOT NULL DEFAULT 100,',
    '  `arrondi_net` INT NOT NULL DEFAULT 100,',
    '  `plafond_especes` DOUBLE NOT NULL DEFAULT 5000,',
    '  `taux_maternite` DOUBLE NOT NULL DEFAULT 50,',
    '  `duree_maternite_mois` INT NOT NULL DEFAULT 3,',
    '  `jours_conge_par_an` DOUBLE NOT NULL DEFAULT 30,',
    '  `nb_annees_cumul` INT NOT NULL DEFAULT 3,',
    '  `plafond_cumul_conge` DOUBLE NOT NULL DEFAULT 30,',
    '  `jours_permission_par_an` DOUBLE NOT NULL DEFAULT 10,',
    '  `report_autorise` TINYINT NOT NULL DEFAULT 0,',
    '  `exclure_dimanche` TINYINT NOT NULL DEFAULT 0,',
    '  `exclure_samedi` TINYINT NOT NULL DEFAULT 0,',
    '  `jours_feries` TEXT NOT NULL,',
    '  `examen_sur_permission` TINYINT NOT NULL DEFAULT 0,',
    '  `bloquer_depassement` TINYINT NOT NULL DEFAULT 1,',
    '  `version_calendrier` INT NOT NULL DEFAULT 3,',
    '  `icone_app` LONGTEXT NULL',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_bareme_anciennete` (',
    '  `ordre` INT NOT NULL PRIMARY KEY,',
    '  `annees_min` INT NOT NULL,',
    '  `annees_max` INT NOT NULL,',
    '  `indice` DOUBLE NOT NULL,',
    "  `description` VARCHAR(60) NOT NULL DEFAULT ''",
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_bareme_irsa` (',
    '  `ordre` INT NOT NULL PRIMARY KEY,',
    '  `seuil_min` DOUBLE NOT NULL,',
    '  `seuil_max` DOUBLE NULL DEFAULT NULL,',
    '  `taux` DOUBLE NOT NULL',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_entete` (',
    '  `id` TINYINT NOT NULL PRIMARY KEY,',
    '  `configuree` TINYINT NOT NULL DEFAULT 0,',
    "  `mode` VARCHAR(20) NOT NULL DEFAULT 'image',",
    "  `ligne_1` VARCHAR(255) NOT NULL DEFAULT 'FIANGONANA LOTERANA MALAGASY',",
    "  `ligne_2` VARCHAR(255) NOT NULL DEFAULT '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',",
    "  `ligne_3` VARCHAR(255) NOT NULL DEFAULT 'SAMPAN''ASA LOTERANA MOMBA NY FAHASALAMANA',",
    "  `ligne_4` VARCHAR(255) NOT NULL DEFAULT 'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT',",
    "  `ligne_5` VARCHAR(255) NOT NULL DEFAULT 'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',",
    "  `ligne_6` VARCHAR(255) NOT NULL DEFAULT 'NIF: 5000767080    STAT: 851 125 120 120 001 36',",
    "  `ligne_7` VARCHAR(255) NOT NULL DEFAULT 'E-mail: salfa.tulear@moov.mg',",
    '  `image_finale` LONGTEXT NULL,',
    '  `image_complete` LONGTEXT NULL,',
    '  `logo_gauche` LONGTEXT NULL,',
    '  `logo_droite` LONGTEXT NULL',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'CREATE TABLE IF NOT EXISTS `salfa_annees` (',
    '  `annee` INT NOT NULL PRIMARY KEY,',
    "  `date_creation` VARCHAR(32) NOT NULL DEFAULT ''",
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    '-- Utilisateurs par défaut : admin / admin123 et comptable / comptable123',
    'INSERT IGNORE INTO `salfa_users` (`id`, `username`, `nom_complet`, `role`, `actif`, `password_hash`) VALUES',
    `  (1, 'admin', 'Administrateur Principal SALFA', 'Administrateur', 1, '${HASH_ADMIN}'),`,
    `  (2, 'comptable', 'Comptable Clinique SALFA', 'Comptable', 1, '${HASH_COMPTABLE}');`,
    '',
    "INSERT IGNORE INTO `salfa_revision` (`id`, `revision`, `conges_version`, `conges_loi_3ans`) VALUES (1, 1, '" + CONGES_VERSION + "', 3);",
    "INSERT IGNORE INTO `salfa_config` (`id`, `configuree`, `jours_feries`) VALUES (1, 0, '');",
    'INSERT IGNORE INTO `salfa_entete` (`id`, `configuree`) VALUES (1, 0), (2, 0);',
    '',
    'INSERT IGNORE INTO `salfa_bareme_anciennete` (`ordre`, `annees_min`, `annees_max`, `indice`, `description`) VALUES',
    "  (1, 0, 1, 1.00, '0 à 1 an'),",
    "  (2, 2, 3, 1.09, '2'),",
    "  (3, 4, 5, 1.18, '4'),",
    "  (4, 6, 7, 1.27, '6'),",
    "  (5, 8, 9, 1.36, '8'),",
    "  (6, 10, 11, 1.45, '10'),",
    "  (7, 12, 13, 1.53, '12'),",
    "  (8, 14, 15, 1.60, '14'),",
    "  (9, 16, 17, 1.65, '16'),",
    "  (10, 18, 19, 1.68, '18'),",
    "  (11, 20, 100, 1.70, '20 et plus');",
    '',
    'INSERT IGNORE INTO `salfa_bareme_irsa` (`ordre`, `seuil_min`, `seuil_max`, `taux`) VALUES',
    '  (1, 0, 350000, 0),',
    '  (2, 350000, 400000, 5),',
    '  (3, 400000, 500000, 10),',
    '  (4, 500000, 600000, 15),',
    '  (5, 600000, NULL, 20);',
  ];
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
  const matriculesCourants = new Set(parMat2026.keys());
  const bufExcel = fs.readFileSync(cheminExcel);
  const nomFichier = path.basename(cheminExcel);

  // Le classeur 2026 actuel est un instantané de soldes annuels, pas un journal
  // des demandes. Les cases vides sont des soldes nuls, selon la confirmation du gestionnaire.
  const snapshot = lireSnapshotConges(bufExcel, nomFichier, tousEmployes, congesMod.retrouverEmploye);
  let feuillesRetenues = [];
  let fiches2026 = [];
  let fichesAnciensSeuls = [];
  let fichesToutes = [];
  let versionConges = CONGES_VERSION;
  let nbSalariesSnapshot = 0;

  if (snapshot) {
    feuillesRetenues = [snapshot.feuille];
    const horodatage = horodatageSnapshot(snapshot);
    fiches2026 = convertirSoldesEnFiches(snapshot, congesMod, horodatage);
    assert.equal(
      fiches2026.length,
      snapshot.lignes.length * snapshot.annees.length,
      'Chaque salarié doit avoir une ligne de solde pour chaque année (cases vides incluses).'
    );
    fichesAnciensSeuls = chargerCongesHistoriques(
      parMatTous,
      matriculesCourants,
      congesMod,
      fiches2026.length
    );
    fichesToutes = [...fiches2026, ...fichesAnciensSeuls];
    nbSalariesSnapshot = snapshot.lignes.length;

    data2026.meta = {
      ...(data2026.meta || {}),
      conges_version: CONGES_VERSION,
      conges_source_file: nomFichier,
      conges_mode_import: 'SOLDE_RESTANT_PAR_ANNEE',
      conges_loi_3ans: 3,
    };
    data2026.conges = fiches2026;
    fs.writeFileSync(DATA_2026_PATH, JSON.stringify(data2026, null, 2) + '\n', 'utf8');
    // Ne pas remplacer le fichier des anciennes fiches: le relevé annuel ne contient
    // aucune donnée concernant les anciens salariés absents du classeur 2026.
  } else {
    // Compatibilité avec l'ancien classeur détaillé .xlsb / format des demandes datées.
    const analyse = importMod.analyserControleConges(bufExcel, nomFichier, tousEmployes);
    feuillesRetenues = analyse.feuilles
      .filter((f) => f.reconnue && !f.archiveProbable && f.nbLignes > 0)
      .map((f) => f.nom);
    if (feuillesRetenues.length === 0) {
      feuillesRetenues = analyse.feuilles.filter((f) => f.reconnue && f.nbLignes > 0).map((f) => f.nom);
    }
    const setFeuilles = new Set(feuillesRetenues);
    const lignesRetenues = analyse.lignes.filter((l) => setFeuilles.has(l.feuille));
    const lignes2026 = lignesRetenues.filter((l) => l.numero_matricule && parMat2026.has(Number(l.numero_matricule)));
    fiches2026 = convertirLignesEnFiches(lignes2026, parMat2026, congesMod, [], 0);
    const lignesAnciens = lignesRetenues.filter(
      (l) => l.numero_matricule && !parMat2026.has(Number(l.numero_matricule)) && parMatTous.has(Number(l.numero_matricule))
    );
    fichesToutes = convertirLignesEnFiches(
      lignesAnciens,
      parMatTous,
      congesMod,
      fiches2026.map((c) => ({ ...c, employe_id: Number(parMatTous.get(Number(c.numero_matricule)).id) })),
      fiches2026.length
    );
    fichesAnciensSeuls = fichesToutes.slice(fiches2026.length);
    versionConges = 'controle-2026-10-legacy';
    assert.ok(fichesToutes.length > 0, 'Aucune fiche de congé reconnue dans le classeur Excel');

    data2026.meta = {
      ...(data2026.meta || {}),
      conges_version: versionConges,
      conges_source_file: nomFichier,
      conges_mode_import: 'FICHES_ABSENCE_DETAILLEES',
      conges_loi_3ans: 3,
    };
    data2026.conges = fiches2026;
    fs.writeFileSync(DATA_2026_PATH, JSON.stringify(data2026, null, 2) + '\n', 'utf8');
    fs.writeFileSync(
      OUT_HIST_CONGES_PATH,
      JSON.stringify(
        {
          meta: {
            source_excel: nomFichier,
            feuilles: feuillesRetenues,
            conges_version: versionConges,
            nb_conges_anciens: fichesAnciensSeuls.length,
          },
          conges: fichesAnciensSeuls,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
  }

  const matsPresents = Array.from(new Set(fichesToutes.map((c) => Number(c.numero_matricule)))).sort((a, b) => a - b);
  const nbCongesAnnuels = fichesToutes.filter((c) => c.categorie === 'CONGE').length;
  const nbPermissions = fichesToutes.filter((c) => c.categorie === 'PERMISSION').length;
  const nbSoldesAnnuels = fichesToutes.filter((c) => c.categorie === 'AJUSTEMENT' && c.ajustement_type === 'OUVERTURE').length;
  const anneesCouvertes = Array.from(new Set(fichesToutes.map((c) => Number(c.annee)))).sort((a, b) => a - b);

  const sql = [
    '-- ============================================================================',
    '-- SALFA TOLIARA — Gestion des Salaires & Congés (Version WAMP / MySQL)',
    '-- Script SQL relationnel : importation des soldes et de l’historique de congés',
    '-- ============================================================================',
    `-- Fichier source : ${nomFichier} (feuille(s) : ${feuillesRetenues.join(', ')})`,
    `-- Version contrôle : ${versionConges}`,
    `-- Structure : 100 % relationnelle en colonnes et lignes (AUCUN JSON dans MySQL)`,
    `-- Utilisateurs par défaut inclus dans salfa_users :`,
    `--   * admin / admin123 (Administrateur)`,
    `--   * comptable / comptable123 (Comptable)`,
    `-- Contenu importé dans salfa_conges :`,
    `--   * ${fichesToutes.length} lignes : ${nbSoldesAnnuels} soldes annuels (cases vides = 0) + ${nbCongesAnnuels} fiches de congé + ${nbPermissions} permissions historiques`,
    `--   * ${snapshot ? `${nbSalariesSnapshot} salariés avec soldes` : `${fiches2026.length} fiches actuelles`} + ${Math.max(0, matsPresents.length - nbSalariesSnapshot)} salariés d’archive; années ${anneesCouvertes[0]}–${anneesCouvertes[anneesCouvertes.length - 1]}`,
    '-- ============================================================================',
    '',
    'SET NAMES utf8mb4;',
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
    '',
    'CREATE DATABASE IF NOT EXISTS `salfa_paie` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
    'USE `salfa_paie`;',
    '',
    ...ddlTablesRelationnelles(),
    '',
    'START TRANSACTION;',
    '',
    '-- Ajout sans écrasement des salariés éventuellement absents de salfa_employes',
    'SET @base_emp_id = COALESCE((SELECT MAX(`id`) FROM `salfa_employes`), 0);',
    'INSERT IGNORE INTO `salfa_employes` (',
    '  `id`, `numero_matricule`, `nom_prenoms`, `numero_cnaps`, `categorie`, `jobs`,',
    '  `date_embauche`, `nombre_annees`, `enfant_a_charge`, `base_aj`, `logement_transport`,',
    '  `rendement`, `responsabilite_representation`, `rib`, `mode_paiement`, `actif`,',
    '  `date_inactif`, `conge_maternite`, `date_debut_maternite`, `date_creation`',
    ') VALUES',
  ];

  tousEmployes.forEach((e, idx) => {
    const fin = idx === tousEmployes.length - 1 ? ';' : ',';
    sql.push(
      `  (@base_emp_id + ${idx + 1}, ${sqlInt(e.numero_matricule)}, ${sqlStr(e.nom_prenoms, 160)}, ${sqlStr(e.numero_cnaps, 60)}, ${sqlStr(e.categorie, 32)}, ${sqlStr(e.jobs, 160)}, ${sqlStr(e.date_embauche, 20)}, ${sqlInt(e.nombre_annees)}, ${sqlInt(e.enfant_a_charge)}, ${sqlNum(e.base_aj ?? 0)}, ${sqlNum(e.logement_transport ?? 0)}, ${sqlNum(e.rendement ?? 0)}, ${sqlNum(e.responsabilite_representation ?? 0)}, ${sqlStr(e.rib, 80)}, ${sqlStr(e.mode_paiement || 'ESPECES', 32)}, ${e.actif ? 1 : 0}, ${sqlStr(e.date_inactif || '', 20)}, ${e.conge_maternite ? 1 : 0}, ${sqlStr(e.date_debut_maternite || '', 20)}, ${sqlStr(e.date_creation || '', 32)})${fin}`
    );
  });

  sql.push(
    '',
    "-- Remplacement propre des lignes issues d'un précédent import Excel (les saisies manuelles sont conservées)",
    "DELETE FROM `salfa_conges` WHERE `saisie_par` = 'Import Excel';",
    'SET @base_conge_id = COALESCE((SELECT MAX(`id`) FROM `salfa_conges`), 0);',
    ''
  );

  // Insertion par lots de 100 lignes dans salfa_conges (colonnes et lignes distinctes)
  const TAILLE_LOT = 100;
  for (let offset = 0; offset < fichesToutes.length; offset += TAILLE_LOT) {
    const lot = fichesToutes.slice(offset, offset + TAILLE_LOT);
    sql.push(
      'INSERT INTO `salfa_conges` (',
      '  `id`, `employe_id`, `numero_matricule`, `nom_prenoms`, `fonction`, `service`, `contact`,',
      '  `categorie`, `motif_code`, `motif_libelle`, `imputation`, `annee`, `date_demande`,',
      '  `date_debut`, `heure_debut`, `date_fin`, `date_retour`, `heure_fin`, `jours_demandes`,',
      '  `jours_valides`, `remplacant`, `titre_periode`, `justificatif`, `observations`, `statut`,',
      '  `visa_chef_par`, `visa_chef_le`, `visa_medecin_par`, `visa_medecin_le`,',
      '  `visa_gestionnaire_par`, `visa_gestionnaire_le`, `motif_refus`, `ajustement_type`,',
      '  `saisie_par`, `date_saisie`, `date_modification`',
      ') VALUES'
    );
    lot.forEach((c, idx) => {
      const numOrdre = offset + idx + 1;
      const fin = idx === lot.length - 1 ? ';' : ',';
      sql.push(
        `  (@base_conge_id + ${numOrdre}, ${sqlInt(c.employe_id)}, ${sqlInt(c.numero_matricule)}, ${sqlStr(c.nom_prenoms, 160)}, ${sqlStr(c.fonction, 160)}, ${sqlStr(c.service, 120)}, ${sqlStr(c.contact, 120)}, ${sqlStr(c.categorie, 32)}, ${sqlStr(c.motif_code, 40)}, ${sqlStr(c.motif_libelle, 255)}, ${sqlStr(c.imputation, 32)}, ${sqlInt(c.annee)}, ${sqlStr(c.date_demande, 20)}, ${sqlStr(c.date_debut, 20)}, ${sqlStr(c.heure_debut, 16)}, ${sqlStr(c.date_fin, 20)}, ${sqlStr(c.date_retour, 20)}, ${sqlStr(c.heure_fin, 16)}, ${sqlNum(c.jours_demandes ?? 0)}, ${sqlNum(c.jours_valides)}, ${sqlStr(c.remplacant, 160)}, ${sqlStr(c.titre_periode, 80)}, ${sqlStr(c.justificatif, 255)}, ${sqlStr(c.observations)}, ${sqlStr(c.statut || 'VALIDE', 32)}, ${sqlStr(c.visa_chef_par, 120)}, ${sqlStr(c.visa_chef_le, 32)}, ${sqlStr(c.visa_medecin_par, 120)}, ${sqlStr(c.visa_medecin_le, 32)}, ${sqlStr(c.visa_gestionnaire_par, 120)}, ${sqlStr(c.visa_gestionnaire_le, 32)}, ${sqlStr(c.motif_refus, 255)}, ${sqlStr(c.ajustement_type, 32)}, ${sqlStr(c.saisie_par || 'Import Excel', 80)}, ${sqlStr(c.date_saisie, 32)}, ${sqlStr(c.date_modification, 32)})${fin}`
      );
    });
    sql.push('');
  }

  sql.push(
    '-- Rattachement relationnel exact employe_id <-> salfa_employes.id via numero_matricule',
    'UPDATE `salfa_conges` c',
    'INNER JOIN `salfa_employes` e ON e.`numero_matricule` = c.`numero_matricule`',
    'SET c.`employe_id` = e.`id`;',
    '',
    'UPDATE `salfa_revision`',
    "SET `revision` = `revision` + 1, `conges_version` = '" + versionConges + "', `conges_loi_3ans` = 3, `date_modification` = NOW()",
    'WHERE `id` = 1;',
    '',
    'COMMIT;',
    ''
  );

  fs.mkdirSync(OUT_SQL_DIR, { recursive: true });
  const sqlContent = sql.join('\n');
  assert.ok(!sqlContent.includes('store_json'), 'Aucune colonne store_json ne doit figurer dans le SQL');
  assert.ok(!sqlContent.includes('JSON_SET'), 'Aucune fonction JSON MySQL ne doit figurer dans le SQL');
  fs.writeFileSync(OUT_SQL_PATH, sqlContent, 'utf8');

  const tailleKo = (Buffer.byteLength(sqlContent, 'utf8') / 1024).toFixed(1);
  console.log(
    [
      `SQL relationnel WAMP congés généré : ${path.relative(ROOT, OUT_SQL_PATH)} (${tailleKo} Ko)`,
      `  - Soldes annuels  : ${nbSoldesAnnuels} lignes (${nbSalariesSnapshot} salariés × ${snapshot ? snapshot.annees.length : 0} années, cases vides = 0)`,
      `  - Historique      : ${nbCongesAnnuels} congés + ${nbPermissions} permissions (${fichesAnciensSeuls.length} fiches)`,
      `  - Salariés couverts: ${matsPresents.length} matricules`,
      `  - Années couvertes : ${anneesCouvertes.join(', ')}`,
      `  - Utilisateurs SQL : admin / admin123, comptable / comptable123`,
    ].join('\n')
  );
}

main();
