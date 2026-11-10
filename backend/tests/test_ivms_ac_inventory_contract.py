"""Read-only iVMS reference snapshot: guard against wrong IP or implicit writes."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = (ROOT / "frontend" / "src" / "constants" / "ivmsControllerInventory.js").read_text(encoding="utf-8")
DEVICES_UI = (ROOT / "frontend" / "src" / "pages" / "Devices.jsx").read_text(encoding="utf-8")
DIAG = (ROOT / "scripts" / "Test-Kerma-AC3-ReadOnly.ps1").read_text(encoding="utf-8")


class IvmsSnapshotContract(unittest.TestCase):
    def test_seven_ac_controllers_and_two_door_stations(self):
        self.assertEqual(SNAPSHOT.count("kind: 'controller'"), 7)
        self.assertEqual(SNAPSHOT.count("kind: 'door-station'"), 2)
        inventory = re.findall(r"ip: '(192\.168\.3\.\d+)'", SNAPSHOT)
        self.assertEqual(len(inventory), 12)
        self.assertEqual(len(set(inventory)), 12)

    def test_ac3_correct_name_and_ip(self):
        self.assertIn("name: '1-AC3', ip: '192.168.3.222'", SNAPSHOT)
        self.assertIn("name: '1-AC1 1st Floor 1st AC', ip: '192.168.3.201'", SNAPSHOT)
        self.assertIn("name: '1-AC2 1st Floor 2nd AC', ip: '192.168.3.203'", SNAPSHOT)
        self.assertIn("name: '2-AC6 2nd Floor Access Control', ip: '192.168.3.202'", SNAPSHOT)

    def test_read_only_cloud_local_comparison_and_no_permissions_change(self):
        self.assertIn("function IvmsControllerSnapshot({ report, localDevices })", DEVICES_UI)
        self.assertIn("ivms-current-ac-inventory", DEVICES_UI)
        self.assertIn("ivms-ac-1-ac3", DEVICES_UI)
        self.assertIn("NO MATCHING CLOUD IP", DEVICES_UI)
        self.assertIn("LOCAL CONFIG UNAVAILABLE", DEVICES_UI)
        self.assertIn("Do not change Person IDs, Gateway IDs, door rights or passwords", DEVICES_UI)
        self.assertIn("<IvmsControllerSnapshot report={report} localDevices={localDevices} />", DEVICES_UI)

    def test_windows_diagnostic_does_not_write(self):
        self.assertIn("$TargetIp = '192.168.3.222'", DIAG)
        self.assertIn("Test-NetConnection -ComputerName $TargetIp -Port 8000", DIAG)
        for command in ("Set-Content", "Remove-Item", "Restart-Service", "Stop-Service", "Invoke-RestMethod", "Invoke-WebRequest"):
            self.assertNotIn(command, DIAG)


if __name__ == "__main__":
    unittest.main()
