"""Offline guard: never suggest NEW AC registration for a known cloud identity.

No Windows Gateway, MongoDB, access controller or user credentials are needed.
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEVICE_UI = (ROOT / "frontend" / "src" / "pages" / "Devices.jsx").read_text(encoding="utf-8")
EMPLOYEE_UI = (ROOT / "frontend" / "src" / "pages" / "Employees.jsx").read_text(encoding="utf-8")
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


class ExistingAcGuidanceGuards(unittest.TestCase):
    def test_existing_ac_detection_is_read_only_and_matches_both_ip_and_id(self):
        self.assertIn("api.get('/devices/reconciliation')", DEVICE_UI)
        self.assertIn("device.displayIp?.trim() === ip.trim()", DEVICE_UI)
        self.assertIn("device.gatewayDeviceId === effectiveControllerId", DEVICE_UI)
        self.assertIn("const effectiveControllerId = controllerId.trim() || name.trim().toLowerCase()", DEVICE_UI)
        self.assertIn("gatewayDeviceId: effectiveControllerId", DEVICE_UI)
        self.assertIn("device.name?.trim().toLowerCase() === name.trim().toLowerCase()", DEVICE_UI)
        self.assertIn("existingCloudControllers.length > 0", DEVICE_UI)
        self.assertIn("EXISTING ACCESS CONTROLLER FOUND", DEVICE_UI)

    def test_existing_ac_goes_to_access_levels_not_new_controller_creation(self):
        self.assertIn('to="/employees?accessLevels=1"', DEVICE_UI)
        self.assertIn('existing-ac-access-levels-link', DEVICE_UI)
        self.assertIn("get('accessLevels') === '1'", EMPLOYEE_UI)
        self.assertIn("gatewayDeviceId", SERVER)
        self.assertIn('gateway_ac_only_versions.get("kerma-monterrey") != "0.5.0-ac-only"', SERVER)

    def test_no_physical_access_write_behind_cloud_identity_match(self):
        self.assertIn("This is a cloud inventory match, not proof", DEVICE_UI)
        self.assertIn("Do not create another AC with the same address", DEVICE_UI)
        self.assertIn("gatewayRegistered", SERVER)
        self.assertIn("hardwareLinked", SERVER)


if __name__ == "__main__":
    unittest.main()
