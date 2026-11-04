"""Regression guard for remote onboarding of physical access controllers.

No local Windows SDK or production database is required.
"""
import ast
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"
UI = Path(__file__).resolve().parents[2] / "frontend/src/pages/Devices.jsx"


class RemoteControllerContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SERVER.read_text(encoding="utf-8")
        cls.ui = UI.read_text(encoding="utf-8")
        tree = ast.parse(cls.source)
        cls.methods = {
            node.name: ast.get_source_segment(cls.source, node)
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }

    def test_commander_only_and_validated_gateway_request(self):
        method = self.methods["provision_access_controller"]
        self.assertIn('user=Depends(require_commander)', method)
        self.assertIn('"kind": "device.provision"', method)
        self.assertIn('body.gatewayDeviceId.strip()', method)
        self.assertIn('ip_network(network)', method)
        self.assertIn('"credential": body.credentialSet', method)
        self.assertNotIn('"password":', method)

    def test_cannot_make_unlinked_cloud_record_appear_online(self):
        method = self.methods["provision_access_controller"]
        self.assertNotIn('db.devices.insert_one(', method)
        self.assertIn('result.get("configured")', method)
        self.assertIn('send_gateway_command', method)

    def test_audit_and_fail_closed(self):
        method = self.methods["provision_access_controller"]
        self.assertIn('await db.security_permission_audit.insert_one', method)
        self.assertIn('Gateway did not confirm local controller configuration', method)
        self.assertIn('security_permission_audit.update_one', method)

    def test_form_does_not_request_secret(self):
        self.assertIn('/devices/provision-controller', self.ui)
        self.assertIn('controllerDoors', self.ui)
        self.assertIn('credentialSet', self.ui)
        self.assertIn('sdkPort', self.ui)
        self.assertIn('refreshPhysicalInventory', self.ui)
        self.assertNotIn('type="password"', self.ui.lower())


if __name__ == '__main__':
    unittest.main()
