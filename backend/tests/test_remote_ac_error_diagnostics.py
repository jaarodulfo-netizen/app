"""Regression tests: remote AC failures must be actionable without leaking secrets.

No live Gateway, controller, secrets, or database are accessed.
"""
import ast
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "server.py"


def load_classifier():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    funcs = [n for n in tree.body if isinstance(n, ast.FunctionDef)
             and n.name == "classify_remote_ac_failure"]
    assert len(funcs) == 1
    namespace = {}
    exec(compile(ast.Module(body=funcs, type_ignores=[]), str(SOURCE), "exec"),
         namespace)
    return namespace["classify_remote_ac_failure"]


class RemoteACErrorDiagnosis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.classify = staticmethod(load_classifier())

    def test_unconfigured_local_slot(self):
        code, explanation = self.classify(
            RuntimeError("Credential slot B is not configured on this Windows Gateway"))
        self.assertEqual(code, "CREDENTIAL_SLOT")
        self.assertIn("local", explanation)

    def test_duplicate_ip_not_silently_linked(self):
        code, _ = self.classify(RuntimeError("Controller IP already exists in Windows Gateway"))
        self.assertEqual(code, "DUPLICATE_GATEWAY_IP")

    def test_stale_config_distinct_from_sdk_login(self):
        code, _ = self.classify(RuntimeError(
            "Gateway config has changed since process startup; stop and reconcile"))
        self.assertEqual(code, "CONFIG_MISMATCH")

    def test_sdk_monitor_failure(self):
        code, _ = self.classify(RuntimeError(
            "Native SDK event monitoring is not ready for hot-add"))
        self.assertEqual(code, "SDK_MONITOR_NOT_READY")

    def test_unknown_errors_never_echo_raw_gateway_content(self):
        raw = 'Credential string SECRET_DO_NOT_LOG /private/path 192.168.3.219'
        code, explanation = self.classify(RuntimeError(raw))
        self.assertEqual(code, "GATEWAY_REJECTED")
        self.assertNotIn("SECRET", explanation)
        self.assertNotIn("192.168", explanation)
        self.assertNotIn("/private", explanation)

    def test_http_message_not_reflected(self):
        code, explanation = self.classify(RuntimeError(
            "NET_DVR_Login_V40 failed: password=MY_TOP_SECRET"))
        self.assertEqual(code, "SDK_LOGIN_FAILED")
        self.assertNotIn("MY_TOP_SECRET", explanation)


if __name__ == "__main__":
    unittest.main()
