"""python3 scripts/test_sql_paies_cloturees.py — aucun serveur MySQL nécessaire."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("generer_sql_wamp", ROOT / "scripts/generer_sql_wamp.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def lire_paies(sql):
    """Exécuter les INSERT de paie isolés, sans les commandes DDL propres à MySQL."""
    statements = re.findall(r"INSERT INTO `salfa_paies`\s*\((.*?)\) VALUES\s*(.*?);", sql, re.S)
    assert statements, "Le fichier doit contenir des bulletins"
    columns = re.findall(r"`([^`]+)`", statements[0][0])
    with sqlite3.connect(":memory:") as db:
        db.row_factory = sqlite3.Row
        db.execute("CREATE TABLE salfa_paies (" + ", ".join(f"`{c}`" for c in columns) + ")")
        for header, values in statements:
            assert re.findall(r"`([^`]+)`", header) == columns
            db.execute(f"INSERT INTO salfa_paies ({header}) VALUES {values}")
        return [dict(row) for row in db.execute("SELECT * FROM salfa_paies ORDER BY id")]


class ImportPaiesClotureesTest(unittest.TestCase):
    def test_toutes_les_paies_sont_cloturees_sans_changer_les_montants(self):
        data = generator.charger_historique(json.loads(generator.SOURCE.read_text(encoding="utf-8")))
        expected = {p["id"]: p for p in data["paies"]}
        rows = lire_paies(generator.DEST.read_text(encoding="utf-8"))
        self.assertEqual(len(rows), len(expected))
        self.assertEqual({r["id"] for r in rows}, set(expected))
        self.assertEqual({r["annee"] for r in rows}, {p["annee"] for p in expected.values()})
        money = "base_aj logt_trsp rendement resp_repres salaire_brut cnaps patronal salaire_imposable irsa salaire_net augmentation_divers prime_de_garde anciennete2 risque repr_rec accessoir brut avance med net virement especes".split()
        for row in rows:
            p = expected[row["id"]]
            self.assertEqual(row["verrouille"], 1, f"Bulletin {row['id']}")
            for column in money:
                value = p.get(column) if column in ("virement", "especes") else p.get(column, 0)
                self.assertEqual(row[column], None if value is None or value == "" else round(float(value), 4), (row["id"], column))
            self.assertEqual(row["employe_id"], int(p["employe_id"]))
            self.assertEqual(row["mois"], str(p["mois"]).upper())
        self.assertGreater(len({(r["annee"], r["mois"]) for r in rows}), 1)

    def test_regeneration_reproductible(self):
        original = generator.DEST
        try:
            with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
                generator.DEST = Path(tmp) / "paies.sql"
                with contextlib.redirect_stdout(io.StringIO()):
                    generator.main()
                self.assertEqual(generator.DEST.read_bytes(), original.read_bytes())
        finally:
            generator.DEST = original

    def test_sql_conges_ne_cloture_pas_les_paies_existantes(self):
        sql = (ROOT / "wamp/sql/salfa_conges_excel.sql").read_text(encoding="utf-8")
        self.assertNotRegex(sql, r"(?:INSERT INTO|UPDATE|DELETE FROM)\s+`salfa_paies`")


if __name__ == "__main__":
    unittest.main()
