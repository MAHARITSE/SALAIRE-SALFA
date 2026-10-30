"""Génère le fichier SQL relationnel MySQL (version WAMP) depuis les données Excel.

Toutes les données sont séparées en tables, colonnes et lignes MySQL (AUCUN JSON) :
- `salfa_users` (avec comptes par défaut `admin` / `admin123` et `comptable` / `comptable123`)
- `salfa_employes` (70 salariés : 50 actuels + 20 archivés 2022–2025)
- `salfa_paies` (2 390 bulletins mensuels 2022–2026)
- `salfa_conges` (610 fiches d'absence, congés et permissions)
- `salfa_comparaison_net` (48 lignes de comparaison des nets)
- `salfa_config`, `salfa_bareme_anciennete`, `salfa_bareme_irsa`, `salfa_entete`, `salfa_revision`

Supprime également toute ancienne table JSON `salfa_state` si elle existait.

Usage : python3 scripts/generer_sql_wamp.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "data" / "salfa_data.json"
HISTORIQUE = ROOT / "src" / "data" / "salfa_historique.json"
CONGES_HISTORIQUE = ROOT / "src" / "data" / "salfa_conges_historique.json"
DEST = ROOT / "wamp" / "sql" / "salfa_donnees_excel_2022-2026.sql"

HASH_ADMIN = "$2y$10$YX/zKbv4VMuSaS3ddJB5MuBWGfTgOr6aIf7L4PEsva5y2hyHw0j/G"  # admin123
HASH_COMPTABLE = "$2y$10$xFu0Kw7V7YsnIfrwPjOr1.C6.CfWtRq4Wyo.w/PX8cG36QN2.ezou"  # comptable123


def sql_str(val, max_len: int = 0) -> str:
    s = "" if val is None else str(val)
    if max_len > 0 and len(s) > max_len:
        s = s[:max_len]
    s = (
        s.replace("\\", "\\\\")
        .replace("'", "''")
        .replace("\0", "\\0")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\x1a", "\\Z")
    )
    return f"'{s}'"


def sql_num(val) -> str:
    if val is None or val == "":
        return "NULL"
    n = round(float(val), 4)
    if n == int(n):
        return str(int(n))
    return str(n)


def sql_int(val) -> str:
    if val is None or val == "":
        return "0"
    return str(int(float(val)))


def charger_historique(data: dict) -> dict:
    if not HISTORIQUE.exists():
        print("⚠ salfa_historique.json absent : génération limitée à 2026.")
        return data
    hist = json.loads(HISTORIQUE.read_text(encoding="utf-8"))
    employes = list(data["employes"])
    par_matricule = {int(e["numero_matricule"]): e for e in employes}
    prochain_id = max(int(e["id"]) for e in employes)
    for ancien in hist.get("employes", []):
        mat = int(ancien["numero_matricule"])
        if mat in par_matricule:
            continue
        prochain_id += 1
        fiche = dict(
            id=prochain_id,
            numero_matricule=mat,
            nom_prenoms=ancien.get("nom_prenoms", ""),
            numero_cnaps=ancien.get("numero_cnaps", ""),
            categorie=ancien.get("categorie", ""),
            jobs=ancien.get("jobs", ""),
            date_embauche=ancien.get("date_embauche", ""),
            nombre_annees=ancien.get("nombre_annees", 0),
            enfant_a_charge=ancien.get("enfant_a_charge", 0),
            base_aj=ancien.get("base_aj", 0),
            logement_transport=ancien.get("logement_transport", 0),
            rendement=ancien.get("rendement", 0),
            responsabilite_representation=ancien.get("responsabilite_representation", 0),
            rib=ancien.get("rib", ""),
            mode_paiement=ancien.get("mode_paiement", "ESPECES"),
            actif=0,
            conge_maternite=0,
        )
        employes.append(fiche)
        par_matricule[mat] = fiche

    prochain_paie = max(int(p["id"]) for p in data["paies"])
    paies_hist = []
    for p in hist.get("paies", []):
        prochain_paie += 1
        ligne = dict(p)
        ligne["id"] = prochain_paie
        ligne["employe_id"] = int(par_matricule[int(p["numero_matricule"])]["id"])
        paies_hist.append(ligne)

    data["employes"] = employes
    data["paies"] = list(data["paies"]) + paies_hist

    if CONGES_HISTORIQUE.exists():
        conges_hist_doc = json.loads(CONGES_HISTORIQUE.read_text(encoding="utf-8"))
        conges_actuels = list(data.get("conges") or [])
        prochain_conge = max((int(c["id"]) for c in conges_actuels), default=0)
        for c in conges_hist_doc.get("conges", []):
            mat = int(c.get("numero_matricule") or 0)
            if mat not in par_matricule:
                continue
            prochain_conge += 1
            fiche_conge = dict(c)
            fiche_conge["id"] = prochain_conge
            fiche_conge["employe_id"] = int(par_matricule[mat]["id"])
            conges_actuels.append(fiche_conge)
        data["conges"] = conges_actuels

    annees = sorted({int(p["annee"]) for p in data["paies"]})
    data.setdefault("meta", {})["annees_importees"] = annees
    data["meta"]["source_historique"] = hist.get("source", "SALAIRE SALFA 2022-2025")
    data["meta"]["conges_version"] = "controle-2026-10"
    data["meta"]["conges_loi_3ans"] = 3
    return data


def main() -> None:
    data = charger_historique(json.loads(SOURCE.read_text(encoding="utf-8")))
    employes = data.get("employes") or []
    paies = data.get("paies") or []
    comparaison_net = data.get("comparaison_net") or []
    conges = data.get("conges") or []
    meta = data.get("meta") or {}

    # Contrôles d'intégrité relationnelle équivalents à validStore()
    ids_emp, mats = set(), set()
    for e in employes:
        assert int(e["id"]) > 0 and int(e["numero_matricule"]) > 0
        assert e["id"] not in ids_emp and e["numero_matricule"] not in mats
        ids_emp.add(e["id"])
        mats.add(e["numero_matricule"])
    ids_paie, periodes, par_annee = set(), set(), {}
    for p in paies:
        assert int(p["id"]) > 0 and int(p["employe_id"]) in ids_emp
        assert p["id"] not in ids_paie
        cle = (p["employe_id"], p["annee"], str(p["mois"]).upper())
        assert cle not in periodes, f"doublon {cle}"
        ids_paie.add(p["id"])
        periodes.add(cle)
        par_annee[p["annee"]] = par_annee.get(p["annee"], 0) + 1
    ids_conge = set()
    for c in conges:
        assert int(c["id"]) > 0 and int(c["employe_id"]) in ids_emp
        assert c["id"] not in ids_conge
        ids_conge.add(c["id"])

    detail_annees = ", ".join(f"{a} : {n}" for a, n in sorted(par_annee.items()))

    lignes = [
        "-- ============================================================================",
        "-- SALFA TANAMBAO — Base relationnelle complète MySQL (version WAMP)",
        "-- ============================================================================",
        "-- Structure : 100 % relationnelle en colonnes et lignes (AUCUN JSON dans MySQL)",
        f"-- Contenu : {len(employes)} salariés, {len(paies)} bulletins de paie ({detail_annees}),",
        f"--           {len(comparaison_net)} comparaisons de net, {len(conges)} fiches de congé/permission.",
        "-- Comptes par défaut inclus dans `salfa_users` :",
        "--   * admin / admin123 (Administrateur)",
        "--   * comptable / comptable123 (Comptable)",
        "-- ============================================================================",
        "",
        "SET NAMES utf8mb4;",
        "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
        "",
        "CREATE DATABASE IF NOT EXISTS `salfa_paie` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "USE `salfa_paie`;",
        "",
        "-- Suppression de l'ancienne table JSON si elle existait",
        "DROP TABLE IF EXISTS `salfa_state`;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_users` (",
        "  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,",
        "  `username` VARCHAR(80) NOT NULL UNIQUE,",
        "  `nom_complet` VARCHAR(160) NOT NULL,",
        "  `role` VARCHAR(32) NOT NULL,",
        "  `actif` TINYINT NOT NULL DEFAULT 1,",
        "  `password_hash` VARCHAR(255) NOT NULL",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_revision` (",
        "  `id` TINYINT NOT NULL PRIMARY KEY,",
        "  `revision` BIGINT NOT NULL DEFAULT 1,",
        "  `source_file` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2026.xlsm',",
        "  `entreprise` VARCHAR(160) NOT NULL DEFAULT 'SALFA TANAMBAO',",
        "  `titre` VARCHAR(255) NOT NULL DEFAULT 'FILAZANA NY KARAMA SY NY TOA AZY ISAM-BATAN''OLONA (Bulletin de paie individuel)',",
        "  `annee` INT NOT NULL DEFAULT 2026,",
        "  `source_version` VARCHAR(60) NOT NULL DEFAULT 'classeur-2026-10',",
        "  `source_historique` VARCHAR(160) NOT NULL DEFAULT 'SALAIRE SALFA 2022-2025',",
        "  `conges_version` VARCHAR(60) NOT NULL DEFAULT 'controle-2026-10',",
        "  `conges_loi_3ans` INT NOT NULL DEFAULT 3,",
        "  `date_modification` VARCHAR(32) NOT NULL DEFAULT ''",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_employes` (",
        "  `id` INT NOT NULL PRIMARY KEY,",
        "  `numero_matricule` INT NOT NULL UNIQUE,",
        "  `nom_prenoms` VARCHAR(160) NOT NULL,",
        "  `numero_cnaps` VARCHAR(60) NOT NULL DEFAULT '',",
        "  `categorie` VARCHAR(32) NOT NULL DEFAULT '',",
        "  `jobs` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `date_embauche` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `nombre_annees` INT NOT NULL DEFAULT 0,",
        "  `enfant_a_charge` INT NOT NULL DEFAULT 0,",
        "  `base_aj` DOUBLE NOT NULL DEFAULT 0,",
        "  `logement_transport` DOUBLE NOT NULL DEFAULT 0,",
        "  `rendement` DOUBLE NOT NULL DEFAULT 0,",
        "  `responsabilite_representation` DOUBLE NOT NULL DEFAULT 0,",
        "  `rib` VARCHAR(80) NOT NULL DEFAULT '',",
        "  `mode_paiement` VARCHAR(32) NOT NULL DEFAULT 'ESPECES',",
        "  `actif` TINYINT NOT NULL DEFAULT 1,",
        "  `date_inactif` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `conge_maternite` TINYINT NOT NULL DEFAULT 0,",
        "  `date_debut_maternite` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `date_creation` VARCHAR(32) NOT NULL DEFAULT ''",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_paies` (",
        "  `id` INT NOT NULL PRIMARY KEY,",
        "  `employe_id` INT NOT NULL,",
        "  `numero_matricule` INT NOT NULL,",
        "  `annee` INT NOT NULL,",
        "  `mois` VARCHAR(20) NOT NULL,",
        "  `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `numero_cnaps` VARCHAR(60) NOT NULL DEFAULT '',",
        "  `categorie` VARCHAR(32) NOT NULL DEFAULT '',",
        "  `jobs` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `date_embauche` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `nombre_annees` INT NOT NULL DEFAULT 0,",
        "  `enfant_a_charge` INT NOT NULL DEFAULT 0,",
        "  `base_aj` DOUBLE NOT NULL DEFAULT 0,",
        "  `logt_trsp` DOUBLE NOT NULL DEFAULT 0,",
        "  `rendement` DOUBLE NOT NULL DEFAULT 0,",
        "  `resp_repres` DOUBLE NOT NULL DEFAULT 0,",
        "  `salaire_brut` DOUBLE NOT NULL DEFAULT 0,",
        "  `cnaps` DOUBLE NOT NULL DEFAULT 0,",
        "  `patronal` DOUBLE NOT NULL DEFAULT 0,",
        "  `salaire_imposable` DOUBLE NOT NULL DEFAULT 0,",
        "  `irsa` DOUBLE NOT NULL DEFAULT 0,",
        "  `salaire_net` DOUBLE NOT NULL DEFAULT 0,",
        "  `augmentation_divers` DOUBLE NOT NULL DEFAULT 0,",
        "  `prime_de_garde` DOUBLE NOT NULL DEFAULT 0,",
        "  `anciennete2` DOUBLE NOT NULL DEFAULT 0,",
        "  `risque` DOUBLE NOT NULL DEFAULT 0,",
        "  `repr_rec` DOUBLE NOT NULL DEFAULT 0,",
        "  `accessoir` DOUBLE NOT NULL DEFAULT 0,",
        "  `brut` DOUBLE NOT NULL DEFAULT 0,",
        "  `avance` DOUBLE NOT NULL DEFAULT 0,",
        "  `med` DOUBLE NOT NULL DEFAULT 0,",
        "  `net` DOUBLE NOT NULL DEFAULT 0,",
        "  `virement` DOUBLE NULL DEFAULT NULL,",
        "  `especes` DOUBLE NULL DEFAULT NULL,",
        "  `rap` TINYINT NOT NULL DEFAULT 1,",
        "  `rib` VARCHAR(80) NOT NULL DEFAULT '',",
        "  `verrouille` TINYINT NOT NULL DEFAULT 0,",
        "  `conge_maternite` TINYINT NOT NULL DEFAULT 0,",
        "  `date_debut_maternite` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `date_modification` VARCHAR(32) NOT NULL DEFAULT '',",
        "  UNIQUE KEY `uq_paie_periode` (`employe_id`, `annee`, `mois`),",
        "  KEY `idx_paie_annee_mois` (`annee`, `mois`)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_conges` (",
        "  `id` INT NOT NULL PRIMARY KEY,",
        "  `employe_id` INT NOT NULL,",
        "  `numero_matricule` INT NOT NULL DEFAULT 0,",
        "  `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `fonction` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `service` VARCHAR(120) NOT NULL DEFAULT '',",
        "  `contact` VARCHAR(120) NOT NULL DEFAULT '',",
        "  `categorie` VARCHAR(32) NOT NULL DEFAULT 'CONGE',",
        "  `motif_code` VARCHAR(40) NOT NULL DEFAULT '',",
        "  `motif_libelle` VARCHAR(255) NOT NULL DEFAULT '',",
        "  `imputation` VARCHAR(32) NOT NULL DEFAULT 'CONGE',",
        "  `annee` INT NOT NULL,",
        "  `date_demande` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `date_debut` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `heure_debut` VARCHAR(16) NOT NULL DEFAULT '',",
        "  `date_fin` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `date_retour` VARCHAR(20) NOT NULL DEFAULT '',",
        "  `heure_fin` VARCHAR(16) NOT NULL DEFAULT '',",
        "  `jours_demandes` DOUBLE NOT NULL DEFAULT 0,",
        "  `jours_valides` DOUBLE NULL DEFAULT NULL,",
        "  `remplacant` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `titre_periode` VARCHAR(80) NOT NULL DEFAULT '',",
        "  `justificatif` VARCHAR(255) NOT NULL DEFAULT '',",
        "  `observations` TEXT NOT NULL,",
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
        "  KEY `idx_conge_employe_annee` (`employe_id`, `annee`)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_comparaison_net` (",
        "  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,",
        "  `numero_matricule` INT NOT NULL,",
        "  `nom_prenoms` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `categorie` VARCHAR(32) NOT NULL DEFAULT '',",
        "  `jobs` VARCHAR(160) NOT NULL DEFAULT '',",
        "  `net_actuel` DOUBLE NOT NULL DEFAULT 0,",
        "  `net_avant` DOUBLE NOT NULL DEFAULT 0,",
        "  `ecart` DOUBLE NOT NULL DEFAULT 0,",
        "  KEY `idx_comp_matricule` (`numero_matricule`)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_config` (",
        "  `id` TINYINT NOT NULL PRIMARY KEY,",
        "  `configuree` TINYINT NOT NULL DEFAULT 0,",
        "  `cnaps_salariale` DOUBLE NOT NULL DEFAULT 1.0,",
        "  `cnaps_patronale` DOUBLE NOT NULL DEFAULT 13.0,",
        "  `deduction_enfant` DOUBLE NOT NULL DEFAULT 2000,",
        "  `min_irsa` DOUBLE NOT NULL DEFAULT 3000,",
        "  `arrondi_irsa_base` INT NOT NULL DEFAULT 100,",
        "  `arrondi_net` INT NOT NULL DEFAULT 100,",
        "  `plafond_especes` DOUBLE NOT NULL DEFAULT 5000,",
        "  `taux_maternite` DOUBLE NOT NULL DEFAULT 50,",
        "  `duree_maternite_mois` INT NOT NULL DEFAULT 3,",
        "  `jours_conge_par_an` DOUBLE NOT NULL DEFAULT 30,",
        "  `nb_annees_cumul` INT NOT NULL DEFAULT 3,",
        "  `plafond_cumul_conge` DOUBLE NOT NULL DEFAULT 30,",
        "  `jours_permission_par_an` DOUBLE NOT NULL DEFAULT 10,",
        "  `report_autorise` TINYINT NOT NULL DEFAULT 0,",
        "  `exclure_dimanche` TINYINT NOT NULL DEFAULT 0,",
        "  `exclure_samedi` TINYINT NOT NULL DEFAULT 0,",
        "  `jours_feries` TEXT NOT NULL,",
        "  `examen_sur_permission` TINYINT NOT NULL DEFAULT 0,",
        "  `bloquer_depassement` TINYINT NOT NULL DEFAULT 1,",
        "  `version_calendrier` INT NOT NULL DEFAULT 3,",
        "  `icone_app` LONGTEXT NULL",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_bareme_anciennete` (",
        "  `ordre` INT NOT NULL PRIMARY KEY,",
        "  `annees_min` INT NOT NULL,",
        "  `annees_max` INT NOT NULL,",
        "  `indice` DOUBLE NOT NULL,",
        "  `description` VARCHAR(60) NOT NULL DEFAULT ''",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_bareme_irsa` (",
        "  `ordre` INT NOT NULL PRIMARY KEY,",
        "  `seuil_min` DOUBLE NOT NULL,",
        "  `seuil_max` DOUBLE NULL DEFAULT NULL,",
        "  `taux` DOUBLE NOT NULL",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "CREATE TABLE IF NOT EXISTS `salfa_entete` (",
        "  `id` TINYINT NOT NULL PRIMARY KEY,",
        "  `configuree` TINYINT NOT NULL DEFAULT 0,",
        "  `mode` VARCHAR(20) NOT NULL DEFAULT 'image',",
        "  `ligne_1` VARCHAR(255) NOT NULL DEFAULT 'FIANGONANA LOTERANA MALAGASY',",
        "  `ligne_2` VARCHAR(255) NOT NULL DEFAULT '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',",
        "  `ligne_3` VARCHAR(255) NOT NULL DEFAULT 'SAMPAN''ASA LOTERANA MOMBA NY FAHASALAMANA',",
        "  `ligne_4` VARCHAR(255) NOT NULL DEFAULT 'DEPARTEMENT DE SANTE – HEALTH DEPARTMENT',",
        "  `ligne_5` VARCHAR(255) NOT NULL DEFAULT 'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA BP: 99 Tél:94 416 56',",
        "  `ligne_6` VARCHAR(255) NOT NULL DEFAULT 'NIF: 5000767080    STAT: 851 125 120 120 001 36',",
        "  `ligne_7` VARCHAR(255) NOT NULL DEFAULT 'E-mail: salfa.tulear@moov.mg',",
        "  `image_finale` LONGTEXT NULL,",
        "  `image_complete` LONGTEXT NULL,",
        "  `logo_gauche` LONGTEXT NULL,",
        "  `logo_droite` LONGTEXT NULL",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
        "",
        "-- ============================================================================",
        "-- 1. Utilisateurs par défaut (INSERT IGNORE : conserve les comptes déjà créés)",
        "-- ============================================================================",
        "INSERT IGNORE INTO `salfa_users` (`id`, `username`, `nom_complet`, `role`, `actif`, `password_hash`) VALUES",
        f"  (1, 'admin', 'Administrateur Principal SALFA', 'Administrateur', 1, '{HASH_ADMIN}'),",
        f"  (2, 'comptable', 'Comptable Clinique SALFA', 'Comptable', 1, '{HASH_COMPTABLE}');",
        "",
        "START TRANSACTION;",
        "",
        "-- ============================================================================",
        "-- 2. Paramètres, barèmes et métadonnées de révision",
        "-- ============================================================================",
        "INSERT IGNORE INTO `salfa_config` (`id`, `configuree`, `jours_feries`) VALUES (1, 0, '');",
        "INSERT IGNORE INTO `salfa_entete` (`id`, `configuree`) VALUES (1, 0), (2, 0);",
        "",
        "DELETE FROM `salfa_bareme_anciennete`;",
        "INSERT INTO `salfa_bareme_anciennete` (`ordre`, `annees_min`, `annees_max`, `indice`, `description`) VALUES",
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
        "",
        "DELETE FROM `salfa_bareme_irsa`;",
        "INSERT INTO `salfa_bareme_irsa` (`ordre`, `seuil_min`, `seuil_max`, `taux`) VALUES",
        "  (1, 0, 350000, 0),",
        "  (2, 350000, 400000, 5),",
        "  (3, 400000, 500000, 10),",
        "  (4, 500000, 600000, 15),",
        "  (5, 600000, NULL, 20);",
        "",
        "INSERT INTO `salfa_revision` (`id`, `revision`, `source_file`, `entreprise`, `titre`, `annee`, `source_version`, `source_historique`, `conges_version`, `conges_loi_3ans`, `date_modification`) VALUES",
        f"  (1, 1, {sql_str(meta.get('source_file', 'SALAIRE SALFA 2026.xlsm'), 160)}, {sql_str(meta.get('entreprise', 'SALFA TANAMBAO'), 160)}, {sql_str(meta.get('titre', 'Bulletin de paie individuel'), 255)}, {sql_int(meta.get('annee', 2026))}, 'classeur-2026-10', {sql_str(meta.get('source_historique', 'SALAIRE SALFA 2022-2025'), 160)}, 'controle-2026-10', 3, NOW())",
        "ON DUPLICATE KEY UPDATE",
        "  `revision` = `revision` + 1,",
        "  `source_version` = VALUES(`source_version`),",
        "  `source_historique` = VALUES(`source_historique`),",
        "  `conges_version` = VALUES(`conges_version`),",
        "  `conges_loi_3ans` = VALUES(`conges_loi_3ans`),",
        "  `date_modification` = NOW();",
        "",
        "-- ============================================================================",
        f"-- 3. Personnel SALFA ({len(employes)} salariés : 1 ligne = 1 salarié)",
        "-- ============================================================================",
        "DELETE FROM `salfa_employes`;",
        "INSERT INTO `salfa_employes` (",
        "  `id`, `numero_matricule`, `nom_prenoms`, `numero_cnaps`, `categorie`, `jobs`,",
        "  `date_embauche`, `nombre_annees`, `enfant_a_charge`, `base_aj`, `logement_transport`,",
        "  `rendement`, `responsabilite_representation`, `rib`, `mode_paiement`, `actif`,",
        "  `date_inactif`, `conge_maternite`, `date_debut_maternite`, `date_creation`",
        ") VALUES",
    ]

    for idx, e in enumerate(employes):
        fin = ";" if idx == len(employes) - 1 else ","
        lignes.append(
            f"  ({sql_int(e['id'])}, {sql_int(e['numero_matricule'])}, {sql_str(e.get('nom_prenoms', ''), 160)}, "
            f"{sql_str(e.get('numero_cnaps', ''), 60)}, {sql_str(e.get('categorie', ''), 32)}, {sql_str(e.get('jobs', ''), 160)}, "
            f"{sql_str(e.get('date_embauche', ''), 20)}, {sql_int(e.get('nombre_annees', 0))}, {sql_int(e.get('enfant_a_charge', 0))}, "
            f"{sql_num(e.get('base_aj', 0))}, {sql_num(e.get('logement_transport', 0))}, {sql_num(e.get('rendement', 0))}, "
            f"{sql_num(e.get('responsabilite_representation', 0))}, {sql_str(e.get('rib', ''), 80)}, "
            f"{sql_str(e.get('mode_paiement', 'ESPECES'), 32)}, {1 if e.get('actif') else 0}, "
            f"{sql_str(e.get('date_inactif', ''), 20)}, {1 if e.get('conge_maternite') else 0}, "
            f"{sql_str(e.get('date_debut_maternite', ''), 20)}, {sql_str(e.get('date_creation', ''), 32)}){fin}"
        )

    lignes.extend([
        "",
        "-- ============================================================================",
        f"-- 4. Bulletins de paie 2022–2026 ({len(paies)} lignes : 1 ligne = 1 bulletin)",
        "-- ============================================================================",
        "DELETE FROM `salfa_paies`;",
    ])

    lot_paies = 150
    for offset in range(0, len(paies), lot_paies):
        lot = paies[offset : offset + lot_paies]
        lignes.extend([
            "INSERT INTO `salfa_paies` (",
            "  `id`, `employe_id`, `numero_matricule`, `annee`, `mois`, `nom_prenoms`, `numero_cnaps`,",
            "  `categorie`, `jobs`, `date_embauche`, `nombre_annees`, `enfant_a_charge`, `base_aj`,",
            "  `logt_trsp`, `rendement`, `resp_repres`, `salaire_brut`, `cnaps`, `patronal`,",
            "  `salaire_imposable`, `irsa`, `salaire_net`, `augmentation_divers`, `prime_de_garde`,",
            "  `anciennete2`, `risque`, `repr_rec`, `accessoir`, `brut`, `avance`, `med`, `net`,",
            "  `virement`, `especes`, `rap`, `rib`, `verrouille`, `conge_maternite`,",
            "  `date_debut_maternite`, `date_modification`",
            ") VALUES",
        ])
        for idx, p in enumerate(lot):
            fin = ";" if idx == len(lot) - 1 else ","
            rap_val = 0 if p.get("rap") == 0 else 1
            lignes.append(
                f"  ({sql_int(p['id'])}, {sql_int(p['employe_id'])}, {sql_int(p['numero_matricule'])}, "
                f"{sql_int(p['annee'])}, {sql_str(str(p.get('mois', '')).upper(), 20)}, {sql_str(p.get('nom_prenoms', ''), 160)}, "
                f"{sql_str(p.get('numero_cnaps', ''), 60)}, {sql_str(p.get('categorie', ''), 32)}, {sql_str(p.get('jobs', ''), 160)}, "
                f"{sql_str(p.get('date_embauche', ''), 20)}, {sql_int(p.get('nombre_annees', 0))}, {sql_int(p.get('enfant_a_charge', 0))}, "
                f"{sql_num(p.get('base_aj', 0))}, {sql_num(p.get('logt_trsp', 0))}, {sql_num(p.get('rendement', 0))}, "
                f"{sql_num(p.get('resp_repres', 0))}, {sql_num(p.get('salaire_brut', 0))}, {sql_num(p.get('cnaps', 0))}, "
                f"{sql_num(p.get('patronal', 0))}, {sql_num(p.get('salaire_imposable', 0))}, {sql_num(p.get('irsa', 0))}, "
                f"{sql_num(p.get('salaire_net', 0))}, {sql_num(p.get('augmentation_divers', 0))}, {sql_num(p.get('prime_de_garde', 0))}, "
                f"{sql_num(p.get('anciennete2', 0))}, {sql_num(p.get('risque', 0))}, {sql_num(p.get('repr_rec', 0))}, "
                f"{sql_num(p.get('accessoir', 0))}, {sql_num(p.get('brut', 0))}, {sql_num(p.get('avance', 0))}, "
                f"{sql_num(p.get('med', 0))}, {sql_num(p.get('net', 0))}, {sql_num(p.get('virement'))}, "
                f"{sql_num(p.get('especes'))}, {rap_val}, {sql_str(p.get('rib', ''), 80)}, "
                f"{1 if p.get('verrouille') else 0}, {1 if p.get('conge_maternite') else 0}, "
                f"{sql_str(p.get('date_debut_maternite', ''), 20)}, {sql_str(p.get('date_modification', ''), 32)}){fin}"
            )
        lignes.append("")

    lignes.extend([
        "-- ============================================================================",
        f"-- 5. Comparaison des salaires nets ({len(comparaison_net)} lignes)",
        "-- ============================================================================",
        "DELETE FROM `salfa_comparaison_net`;",
    ])
    if comparaison_net:
        lignes.append(
            "INSERT INTO `salfa_comparaison_net` (`id`, `numero_matricule`, `nom_prenoms`, `categorie`, `jobs`, `net_actuel`, `net_avant`, `ecart`) VALUES"
        )
        for idx, c in enumerate(comparaison_net):
            fin = ";" if idx == len(comparaison_net) - 1 else ","
            cid = int(c.get("id") or (idx + 1))
            lignes.append(
                f"  ({cid}, {sql_int(c.get('numero_matricule', 0))}, {sql_str(c.get('nom_prenoms', ''), 160)}, "
                f"{sql_str(c.get('categorie', ''), 32)}, {sql_str(c.get('jobs', ''), 160)}, "
                f"{sql_num(c.get('net_actuel', 0))}, {sql_num(c.get('net_avant', 0))}, {sql_num(c.get('ecart', 0))}){fin}"
            )
        lignes.append("")

    lignes.extend([
        "-- ============================================================================",
        f"-- 6. Fiches de congés et permissions ({len(conges)} lignes : 1 ligne = 1 absence)",
        "-- ============================================================================",
        "DELETE FROM `salfa_conges`;",
    ])
    lot_conges = 100
    for offset in range(0, len(conges), lot_conges):
        lot = conges[offset : offset + lot_conges]
        lignes.extend([
            "INSERT INTO `salfa_conges` (",
            "  `id`, `employe_id`, `numero_matricule`, `nom_prenoms`, `fonction`, `service`, `contact`,",
            "  `categorie`, `motif_code`, `motif_libelle`, `imputation`, `annee`, `date_demande`,",
            "  `date_debut`, `heure_debut`, `date_fin`, `date_retour`, `heure_fin`, `jours_demandes`,",
            "  `jours_valides`, `remplacant`, `titre_periode`, `justificatif`, `observations`, `statut`,",
            "  `visa_chef_par`, `visa_chef_le`, `visa_medecin_par`, `visa_medecin_le`,",
            "  `visa_gestionnaire_par`, `visa_gestionnaire_le`, `motif_refus`, `ajustement_type`,",
            "  `saisie_par`, `date_saisie`, `date_modification`",
            ") VALUES",
        ])
        for idx, c in enumerate(lot):
            fin = ";" if idx == len(lot) - 1 else ","
            lignes.append(
                f"  ({sql_int(c['id'])}, {sql_int(c['employe_id'])}, {sql_int(c.get('numero_matricule', 0))}, "
                f"{sql_str(c.get('nom_prenoms', ''), 160)}, {sql_str(c.get('fonction', ''), 160)}, {sql_str(c.get('service', ''), 120)}, "
                f"{sql_str(c.get('contact', ''), 120)}, {sql_str(c.get('categorie', 'CONGE'), 32)}, {sql_str(c.get('motif_code', ''), 40)}, "
                f"{sql_str(c.get('motif_libelle', ''), 255)}, {sql_str(c.get('imputation', 'CONGE'), 32)}, {sql_int(c.get('annee', 2026))}, "
                f"{sql_str(c.get('date_demande', ''), 20)}, {sql_str(c.get('date_debut', ''), 20)}, {sql_str(c.get('heure_debut', ''), 16)}, "
                f"{sql_str(c.get('date_fin', ''), 20)}, {sql_str(c.get('date_retour', ''), 20)}, {sql_str(c.get('heure_fin', ''), 16)}, "
                f"{sql_num(c.get('jours_demandes', 0))}, {sql_num(c.get('jours_valides'))}, {sql_str(c.get('remplacant', ''), 160)}, "
                f"{sql_str(c.get('titre_periode', ''), 80)}, {sql_str(c.get('justificatif', ''), 255)}, {sql_str(c.get('observations', ''))}, "
                f"{sql_str(c.get('statut', 'VALIDE'), 32)}, {sql_str(c.get('visa_chef_par', ''), 120)}, {sql_str(c.get('visa_chef_le', ''), 32)}, "
                f"{sql_str(c.get('visa_medecin_par', ''), 120)}, {sql_str(c.get('visa_medecin_le', ''), 32)}, "
                f"{sql_str(c.get('visa_gestionnaire_par', ''), 120)}, {sql_str(c.get('visa_gestionnaire_le', ''), 32)}, "
                f"{sql_str(c.get('motif_refus', ''), 255)}, {sql_str(c.get('ajustement_type', ''), 32)}, "
                f"{sql_str(c.get('saisie_par', ''), 80)}, {sql_str(c.get('date_saisie', ''), 32)}, {sql_str(c.get('date_modification', ''), 32)}){fin}"
            )
        lignes.append("")

    lignes.extend([
        "COMMIT;",
        "",
    ])

    sql_text = "\n".join(lignes)
    assert "store_json" not in sql_text, "Aucune colonne store_json ne doit figurer dans le SQL"
    assert "JSON_SET" not in sql_text, "Aucune fonction JSON ne doit figurer dans le SQL"

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(sql_text, encoding="utf-8")
    print(
        f"Écrit {DEST.relative_to(ROOT)} ({DEST.stat().st_size:,} octets, "
        f"{len(employes)} salariés, {len(paies)} paies, {len(conges)} congés, utilisateurs par défaut inclus)."
    )


if __name__ == "__main__":
    main()
