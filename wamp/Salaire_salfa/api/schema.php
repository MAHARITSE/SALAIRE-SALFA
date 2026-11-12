<?php
declare(strict_types=1);

// ==============================================================================
// SCHÉMA RELATIONNEL MYSQL — SALFA PAIE & CONGÉS (AUCUN STOCKAGE JSON)
// Toutes les données sont stockées dans des tables relationnelles typées
// (colonnes et lignes distinctes dans MySQL / phpMyAdmin).
// ==============================================================================

const SALFA_DEFAULT_ADMIN_HASH = '$2y$10$YX/zKbv4VMuSaS3ddJB5MuBWGfTgOr6aIf7L4PEsva5y2hyHw0j/G'; // admin123
const SALFA_DEFAULT_COMPTABLE_HASH = '$2y$10$xFu0Kw7V7YsnIfrwPjOr1.C6.CfWtRq4Wyo.w/PX8cG36QN2.ezou'; // comptable123

const SALFA_MOIS_ORDRE = [
    'JANVIER' => 1, 'FEVRIER' => 2, 'MARS' => 3, 'AVRIL' => 4,
    'MAI' => 5, 'JUIN' => 6, 'JUILLET' => 7, 'AOUT' => 8,
    'SEPTEMBRE' => 9, 'OCTOBRE' => 10, 'NOVEMBRE' => 11, 'DECEMBRE' => 12,
];

