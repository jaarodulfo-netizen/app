"""Tests for credential validity, without contacting production databases or doors."""
import ast
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException


def load_validity_function():
    source = Path(__file__).resolve().parents[1] / "backend" / "server.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "resolve_credential_validity")
    scope = {"Optional": Optional, "datetime": datetime, "ZoneInfo": ZoneInfo, "HTTPException": HTTPException}
    exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), "exec"), scope)
    return scope["resolve_credential_validity"]


def test_default_validity_is_three_calendar_years_and_normal_local_time():
    resolve = load_validity_function()
    begin, end, valid = resolve(None, None)
    today = datetime.now(ZoneInfo("America/Monterrey")).date()
    assert begin == today.isoformat()
    assert end.startswith(str(today.year + 3))
    assert valid["enable"] is True
    assert valid["timeType"] == "local"
    assert valid["beginTime"] == begin + "T00:00:00"
    assert valid["endTime"] == end + "T23:59:59"


def test_custom_validity_preserves_authorized_dates():
    resolve = load_validity_function()
    today = datetime.now(ZoneInfo("America/Monterrey")).date()
    later = today + timedelta(days=90)
    begin, end, valid = resolve(today.isoformat(), later.isoformat())
    assert begin == today.isoformat()
    assert end == later.isoformat()
    assert valid["endTime"] == later.isoformat() + "T23:59:59"


@pytest.mark.parametrize("start,end", [
    ("not-a-date", "2029-12-31"),
    ("2031-01-01", "2030-01-01"),
    ("2026-01-01", "2038-01-01"),
])
def test_invalid_ranges_do_not_reach_gateway(start, end):
    with pytest.raises(HTTPException) as exc:
        load_validity_function()(start, end)
    assert exc.value.status_code == 400


def test_gateway_contract_explicitly_uses_normal_and_validity():
    source = (Path(__file__).resolve().parents[1] / "backend" / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    fn = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "sync_employee_to_gateway")
    compiled = ast.unparse(fn)
    assert "'userType': 'normal'" in compiled
    assert "'Valid': validity" in compiled
    assert "'validFrom': validity['beginTime']" in compiled
    assert "'validTo': validity['endTime']" in compiled
    assert "'cardType': 'normalCard'" in compiled
    assert 'doorRights' in compiled


def load_gateway_sync_function():
    """Compile only the gateway sync function; no DB or hardware imports."""
    source = Path(__file__).resolve().parents[1] / "backend" / "server.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    fn = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "sync_employee_to_gateway")
    norm = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "normalize_door_rights")
    validity = load_validity_function()
    scope = {"resolve_credential_validity": validity, "HTTPException": HTTPException, "Optional": Optional}
    exec(compile(ast.Module(body=[norm, fn], type_ignores=[]), str(source), "exec"), scope)
    return scope


def test_gateway_receipt_is_queued_and_not_synchronized():
    import asyncio

    scope = load_gateway_sync_function()
    async def command(payload):
        assert payload["person"]["validFrom"].endswith("T00:00:00")
        assert payload["person"]["validTo"].endswith("T23:59:59")
        assert payload["person"]["userType"] == "normal"
        assert payload["person"]["doorRights"] == {"restrooms": [1]}
        assert payload["credentials"][0]["value"] == "0008512258"
        assert payload["credentials"][0]["cardType"] == "normalCard"
        return {"queuedFor": ["restrooms"], "faceQueuedFor": []}
    scope["send_gateway_command"] = command
    result = asyncio.run(scope["sync_employee_to_gateway"]({
        "personId": "test-employee", "name": "Test", "cardNos": ["0008512258"],
        "doorRights": {"restrooms": [1]},
        "validFrom": None, "validUntil": None,
    }))
    assert result["hardwareSync"] == "queued"
    assert result["gatewayQueuedFor"] == ["restrooms"]


def test_gateway_wrong_devices_fail_closed():
    import asyncio

    scope = load_gateway_sync_function()
    async def command(payload):
        return {"queuedFor": ["other-controller"], "faceQueuedFor": []}
    scope["send_gateway_command"] = command
    with pytest.raises(HTTPException) as exc:
        asyncio.run(scope["sync_employee_to_gateway"]({
            "personId": "test-employee", "name": "Test", "cardNos": ["0008512258"],
            "doorRights": {"restrooms": [1]},
        }))
    assert exc.value.status_code == 502
