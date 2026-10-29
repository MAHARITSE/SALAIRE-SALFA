"""Extrait les états de paie historiques 2022-2025 des classeurs SALAIRE SALFA.

Complète scripts/extract_salfa.py (qui ne traite que le classeur 2026).
Les classeurs anciens n'ont pas tous la même structure : la feuille 2022 n'a
pas de LISTE SALARIE, le classeur 2025 ne contient que janvier à mai, et les
colonnes changent de position d'une année à l'autre (p. ex. « N° CNaPS » et
« Patronal » absents en 2022/2023, « BASE AJ » en plus de « BASE » en 2025).
On repère donc chaque colonne par son intitulé, jamais par sa position.
Comme pour 2026, le nom de la feuille fait foi pour le mois (le titre interne
de la feuille MAI 2025 indique encore « MARS 2025 »).

Résultat : src/data/salfa_historique.json avec
- paies : toutes les lignes mensuelles 2022-2025 (sans id/employe_id) ;
- employes : les salariés présents dans ces classeurs (fiche du dernier mois
  disponible), à fusionner avec ceux de 2026 par le générateur SQL.

Usage : pip install openpyxl ; python scripts/extract_historique.py
"""

import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
FICHIERS = {
    2022: "SALAIRE SALFA 2022.xlsx",
    2023: "SALAIRE SALFA 2023.xlsm",
    2024: "SALAIRE SALFA 2024.xlsm",
    2025: "SALAIRE SALFA 2025.xlsm",
}
MOIS = ["JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET",
        "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"]

# Intitulé normalisé -> champ canonique (mêmes noms que le classeur 2026).
ENTETES = {
    "n mat": "numero_matricule", "matricule": "numero_matricule", "n": "numero_matricule",
    "nom et prenoms": "nom_prenoms", "n cnaps": "numero_cnaps",
    "cat": "categorie", "jobs": "jobs", "date emb": "date_embauche",
    "nombre d annee": "nombre_annees", "enfant a charge": "enfant_a_charge",
    "enfant": "enfant_a_charge",
    "base": "base", "base aj": "base_aj",
    "logt trsp": "logt_trsp", "rendement": "rendement",
    "resp repres": "resp_repres", "salaire brut": "salaire_brut",
    "cnaps": "cnaps", "patronal": "patronal", "salaire imp": "salaire_imposable",
    "irsa": "irsa", "salaire net": "salaire_net",
    "augmentation": "augmentation_divers", "augmentation divers": "augmentation_divers",
    "prime de garde": "prime_de_garde", "anciennete": "anciennete2",
    "risque": "risque", "repr rec": "repr_rec", "accessoir": "accessoir",
    "brut": "brut", "avance": "avance", "med": "med", "net": "net",
    "virement": "virement", "especes": "especes", "rap": "rap", "rib": "rib",
}
CHAMPS = ["numero_matricule", "nom_prenoms", "numero_cnaps", "categorie", "jobs",
          "date_embauche", "nombre_annees", "enfant_a_charge", "base_aj", "logt_trsp",
          "rendement", "resp_repres", "salaire_brut", "cnaps", "patronal",
          "salaire_imposable", "irsa", "salaire_net", "augmentation_divers",
          "prime_de_garde", "anciennete2", "risque", "repr_rec", "accessoir",
          "brut", "avance", "med", "net", "virement", "especes", "rap", "rib"]
TEXTES = {"nom_prenoms", "numero_cnaps", "categorie", "jobs", "rib"}


def normaliser(valeur) -> str:
    texte = unicodedata.normalize("NFKD", str(valeur or ""))
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", texte.lower()).strip()


MOIS_PAR_NOM = {normaliser(m): m for m in MOIS}


def convertir(champ, valeur):
    if champ == "date_embauche":
        return valeur.strftime("%Y-%m-%d") if isinstance(valeur, (date, datetime)) else ""
    if champ in TEXTES:
        return "" if valeur is None else str(valeur).strip()
    if champ in ("virement", "especes") and valeur is None:
        return None
    if champ == "rap":
        return int(bool(valeur))
    return valeur if isinstance(valeur, (int, float)) and not isinstance(valeur, bool) else 0


