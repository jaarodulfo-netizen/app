"""Offline contract tests for Kerma employee plate enrollment.

Do not connect to MongoDB, Gateway, or real LPR cameras.
"""
import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
UI = (ROOT / "frontend" / "src" / "pages" / "Employees.jsx").read_text(encoding="utf-8")
PROBE = (ROOT / "scripts" / "hikvision_lpr_probe.py").read_text(encoding="utf-8")


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail


def isolated_plate_normalizer():
    """Execute only the pure normalizer, without importing the live backend."""
    tree = ast.parse(SERVER)
    target = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "normalize_license_plates"
    )
    isolated = ast.fix_missing_locations(ast.Module(body=[target], type_ignores=[]))
    namespace = {"re": re, "HTTPException": FakeHTTPException}
    exec(compile(isolated, "<isolated-plate-normalizer>", "exec"), namespace)
    return namespace["normalize_license_plates"]


class EmployeePlateContractTest(unittest.TestCase):
    def test_normalization_accepts_mexican_style_plates(self):
        normalize = isolated_plate_normalizer()
        self.assertEqual(normalize(True, ["sst-123-a", " RRT 987 B "]), ["SST123A", "RRT987B"])
        self.assertEqual(normalize(False, []), [])

    def test_invalid_and_duplicate_plates_are_rejected(self):
        normalize = isolated_plate_normalizer()
        for plates in (
            [], ["ABC123", "abc-123"], ["A1"],
            ["ABCD1234", "EFGH1234", "IJKL1234", "MNOP1234"],
            ["VALID1", "BAD#2"],
        ):
            with self.subTest(plates=plates), self.assertRaises(FakeHTTPException):
                normalize(True, plates)
        with self.assertRaises(FakeHTTPException):
            normalize(False, ["ABC123"])

    def test_active_owner_lookups_and_offboarded_protection(self):
        self.assertIn('"licensePlates": {"$in": plates}', SERVER)
        self.assertIn('"is_active": {"$ne": False}', SERVER)
        self.assertIn('async def update_employee_vehicles(', SERVER)
        self.assertIn('Offboarded personnel cannot enroll vehicles', SERVER)
        self.assertIn('"lprSyncStatus": "removal_unverified"', SERVER)
        self.assertIn('else "not_applicable"', SERVER)

    def test_camera_is_never_claimed_synced_or_access_granted(self):
        self.assertIn('"syncSupported": False', SERVER)
        self.assertIn('"accessGrantedByRegistry": False', SERVER)
        self.assertIn('"cameraSyncEnabled": False', SERVER)
        self.assertIn('gateway_auth(request)', SERVER)
        self.assertIn('LPR CAMERA_IP', SERVER.replace('LPR_CAMERA_IP', 'LPR CAMERA_IP'))
        self.assertIn("LPR REGISTRY ONLY", UI)
        self.assertIn("LPR NOT CONNECTED", UI)
        self.assertIn("SAVE VEHICLE ONLY (NO DOOR SYNC)", UI)
        self.assertIn('licensePlates: hasVehicle ? parseVehiclePlates(platesText) : []', UI)

    def test_local_probe_never_modifies_camera(self):
        parsed = ast.parse(PROBE)
        nodes = [n for n in ast.walk(parsed) if isinstance(n, ast.Call)]
        methods = {
            n.func.attr for n in nodes if isinstance(n.func, ast.Attribute)
        }
        self.assertIn("get", methods)
        self.assertNotIn("put", methods)
        self.assertNotIn("post", methods)
        self.assertNotIn("delete", methods)
        self.assertIn('parsed.hostname != "192.168.3.1"', PROBE)


if __name__ == "__main__":
    unittest.main()
