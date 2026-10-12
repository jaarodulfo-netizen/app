# Kerma Security V2 — Hikvision enrollment repair (2026-10-12)

## Findings

The cloud server sends `person.upsert` to an authenticated studio gateway over WebSocket.
The repository's `scripts/hikvision_gateway.py` is an older event-only ingest agent and
**does not implement** WebSocket `person.upsert`. The active studio gateway's implementation
and controller mappings must be inspected on-site before this change can be called a hardware fix.

The Enrollment UI previously generated a random face-match percentage locally; that was
not proof of biometric enrollment. It has been removed. Device-level enrollment status
also was not read back after the gateway acknowledged a command.

## Incoming person.upsert contract

```json
{
  "kind": "person.upsert",
  "person": {
    "id": "employee-id",
    "name": "Employee Name",
    "userType": "normal",
    "Valid": {
      "enable": true,
      "beginTime": "2026-10-12T00:00:00",
      "endTime": "2029-10-12T23:59:59",
      "timeType": "local"
    },
    "doorRights": {"device-id": [1]}
  },
  "credentials": [
    {"type": "card", "value": "0008512258", "cardType": "normalCard"}
  ]
}
```

This payload is for illustration. Use only the doorRights assigned by the access
level; **do not** copy this example's door permissions to other employees.

## Required behavior in the installed local gateway

1. Confirm gateway version, device mapping, reachability and device clock/zone.
2. For each authorized device, translate `person.Valid` to
   `UserInfo.Valid` and use `userType: normal`.
3. Keep the existing access-level door selection. Provision the corresponding
   approved `doorRight` and `RightPlan` on the device without granting rights
   to other doors or silently substituting a global 24/7 plan.
4. Provision the card as a **normal** card (not duress or super card), retaining
   the card number as a string with leading zeros.
5. Upload a face only if an actual photo was supplied; a file being present is
   not equivalent to biometric matching.
6. Read back `UserInfo`, `CardInfo`, permissions, validity, and face status
   from each device and include individual success/failure details in the
   gateway command result. In particular, a WebSocket `ok` result alone is
   insufficient to claim physical enrollment.
7. Fail closed when any device rejects the requested credential or plan.
   No fallback to duress or unrestricted privileges.
8. Record firmware-specific ISAPI error details without storing raw passwords.

## Safe verification workflow

Run the **read-only** `scripts/diagnose_hikvision_card.py` against one
authorized reader/controller at a time using credentials stored on-site;
it queries its local clock, card record and person/rights. Search APIs may
differ by firmware, so an unsuccessful query is **not** proof of absence.

Test with an approved spare card, first as normal, at the assigned doors.
Inspect the Hikvision raw event for:
- Card No. Does Not Exist: record did not reach the specified controller, or
  the number encoding differs.
- Invalid Time Period / Time Invalid: `Valid`, `RightPlan`, device clock
  and access-level schedules need comparison.
- Facial failure: check the actual terminal's face record; do not rely on
  frontend photo or old `faceSync` field.

Before deploying: run `pytest -q tests/test_credential_validity.py` and
`cd frontend && yarn build` in an environment with dependencies installed.
A physical card test is required after the installed gateway is upgraded.

No controller configuration, door assignment or employee was changed by
creating this branch.
