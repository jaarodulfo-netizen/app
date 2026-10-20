"""Regression guard: personnel must never be re-created on backend startup.

Run from project root:
    python -m unittest discover -s backend/tests -p "test_no_employee_reseed.py"

Uses AST so no MongoDB, secret variables, or hardware are necessary.
"""
import ast
import unittest
from pathlib import Path


SERVER_FILE = Path(__file__).resolve().parents[1] / "server.py"


class NoEmployeeReseedOnStartup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = ast.parse(SERVER_FILE.read_text(encoding="utf-8"))
        cls.source = SERVER_FILE.read_text(encoding="utf-8")

    def test_no_legacy_staff_list_remains(self):
        self.assertNotIn("KERMA_PERSON_SEED =", self.source)
        self.assertNotIn("async def seed_kerma_people", self.source)

    def test_startup_does_not_insert_or_update_employees(self):
        startup = next(
            n for n in self.tree.body
            if isinstance(n, ast.AsyncFunctionDef) and n.name == "startup"
        )
        for n in ast.walk(startup):
            if isinstance(n, ast.Call):
                func = n.func
                self.assertNotEqual(getattr(func, "id", None), "seed_kerma_people")
            if isinstance(n, ast.Attribute) and n.attr == "employees":
                self.fail("Startup must not access employees collection: protects deleted staff")

    def test_credential_and_device_setup_remain(self):
        self.assertIn("await seed_kerma_devices()", self.source)
        self.assertIn("await seed_kerma_doors()", self.source)
        self.assertIn('@api_router.delete("/employees/{item_id}")', self.source)
        self.assertIn('@api_router.post("/employees")', self.source)


if __name__ == "__main__":
    unittest.main()
