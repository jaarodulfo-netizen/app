"""Ensure Kerma Personnel exposes offboarded history safely without touching devices.

No live MongoDB or Gateway connection is needed for these source-level regressions.
"""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "backend" / "server.py"
PERSONNEL = ROOT / "frontend" / "src" / "pages" / "Employees.jsx"


class OffboardedRegistryStatusGuards(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = SERVER.read_text(encoding="utf-8")
        cls.frontend = PERSONNEL.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.backend)
        cls.handlers = {
            node.name: node for node in cls.tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def handler_text(self, name):
        return ast.get_source_segment(self.backend, self.handlers[name]) or ""

    def test_archived_personnel_requires_commander(self):
        handler = self.handler_text("list_offboarded_employees")
        self.assertIn("Depends(require_commander)", handler)
        self.assertIn('"is_active": False', handler)
        self.assertIn("Query(200, ge=1, le=500)", handler)
        self.assertIn("count_documents", handler)
        self.assertIn(".skip(offset).limit(limit).to_list(limit)", handler)
        self.assertIn("timezone.utc", handler)
        self.assertNotIn("db.employees.delete", handler)

    def test_live_roster_is_unchanged_for_other_app_views(self):
        handler = self.handler_text("list_employees")
        self.assertIn('"is_active": {"$ne": False}', handler)

    def test_archived_rows_are_visible_and_read_only(self):
        self.assertIn("api.get('/employees/offboarded', { params: { offset, limit } })", self.frontend)
        self.assertIn("Promise.allSettled", self.frontend)
        self.assertIn("(statusFilter === 'active' && !isOffboarded)", self.frontend)
        self.assertIn("user?.role === 'commander' ? offboardedEmployees : []", self.frontend)
        self.assertIn("OFFBOARDED", self.frontend)
        self.assertIn("emp.offboardedAt", self.frontend)
        self.assertIn("emp.offboardedBy", self.frontend)
        self.assertIn("ARCHIVED · READ ONLY", self.frontend)

    def test_cloud_and_hardware_status_are_not_conflated(self):
        self.assertIn("HARDWARE UNVERIFIED", self.frontend)
        self.assertIn("REMOVAL QUEUED", self.frontend)
        self.assertIn("REMOVAL PENDING", self.frontend)
        self.assertIn("SIN PERMISOS · NUBE", self.frontend)
        self.assertNotIn('"hardwareVerified": True', self.backend)


if __name__ == "__main__":
    unittest.main()
