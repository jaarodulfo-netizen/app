"""HLS access and emergency facial inspection regression guards.

Static AST checks: do not require MongoDB, an NVR, or a live door.
"""
import ast
import unittest
from pathlib import Path

SOURCE = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def get_function(name):
    return next(n for n in TREE.body
                if isinstance(n, ast.AsyncFunctionDef) and n.name == name)


class GatewayVideoIsolationRegression(unittest.TestCase):
    def test_separate_media_socket(self):
        video = ast.get_source_segment(SOURCE, get_function("dedicated_video_tunnel"))
        access = ast.get_source_segment(SOURCE, get_function("gateway_socket"))
        self.assertIn("gateway_video_connections", video)
        self.assertNotIn("gateway_video_connections", access)
        self.assertNotIn("nvr.hls.fetch", access)

    def test_media_command_allowlist(self):
        video = ast.get_source_segment(SOURCE, get_function("send_video_gateway_command"))
        self.assertIn("nvr.hls.start", video)
        self.assertIn("nvr.hls.fetch", video)
        self.assertIn("Physical access commands are forbidden", video)
        self.assertNotIn("door.open", video)

    def test_video_urls_validate_current_cctv_permission(self):
        viewer = ast.get_source_segment(SOURCE, get_function("_authorized_hls_viewer"))
        self.assertIn('effective_permissions(viewer)["cctv"]', viewer)
        self.assertIn('viewer.get("is_active"', viewer)
        for method in ("live_camera_playlist", "live_camera_segment"):
            src = ast.get_source_segment(SOURCE, get_function(method))
            self.assertIn("_authorized_hls_viewer(", src)

    def test_facial_inspection_only_reads(self):
        src = ast.get_source_segment(SOURCE, get_function("facial_emergency_diagnostics"))
        for command in ('"kind": "device.info"', '"kind": "device.capabilities"', '"kind": "door.status"'):
            self.assertIn(command, src)
        self.assertNotIn('"kind": "door.open"', src)


if __name__ == "__main__":
    unittest.main()
