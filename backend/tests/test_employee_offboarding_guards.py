"""Regression guards for employee offboarding and all-device revocation.

These tests intentionally use AST/source inspection; no live hardware, MongoDB,
credentials, or Gateway are required.
"""
import ast
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"


class EmployeeOffboardingGuards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SERVER.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.text)
        cls.functions = {
            node.name: node for node in cls.tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def function_text(self, name):
        return ast.get_source_segment(self.text, self.functions[name]) or ""

    def test_deletion_is_not_only_a_database_delete(self):
        content = self.function_text("delete_employee")
        self.assertNotIn("db.employees.delete_one", content)
        self.assertIn('"is_active": False', content)
        self.assertIn("db.access_revocations.insert_one", content)
        self.assertIn("dispatch_employee_revocation", content)

    def test_hardware_gateway_receives_full_delete_command(self):
        content = self.function_text("dispatch_employee_revocation")
        self.assertIn('"kind": "person.delete"', content)
        self.assertIn('"personId": doc["personId"]', content)
        self.assertIn('expected.issubset(actual)', content)
        self.assertIn('"queued"', content)

    def test_never_report_queue_as_physical_verification(self):
        self.assertIn('"hardwareVerified": False', self.function_text("revocation_view"))
        self.assertNotIn('"hardwareVerified": True', self.text)

    def test_offboarded_people_cannot_be_resynced(self):
        self.assertIn('employee.get("is_active") is False', self.function_text("sync_employee_to_gateway"))
        self.assertIn('existing.get("is_active") is False', self.function_text("update_employee"))
        self.assertIn('employee.get("is_active") is False', self.function_text("retry_employee_sync"))

    def test_registry_hides_inactive_without_erasing_audit(self):
        self.assertIn('"is_active": {"$ne": False}', self.function_text("list_employees"))

    def test_gateway_reconnect_retries_pending_revocations(self):
        self.assertIn("retry_offboarding_on_gateway_connect", self.text)
        self.assertIn("asyncio.create_task(retry_offboarding_on_gateway_connect", self.text)

    def test_only_commander_can_offboard(self):
        handler = self.function_text("delete_employee")
        self.assertIn("Depends(require_commander)", handler)


if __name__ == "__main__":
    unittest.main()
