"""Génère le fichier SQL d'import MySQL (version WAMP) depuis les données Excel.

Sources :
- src/data/salfa_data.json (classeur « SALAIRE SALFA 2026.xlsm », extrait par
  scripts/extract_salfa.py) : salariés actuels, paies 2026, congés ;
- src/data/salfa_historique.json (classeurs 2022 à 2025, extraits par
  scripts/extract_historique.py) : paies historiques et salariés partis depuis.

Le fichier produit, wamp/sql/salfa_donnees_excel_2022-2026.sql, s'importe dans
phpMyAdmin ou avec le client mysql : il crée les tables de l'application si
besoin, puis charge toutes les données dans la ligne unique `salfa_state`
(le format réellement lu par wamp/api/index.php). Les salariés uniquement
présents dans les anciens classeurs sont ajoutés en `actif = 0` (archive) ;
la fiche des salariés actuels reste celle de 2026.

Les comptes utilisateurs ne sont JAMAIS inclus : aucun mot de passe ne figure
dans le SQL. Les comptes se créent sur le serveur avec wamp/setup.php (premier
administrateur) puis wamp/CREER-COMPTE.php.

Usage : python3 scripts/generer_sql_wamp.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "data" / "salfa_data.json"
HISTORIQUE = ROOT / "src" / "data" / "salfa_historique.json"
DEST = ROOT / "wamp" / "sql" / "salfa_donnees_excel_2022-2026.sql"
TAILLE_MORCEAU = 100_000  # caractères JSON par instruction (limites d'import)


def sql_literal(texte: str) -> str:
    """Littéral MySQL : on double les apostrophes (aucune barre oblique dans le JSON)."""
    assert "\\" not in texte, "barre oblique inattendue dans le JSON à exporter"
    return "'" + texte.replace("'", "''") + "'"


def charger_historique(data: dict) -> dict:
    """Fusionne les paies 2022-2025 et les anciens salariés dans les données 2026."""
    if not HISTORIQUE.exists():
        print("⚠ salfa_historique.json absent : génération limitée à 2026 "
              "(lancer d'abord scripts/extract_historique.py).")
        return data
    hist = json.loads(HISTORIQUE.read_text(encoding="utf-8"))
    employes = list(data["employes"])
    par_matricule = {int(e["numero_matricule"]): e for e in employes}
    prochain_id = max(int(e["id"]) for e in employes)
    for ancien in hist.get("employes", []):
        mat = int(ancien["numero_matricule"])
        if mat in par_matricule:
            continue  # la fiche 2026 (ou la plus récente) fait foi
        prochain_id += 1
        fiche = dict(id=prochain_id, numero_matricule=mat,
                     nom_prenoms=ancien.get("nom_prenoms", ""),
                     numero_cnaps=ancien.get("numero_cnaps", ""),
                     categorie=ancien.get("categorie", ""), jobs=ancien.get("jobs", ""),
                     date_embauche=ancien.get("date_embauche", ""),
                     nombre_annees=ancien.get("nombre_annees", 0),
                     enfant_a_charge=ancien.get("enfant_a_charge", 0),
                     base_aj=ancien.get("base_aj", 0),
                     logement_transport=ancien.get("logement_transport", 0),
                     rendement=ancien.get("rendement", 0),
                     responsabilite_representation=ancien.get("responsabilite_representation", 0),
                     rib=ancien.get("rib", ""),
                     mode_paiement=ancien.get("mode_paiement", "ESPECES"),
                     actif=0, conge_maternite=0)  # archive historique
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
    annees = sorted({int(p["annee"]) for p in data["paies"]})
    data.setdefault("meta", {})["annees_importees"] = annees
    data["meta"]["source_historique"] = hist.get("source", "SALAIRE SALFA 2022-2025")
    return data


def main() -> None:
    data = charger_historique(json.loads(SOURCE.read_text(encoding="utf-8")))

    store = {
        "meta": data.get("meta") or {},
        "bareme_anciennete": data.get("bareme_anciennete") or {},
        "employes": data.get("employes") or [],
        "paies": data.get("paies") or [],
        "comparaison_net": data.get("comparaison_net") or [],
        "conges": data.get("conges") or [],
        # Les comptes vivent dans la table salfa_users, jamais dans ce fichier.
        "utilisateurs": [],
    }

    # Contrôles de cohérence équivalents à wamp/api/validation.php (validStore).
    ids_emp, mats = set(), set()
    for e in store["employes"]:
        assert int(e["id"]) > 0 and int(e["numero_matricule"]) > 0
        assert e["id"] not in ids_emp and e["numero_matricule"] not in mats
        ids_emp.add(e["id"])
        mats.add(e["numero_matricule"])
    ids_paie, periodes = set(), set()
    par_annee = {}
    for p in store["paies"]:
        assert int(p["id"]) > 0 and int(p["employe_id"]) in ids_emp
        assert p["id"] not in ids_paie
        cle = (p["employe_id"], p["annee"], str(p["mois"]).upper())
        assert cle not in periodes, f"doublon {cle}"
        ids_paie.add(p["id"])
        periodes.add(cle)
        par_annee[p["annee"]] = par_annee.get(p["annee"], 0) + 1
    ids_conge = set()
    for c in store["conges"]:
        assert int(c["id"]) > 0 and int(c["employe_id"]) in ids_emp
        assert c["id"] not in ids_conge
        ids_conge.add(c["id"])

    payload = json.dumps(store, ensure_ascii=False, separators=(",", ":"))
    # Découper le JSON BRUT puis échapper chaque morceau : la concaténation des
    # littéraux redonne exactement le JSON d'origine.
    morceaux = [payload[i : i + TAILLE_MORCEAU] for i in range(0, len(payload), TAILLE_MORCEAU)]
    detail_annees = ", ".join(f"{a} : {n}" for a, n in sorted(par_annee.items()))

    lignes = [
        "-- ============================================================================",
        "-- SALFA TANAMBAO — Données Excel pour MySQL (version WAMP)",
        "-- ============================================================================",
        "-- Sources : classeurs « SALAIRE SALFA 2022.xlsx », « SALAIRE SALFA 2023.xlsm »,",
        "-- « SALAIRE SALFA 2024.xlsm », « SALAIRE SALFA 2025.xlsm » (janvier a mai) et",
        "-- « SALAIRE SALFA 2026.xlsm » (janvier a octobre), extraits dans",
        "-- src/data/salfa_data.json et src/data/salfa_historique.json. Régénérer avec :",
        "--   python3 scripts/extract_historique.py && python3 scripts/generer_sql_wamp.py",
        "--",
        f"-- Contenu : {len(store['employes'])} salariés, {len(store['paies'])} lignes de paie",
        f"-- ({detail_annees}),",
        f"-- {len(store['comparaison_net'])} comparaisons de net, {len(store['conges'])} fiches d'absence/congés.",
        "-- Les salariés uniquement présents dans les anciens classeurs sont en",
        "-- actif = 0 (archive) ; un doublon Excel (sept. 2023, matricule 39) a été",
        "-- écarté, première ligne conservée.",
        "--",
        "-- IMPORT (phpMyAdmin) : sélectionner la base « salfa_paie », onglet",
        "-- « Importer », choisir ce fichier, « Exécuter ». Ou en ligne de commande :",
        "--   mysql -u salfa_app -p salfa_paie < salfa_donnees_excel_2022-2026.sql",
        "--",
        "-- ⚠ Ce fichier contient des données de paie confidentielles : ne jamais le",
        "-- copier dans C:\\wamp64\\www, ne pas le publier. Sauvegardez la base AVANT",
        "-- l'import : il REMPLACE les données de paie existantes (salfa_state) et",
        "-- remet la révision à 0 (les postes connectés doivent recharger la page).",
        "-- Les paramètres communs et l'en-tête des bulletins (config_json /",
        "-- header_json) sont réinitialisés aux valeurs par défaut de l'application.",
        "-- Les COMPTES utilisateurs (table salfa_users) ne sont ni créés ni",
        "-- modifiés par ce fichier et aucun mot de passe n'y figure : créez le",
        "-- premier administrateur avec wamp/setup.php, puis les autres comptes",
        "-- avec wamp/CREER-COMPTE.php (voir wamp/GUIDE-WAMP.md).",
        "-- ============================================================================",
        "",
        "SET NAMES utf8mb4;",
        "SET time_zone = '+00:00';",
        "",
        "CREATE DATABASE IF NOT EXISTS `salfa_paie` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "USE `salfa_paie`;",
        "",
        "-- Tables identiques à celles créées par wamp/setup.php.",
        "CREATE TABLE IF NOT EXISTS salfa_users (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE, nom_complet VARCHAR(160) NOT NULL, role VARCHAR(32) NOT NULL, actif TINYINT NOT NULL DEFAULT 1, password_hash VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS salfa_state (id TINYINT NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, store_json LONGTEXT NOT NULL, config_json LONGTEXT NULL, header_json LONGTEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "",
        "START TRANSACTION;",
        "",
        "-- Données de paie (JSON lu par l'API WAMP), chargées par morceaux.",
        f"INSERT INTO salfa_state (id, revision, store_json, config_json, header_json) VALUES (1, 0, {sql_literal(morceaux[0])}, NULL, NULL)",
        "  ON DUPLICATE KEY UPDATE revision = 0, store_json = VALUES(store_json), config_json = NULL, header_json = NULL;",
    ]
    for morceau in morceaux[1:]:
        lignes.append(f"UPDATE salfa_state SET store_json = CONCAT(store_json, {sql_literal(morceau)}) WHERE id = 1;")
    lignes += [
        "",
        "COMMIT;",
        "",
        "-- Vérification après import : JSON valide et volumes attendus.",
        "SELECT id, revision, CHAR_LENGTH(store_json) AS taille_store_json, JSON_VALID(store_json) AS json_valide FROM salfa_state;",
        f"SELECT JSON_LENGTH(store_json, '$.employes') AS employes, JSON_LENGTH(store_json, '$.paies') AS paies, JSON_LENGTH(store_json, '$.conges') AS conges FROM salfa_state WHERE id = 1;",
        "",
    ]

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text("\n".join(lignes), encoding="utf-8")
    print(
        f"{DEST.relative_to(ROOT)} : {len(store['employes'])} salariés, "
        f"{len(store['paies'])} paies ({detail_annees}), {len(store['conges'])} congés, "
        f"JSON {len(payload)} caractères en {len(morceaux)} morceaux."
    )


if __name__ == "__main__":
    main()
