"""Regression guards for commander-only promotion/demotion of officers."""
import ast
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"
UI = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "Officers.jsx"


class AdministratorRoleContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = SERVER.read_text(encoding="utf-8")
        cls.ui = UI.read_text(encoding="utf-8")
        tree = ast.parse(cls.backend)
        cls.methods = {
            node.name: ast.get_source_segment(cls.backend, node)
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def test_role_switch_is_commander_only(self):
        method = self.methods["update_officer_role"]
        self.assertIn('Depends(require_commander)', self.backend)
        self.assertIn('@api_router.put("/auth/officers/{officer_id}/role")', self.backend)
        self.assertIn('role not in {"officer", "commander"}', method)
        self.assertNotIn('"admin"', method)  # Admin maps to existing commander RBAC

    def test_cannot_change_own_role_or_demote_last_admin(self):
        method = self.methods["update_officer_role"]
        self.assertIn('oid == user["_id"]', method)
        self.assertIn('other_admins < 1', method)
        self.assertIn('Cannot demote the last active administrator', method)
        self.assertIn('Cannot promote a deactivated account', method)

    def test_audit_and_session_revocation(self):
        method = self.methods["update_officer_role"]
        self.assertIn('await db.sessions.delete_many({"user_id": officer_id})', method)
        self.assertIn('await db.security_permission_audit.insert_one(', method)
        self.assertIn('"officer_role_changed"', method)
        self.assertIn('"previousRole": previous_role', method)
        self.assertIn('"newRole": body.role', method)
        self.assertIn('{"_id": oid, "role": previous_role', method)

    def test_role_changes_take_effect_from_live_database(self):
        self.assertIn('user = await db.users.find_one({"_id": ObjectId(payload["sub"])})',
                      self.methods["get_current_user"])
        self.assertIn('if user.get("role") != "commander":',
                      self.methods["require_commander"])

    def test_frontend_has_explicit_confirmation_and_new_role_labels(self):
        self.assertIn('PROMOTE TO ADMIN', self.ui)
        self.assertIn('DEMOTE TO OFFICER', self.ui)
        self.assertIn('CONFIRM ROLE CHANGE', self.ui)
        self.assertIn('setRoleChangeArmed', self.ui)
        self.assertIn('/role', self.ui)
        self.assertIn('activeAdminCount <= 1', self.ui)
        self.assertIn('o.id !== user?.id', self.ui)


if __name__ == "__main__":
    unittest.main()
