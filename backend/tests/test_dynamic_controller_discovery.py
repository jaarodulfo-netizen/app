"""New AC/facial discovery regression tests.

Runs without real MongoDB, the Windows Gateway, or any door controller.
"""
import ast
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

SERVER = Path(__file__).resolve().parents[1] / "server.py"
ROOT = Path(__file__).resolve().parents[2]


def tested_inventory(devices_result=None, manual_matches=None, door_results=None):
    src = SERVER.read_text(encoding="utf-8")
    tree = ast.parse(src)
    fn = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef)
              and node.name == "register_gateway_physical_devices")
    env = {"re": re, "datetime": datetime, "timezone": timezone, "logger": Mock()}
    docs = SimpleNamespace(
        find_one=AsyncMock(return_value=devices_result),
        find=Mock(return_value=SimpleNamespace(to_list=AsyncMock(
            return_value=manual_matches or []))),
        insert_one=AsyncMock(return_value=SimpleNamespace(inserted_id="new-device")),
        update_one=AsyncMock(),
    )
    doors = SimpleNamespace(
        find_one=AsyncMock(side_effect=door_results if door_results is not None else [None] * 4),
        update_one=AsyncMock(),
        insert_one=AsyncMock(),
    )
    env["db"] = SimpleNamespace(devices=docs, doors=doors)
    exec(compile(ast.Module(body=[fn], type_ignores=[]), str(SERVER), "exec"), env)
    return env["register_gateway_physical_devices"], docs, doors


class NewControllerDiscovery(unittest.IsolatedAsyncioTestCase):
    async def test_enabled_controller_advertisement_creates_four_linked_doors(self):
        fn, devices, doors = tested_inventory()
        count = await fn("kerma-monterrey", [{
            "id": "new-ac-4", "name": "NEW SECURITY AC", "role": "controller",
            "doors": [1, 2, 3, 4], "online": True,
        }])
        self.assertEqual(count, 1)
        self.assertEqual(doors.insert_one.await_count, 4)
        self.assertEqual(
            [call.args[0]["doorNo"] for call in doors.insert_one.await_args_list],
            [1, 2, 3, 4],
        )
        self.assertTrue(all(call.args[0]["hardwareLinked"]
                            for call in doors.insert_one.await_args_list))
        self.assertTrue(all(call.args[0]["visible"]
                            for call in doors.insert_one.await_args_list))
        updated = devices.update_one.await_args.args[1]["$set"]
        self.assertEqual(updated["gatewayDeviceId"], "new-ac-4")
        self.assertEqual(updated["type"] if "type" in updated else "card", "card")

    async def test_existing_physical_door_label_and_hidden_flag_are_preserved(self):
        existing = {"_id": "existing-device", "name": "My AC", "type": "card"}
        existing_door = {"_id": "door-3", "name": "LAB", "visible": False}
        fn, _, doors = tested_inventory(
            devices_result=existing, door_results=[existing_door],
        )
        await fn("kerma-monterrey", [{
            "id": "lab-ac", "name": "My AC", "role": "controller",
            "doors": [3], "online": False,
        }])
        self.assertEqual(doors.update_one.await_count, 1)
        patch = doors.update_one.await_args.args[1]["$set"]
        self.assertNotIn("name", patch)
        self.assertNotIn("visible", patch)
        self.assertNotIn("floor", patch)
        self.assertEqual(patch["hardwareStatus"], "offline")
        doors.insert_one.assert_not_awaited()

    async def test_exact_unique_manual_name_reuses_existing_device(self):
        manual = {"_id": "manual-device", "name": "Lab AC", "type": "card"}
        fn, devices, _ = tested_inventory(manual_matches=[manual],
                                          door_results=[None])
        await fn("kerma-monterrey", [{
            "id": "lab-ac", "name": "Lab AC", "role": "controller",
            "doors": [1], "online": True,
        }])
        devices.insert_one.assert_not_awaited()
        self.assertEqual(devices.update_one.await_args.args[0], {"_id": "manual-device"})

    async def test_bad_role_or_bad_outputs_do_not_make_fake_doors(self):
        fn, devices, doors = tested_inventory()
        count = await fn("kerma-monterrey", [
            {"id": "bad", "role": "nvr", "doors": [1], "online": True},
            {"id": "bad2", "role": "controller", "doors": [0], "online": True},
            {"id": "bad3", "role": "controller", "doors": [True], "online": True},
        ])
        self.assertEqual(count, 0)
        devices.insert_one.assert_not_awaited()
        doors.insert_one.assert_not_awaited()


class DiscoveryContract(unittest.TestCase):
    def test_authenticated_websocket_invokes_discovery_not_only_status_update(self):
        src = SERVER.read_text(encoding="utf-8")
        self.assertIn("registered_count = await register_gateway_physical_devices(", src)
        self.assertIn('msg.get("devices") or []', src)
        self.assertIn('{"controller": "card", "face-terminal": "face"}', src)

    def test_manual_entries_are_not_physical_until_gateway_reports_them(self):
        src = SERVER.read_text(encoding="utf-8")
        self.assertIn('doc["gatewayRegistered"] = False', src)
        self.assertIn('doc["status"] = "unlinked"', src)
        self.assertIn('if body.gatewayDeviceId or body.doors:', src)
        self.assertIn('await validate_physical_access_rights(rights)', src)

    def test_access_level_right_removal_needs_verified_revocation(self):
        src = SERVER.read_text(encoding="utf-8")
        self.assertIn('Removing rights from an assigned access level requires verified hardware revocation', src)

    def test_frontend_refreshes_both_collections(self):
        src = (ROOT / "frontend/src/context/SecurityContext.jsx").read_text(encoding="utf-8")
        self.assertIn('api.get(\'/devices\'), api.get(\'/doors\')', src)
        self.assertIn('refreshPhysicalInventory,', src)

    def test_editor_can_add_outputs_to_existing_level_with_confirmation(self):
        src = (ROOT / "frontend/src/pages/Employees.jsx").read_text(encoding="utf-8")
        self.assertIn('CONFIRM LEVEL UPDATE', src)
        self.assertIn("setEditingLevelId(level.id)", src)
        self.assertIn("api.put(", src)
        self.assertIn('DOOR REMOVAL REQUIRES REVOCATION', src)


if __name__ == "__main__":
    unittest.main()