/** Crée toutes les tables relationnelles MySQL, migre une éventuelle ancienne table salfa_state puis la supprime. */
function ensureSalfaInitialized(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_users` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `username` VARCHAR(80) NOT NULL UNIQUE,
        `nom_complet` VARCHAR(160) NOT NULL,
        `role` VARCHAR(32) NOT NULL,
        `actif` TINYINT NOT NULL DEFAULT 1,
        `password_hash` VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_revision` (
        `id` TINYINT NOT NULL PRIMARY KEY,
        `revision` BIGINT NOT NULL DEFAULT 1,
        `source_file` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2026.xlsm',
        `entreprise` VARCHAR(160) NOT NULL DEFAULT 'SALFA TANAMBAO',
        `titre` VARCHAR(255) NOT NULL DEFAULT 'FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN''OLONA (Bulletin de paie individuel)',
        `annee` INT NOT NULL DEFAULT 2026,
        `source_version` VARCHAR(60) NOT NULL DEFAULT 'classeur-2026-10',
        `source_historique` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2022-2025',
        `conges_version` VARCHAR(60) NOT NULL DEFAULT 'controle-2026-10',
        `conges_loi_3ans` INT NOT NULL DEFAULT 3,
        `date_modification` VARCHAR(32) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_employes` (
        `id` INT NOT NULL PRIMARY KEY,
        `numero_matricule` INT NOT NULL UNIQUE,
        `nom_prenoms` VARCHAR(160) NOT NULL,
        `numero_cnaps` VARCHAR(60) NOT NULL DEFAULT '',
        `categorie` VARCHAR(32) NOT NULL DEFAULT '',
        `jobs` VARCHAR(160) NOT NULL DEFAULT '',
        `date_embauche` VARCHAR(20) NOT NULL DEFAULT '',
        `nombre_annees` INT NOT NULL DEFAULT 0,
        `enfant_a_charge` INT NOT NULL DEFAULT 0,
        `base_aj` DOUBLE NOT NULL DEFAULT 0,
        `logement_transport` DOUBLE NOT NULL DEFAULT 0,
        `rendement` DOUBLE NOT NULL DEFAULT 0,
        `responsabilite_representation` DOUBLE NOT NULL DEFAULT 0,
        `rib` VARCHAR(80) NOT NULL DEFAULT '',
        `mode_paiement` VARCHAR(32) NOT NULL DEFAULT 'ESPECES',
        `actif` TINYINT NOT NULL DEFAULT 1,
        `date_inactif` VARCHAR(20) NOT NULL DEFAULT '',
        `conge_maternite` TINYINT NOT NULL DEFAULT 0,
        `date_debut_maternite` VARCHAR(20) NOT NULL DEFAULT '',
        `date_creation` VARCHAR(32) NOT NULL DEFAULT '',
        `genre` VARCHAR(20) NOT NULL DEFAULT '',
        `date_naissance` VARCHAR(20) NOT NULL DEFAULT '',
        `lieu_naissance` VARCHAR(160) NOT NULL DEFAULT '',
        `pere` VARCHAR(160) NOT NULL DEFAULT '',
        `mere` VARCHAR(160) NOT NULL DEFAULT '',
        `cin` VARCHAR(32) NOT NULL DEFAULT '',
        `date_cin` VARCHAR(20) NOT NULL DEFAULT '',
        `lieu_cin` VARCHAR(160) NOT NULL DEFAULT '',
        `situation_matrimoniale` VARCHAR(60) NOT NULL DEFAULT '',
        `adresse` VARCHAR(255) NOT NULL DEFAULT '',
        `service` VARCHAR(160) NOT NULL DEFAULT '',
        `diplome` VARCHAR(255) NOT NULL DEFAULT '',
        `etablissement` VARCHAR(255) NOT NULL DEFAULT '',
        `statut` VARCHAR(80) NOT NULL DEFAULT '',
        `numero_ordre` VARCHAR(60) NOT NULL DEFAULT '',
        `nature_contrat` VARCHAR(32) NOT NULL DEFAULT '',
        `duree_contrat` VARCHAR(160) NOT NULL DEFAULT '',
        `lieu_embauche` VARCHAR(160) NOT NULL DEFAULT '',
        `lieu_travail` VARCHAR(160) NOT NULL DEFAULT '',
        `date_effet` VARCHAR(20) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Compléments « LISTE DE PERSONNEL » : ajouter les colonnes manquantes sur une base existante.
    $personnelCols = [
        "genre" => "VARCHAR(20) NOT NULL DEFAULT ''",
        "date_naissance" => "VARCHAR(20) NOT NULL DEFAULT ''",
        "lieu_naissance" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "pere" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "mere" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "cin" => "VARCHAR(32) NOT NULL DEFAULT ''",
        "date_cin" => "VARCHAR(20) NOT NULL DEFAULT ''",
        "lieu_cin" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "situation_matrimoniale" => "VARCHAR(60) NOT NULL DEFAULT ''",
        "adresse" => "VARCHAR(255) NOT NULL DEFAULT ''",
        "service" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "diplome" => "VARCHAR(255) NOT NULL DEFAULT ''",
        "etablissement" => "VARCHAR(255) NOT NULL DEFAULT ''",
        "statut" => "VARCHAR(80) NOT NULL DEFAULT ''",
        "numero_ordre" => "VARCHAR(60) NOT NULL DEFAULT ''",
        "nature_contrat" => "VARCHAR(32) NOT NULL DEFAULT ''",
        "duree_contrat" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "lieu_embauche" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "lieu_travail" => "VARCHAR(160) NOT NULL DEFAULT ''",
        "date_effet" => "VARCHAR(20) NOT NULL DEFAULT ''"
    ];
    foreach ($personnelCols as $col => $definition) {
        $exists = $db->query("SHOW COLUMNS FROM `salfa_employes` LIKE " . $db->quote($col))->fetch(PDO::FETCH_ASSOC);
        if (!$exists) {
            $db->exec("ALTER TABLE `salfa_employes` ADD COLUMN `$col` $definition");
        }
    }

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_paies` (
        `id` INT NOT NULL PRIMARY KEY,
        `employe_id` INT NOT NULL,
        `numero_matricule` INT NOT NULL,
        `annee` INT NOT NULL,
        `mois` VARCHAR(20) NOT NULL,
        `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',
        `numero_cnaps` VARCHAR(60) NOT NULL DEFAULT '',
        `categorie` VARCHAR(32) NOT NULL DEFAULT '',
        `jobs` VARCHAR(160) NOT NULL DEFAULT '',
        `date_embauche` VARCHAR(20) NOT NULL DEFAULT '',
        `nombre_annees` INT NOT NULL DEFAULT 0,
        `enfant_a_charge` INT NOT NULL DEFAULT 0,
        `base_aj` DOUBLE NOT NULL DEFAULT 0,
        `logt_trsp` DOUBLE NOT NULL DEFAULT 0,
        `rendement` DOUBLE NOT NULL DEFAULT 0,
        `resp_repres` DOUBLE NOT NULL DEFAULT 0,
        `salaire_brut` DOUBLE NOT NULL DEFAULT 0,
        `cnaps` DOUBLE NOT NULL DEFAULT 0,
        `patronal` DOUBLE NOT NULL DEFAULT 0,
        `salaire_imposable` DOUBLE NOT NULL DEFAULT 0,
        `irsa` DOUBLE NOT NULL DEFAULT 0,
        `salaire_net` DOUBLE NOT NULL DEFAULT 0,
        `augmentation_divers` DOUBLE NOT NULL DEFAULT 0,
        `prime_de_garde` DOUBLE NOT NULL DEFAULT 0,
        `anciennete2` DOUBLE NOT NULL DEFAULT 0,
        `risque` DOUBLE NOT NULL DEFAULT 0,
        `repr_rec` DOUBLE NOT NULL DEFAULT 0,
        `accessoir` DOUBLE NOT NULL DEFAULT 0,
        `brut` DOUBLE NOT NULL DEFAULT 0,
        `avance` DOUBLE NOT NULL DEFAULT 0,
        `med` DOUBLE NOT NULL DEFAULT 0,
        `net` DOUBLE NOT NULL DEFAULT 0,
        `virement` DOUBLE NULL DEFAULT NULL,
        `especes` DOUBLE NULL DEFAULT NULL,
        `rib` VARCHAR(80) NOT NULL DEFAULT '',
        `verrouille` TINYINT NOT NULL DEFAULT 0,
        `conge_maternite` TINYINT NOT NULL DEFAULT 0,
        `date_debut_maternite` VARCHAR(20) NOT NULL DEFAULT '',
        `date_modification` VARCHAR(32) NOT NULL DEFAULT '',
        UNIQUE KEY `uq_paie_periode` (`employe_id`, `annee`, `mois`),
        KEY `idx_paie_annee_mois` (`annee`, `mois`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_conges` (
        `id` INT NOT NULL PRIMARY KEY,
        `employe_id` INT NOT NULL,
        `numero_matricule` INT NOT NULL DEFAULT 0,
        `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',
        `fonction` VARCHAR(160) NOT NULL DEFAULT '',
        `service` VARCHAR(120) NOT NULL DEFAULT '',
        `contact` VARCHAR(120) NOT NULL DEFAULT '',
        `categorie` VARCHAR(32) NOT NULL DEFAULT 'CONGE',
        `motif_code` VARCHAR(40) NOT NULL DEFAULT '',
        `motif_libelle` VARCHAR(255) NOT NULL DEFAULT '',
        `imputation` VARCHAR(32) NOT NULL DEFAULT 'CONGE',
        `annee` INT NOT NULL,
        `date_demande` VARCHAR(20) NOT NULL DEFAULT '',
        `date_debut` VARCHAR(20) NOT NULL DEFAULT '',
        `heure_debut` VARCHAR(16) NOT NULL DEFAULT '',
        `date_fin` VARCHAR(20) NOT NULL DEFAULT '',
        `date_retour` VARCHAR(20) NOT NULL DEFAULT '',
        `heure_fin` VARCHAR(16) NOT NULL DEFAULT '',
        `jours_demandes` DOUBLE NOT NULL DEFAULT 0,
        `jours_valides` DOUBLE NULL DEFAULT NULL,
        `remplacant` VARCHAR(160) NOT NULL DEFAULT '',
        `titre_periode` VARCHAR(80) NOT NULL DEFAULT '',
        `justificatif` VARCHAR(255) NOT NULL DEFAULT '',
        `observations` TEXT NOT NULL,
        `statut` VARCHAR(32) NOT NULL DEFAULT 'VALIDE',
        `visa_chef_par` VARCHAR(120) NOT NULL DEFAULT '',
        `visa_chef_le` VARCHAR(32) NOT NULL DEFAULT '',
        `visa_medecin_par` VARCHAR(120) NOT NULL DEFAULT '',
        `visa_medecin_le` VARCHAR(32) NOT NULL DEFAULT '',
        `visa_gestionnaire_par` VARCHAR(120) NOT NULL DEFAULT '',
        `visa_gestionnaire_le` VARCHAR(32) NOT NULL DEFAULT '',
        `motif_refus` VARCHAR(255) NOT NULL DEFAULT '',
        `ajustement_type` VARCHAR(32) NOT NULL DEFAULT '',
        `saisie_par` VARCHAR(80) NOT NULL DEFAULT '',
        `date_saisie` VARCHAR(32) NOT NULL DEFAULT '',
        `date_modification` VARCHAR(32) NOT NULL DEFAULT '',
        KEY `idx_conge_employe_annee` (`employe_id`, `annee`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_comparaison_net` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `numero_matricule` INT NOT NULL,
        `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',
        `categorie` VARCHAR(32) NOT NULL DEFAULT '',
        `jobs` VARCHAR(160) NOT NULL DEFAULT '',
        `net_actuel` DOUBLE NOT NULL DEFAULT 0,
        `net_avant` DOUBLE NOT NULL DEFAULT 0,
        `ecart` DOUBLE NOT NULL DEFAULT 0,
        KEY `idx_comp_matricule` (`numero_matricule`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_config` (
        `id` TINYINT NOT NULL PRIMARY KEY,
        `configuree` TINYINT NOT NULL DEFAULT 0,
        `cnaps_salariale` DOUBLE NOT NULL DEFAULT 1.0,
        `cnaps_patronale` DOUBLE NOT NULL DEFAULT 13.0,
        `deduction_enfant` DOUBLE NOT NULL DEFAULT 2000,
        `min_irsa` DOUBLE NOT NULL DEFAULT 3000,
        `arrondi_irsa_base` INT NOT NULL DEFAULT 100,
        `arrondi_net` INT NOT NULL DEFAULT 100,
        `plafond_especes` DOUBLE NOT NULL DEFAULT 5000,
        `taux_maternite` DOUBLE NOT NULL DEFAULT 50,
        `duree_maternite_mois` INT NOT NULL DEFAULT 3,
        `jours_conge_par_an` DOUBLE NOT NULL DEFAULT 30,
        `nb_annees_cumul` INT NOT NULL DEFAULT 3,
        `plafond_cumul_conge` DOUBLE NOT NULL DEFAULT 30,
        `jours_permission_par_an` DOUBLE NOT NULL DEFAULT 10,
        `report_autorise` TINYINT NOT NULL DEFAULT 0,
        `exclure_dimanche` TINYINT NOT NULL DEFAULT 0,
        `exclure_samedi` TINYINT NOT NULL DEFAULT 0,
        `jours_feries` TEXT NOT NULL,
        `examen_sur_permission` TINYINT NOT NULL DEFAULT 0,
        `bloquer_depassement` TINYINT NOT NULL DEFAULT 1,
        `version_calendrier` INT NOT NULL DEFAULT 3,
        `icone_app` LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Migration transparente d'une table salfa_config existante (ajout icone_app + plafond annuel 30 j indépendant)
    $hasIconeCol = $db->query("SHOW COLUMNS FROM `salfa_config` LIKE 'icone_app'")->fetch(PDO::FETCH_ASSOC);
    if (!$hasIconeCol) {
        $db->exec("ALTER TABLE `salfa_config` ADD COLUMN `icone_app` LONGTEXT NULL");
    }
    $db->exec("UPDATE `salfa_config` SET `report_autorise` = 0, `plafond_cumul_conge` = 30, `jours_conge_par_an` = LEAST(30, `jours_conge_par_an`), `bloquer_depassement` = 1, `version_calendrier` = 3 WHERE `version_calendrier` < 3");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_bareme_anciennete` (
        `ordre` INT NOT NULL PRIMARY KEY,
        `annees_min` INT NOT NULL,
        `annees_max` INT NOT NULL,
        `indice` DOUBLE NOT NULL,
        `description` VARCHAR(60) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_bareme_irsa` (
        `ordre` INT NOT NULL PRIMARY KEY,
        `seuil_min` DOUBLE NOT NULL,
        `seuil_max` DOUBLE NULL DEFAULT NULL,
        `taux` DOUBLE NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_entete` (
        `id` TINYINT NOT NULL PRIMARY KEY,
        `configuree` TINYINT NOT NULL DEFAULT 0,
        `mode` VARCHAR(20) NOT NULL DEFAULT 'image',
        `ligne_1` VARCHAR(255) NOT NULL DEFAULT 'FIANGONANA LOTERANA MALAGASY',
        `ligne_2` VARCHAR(255) NOT NULL DEFAULT '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',
        `ligne_3` VARCHAR(255) NOT NULL DEFAULT 'SAMPAN''ASA LOTERANA MOMBA NY FAHASALAMANA',
        `ligne_4` VARCHAR(255) NOT NULL DEFAULT 'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT',
        `ligne_5` VARCHAR(255) NOT NULL DEFAULT 'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',
        `ligne_6` VARCHAR(255) NOT NULL DEFAULT 'NIF: 5000767080    STAT: 851 125 120 120 001 36',
        `ligne_7` VARCHAR(255) NOT NULL DEFAULT 'E-mail: salfa.tulear@moov.mg',
        `image_finale` LONGTEXT NULL,
        `image_complete` LONGTEXT NULL,
        `logo_gauche` LONGTEXT NULL,
        `logo_droite` LONGTEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS `salfa_annees` (
        `annee` INT NOT NULL PRIMARY KEY,
        `date_creation` VARCHAR(32) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("INSERT IGNORE INTO `salfa_revision` (`id`, `revision`) VALUES (1, 1)");
    $db->exec("INSERT IGNORE INTO `salfa_config` (`id`, `configuree`, `jours_feries`) VALUES (1, 0, '')");
    $db->exec("INSERT IGNORE INTO `salfa_entete` (`id`, `configuree`) VALUES (1, 0), (2, 0)");

    if ((int)$db->query("SELECT COUNT(*) FROM `salfa_bareme_anciennete`")->fetchColumn() === 0) {
        $db->exec("INSERT INTO `salfa_bareme_anciennete` (`ordre`, `annees_min`, `annees_max`, `indice`, `description`) VALUES
            (1, 0, 1, 1.00, '0 à 1 an'),
            (2, 2, 3, 1.09, '2'),
            (3, 4, 5, 1.18, '4'),
            (4, 6, 7, 1.27, '6'),
            (5, 8, 9, 1.36, '8'),
            (6, 10, 11, 1.45, '10'),
            (7, 12, 13, 1.53, '12'),
            (8, 14, 15, 1.60, '14'),
            (9, 16, 17, 1.65, '16'),
            (10, 18, 19, 1.68, '18'),
            (11, 20, 100, 1.70, '20 et plus')");
    }

    if ((int)$db->query("SELECT COUNT(*) FROM `salfa_bareme_irsa`")->fetchColumn() === 0) {
        $db->exec("INSERT INTO `salfa_bareme_irsa` (`ordre`, `seuil_min`, `seuil_max`, `taux`) VALUES
            (1, 0, 350000, 0),
            (2, 350000, 400000, 5),
            (3, 400000, 500000, 10),
            (4, 500000, 600000, 15),
            (5, 600000, NULL, 20)");
    }

    // Comptes par défaut si aucun utilisateur n'est encore présent
    if ((int)$db->query("SELECT COUNT(*) FROM `salfa_users`")->fetchColumn() === 0) {
        $ins = $db->prepare("INSERT IGNORE INTO `salfa_users` (`id`, `username`, `nom_complet`, `role`, `actif`, `password_hash`) VALUES (?, ?, ?, ?, 1, ?)");
        $ins->execute([1, 'admin', 'Administrateur Principal SALFA', 'Administrateur', SALFA_DEFAULT_ADMIN_HASH]);
        $ins->execute([2, 'comptable', 'Comptable Clinique SALFA', 'Comptable', SALFA_DEFAULT_COMPTABLE_HASH]);
    }

    // Suppression automatique de l'ancienne colonne `rap` si présente sur une base existante
    try {
        $hasRapCol = $db->query("SHOW COLUMNS FROM `salfa_paies` LIKE 'rap'")->fetch(PDO::FETCH_ASSOC);
        if ($hasRapCol) {
            $db->exec("ALTER TABLE `salfa_paies` DROP COLUMN `rap`");
        }
    } catch (Throwable $e) {
        // Ignorer si non applicable
    }

    // Migration automatique et suppression définitive d'une éventuelle ancienne table salfa_state (JSON)
    migrateAndDropLegacyJsonTable($db);
}

/** Migre automatiquement l'ancienne table salfa_state (si présente) vers les tables relationnelles puis la supprime. */
function migrateAndDropLegacyJsonTable(PDO $db): void {
    $hasLegacy = $db->query("SHOW TABLES LIKE 'salfa_state'")->fetchColumn();
    if (!$hasLegacy) return;

    try {
        $legacyRow = $db->query("SELECT * FROM `salfa_state` WHERE `id` = 1")->fetch(PDO::FETCH_ASSOC);
        $nbEmp = (int)$db->query("SELECT COUNT(*) FROM `salfa_employes`")->fetchColumn();
        $nbConges = (int)$db->query("SELECT COUNT(*) FROM `salfa_conges`")->fetchColumn();

        if (is_array($legacyRow) && $nbEmp === 0 && $nbConges === 0) {
            $db->beginTransaction();
            $legacyStore = json_decode((string)($legacyRow['store_json'] ?? ''), true);
            if (is_array($legacyStore)) {
                syncEmployesTable($db, is_array($legacyStore['employes'] ?? null) ? $legacyStore['employes'] : []);
                syncPaiesTable($db, is_array($legacyStore['paies'] ?? null) ? $legacyStore['paies'] : []);
                syncCongesTable($db, is_array($legacyStore['conges'] ?? null) ? $legacyStore['conges'] : []);
                syncComparaisonNetTable($db, is_array($legacyStore['comparaison_net'] ?? null) ? $legacyStore['comparaison_net'] : []);
                updateRevisionMeta($db, is_array($legacyStore['meta'] ?? null) ? $legacyStore['meta'] : [], max(1, (int)($legacyRow['revision'] ?? 1)));
            }
            if (!empty($legacyRow['config_json'])) {
                $legacyCfg = json_decode((string)$legacyRow['config_json'], true);
                if (is_array($legacyCfg)) writeConfigTables($db, $legacyCfg);
            }
            if (!empty($legacyRow['header_json'])) {
                $legacyHdr = json_decode((string)$legacyRow['header_json'], true);
                if (is_array($legacyHdr)) writeHeaderTable($db, $legacyHdr);
            }
            $db->commit();
        }
        $db->exec("DROP TABLE IF EXISTS `salfa_state`");
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('SALFA legacy migration warning: ' . $e->getMessage());
    }
}

function loadRelationalStore(PDO $db): array {
    $revRow = $db->query("SELECT * FROM `salfa_revision` WHERE `id` = 1")->fetch(PDO::FETCH_ASSOC) ?: [];
    $anneeRef = (int)($revRow['annee'] ?? 2026) ?: 2026;

    $employes = [];
    foreach ($db->query("SELECT * FROM `salfa_employes` ORDER BY `numero_matricule` ASC, `id` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $employes[] = [
            'id' => (int)$r['id'],
            'numero_matricule' => (int)$r['numero_matricule'],
            'nom_prenoms' => (string)$r['nom_prenoms'],
            'numero_cnaps' => (string)$r['numero_cnaps'],
            'categorie' => (string)$r['categorie'],
            'jobs' => (string)$r['jobs'],
            'date_embauche' => (string)$r['date_embauche'],
            'nombre_annees' => (int)$r['nombre_annees'],
            'enfant_a_charge' => (int)$r['enfant_a_charge'],
            'base_aj' => (float)$r['base_aj'],
            'logement_transport' => (float)$r['logement_transport'],
            'rendement' => (float)$r['rendement'],
            'responsabilite_representation' => (float)$r['responsabilite_representation'],
            'rib' => (string)$r['rib'],
            'mode_paiement' => (string)$r['mode_paiement'],
            'actif' => (int)$r['actif'],
            'date_inactif' => (string)$r['date_inactif'],
            'conge_maternite' => (int)$r['conge_maternite'],
            'date_debut_maternite' => (string)$r['date_debut_maternite'],
            'date_creation' => (string)$r['date_creation'],
            'genre' => (string)($r['genre'] ?? ''),
            'date_naissance' => (string)($r['date_naissance'] ?? ''),
            'lieu_naissance' => (string)($r['lieu_naissance'] ?? ''),
            'pere' => (string)($r['pere'] ?? ''),
            'mere' => (string)($r['mere'] ?? ''),
            'cin' => (string)($r['cin'] ?? ''),
            'date_cin' => (string)($r['date_cin'] ?? ''),
            'lieu_cin' => (string)($r['lieu_cin'] ?? ''),
            'situation_matrimoniale' => (string)($r['situation_matrimoniale'] ?? ''),
            'adresse' => (string)($r['adresse'] ?? ''),
            'service' => (string)($r['service'] ?? ''),
            'diplome' => (string)($r['diplome'] ?? ''),
            'etablissement' => (string)($r['etablissement'] ?? ''),
            'statut' => (string)($r['statut'] ?? ''),
            'numero_ordre' => (string)($r['numero_ordre'] ?? ''),
            'nature_contrat' => (string)($r['nature_contrat'] ?? ''),
            'duree_contrat' => (string)($r['duree_contrat'] ?? ''),
            'lieu_embauche' => (string)($r['lieu_embauche'] ?? ''),
            'lieu_travail' => (string)($r['lieu_travail'] ?? ''),
            'date_effet' => (string)($r['date_effet'] ?? ''),
        ];
    }

    $paies = [];
    $moisSet = [];
    $anneesSet = [];
    foreach ($db->query("SELECT * FROM `salfa_paies` ORDER BY `annee` ASC, `id` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $an = (int)$r['annee'];
        $ms = strtoupper((string)$r['mois']);
        $anneesSet[$an] = true;
        if ($an === $anneeRef && isset(SALFA_MOIS_ORDRE[$ms])) {
            $moisSet[$ms] = SALFA_MOIS_ORDRE[$ms];
        }
        $paies[] = [
            'id' => (int)$r['id'],
            'employe_id' => (int)$r['employe_id'],
            'numero_matricule' => (int)$r['numero_matricule'],
            'annee' => $an,
            'mois' => $ms,
            'nom_prenoms' => (string)$r['nom_prenoms'],
            'numero_cnaps' => (string)$r['numero_cnaps'],
            'categorie' => (string)$r['categorie'],
            'jobs' => (string)$r['jobs'],
            'date_embauche' => (string)$r['date_embauche'],
            'nombre_annees' => (int)$r['nombre_annees'],
            'enfant_a_charge' => (int)$r['enfant_a_charge'],
            'base_aj' => (float)$r['base_aj'],
            'logt_trsp' => (float)$r['logt_trsp'],
            'rendement' => (float)$r['rendement'],
            'resp_repres' => (float)$r['resp_repres'],
            'salaire_brut' => (float)$r['salaire_brut'],
            'cnaps' => (float)$r['cnaps'],
            'patronal' => (float)$r['patronal'],
            'salaire_imposable' => (float)$r['salaire_imposable'],
            'irsa' => (float)$r['irsa'],
            'salaire_net' => (float)$r['salaire_net'],
            'augmentation_divers' => (float)$r['augmentation_divers'],
            'prime_de_garde' => (float)$r['prime_de_garde'],
            'anciennete2' => (float)$r['anciennete2'],
            'risque' => (float)$r['risque'],
            'repr_rec' => (float)$r['repr_rec'],
            'accessoir' => (float)$r['accessoir'],
            'brut' => (float)$r['brut'],
            'avance' => (float)$r['avance'],
            'med' => (float)$r['med'],
            'net' => (float)$r['net'],
            'virement' => $r['virement'] === null ? null : (float)$r['virement'],
            'especes' => $r['especes'] === null ? null : (float)$r['especes'],
            'rib' => (string)$r['rib'],
            'verrouille' => (int)$r['verrouille'],
            'conge_maternite' => (int)$r['conge_maternite'],
            'date_debut_maternite' => (string)$r['date_debut_maternite'],
            'date_modification' => (string)$r['date_modification'],
        ];
    }

    $conges = [];
    foreach ($db->query("SELECT * FROM `salfa_conges` ORDER BY `id` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $conges[] = [
            'id' => (int)$r['id'],
            'employe_id' => (int)$r['employe_id'],
            'numero_matricule' => (int)$r['numero_matricule'],
            'nom_prenoms' => (string)$r['nom_prenoms'],
            'fonction' => (string)$r['fonction'],
            'service' => (string)$r['service'],
            'contact' => (string)$r['contact'],
            'categorie' => (string)$r['categorie'],
            'motif_code' => (string)$r['motif_code'],
            'motif_libelle' => (string)$r['motif_libelle'],
            'imputation' => (string)$r['imputation'],
            'annee' => (int)$r['annee'],
            'date_demande' => (string)$r['date_demande'],
            'date_debut' => (string)$r['date_debut'],
            'heure_debut' => (string)$r['heure_debut'],
            'date_fin' => (string)$r['date_fin'],
            'date_retour' => (string)$r['date_retour'],
            'heure_fin' => (string)$r['heure_fin'],
            'jours_demandes' => (float)$r['jours_demandes'],
            'jours_valides' => $r['jours_valides'] === null ? null : (float)$r['jours_valides'],
            'remplacant' => (string)$r['remplacant'],
            'titre_periode' => (string)$r['titre_periode'],
            'justificatif' => (string)$r['justificatif'],
            'observations' => (string)$r['observations'],
            'statut' => (string)$r['statut'],
            'visa_chef_par' => (string)$r['visa_chef_par'],
            'visa_chef_le' => (string)$r['visa_chef_le'],
            'visa_medecin_par' => (string)$r['visa_medecin_par'],
            'visa_medecin_le' => (string)$r['visa_medecin_le'],
            'visa_gestionnaire_par' => (string)$r['visa_gestionnaire_par'],
            'visa_gestionnaire_le' => (string)$r['visa_gestionnaire_le'],
            'motif_refus' => (string)$r['motif_refus'],
            'ajustement_type' => (string)$r['ajustement_type'],
            'saisie_par' => (string)$r['saisie_par'],
            'date_saisie' => (string)$r['date_saisie'],
            'date_modification' => (string)$r['date_modification'],
        ];
    }

    $comp = [];
    foreach ($db->query("SELECT * FROM `salfa_comparaison_net` ORDER BY `id` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $comp[] = [
            'id' => (int)$r['id'],
            'numero_matricule' => (int)$r['numero_matricule'],
            'nom_prenoms' => (string)$r['nom_prenoms'],
            'categorie' => (string)$r['categorie'],
            'jobs' => (string)$r['jobs'],
            'net_actuel' => (float)$r['net_actuel'],
            'net_avant' => (float)$r['net_avant'],
            'ecart' => (float)$r['ecart'],
        ];
    }

    $baremeDocRows = [];
    foreach ($db->query("SELECT * FROM `salfa_bareme_anciennete` ORDER BY `ordre` ASC")->fetchAll(PDO::FETCH_ASSOC) as $b) {
        if ((int)$b['annees_min'] >= 2) {
            $baremeDocRows[] = [
                'annees_anciennete' => (int)$b['annees_min'],
                'indice_augmentation' => (float)$b['indice'],
                'description' => (string)$b['description'],
            ];
        }
    }

    $anneesExplicites = [];
    foreach ($db->query("SELECT `annee` FROM `salfa_annees` ORDER BY `annee` ASC")->fetchAll(PDO::FETCH_ASSOC) as $ar) {
        $ay = (int)$ar['annee'];
        if ($ay >= 1990 && $ay <= 2100) {
            $anneesExplicites[] = $ay;
            $anneesSet[$ay] = true;
        }
    }

    asort($moisSet);
    $anneesImportees = array_keys($anneesSet);
    sort($anneesImportees);

    return [
        'meta' => [
            'source_file' => (string)($revRow['source_file'] ?? 'SALAIRE SALFA 2026.xlsm'),
            'entreprise' => (string)($revRow['entreprise'] ?? 'SALFA TANAMBAO'),
            'titre' => (string)($revRow['titre'] ?? "FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA (Bulletin de paie individuel)"),
            'annee' => $anneeRef,
            'mois_disponibles' => array_keys($moisSet),
            'annees_importees' => $anneesImportees,
            'source_version' => (string)($revRow['source_version'] ?? 'classeur-2026-10'),
            'source_historique' => (string)($revRow['source_historique'] ?? 'SALAIRE SALFA 2022-2025'),
            'conges_version' => (string)($revRow['conges_version'] ?? 'controle-2026-10'),
            'conges_loi_3ans' => (int)($revRow['conges_loi_3ans'] ?? 3),
        ],
        'bareme_anciennete' => [
            'description' => "Barème de valorisation de l'ancienneté (indice d'augmentation sur le salaire de base)",
            'regle' => "Une unité d'ancienneté = 2 années complètes de travail au sein de la SALFA (ou 2 années dans un poste similaire)",
            'bareme' => $baremeDocRows,
        ],
        'employes' => $employes,
        'paies' => $paies,
        'comparaison_net' => $comp,
        'conges' => $conges,
        'annees' => $anneesExplicites,
        'utilisateurs' => [],
    ];
}

function loadRelationalConfig(PDO $db): ?array {
    $cfg = $db->query("SELECT * FROM `salfa_config` WHERE `id` = 1")->fetch(PDO::FETCH_ASSOC);
    if (!$cfg || (int)$cfg['configuree'] === 0) return null;

    $baremeAnc = [];
    foreach ($db->query("SELECT * FROM `salfa_bareme_anciennete` ORDER BY `ordre` ASC")->fetchAll(PDO::FETCH_ASSOC) as $b) {
        $baremeAnc[] = [
            'min' => (int)$b['annees_min'],
            'max' => (int)$b['annees_max'],
            'indice' => (float)$b['indice'],
        ];
    }

    $baremeIrsa = [];
    foreach ($db->query("SELECT * FROM `salfa_bareme_irsa` ORDER BY `ordre` ASC")->fetchAll(PDO::FETCH_ASSOC) as $t) {
        $baremeIrsa[] = [
            'min' => (float)$t['seuil_min'],
            'max' => $t['seuil_max'] === null ? null : (float)$t['seuil_max'],
            'taux' => (float)$t['taux'],
        ];
    }

    return [
        'cnapsSalariale' => (float)$cfg['cnaps_salariale'],
        'cnapsPatronale' => (float)$cfg['cnaps_patronale'],
        'deductionEnfant' => (float)$cfg['deduction_enfant'],
        'minIrsa' => (float)$cfg['min_irsa'],
        'arrondiIrsaBase' => (int)$cfg['arrondi_irsa_base'],
        'arrondiNet' => (int)$cfg['arrondi_net'],
        'plafondEspeces' => (float)$cfg['plafond_especes'],
        'tauxMaternite' => (float)$cfg['taux_maternite'],
        'dureeMaterniteMois' => (int)$cfg['duree_maternite_mois'],
        'baremeAnciennete' => $baremeAnc,
        'baremeIrsa' => $baremeIrsa,
        'congies' => [
            'joursCongeParAn' => min(30.0, (float)$cfg['jours_conge_par_an']),
            'nbAnneesCumul' => (int)$cfg['nb_annees_cumul'],
            'plafondCumulConge' => min(30.0, (float)$cfg['plafond_cumul_conge']),
            'joursPermissionParAn' => (float)$cfg['jours_permission_par_an'],
            'reportAutorise' => false,
            'exclureDimanche' => (bool)(int)$cfg['exclure_dimanche'],
            'exclureSamedi' => (bool)(int)$cfg['exclure_samedi'],
            'joursFeries' => (string)$cfg['jours_feries'],
            'examenSurPermission' => (bool)(int)$cfg['examen_sur_permission'],
            'bloquerDepassement' => (bool)(int)$cfg['bloquer_depassement'],
            'versionCalendrier' => 3,
        ],
        'iconeApp' => (string)($cfg['icone_app'] ?? ''),
    ];
}

function loadRelationalHeader(PDO $db, int $id = 1): ?array {
    $st = $db->prepare("SELECT * FROM `salfa_entete` WHERE `id` = ?");
    $st->execute([$id]);
    $h = $st->fetch(PDO::FETCH_ASSOC);
    if (!$h || (int)$h['configuree'] === 0) return null;
    return [
        'mode' => (string)$h['mode'] === 'personnalise' ? 'personnalise' : 'image',
        'image' => (string)($h['image_finale'] ?? ''),
        'fullImage' => (string)($h['image_complete'] ?? ''),
        'lines' => [
            (string)$h['ligne_1'],
            (string)$h['ligne_2'],
            (string)$h['ligne_3'],
            (string)$h['ligne_4'],
            (string)$h['ligne_5'],
            (string)$h['ligne_6'],
            (string)$h['ligne_7'],
        ],
        'logoLeft' => (string)($h['logo_gauche'] ?? ''),
        'logoRight' => (string)($h['logo_droite'] ?? ''),
    ];
}

function loadRelationalSnapshot(PDO $db): array {
    $rev = (int)$db->query("SELECT `revision` FROM `salfa_revision` WHERE `id` = 1")->fetchColumn();
    return [
        'revision' => $rev,
        'store' => loadRelationalStore($db),
        'config' => loadRelationalConfig($db),
        'header' => loadRelationalHeader($db, 1),
        'congeHeader' => loadRelationalHeader($db, 2),
    ];
}

function syncEmployesTable(PDO $db, array $employes): void {
    if (empty($employes)) {
        $db->exec("DELETE FROM `salfa_employes`");
        return;
    }
    $ids = [];
    foreach ($employes as $e) {
        $ids[] = (int)$e['id'];
    }
    $inList = implode(',', array_map('intval', $ids));
    $db->exec("DELETE FROM `salfa_employes` WHERE `id` NOT IN ($inList)");

    $cols = [
        'id', 'numero_matricule', 'nom_prenoms', 'numero_cnaps', 'categorie', 'jobs',
        'date_embauche', 'nombre_annees', 'enfant_a_charge', 'base_aj', 'logement_transport',
        'rendement', 'responsabilite_representation', 'rib', 'mode_paiement', 'actif',
        'date_inactif', 'conge_maternite', 'date_debut_maternite', 'date_creation',
        'genre', 'date_naissance', 'lieu_naissance', 'pere', 'mere', 'cin', 'date_cin', 'lieu_cin', 'situation_matrimoniale', 'adresse', 'service', 'diplome', 'etablissement', 'statut', 'numero_ordre', 'nature_contrat', 'duree_contrat', 'lieu_embauche', 'lieu_travail', 'date_effet',
    ];
    $updates = [];
    foreach ($cols as $c) {
        if ($c !== 'id') $updates[] = "`$c` = VALUES(`$c`)";
    }
    $colSql = '`' . implode('`, `', $cols) . '`';
    $rowPlaceholders = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';

    foreach (array_chunk($employes, 150) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), $rowPlaceholders));
        $sql = "INSERT INTO `salfa_employes` ($colSql) VALUES $placeholders ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
        $params = [];
        foreach ($chunk as $e) {
            $params[] = (int)($e['id'] ?? 0);
            $params[] = (int)($e['numero_matricule'] ?? 0);
            $params[] = substr((string)($e['nom_prenoms'] ?? ''), 0, 160);
            $params[] = substr((string)($e['numero_cnaps'] ?? ''), 0, 60);
            $params[] = substr((string)($e['categorie'] ?? ''), 0, 32);
            $params[] = substr((string)($e['jobs'] ?? ''), 0, 160);
            $params[] = substr((string)($e['date_embauche'] ?? ''), 0, 20);
            $params[] = (int)($e['nombre_annees'] ?? 0);
            $params[] = (int)($e['enfant_a_charge'] ?? 0);
            $params[] = (float)($e['base_aj'] ?? 0);
            $params[] = (float)($e['logement_transport'] ?? 0);
            $params[] = (float)($e['rendement'] ?? 0);
            $params[] = (float)($e['responsabilite_representation'] ?? 0);
            $params[] = substr((string)($e['rib'] ?? ''), 0, 80);
            $params[] = substr((string)($e['mode_paiement'] ?? 'ESPECES'), 0, 32);
            $params[] = !empty($e['actif']) ? 1 : 0;
            $params[] = substr((string)($e['date_inactif'] ?? ''), 0, 20);
            $params[] = !empty($e['conge_maternite']) ? 1 : 0;
            $params[] = substr((string)($e['date_debut_maternite'] ?? ''), 0, 20);
            $params[] = substr((string)($e['date_creation'] ?? ''), 0, 32);
            $params[] = substr((string)($e['genre'] ?? ''), 0, 20);
            $params[] = substr((string)($e['date_naissance'] ?? ''), 0, 20);
            $params[] = substr((string)($e['lieu_naissance'] ?? ''), 0, 160);
            $params[] = substr((string)($e['pere'] ?? ''), 0, 160);
            $params[] = substr((string)($e['mere'] ?? ''), 0, 160);
            $params[] = substr((string)($e['cin'] ?? ''), 0, 32);
            $params[] = substr((string)($e['date_cin'] ?? ''), 0, 20);
            $params[] = substr((string)($e['lieu_cin'] ?? ''), 0, 160);
            $params[] = substr((string)($e['situation_matrimoniale'] ?? ''), 0, 60);
            $params[] = substr((string)($e['adresse'] ?? ''), 0, 255);
            $params[] = substr((string)($e['service'] ?? ''), 0, 160);
            $params[] = substr((string)($e['diplome'] ?? ''), 0, 255);
            $params[] = substr((string)($e['etablissement'] ?? ''), 0, 255);
            $params[] = substr((string)($e['statut'] ?? ''), 0, 80);
            $params[] = substr((string)($e['numero_ordre'] ?? ''), 0, 60);
            $params[] = substr((string)($e['nature_contrat'] ?? ''), 0, 32);
            $params[] = substr((string)($e['duree_contrat'] ?? ''), 0, 160);
            $params[] = substr((string)($e['lieu_embauche'] ?? ''), 0, 160);
            $params[] = substr((string)($e['lieu_travail'] ?? ''), 0, 160);
            $params[] = substr((string)($e['date_effet'] ?? ''), 0, 20);
        }
        $st = $db->prepare($sql);
        $st->execute($params);
    }
}

function syncPaiesTable(PDO $db, array $paies): void {
    if (empty($paies)) {
        $db->exec("DELETE FROM `salfa_paies`");
        return;
    }
    $ids = [];
    foreach ($paies as $p) {
        $ids[] = (int)$p['id'];
    }
    $inList = implode(',', array_map('intval', $ids));
    $db->exec("DELETE FROM `salfa_paies` WHERE `id` NOT IN ($inList)");

    $cols = [
        'id', 'employe_id', 'numero_matricule', 'annee', 'mois', 'nom_prenoms', 'numero_cnaps',
        'categorie', 'jobs', 'date_embauche', 'nombre_annees', 'enfant_a_charge', 'base_aj',
        'logt_trsp', 'rendement', 'resp_repres', 'salaire_brut', 'cnaps', 'patronal',
        'salaire_imposable', 'irsa', 'salaire_net', 'augmentation_divers', 'prime_de_garde',
        'anciennete2', 'risque', 'repr_rec', 'accessoir', 'brut', 'avance', 'med', 'net',
        'virement', 'especes', 'rib', 'verrouille', 'conge_maternite',
        'date_debut_maternite', 'date_modification',
    ];
    $updates = [];
    foreach ($cols as $c) {
        if ($c !== 'id') $updates[] = "`$c` = VALUES(`$c`)";
    }
    $colSql = '`' . implode('`, `', $cols) . '`';
    $rowPlaceholders = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';

    foreach (array_chunk($paies, 150) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), $rowPlaceholders));
        $sql = "INSERT INTO `salfa_paies` ($colSql) VALUES $placeholders ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
        $params = [];
        foreach ($chunk as $p) {
            $vir = $p['virement'] ?? null;
            $esp = $p['especes'] ?? null;
            $params[] = (int)($p['id'] ?? 0);
            $params[] = (int)($p['employe_id'] ?? 0);
            $params[] = (int)($p['numero_matricule'] ?? 0);
            $params[] = (int)($p['annee'] ?? 2026);
            $params[] = substr(strtoupper((string)($p['mois'] ?? '')), 0, 20);
            $params[] = substr((string)($p['nom_prenoms'] ?? ''), 0, 160);
            $params[] = substr((string)($p['numero_cnaps'] ?? ''), 0, 60);
            $params[] = substr((string)($p['categorie'] ?? ''), 0, 32);
            $params[] = substr((string)($p['jobs'] ?? ''), 0, 160);
            $params[] = substr((string)($p['date_embauche'] ?? ''), 0, 20);
            $params[] = (int)($p['nombre_annees'] ?? 0);
            $params[] = (int)($p['enfant_a_charge'] ?? 0);
            $params[] = (float)($p['base_aj'] ?? 0);
            $params[] = (float)($p['logt_trsp'] ?? 0);
            $params[] = (float)($p['rendement'] ?? 0);
            $params[] = (float)($p['resp_repres'] ?? 0);
            $params[] = (float)($p['salaire_brut'] ?? 0);
            $params[] = (float)($p['cnaps'] ?? 0);
            $params[] = (float)($p['patronal'] ?? 0);
            $params[] = (float)($p['salaire_imposable'] ?? 0);
            $params[] = (float)($p['irsa'] ?? 0);
            $params[] = (float)($p['salaire_net'] ?? 0);
            $params[] = (float)($p['augmentation_divers'] ?? 0);
            $params[] = (float)($p['prime_de_garde'] ?? 0);
            $params[] = (float)($p['anciennete2'] ?? 0);
            $params[] = (float)($p['risque'] ?? 0);
            $params[] = (float)($p['repr_rec'] ?? 0);
            $params[] = (float)($p['accessoir'] ?? 0);
            $params[] = (float)($p['brut'] ?? 0);
            $params[] = (float)($p['avance'] ?? 0);
            $params[] = (float)($p['med'] ?? 0);
            $params[] = (float)($p['net'] ?? 0);
            $params[] = ($vir === null || $vir === '') ? null : (float)$vir;
            $params[] = ($esp === null || $esp === '') ? null : (float)$esp;
            $params[] = substr((string)($p['rib'] ?? ''), 0, 80);
            $params[] = !empty($p['verrouille']) ? 1 : 0;
            $params[] = !empty($p['conge_maternite']) ? 1 : 0;
            $params[] = substr((string)($p['date_debut_maternite'] ?? ''), 0, 20);
            $params[] = substr((string)($p['date_modification'] ?? ''), 0, 32);
        }
        $st = $db->prepare($sql);
        $st->execute($params);
    }
}

function syncCongesTable(PDO $db, array $conges): void {
    if (empty($conges)) {
        $db->exec("DELETE FROM `salfa_conges`");
        return;
    }
    $ids = [];
    foreach ($conges as $c) {
        $ids[] = (int)$c['id'];
    }
    $inList = implode(',', array_map('intval', $ids));
    $db->exec("DELETE FROM `salfa_conges` WHERE `id` NOT IN ($inList)");

    $cols = [
        'id', 'employe_id', 'numero_matricule', 'nom_prenoms', 'fonction', 'service', 'contact',
        'categorie', 'motif_code', 'motif_libelle', 'imputation', 'annee', 'date_demande',
        'date_debut', 'heure_debut', 'date_fin', 'date_retour', 'heure_fin', 'jours_demandes',
        'jours_valides', 'remplacant', 'titre_periode', 'justificatif', 'observations', 'statut',
        'visa_chef_par', 'visa_chef_le', 'visa_medecin_par', 'visa_medecin_le',
        'visa_gestionnaire_par', 'visa_gestionnaire_le', 'motif_refus', 'ajustement_type',
        'saisie_par', 'date_saisie', 'date_modification',
    ];
    $updates = [];
    foreach ($cols as $c) {
        if ($c !== 'id') $updates[] = "`$c` = VALUES(`$c`)";
    }
    $colSql = '`' . implode('`, `', $cols) . '`';
    $rowPlaceholders = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';

    foreach (array_chunk($conges, 150) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), $rowPlaceholders));
        $sql = "INSERT INTO `salfa_conges` ($colSql) VALUES $placeholders ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
        $params = [];
        foreach ($chunk as $c) {
            $jv = $c['jours_valides'] ?? null;
            $params[] = (int)($c['id'] ?? 0);
            $params[] = (int)($c['employe_id'] ?? 0);
            $params[] = (int)($c['numero_matricule'] ?? 0);
            $params[] = substr((string)($c['nom_prenoms'] ?? ''), 0, 160);
            $params[] = substr((string)($c['fonction'] ?? ''), 0, 160);
            $params[] = substr((string)($c['service'] ?? ''), 0, 120);
            $params[] = substr((string)($c['contact'] ?? ''), 0, 120);
            $params[] = substr((string)($c['categorie'] ?? 'CONGE'), 0, 32);
            $params[] = substr((string)($c['motif_code'] ?? ''), 0, 40);
            $params[] = substr((string)($c['motif_libelle'] ?? ''), 0, 255);
            $params[] = substr((string)($c['imputation'] ?? 'CONGE'), 0, 32);
            $params[] = (int)($c['annee'] ?? 2026);
            $params[] = substr((string)($c['date_demande'] ?? ''), 0, 20);
            $params[] = substr((string)($c['date_debut'] ?? ''), 0, 20);
            $params[] = substr((string)($c['heure_debut'] ?? ''), 0, 16);
            $params[] = substr((string)($c['date_fin'] ?? ''), 0, 20);
            $params[] = substr((string)($c['date_retour'] ?? ''), 0, 20);
            $params[] = substr((string)($c['heure_fin'] ?? ''), 0, 16);
            $params[] = (float)($c['jours_demandes'] ?? 0);
            $params[] = ($jv === null || $jv === '') ? null : (float)$jv;
            $params[] = substr((string)($c['remplacant'] ?? ''), 0, 160);
            $params[] = substr((string)($c['titre_periode'] ?? ''), 0, 80);
            $params[] = substr((string)($c['justificatif'] ?? ''), 0, 255);
            $params[] = (string)($c['observations'] ?? '');
            $params[] = substr((string)($c['statut'] ?? 'VALIDE'), 0, 32);
            $params[] = substr((string)($c['visa_chef_par'] ?? ''), 0, 120);
            $params[] = substr((string)($c['visa_chef_le'] ?? ''), 0, 32);
            $params[] = substr((string)($c['visa_medecin_par'] ?? ''), 0, 120);
            $params[] = substr((string)($c['visa_medecin_le'] ?? ''), 0, 32);
            $params[] = substr((string)($c['visa_gestionnaire_par'] ?? ''), 0, 120);
            $params[] = substr((string)($c['visa_gestionnaire_le'] ?? ''), 0, 32);
            $params[] = substr((string)($c['motif_refus'] ?? ''), 0, 255);
            $params[] = substr((string)($c['ajustement_type'] ?? ''), 0, 32);
            $params[] = substr((string)($c['saisie_par'] ?? ''), 0, 80);
            $params[] = substr((string)($c['date_saisie'] ?? ''), 0, 32);
            $params[] = substr((string)($c['date_modification'] ?? ''), 0, 32);
        }
        $st = $db->prepare($sql);
        $st->execute($params);
    }
}

function syncComparaisonNetTable(PDO $db, array $comp): void {
    $db->exec("DELETE FROM `salfa_comparaison_net`");
    if (empty($comp)) return;
    $st = $db->prepare("INSERT INTO `salfa_comparaison_net` (`id`, `numero_matricule`, `nom_prenoms`, `categorie`, `jobs`, `net_actuel`, `net_avant`, `ecart`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $autoId = 1;
    foreach ($comp as $c) {
        $cid = (int)($c['id'] ?? 0) ?: $autoId;
        $autoId = max($autoId, $cid) + 1;
        $st->execute([
            $cid,
            (int)($c['numero_matricule'] ?? 0),
            substr((string)($c['nom_prenoms'] ?? ''), 0, 160),
            substr((string)($c['categorie'] ?? ''), 0, 32),
            substr((string)($c['jobs'] ?? ''), 0, 160),
            (float)($c['net_actuel'] ?? 0),
            (float)($c['net_avant'] ?? 0),
            (float)($c['ecart'] ?? 0),
        ]);
    }
}

function syncAnneesTable(PDO $db, array $annees): void {
    $clean = [];
    foreach ($annees as $y) {
        $yi = (int)$y;
        if ($yi >= 1990 && $yi <= 2100) {
            $clean[$yi] = $yi;
        }
    }
    ksort($clean);
    if (empty($clean)) {
        $db->exec("DELETE FROM `salfa_annees`");
        return;
    }
    $inList = implode(',', array_map('intval', array_values($clean)));
    $db->exec("DELETE FROM `salfa_annees` WHERE `annee` NOT IN ($inList)");
    $now = date('Y-m-d H:i:s');
    $st = $db->prepare("INSERT INTO `salfa_annees` (`annee`, `date_creation`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `annee` = VALUES(`annee`)");
    foreach ($clean as $yi) {
        $st->execute([$yi, $now]);
    }
}

function updateRevisionMeta(PDO $db, array $meta, int $newRevision): void {
    $st = $db->prepare("UPDATE `salfa_revision` SET
        `revision` = ?,
        `source_file` = ?,
        `entreprise` = ?,
        `titre` = ?,
        `annee` = ?,
        `source_version` = ?,
        `source_historique` = ?,
        `conges_version` = ?,
        `conges_loi_3ans` = ?,
        `date_modification` = ?
        WHERE `id` = 1");
    $st->execute([
        $newRevision,
        substr((string)($meta['source_file'] ?? 'SALAIRE SALFA 2026.xlsm'), 0, 160),
        substr((string)($meta['entreprise'] ?? 'SALFA TANAMBAO'), 0, 160),
        substr((string)($meta['titre'] ?? "FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN'OLONA (Bulletin de paie individuel)"), 0, 255),
        (int)($meta['annee'] ?? 2026) ?: 2026,
        substr((string)($meta['source_version'] ?? 'classeur-2026-10'), 0, 60),
        substr((string)($meta['source_historique'] ?? 'SALAIRE SALFA 2022-2025'), 0, 160),
        substr((string)($meta['conges_version'] ?? 'controle-2026-10'), 0, 60),
        (int)($meta['conges_loi_3ans'] ?? 3) ?: 3,
        date('Y-m-d H:i:s'),
    ]);
}

function writeConfigTables(PDO $db, array $cfg): void {
    $congies = is_array($cfg['congies'] ?? null) ? $cfg['congies'] : [];
    $joursAn = min(30.0, max(0.0, (float)($congies['joursCongeParAn'] ?? 30)));
    $iconeApp = isset($cfg['iconeApp']) && trim((string)$cfg['iconeApp']) !== '' ? (string)$cfg['iconeApp'] : null;
    $st = $db->prepare("UPDATE `salfa_config` SET
        `configuree` = 1,
        `cnaps_salariale` = ?,
        `cnaps_patronale` = ?,
        `deduction_enfant` = ?,
        `min_irsa` = ?,
        `arrondi_irsa_base` = ?,
        `arrondi_net` = ?,
        `plafond_especes` = ?,
        `taux_maternite` = ?,
        `duree_maternite_mois` = ?,
        `jours_conge_par_an` = ?,
        `nb_annees_cumul` = ?,
        `plafond_cumul_conge` = ?,
        `jours_permission_par_an` = ?,
        `report_autorise` = 0,
        `exclure_dimanche` = ?,
        `exclure_samedi` = ?,
        `jours_feries` = ?,
        `examen_sur_permission` = ?,
        `bloquer_depassement` = ?,
        `version_calendrier` = 3,
        `icone_app` = ?
        WHERE `id` = 1");
    $st->execute([
        (float)($cfg['cnapsSalariale'] ?? 1.0),
        (float)($cfg['cnapsPatronale'] ?? 13.0),
        (float)($cfg['deductionEnfant'] ?? 2000),
        (float)($cfg['minIrsa'] ?? 3000),
        (int)($cfg['arrondiIrsaBase'] ?? 100),
        (int)($cfg['arrondiNet'] ?? 100),
        (float)($cfg['plafondEspeces'] ?? 5000),
        (float)($cfg['tauxMaternite'] ?? 50),
        (int)($cfg['dureeMaterniteMois'] ?? 3),
        $joursAn,
        (int)($congies['nbAnneesCumul'] ?? 3),
        min($joursAn, (float)($congies['plafondCumulConge'] ?? $joursAn)),
        (float)($congies['joursPermissionParAn'] ?? 10),
        !empty($congies['exclureDimanche']) ? 1 : 0,
        !empty($congies['exclureSamedi']) ? 1 : 0,
        (string)($congies['joursFeries'] ?? ''),
        !empty($congies['examenSurPermission']) ? 1 : 0,
        array_key_exists('bloquerDepassement', $congies) ? (!empty($congies['bloquerDepassement']) ? 1 : 0) : 1,
        $iconeApp,
    ]);

    if (is_array($cfg['baremeAnciennete'] ?? null) && !empty($cfg['baremeAnciennete'])) {
        $db->exec("DELETE FROM `salfa_bareme_anciennete`");
        $ins = $db->prepare("INSERT INTO `salfa_bareme_anciennete` (`ordre`, `annees_min`, `annees_max`, `indice`, `description`) VALUES (?, ?, ?, ?, ?)");
        $ord = 1;
        foreach ($cfg['baremeAnciennete'] as $b) {
            $min = (int)($b['min'] ?? 0);
            $max = (int)($b['max'] ?? $min);
            $ins->execute([$ord++, $min, $max, (float)($b['indice'] ?? 1.0), $max >= 100 ? "$min et plus" : (string)$min]);
        }
    }

    if (is_array($cfg['baremeIrsa'] ?? null) && !empty($cfg['baremeIrsa'])) {
        $db->exec("DELETE FROM `salfa_bareme_irsa`");
        $ins = $db->prepare("INSERT INTO `salfa_bareme_irsa` (`ordre`, `seuil_min`, `seuil_max`, `taux`) VALUES (?, ?, ?, ?)");
        $ord = 1;
        foreach ($cfg['baremeIrsa'] as $t) {
            $sMax = $t['max'] ?? null;
            $ins->execute([
                $ord++,
                (float)($t['min'] ?? 0),
                ($sMax === null || $sMax === '') ? null : (float)$sMax,
                (float)($t['taux'] ?? 0),
            ]);
        }
    }
}

function writeHeaderTable(PDO $db, array $hdr, int $id = 1): void {
    $lines = is_array($hdr['lines'] ?? null) ? array_values($hdr['lines']) : [];
    $st = $db->prepare("INSERT INTO `salfa_entete`
        (`id`, `configuree`, `mode`, `ligne_1`, `ligne_2`, `ligne_3`, `ligne_4`, `ligne_5`, `ligne_6`, `ligne_7`, `image_finale`, `image_complete`, `logo_gauche`, `logo_droite`)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            `configuree` = 1,
            `mode` = VALUES(`mode`),
            `ligne_1` = VALUES(`ligne_1`),
            `ligne_2` = VALUES(`ligne_2`),
            `ligne_3` = VALUES(`ligne_3`),
            `ligne_4` = VALUES(`ligne_4`),
            `ligne_5` = VALUES(`ligne_5`),
            `ligne_6` = VALUES(`ligne_6`),
            `ligne_7` = VALUES(`ligne_7`),
            `image_finale` = VALUES(`image_finale`),
            `image_complete` = VALUES(`image_complete`),
            `logo_gauche` = VALUES(`logo_gauche`),
            `logo_droite` = VALUES(`logo_droite`)");
    $st->execute([
        $id,
        ($hdr['mode'] ?? 'image') === 'personnalise' ? 'personnalise' : 'image',
        substr((string)($lines[0] ?? ''), 0, 255),
        substr((string)($lines[1] ?? ''), 0, 255),
        substr((string)($lines[2] ?? ''), 0, 255),
        substr((string)($lines[3] ?? ''), 0, 255),
        substr((string)($lines[4] ?? ''), 0, 255),
        substr((string)($lines[5] ?? ''), 0, 255),
        substr((string)($lines[6] ?? ''), 0, 255),
        isset($hdr['image']) ? (string)$hdr['image'] : null,
        isset($hdr['fullImage']) ? (string)$hdr['fullImage'] : null,
        isset($hdr['logoLeft']) ? (string)$hdr['logoLeft'] : null,
        isset($hdr['logoRight']) ? (string)$hdr['logoRight'] : null,
    ]);
}

// ==============================================================================
// EXPORT & ARCHIVAGE DE SAUVEGARDES SQL RELATIONNELLES (AUCUN JSON)
// ==============================================================================

function resolveSqlBackupsDir(): string {
    $cur = __DIR__;
    for ($i = 0; $i < 6; $i++) {
        $parent = dirname($cur);
        if ($parent === $cur) break;
        $base = strtolower(basename($cur));
        if ($base === 'www' || $base === 'htdocs' || $base === 'public_html') {
            $outside = $parent . DIRECTORY_SEPARATOR . 'salfa-backups';
            if (!is_dir($outside)) @mkdir($outside, 0750, true);
            if (is_dir($outside) && is_writable($outside)) return $outside;
            break;
        }
        $cur = $parent;
    }
    $localDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backups';
    if (!is_dir($localDir)) @mkdir($localDir, 0750, true);
    if (is_dir($localDir)) {
        $ht = $localDir . DIRECTORY_SEPARATOR . '.htaccess';
        if (!is_file($ht)) {
            @file_put_contents($ht, "Require all denied\n");
        }
        $idx = $localDir . DIRECTORY_SEPARATOR . 'index.php';
        if (!is_file($idx)) {
            @file_put_contents($idx, "<?php http_response_code(403); exit;\n");
        }
    }
    return $localDir;
}

function sqlDumpVal(PDO $db, $v): string {
    if ($v === null) return 'NULL';
    if (is_bool($v)) return $v ? '1' : '0';
    if (is_int($v) || is_float($v)) return (string)$v;
    return $db->quote((string)$v);
}

function dumpTableRowsSql(PDO $db, string $tableName, array $columns, string $orderBy, bool $insertIgnore = false): string {
    $colList = implode(', ', array_map(fn($c) => "`$c`", $columns));
    $rows = $db->query("SELECT $colList FROM `$tableName` ORDER BY $orderBy")->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    if (!$insertIgnore) {
        $out[] = "DELETE FROM `$tableName`;";
    }
    if (empty($rows)) return implode("\n", $out);
    $verb = $insertIgnore ? 'INSERT IGNORE INTO' : 'INSERT INTO';
    foreach (array_chunk($rows, 150) as $batch) {
        $tuples = [];
        foreach ($batch as $r) {
            $vals = [];
            foreach ($columns as $c) {
                $vals[] = sqlDumpVal($db, $r[$c] ?? null);
            }
            $tuples[] = '  (' . implode(', ', $vals) . ')';
        }
        $out[] = "$verb `$tableName` ($colList) VALUES\n" . implode(",\n", $tuples) . ';';
    }
    return implode("\n", $out);
}

function generateRelationalSqlDump(PDO $db, string $motif = 'Sauvegarde SQL manuelle', bool $congesOnly = false): array {
    $now = date('Y-m-d H:i:s');
    $nbEmp = (int)$db->query("SELECT COUNT(*) FROM `salfa_employes`")->fetchColumn();
    $nbPaies = (int)$db->query("SELECT COUNT(*) FROM `salfa_paies`")->fetchColumn();
    $nbConges = (int)$db->query("SELECT COUNT(*) FROM `salfa_conges`")->fetchColumn();

    $lines = [];
    $lines[] = '-- ==============================================================================';
    $lines[] = '-- SAUVEGARDE SQL RELATIONNELLE — SALFA TANAMBAO (PAIE & CONGÉS)';
    $lines[] = "-- Générée le : $now";
    $lines[] = '-- Motif      : ' . str_replace(["\r", "\n"], ' ', $motif);
    $lines[] = "-- Contenu    : $nbEmp salarié(s), " . ($congesOnly ? '(paies préservées)' : "$nbPaies bulletin(s)") . ", $nbConges fiche(s) congés/permissions";
    $lines[] = '-- Format     : 100 % relationnel (colonnes et lignes MySQL, aucun JSON)';
    $lines[] = '-- ==============================================================================';
    $lines[] = '';
    $lines[] = 'SET NAMES utf8mb4;';
    $lines[] = 'SET FOREIGN_KEY_CHECKS = 0;';
    $lines[] = 'CREATE DATABASE IF NOT EXISTS `salfa_paie` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;';
    $lines[] = 'USE `salfa_paie`;';
    $lines[] = '';
    $lines[] = 'START TRANSACTION;';
    $lines[] = 'DROP TABLE IF EXISTS `salfa_state`;';
    $lines[] = '';

    foreach (['salfa_users', 'salfa_revision', 'salfa_employes', 'salfa_paies', 'salfa_conges', 'salfa_comparaison_net', 'salfa_config', 'salfa_bareme_anciennete', 'salfa_bareme_irsa', 'salfa_entete', 'salfa_annees'] as $tbl) {
        $createRow = $db->query("SHOW CREATE TABLE `$tbl`")->fetch(PDO::FETCH_NUM);
        if ($createRow && isset($createRow[1])) {
            $ddl = preg_replace('/^CREATE TABLE /i', 'CREATE TABLE IF NOT EXISTS ', (string)$createRow[1]);
            $lines[] = $ddl . ';';
            $lines[] = '';
        }
    }

    // Comptes par défaut garantis + synchronisation des utilisateurs existants
    $lines[] = '-- Comptes utilisateurs par défaut + comptes actifs/personnalisés';
    $lines[] = "INSERT IGNORE INTO `salfa_users` (`id`, `username`, `nom_complet`, `role`, `actif`, `password_hash`) VALUES";
    $lines[] = "  (1, 'admin', 'Administrateur Principal SALFA', 'Administrateur', 1, " . $db->quote(SALFA_DEFAULT_ADMIN_HASH) . "),";
    $lines[] = "  (2, 'comptable', 'Comptable Clinique SALFA', 'Comptable', 1, " . $db->quote(SALFA_DEFAULT_COMPTABLE_HASH) . ");";
    if (!$congesOnly) {
        $lines[] = dumpTableRowsSql($db, 'salfa_users', ['id', 'username', 'nom_complet', 'role', 'actif', 'password_hash'], '`id` ASC', false);
    }
    $lines[] = '';

    $empCols = ['id', 'numero_matricule', 'nom_prenoms', 'numero_cnaps', 'categorie', 'jobs', 'date_embauche', 'nombre_annees', 'enfant_a_charge', 'base_aj', 'logement_transport', 'rendement', 'responsabilite_representation', 'rib', 'mode_paiement', 'actif', 'date_inactif', 'conge_maternite', 'date_debut_maternite', 'date_creation', 'genre', 'date_naissance', 'lieu_naissance', 'pere', 'mere', 'cin', 'date_cin', 'lieu_cin', 'situation_matrimoniale', 'adresse', 'service', 'diplome', 'etablissement', 'statut', 'numero_ordre', 'nature_contrat', 'duree_contrat', 'lieu_embauche', 'lieu_travail', 'date_effet'];
    if ($congesOnly) {
        $lines[] = dumpTableRowsSql($db, 'salfa_employes', $empCols, '`id` ASC', true);
    } else {
        $lines[] = dumpTableRowsSql($db, 'salfa_revision', ['id', 'revision', 'source_file', 'entreprise', 'titre', 'annee', 'source_version', 'source_historique', 'conges_version', 'conges_loi_3ans', 'date_modification'], '`id` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_config', ['id', 'configuree', 'cnaps_salariale', 'cnaps_patronale', 'deduction_enfant', 'min_irsa', 'arrondi_irsa_base', 'arrondi_net', 'plafond_especes', 'taux_maternite', 'duree_maternite_mois', 'jours_conge_par_an', 'nb_annees_cumul', 'plafond_cumul_conge', 'jours_permission_par_an', 'report_autorise', 'exclure_dimanche', 'exclure_samedi', 'jours_feries', 'examen_sur_permission', 'bloquer_depassement', 'version_calendrier', 'icone_app'], '`id` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_bareme_anciennete', ['ordre', 'annees_min', 'annees_max', 'indice', 'description'], '`ordre` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_bareme_irsa', ['ordre', 'seuil_min', 'seuil_max', 'taux'], '`ordre` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_entete', ['id', 'configuree', 'mode', 'ligne_1', 'ligne_2', 'ligne_3', 'ligne_4', 'ligne_5', 'ligne_6', 'ligne_7', 'image_finale', 'image_complete', 'logo_gauche', 'logo_droite'], '`id` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_employes', $empCols, '`id` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_paies', ['id', 'employe_id', 'numero_matricule', 'annee', 'mois', 'nom_prenoms', 'numero_cnaps', 'categorie', 'jobs', 'date_embauche', 'nombre_annees', 'enfant_a_charge', 'base_aj', 'logt_trsp', 'rendement', 'resp_repres', 'salaire_brut', 'cnaps', 'patronal', 'salaire_imposable', 'irsa', 'salaire_net', 'augmentation_divers', 'prime_de_garde', 'anciennete2', 'risque', 'repr_rec', 'accessoir', 'brut', 'avance', 'med', 'net', 'virement', 'especes', 'rib', 'verrouille', 'conge_maternite', 'date_debut_maternite', 'date_modification'], '`annee` ASC, `id` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_comparaison_net', ['id', 'numero_matricule', 'nom_prenoms', 'categorie', 'jobs', 'net_actuel', 'net_avant', 'ecart'], '`id` ASC');
        $lines[] = dumpTableRowsSql($db, 'salfa_annees', ['annee', 'date_creation'], '`annee` ASC');
    }

    $lines[] = dumpTableRowsSql($db, 'salfa_conges', ['id', 'employe_id', 'numero_matricule', 'nom_prenoms', 'fonction', 'service', 'contact', 'categorie', 'motif_code', 'motif_libelle', 'imputation', 'annee', 'date_demande', 'date_debut', 'heure_debut', 'date_fin', 'date_retour', 'heure_fin', 'jours_demandes', 'jours_valides', 'remplacant', 'titre_periode', 'justificatif', 'observations', 'statut', 'visa_chef_par', 'visa_chef_le', 'visa_medecin_par', 'visa_medecin_le', 'visa_gestionnaire_par', 'visa_gestionnaire_le', 'motif_refus', 'ajustement_type', 'saisie_par', 'date_saisie', 'date_modification'], '`id` ASC');
    $lines[] = '';
    $lines[] = 'COMMIT;';
    $lines[] = 'SET FOREIGN_KEY_CHECKS = 1;';
    $lines[] = '';

    $sql = implode("\n", $lines);
    return [
        'sql' => $sql,
        'size' => strlen($sql),
        'created_at' => $now,
        'motif' => $motif,
        'nb_employes' => $nbEmp,
        'nb_paies' => $congesOnly ? 0 : $nbPaies,
        'nb_conges' => $nbConges,
    ];
}

function saveSqlBackupOnDisk(PDO $db, string $type = 'MANUELLE', string $periode = '', string $motif = 'Sauvegarde SQL'): array {
    $congesOnly = ($type === 'CONGES');
    $dump = generateRelationalSqlDump($db, $motif, $congesOnly);
    // Éviter qu'une sauvegarde manuelle/de sécurité écrase un fichier de la même seconde.
    $stamp = date('Y-m-d_H-i-s') . '_' . bin2hex(random_bytes(4));
    $slug = trim((string)preg_replace('/[^A-Z0-9]+/', '_', strtoupper($periode)), '_');
    if ($type === 'CLOTURE') {
        $filename = 'SALFA_CLOTURE_' . ($slug !== '' ? $slug . '_' : '') . $stamp . '.sql';
    } elseif ($congesOnly) {
        $filename = 'SALFA_CONGES_' . $stamp . '.sql';
    } else {
        $filename = 'SALFA_SAUVEGARDE_SQL_' . $stamp . '.sql';
    }
    $dir = resolveSqlBackupsDir();
    $saved = false;
    if (is_dir($dir) && is_writable($dir)) {
        $saved = (@file_put_contents($dir . DIRECTORY_SEPARATOR . $filename, $dump['sql']) !== false);
        // Conserver les 30 dernières sauvegardes disque pour éviter la saturation
        $files = glob($dir . DIRECTORY_SEPARATOR . 'SALFA_*.sql') ?: [];
        if (count($files) > 30) {
            usort($files, fn($a, $b) => (int)@filemtime($b) <=> (int)@filemtime($a));
            foreach (array_slice($files, 30) as $old) {
                @unlink($old);
            }
        }
    }
    $dump['filename'] = $filename;
    $dump['server_saved'] = $saved;
    return $dump;
}

function listSqlBackupsOnDisk(): array {
    $dir = resolveSqlBackupsDir();
    if (!is_dir($dir)) return [];
    $files = glob($dir . DIRECTORY_SEPARATOR . 'SALFA_*.sql') ?: [];
    usort($files, fn($a, $b) => (int)@filemtime($b) <=> (int)@filemtime($a));
    $out = [];
    foreach (array_slice($files, 0, 30) as $path) {
        $fname = basename($path);
        $motif = 'Sauvegarde serveur WAMP';
        $fh = @fopen($path, 'rb');
        if ($fh) {
            for ($i = 0; $i < 8; $i++) {
                $line = fgets($fh, 512);
                if ($line === false) break;
                if (preg_match('/^--\s*Motif\s*:\s*(.+)$/u', trim($line), $m)) {
                    $motif = trim($m[1]);
                    break;
                }
            }
            fclose($fh);
        }
        $out[] = [
            'filename' => $fname,
            'size' => (int)@filesize($path),
            'created_at' => date('Y-m-d H:i:s', (int)@filemtime($path)),
            'motif' => $motif,
        ];
    }
    return $out;
}

function readSqlBackupFromDisk(string $filename): ?string {
    $clean = basename($filename);
    if (!preg_match('/^SALFA_[A-Za-z0-9_-]+\.sql$/', $clean)) return null;
    $path = resolveSqlBackupsDir() . DIRECTORY_SEPARATOR . $clean;
    if (!is_file($path)) return null;
    $content = @file_get_contents($path);
    return is_string($content) ? $content : null;
}

