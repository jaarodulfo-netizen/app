"""Isolated unit tests: no database, network or Hikvision calls."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from attendance_punch import classify_attendance_punch, measure_attendance

TZ = ZoneInfo("America/Monterrey")
BASE = datetime(2026, 10, 17, 7, 0, tzinfo=TZ)


def mark(minutes, mode=None):
    return {"time": BASE + timedelta(minutes=minutes), "punch": mode}


def test_hikvision_raw_punch_labels():
    e = {"raw": {"AccessControllerEvent": {"attendanceStatus": "checkIn"}}}
    assert classify_attendance_punch(e) == "check_in"
    e["raw"]["AccessControllerEvent"]["attendanceStatus"] = "breakOut"
    assert classify_attendance_punch(e) == "break_out"
    e["raw"]["AccessControllerEvent"]["attendanceStatus"] = "breakIn"
    assert classify_attendance_punch(e) == "break_in"
    e["raw"]["AccessControllerEvent"]["attendanceStatus"] = "checkOut"
    assert classify_attendance_punch(e) == "check_out"
    assert classify_attendance_punch({"raw": {"AccessControllerEvent": {"subEventType": 1}}}) is None
    assert classify_attendance_punch({"description": "Face matched"}) is None


def test_complete_shift_with_break():
    scans = [mark(0, "check_in"), mark(240, "break_out"),
             mark(270, "break_in"), mark(510, "check_out")]
    result = measure_attendance(scans)
    assert result["status"] == "complete"
    assert result["punches_confirmed"]
    assert result["break_seconds"] == 1800
    assert result["break_count"] == 1
    assert result["worked_seconds"] == 8 * 3600


def test_generic_scans_are_provisional_only():
    r = measure_attendance([mark(0), mark(480)])
    assert r["status"] == "needs_review"
    assert r["estimated"]
    assert not r["punches_confirmed"]
    assert r["break_seconds"] == 0


def test_single_generic_scan_is_not_departure():
    r = measure_attendance([mark(0)])
    assert r["status"] == "open"
    assert r["last_out"] is None
    assert r["worked_seconds"] == 0


def test_missing_break_in_not_silently_approved():
    r = measure_attendance([mark(0, "check_in"), mark(250, "break_out"), mark(500, "check_out")])
    assert not r["punches_confirmed"]
    assert r["status"] == "incomplete"


def test_no_checkin_with_checkout_not_valid():
    r = measure_attendance([mark(500, "check_out")])
    assert not r["punches_confirmed"]
    assert r["worked_seconds"] == 0


def test_unpaired_scans_not_counted_as_break():
    r = measure_attendance([mark(0, "check_in"), mark(300),
                             mark(330), mark(480, "check_out")])
    assert r["punches_confirmed"]
    assert r["break_seconds"] == 0
