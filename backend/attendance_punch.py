"""Attendance punches from Hikvision raw events, with conservative payroll estimates.

A generic granted face/card scan is NOT enough to distinguish check-out,
break return, or approved overtime. Only explicit device attendanceStatus
codes are treated as confirmed punches.
"""
import re

PUNCH_ALIASES = {
    "checkin": "check_in",
    "clockin": "check_in",
    "onduty": "check_in",
    "workin": "check_in",
    "checkinnormal": "check_in",
    "checkout": "check_out",
    "clockout": "check_out",
    "offduty": "check_out",
    "workout": "check_out",
    "breakout": "break_out",
    "breakstart": "break_out",
    "breakin": "break_in",
    "breakend": "break_in",
    "overtimein": "overtime_in",
    "overtimestart": "overtime_in",
    "overtimeout": "overtime_out",
    "overtimeend": "overtime_out",
}


def classify_attendance_punch(gateway_event):
    """Read a defined attendance mode, never infer it from a generic access grant."""
    if not isinstance(gateway_event, dict):
        return None
    payload = gateway_event.get("raw")
    if not isinstance(payload, dict):
        payload = gateway_event
    acs = payload.get("AccessControllerEvent")
    items = [acs if isinstance(acs, dict) else {}, payload, gateway_event]
    for source in items:
        for key in ("attendanceStatus", "attendanceState", "attendanceType", "attendStatus", "punchType"):
            raw = source.get(key)
            if isinstance(raw, str):
                normalized = re.sub(r"[^a-z0-9]", "", raw.lower())
                if normalized in PUNCH_ALIASES:
                    return PUNCH_ALIASES[normalized]
    return None


def measure_attendance(scans):
    """Return conservative duration data for one ordered shift session.

    A complete explicit IN/OUT pair makes times confirmable. Breaks are deducted
    ONLY when explicit break-out/break-in events form a pair. Unknown punches
    never become breaks or payroll-certified overtime automatically.
    """
    ordered = sorted(scans, key=lambda row: row["time"])
    if not ordered:
        return {
            "first_in": None, "last_out": None,
            "worked_seconds": 0, "break_seconds": 0, "break_count": 0,
            "punches_confirmed": False, "estimated": False,
            "status": "open", "warning": "No attendance punches",
        }
    explicit = any(s.get("punch") for s in ordered)
    if not explicit:
        first = ordered[0]["time"]
        last = ordered[-1]["time"] if len(ordered) > 1 else None
        duration = max(0, int((last - first).total_seconds())) if last else 0
        return {
            "first_in": first, "last_out": last,
            "worked_seconds": duration, "break_seconds": 0, "break_count": 0,
            "punches_confirmed": False, "estimated": len(ordered) > 1,
            "status": "needs_review" if len(ordered) > 1 else "open",
            "warning": (
                "First/last scans are provisional; no explicit IN/OUT or break status"
                if len(ordered) > 1 else "Only one generic scan; departure unknown"
            ),
        }

    first = next((s["time"] for s in ordered if s.get("punch") == "check_in"), None)
    last = None
    open_break = None
    seconds_break = 0
    breaks = 0
    anomalous = False
    if first is None:
        anomalous = True
    else:
        for item in ordered:
            moment, kind = item["time"], item.get("punch")
            if moment < first:
                continue
            if kind == "break_out":
                if open_break is not None:
                    anomalous = True
                else:
                    open_break = moment
            elif kind == "break_in":
                if open_break is None or moment <= open_break:
                    anomalous = True
                else:
                    seconds_break += int((moment - open_break).total_seconds())
                    breaks += 1
                    open_break = None
            elif kind == "check_out":
                if moment > first and last is None:
                    last = moment
                else:
                    anomalous = True
            elif kind == "check_in" and moment != first:
                anomalous = True
            if last is not None and moment > last:
                anomalous = True
    if open_break is not None:
        anomalous = True
    span = max(0, int((last - first).total_seconds())) if last and first else 0
    worked = max(0, span - seconds_break)
    completed = bool(first and last and not anomalous)
    return {
        "first_in": first, "last_out": last, "worked_seconds": worked,
        "break_seconds": seconds_break, "break_count": breaks,
        "punches_confirmed": completed, "estimated": not completed,
        "status": "complete" if completed else ("incomplete" if last else "open"),
        "warning": (
            None if completed else
            "Missing/mismatched explicit IN, OUT, or break punches; manual review required"
        ),
    }
