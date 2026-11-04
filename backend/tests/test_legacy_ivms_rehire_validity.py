"""Safety regression guards for rehired iVMS-4200 employees.

No database, online Gateway, controller, biometric data, or user credentials
are needed. All checks use AST inspection.
"""
import ast
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"
UI = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "Employees.jsx"


class LegacyRehireValidityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = SERVER.read_text(encoding="utf-8")
        cls.ui = UI.read_text(encoding="utf-8")
        tree = ast.parse(cls.src)
        cls.fns = {
            node.name: node for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def method(self, name):
        return ast.get_source_segment(self.src, self.fns[name])

    def test_legacy_id_is_not_replaced(self):
        code = self.method("ensure_hikvision_employee_identity")
        self.assertIn('legacy = employee.get("source") == "iVMS-4200"', code)
        self.assertIn('if not employee.get("validFrom") or not employee.get("validTo")', code)
        self.assertIn('if not current_id:', code)
        self.assertIn('if legacy:', code)
        update = self.method("update_employee")
        self.assertIn('Imported iVMS Person ID cannot be changed', update)

    def test_no_automatic_three_year_extension_for_import(self):
        update = self.method("update_employee")
        self.assertIn('original_missing_validity', update)
        self.assertIn('Enter a new approved start and end date', update)
        self.assertIn('validity_changed', update)
        self.assertNotIn('replace(year=start.year + 3)', update)

    def test_only_commander_may_authorize_rehire_range(self):
        update = self.method("update_employee")
        self.assertIn('if user.get("role") != "commander":', update)
        self.assertIn('"validityApprovedBy"', update)
        self.assertIn('"validityApprovedAt"', update)
        self.assertIn('"validityApprovalReason"', update)
        self.assertIn('"rehire_existing_ivms_employee"', update)

    def test_validity_is_checked_before_saving(self):
        code = self.method("update_employee")
        self.assertLess(code.index('original_missing_validity'), code.index('await db.employees.update_one'))
        self.assertIn('start >= end', code)
        self.assertIn('end <= datetime.now(ZoneInfo("America/Monterrey"))', code)
        self.assertIn('or end.year > 2037', code)

    def test_ui_requires_both_dates_and_keeps_card(self):
        self.assertIn('data-testid="ivms-rehire-validity"', self.ui)
        self.assertIn('data-testid="ivms-valid-from"', self.ui)
        self.assertIn('data-testid="ivms-valid-to"', self.ui)
        self.assertIn('!validityReady', self.ui)
        self.assertIn("validFrom:", self.ui)
        self.assertIn("validTo:", self.ui)
        self.assertIn("disabled={user?.role !== 'commander'}", self.ui)


if __name__ == "__main__":
    unittest.main()