def extraire_feuille(ws, annee, mois):
    """Repère la ligne d'en-tête (matricule + nom) puis lit les lignes salariés."""
    lignes = list(ws.iter_rows(values_only=True))
    entete_idx, colonnes = None, {}
    for i, ligne in enumerate(lignes[:6]):
        cols = {}
        for j, cellule in enumerate(ligne):
            champ = ENTETES.get(normaliser(cellule))
            # « BRUT+AGZ1:AF2 » (sept. 2024) : la colonne BRUT reste reconnaissable.
            if champ is None and normaliser(cellule).startswith("brut") and "brut" not in cols:
                champ = "brut"
            if champ and champ not in cols:
                cols[champ] = j
        # Juillet 2024 : l'intitulé du nom est vide, le nom suit le matricule.
        if "numero_matricule" in cols and "nom_prenoms" not in cols:
            cols["nom_prenoms"] = cols["numero_matricule"] + 1
        if "numero_matricule" in cols and "nom_prenoms" in cols:
            entete_idx, colonnes = i, cols
            break
    if entete_idx is None:
        raise ValueError(f"en-tête introuvable ({annee} {mois})")
    # « BASE AJ » fait foi quand elle existe (2025), sinon « BASE ».
    if "base_aj" in colonnes:
        colonnes.pop("base", None)
    elif "base" in colonnes:
        colonnes["base_aj"] = colonnes.pop("base")

    paies = []
    for ligne in lignes[entete_idx + 1:]:
        def val(champ):
            j = colonnes.get(champ)
            return ligne[j] if j is not None and j < len(ligne) else None
        mat, nom = val("numero_matricule"), val("nom_prenoms")
        if not isinstance(mat, (int, float)) or isinstance(mat, bool):
            continue
        if not isinstance(nom, str) or not nom.strip() or "total" in normaliser(nom):
            continue
        paie = {champ: convertir(champ, val(champ)) for champ in CHAMPS}
        paie["numero_matricule"] = int(mat)
        paie.update(annee=annee, mois=mois, verrouille=0)
        paies.append(paie)
    return paies


def main():
    paies, dernier = [], {}
    for annee, nom_fichier in FICHIERS.items():
        wb = openpyxl.load_workbook(ROOT / nom_fichier, data_only=True, read_only=True)
        feuilles = {normaliser(ws.title): ws for ws in wb.worksheets}
        trouvees = []
        for nom_norm, mois in MOIS_PAR_NOM.items():
            ws = feuilles.get(nom_norm)
            if ws is None:
                continue
            lignes = extraire_feuille(ws, annee, mois)
            # Doublons d'une même période (sept. 2023, matricule 39 recopié à
            # l'identique) : l'application refuse 2 lignes par salarié/période.
            vus, uniques = {}, []
            for p in lignes:
                cle = p["numero_matricule"]
                if cle in vus:
                    print(f"  ⚠ doublon ignoré ({annee} {mois}, matricule {cle}, "
                          f"{'identique' if vus[cle] == p else 'DIFFÉRENT : première ligne conservée'})")
                    continue
                vus[cle] = p
                uniques.append(p)
            lignes = uniques
            trouvees.append(f"{mois}:{len(lignes)}")
            for p in lignes:
                dernier[p["numero_matricule"]] = p  # ordre chronologique : le dernier écrase
            paies.extend(lignes)
        print(f"{annee} ({nom_fichier}) : {', '.join(trouvees)}")

    assert len(set((p["numero_matricule"], p["annee"], p["mois"]) for p in paies)) == len(paies), "doublon matricule/période"

    employes = []
    for mat in sorted(dernier):
        p = dernier[mat]
        employes.append(dict(
            numero_matricule=mat, nom_prenoms=p["nom_prenoms"],
            numero_cnaps=p["numero_cnaps"], categorie=p["categorie"], jobs=p["jobs"],
            date_embauche=p["date_embauche"], nombre_annees=p["nombre_annees"],
            enfant_a_charge=p["enfant_a_charge"], base_aj=p["base_aj"],
            logement_transport=p["logt_trsp"], rendement=p["rendement"],
            responsabilite_representation=p["resp_repres"], rib=p["rib"],
            mode_paiement="VIREMENT" if p["rib"] else "ESPECES",
        ))
    sortie = ROOT / "src" / "data" / "salfa_historique.json"
    sortie.write_text(json.dumps(
        {"source": "SALAIRE SALFA 2022-2025", "employes": employes, "paies": paies},
        ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(employes)} salariés historiques, {len(paies)} lignes de paie 2022-2025 -> {sortie.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
