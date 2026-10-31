"""Diagnostic des valeurs historiques, sans aucune modification de données.

Usage : PYTHONDONTWRITEBYTECODE=1 python3 scripts/audit-donnees.py
Un écart est une demande de vérification comptable, pas une correction automatique.
"""
import json
from generer_sql_wamp import SOURCE, charger_historique


def auditer():
    data = charger_historique(json.loads(SOURCE.read_text(encoding="utf-8")))
    anomalies = []
    for p in data["paies"]:
        def n(key):
            return float(p.get(key) or 0)
        checks = [
            ("repartition_reglement", n("virement") + n("especes"), n("net"), 0.02),
            ("total_accessoires", sum(n(k) for k in ["augmentation_divers", "prime_de_garde", "anciennete2", "risque", "repr_rec"]), n("accessoir"), 0.02),
            ("brut_total", n("salaire_net") + n("accessoir"), n("brut"), 0.02),
            ("net_apres_retenues", max(0, n("brut") - n("avance") - n("med")), n("net"), 105),
        ]
        for rule, calculated, saved, tolerance in checks:
            if abs(calculated - saved) > tolerance:
                anomalies.append({
                    "controle": rule, "annee": p["annee"], "mois": p["mois"],
                    "matricule": p["numero_matricule"],
                    "valeur_calculee": round(calculated, 3), "valeur_enregistree": saved,
                    "ecart": round(calculated - saved, 3),
                    "virement_non_renseigne": p.get("virement") is None,
                    "especes_non_renseignees": p.get("especes") is None,
                })
    return {"bulletins_controles": len(data["paies"]), "nombre_ecarts_a_verifier": len(anomalies), "ecarts": anomalies}


if __name__ == "__main__":
    print(json.dumps(auditer(), ensure_ascii=False, indent=2))
