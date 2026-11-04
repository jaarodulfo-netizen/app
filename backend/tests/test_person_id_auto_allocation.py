"""Unit guards for collision-resistant hardware Person ID allocation.

These run without MongoDB, Railway, secret variables, or Hikvision hardware.
They execute the real identity function extracted by AST from server.py.
"""
import ast
import asyncio
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock


SERVER = Path(__file__).resolve().parents[1] / "server.py"
SOURCE = SERVER.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def identity_function(conflicts=None, reservations=None, random_values=None):
    node = next(n for n in TREE.body if isinstance(n, ast.AsyncFunctionDef)
                and n.name == "ensure_hikvision_employee_identity")
    module = ast.Module(body=[node], type_ignores=[])
    env = {
        "ObjectId": str,
        "re": re,
        "datetime": datetime,
        "timezone": timezone,
        "HTTPException": FakeHTTPException,
        "PERSON_ID_RANDOM_BASE": 1_200_000_000,
        "PERSON_ID_RANDOM_SPAN": 800_000_000,
        "secrets": SimpleNamespace(randbelow=Mock(side_effect=random_values or [0])),
        "person_id_conflicts": AsyncMock(side_effect=conflicts or [False, False]),
        "reserve_person_id": AsyncMock(side_effect=reservations or [True, True]),
    }
    employees = SimpleNamespace(
        update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
        find_one=AsyncMock(return_value=None),
    )
    env["db"] = SimpleNamespace(employees=employees)
    exec(compile(module, str(SERVER), "exec"), env)
    return env["ensure_hikvision_employee_identity"], env


def person(card="0008512251", person_id=None, source=None):
    return {
        "_id": "employee-1", "name": "TEST-ONLY PERSON",
        "cardNo": card, "personId": person_id, "source": source,
        "validFrom": "2026-11-04T00:00:00",
        "validTo": "2029-11-03T23:59:59",
    }


class IdentityAllocationTests(unittest.IsolatedAsyncioTestCase):
    async def test_auto_id_is_separate_from_unchanged_card(self):
        f, ctx = identity_function()
        result = await f(person())
        self.assertEqual(result["cardNo"], "0008512251")
        self.assertEqual(result["personId"], "1200000000")
        self.assertNotEqual(result["personId"], result["cardNo"])
        self.assertEqual(ctx["db"].employees.update_one.await_count, 1)

    async def test_collision_gets_another_random_id(self):
        f, ctx = identity_function(
            conflicts=[True, False, False], reservations=[True, True],
            random_values=[0, 1],
        )
        result = await f(person())
        self.assertEqual(result["personId"], "1200000001")
        self.assertEqual(ctx["secrets"].randbelow.call_count, 2)

    async def test_exhausted_range_fails_closed(self):
        f, _ = identity_function(
            conflicts=[True] * 48, random_values=[0] * 48,
        )
        with self.assertRaises(FakeHTTPException) as raised:
            await f(person())
        self.assertEqual(raised.exception.status_code, 503)

    async def test_existing_v2_id_is_never_rewritten(self):
        f, ctx = identity_function()
        result = await f(person(person_id="0008512251"))
        self.assertEqual(result["personId"], "0008512251")
        ctx["db"].employees.update_one.assert_not_awaited()

    async def test_existing_ivms_id_is_never_rewritten(self):
        f, ctx = identity_function()
        result = await f(person(person_id="8512251", source="iVMS-4200"))
        self.assertEqual(result["personId"], "8512251")
        ctx["db"].employees.update_one.assert_not_awaited()

    async def test_no_override_of_existing_reservation(self):
        f, _ = identity_function(
            reservations=[False] * 48,
            conflicts=[False] * 48,
            random_values=list(range(48)),
        )
        with self.assertRaises(FakeHTTPException):
            await f(person())

    def test_gateway_confirmation_does_not_require_id_equal_card(self):
        self.assertNotIn('person_id != card or', SOURCE)
        self.assertIn('"personId": person_id, "syncRequestId": request_token', SOURCE)
        self.assertIn('"$or": [{"cardNo": card}, {"cardNos": card}]', SOURCE)

    def test_user_cannot_override_new_hardware_id(self):
        self.assertIn('Person ID is assigned automatically and cannot be overridden', SOURCE)
        self.assertIn('PERSON_ID_RANDOM_BASE = 1_200_000_000', SOURCE)
        self.assertIn('secrets.randbelow(PERSON_ID_RANDOM_SPAN)', SOURCE)


if __name__ == "__main__":
    unittest.main()
