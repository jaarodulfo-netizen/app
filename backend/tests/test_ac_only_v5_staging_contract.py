"""V5 AC-only staging contract: no old Gateway commands, no false online claim."""
import ast
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / "server.py"
UI = Path(__file__).resolve().parents[2] / "frontend/src/pages/Devices.jsx"


class AcOnlyStagingContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = SERVER.read_text(encoding="utf-8")
        cls.frontend = UI.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.src)

    def test_backend_requires_opted_in_gateway_agent_version(self):
        provision = next(n for n in self.tree.body if isinstance(n, ast.AsyncFunctionDef)
                         and n.name == "provision_access_controller")
        body = ast.get_source_segment(self.src, provision)
        self.assertIn('gateway_ac_only_versions.get("kerma-monterrey") != "0.5.0-ac-only"', body)
        self.assertIn('status_code=412', body)
        self.assertIn('"staged_pending_restart"', body)
        self.assertIn('"restartRequired": True', body)
        self.assertIn('"hardwareOnlineVerified": False', body)
        self.assertNotIn('engine.attachProvisionedDevice', body)

    def test_auth_gateway_registration_controls_capability(self):
        self.assertIn('gateway_ac_only_versions[gateway_id] = agent_version', self.src)
        self.assertIn('gateway_ac_only_versions.pop(gateway_id, None)', self.src)
        self.assertIn('acStagingReady', self.src)

    def test_frontend_guards_and_staged_message(self):
        self.assertIn("data?.acStagingReady === true", self.frontend)
        self.assertIn('AC-ONLY ADD-ON NOT READY', self.frontend)
        self.assertIn('SAVE NEW AC TO GATEWAY', self.frontend)
        self.assertIn('restartRequired !== true', self.frontend)
        self.assertIn('AC SAVED — CONTROLLED GATEWAY RESTART REQUIRED', self.frontend)


if __name__ == "__main__":
    unittest.main()
