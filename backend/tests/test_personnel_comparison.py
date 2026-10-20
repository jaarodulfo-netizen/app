"""Read-only personnel comparison regression checks.

Run without DB or device connections:
python -m unittest discover -s backend/tests -p "test_personnel_comparison.py"
"""
import ast
import json
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1]
SERVER = BACKEND / "server.py"
REFERENCE = BACKEND / "legacy_ivms_roster_reference.json"


class PersonnelComparisonRegression(unittest.TestCase):
    def test_historical_snapshot_is_valid_and_unique(self):
        roster = json.loads(REFERENCE.read_text(encoding="utf-8"))
        self.assertTrue(roster["snapshot"])
        people = roster["employees"]
        self.assertGreater(len(people), 0)
        identifiers = [p["personId"] for p in people]
        self.assertEqual(len(identifiers), len(set(identifiers)))

    def test_comparison_route_has_no_write_or_gateway_calls(self):
        tree = ast.parse(SERVER.read_text(encoding="utf-8"))
        fn = next(
            n for n in tree.body
            if isinstance(n, ast.AsyncFunctionDef)
            and n.name == "compare_historic_ivms_roster"
        )
        forbidden = {
            "insert_one", "insert_many", "update_one", "update_many",
            "delete_one", "delete_many", "replace_one", "bulk_write",
            "send_gateway_command", "seed_kerma_people",
        }
        for node in ast.walk(fn):
            if isinstance(node, ast.Call):
                self.assertNotIn(getattr(node.func, "attr", ""), forbidden)
                self.assertNotIn(getattr(node.func, "id", ""), forbidden)

    def test_no_startup_reseed(self):
        source = SERVER.read_text(encoding="utf-8")
        self.assertNotIn("await seed_kerma_people()", source)
        self.assertNotIn("KERMA_PERSON_SEED =", source)


if __name__ == "__main__":
    unittest.main()
