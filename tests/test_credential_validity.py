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
    assert "'cardType': 'normal'" in compiled
    assert 'doorRights' in compiled
