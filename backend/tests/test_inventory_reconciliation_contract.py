"""Safety tests for non-mutating Gateway/cloud hardware inventory comparison.

The route must never transform a displayed IP into a physical device
identity, enroll persons, or write over existing Gateway-linked doors.
"""
import ast
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "server.py"
FRONTEND = Path(__file__).resolve().parents[2] / "frontend/src/pages/Devices.jsx"


class ReconciliationSafetyContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = BACKEND.read_text(encoding="utf-8")
        cls.frontend = FRONTEND.read_text(encoding="utf-8")
        root = ast.parse(cls.backend)
        cls.funcs = {
            node.name: ast.get_source_segment(cls.backend, node)
            for node in root.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def test_reconcile_is_read_only_commander_only(self):
        body = self.funcs["preview_device_reconciliation"]
        self.assertIn('user=Depends(require_commander)', body)
        self.assertIn('db.devices.find(', body)
        self.assertIn('"readOnly": True', body)
        self.assertIn('"identityVerifiedByIp": False', body)
        self.assertIn('"gatewayIpAvailable": False', body)
        for forbidden in ('.insert_one(', '.update_one(', '.update_many(', '.delete_one(',
                          'send_gateway_command(', 'sync_employee_to_gateway('):
            self.assertNotIn(forbidden, body)

    def test_unlinked_rows_not_transformed_into_hardware(self):
        body = self.funcs["preview_device_reconciliation"]
        self.assertIn('gatewayRegistered") is True', body)
        self.assertIn('"gatewayDeviceId": d.get("gatewayDeviceId") if linked else None', body)
        self.assertIn('"possibleMatches"', body)
        self.assertIn('"duplicateIps"', body)
        self.assertNotIn('hardwareLinked": True', body)

    def test_ui_does_not_claim_ip_is_identity(self):
        ui = self.frontend
        self.assertIn('/devices/reconciliation', ui)
        self.assertIn('IP ADDRESS CONFLICTS', ui)
        self.assertIn('REGISTER ONLY IF NEW AC', ui)
        self.assertIn('confirmedNewController', ui)
        self.assertIn('gatewayRegistered !== true', ui)
        self.assertIn('Gateway V4.1 does not remotely reconfigure existing facial IPs.', ui)


if __name__ == "__main__":
    unittest.main()
