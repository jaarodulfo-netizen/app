"""Access-control regression guards; no database/hardware required."""
import ast
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"


class PermissionsContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SERVER.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)
        cls.functions = {
            f.name: f for f in cls.tree.body if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def test_camera_routes_require_cctv(self):
        for function in (
            "list_cameras", "create_camera", "camera_snapshot",
            "delete_camera", "start_stream", "stop_stream",
            "stream_state", "sync_nvr_channels",
        ):
            source = ast.get_source_segment(self.source, self.functions[function])
            self.assertIn("Depends(require_cctv)", source, function)

    def test_enrollment_manual_sync_is_independent(self):
        src = ast.get_source_segment(self.source, self.functions["retry_employee_sync"])
        self.assertIn("Depends(require_manual_sync)", src)
        for name in ("list_employees", "create_employee", "update_employee", "delete_employee"):
            self.assertIn("Depends(require_enrollment)",
                          ast.get_source_segment(self.source, self.functions[name]))

    def test_facial_permanent_release_guard(self):
        for name in ("start_single_emergency_test", "activate_emergency_release"):
            source = ast.get_source_segment(self.source, self.functions[name])
            self.assertTrue("face" in source or "facial_ids" in source)

    def test_stream_url_is_scoped_and_revocable(self):
        src = ast.get_source_segment(self.source, self.functions["hls_file"])
        self.assertIn("effective_permissions(stream_user)", src)
        self.assertIn('stream_user.get("is_active"', src)


if __name__ == "__main__":
    unittest.main()
