# Kerma Security V2 — Hikvision enrollment repair (2026-10-12)

## Findings

The cloud server sends `person.upsert` to an authenticated studio gateway over WebSocket.
Historical Windows gateway code recovered from earlier Kerma troubleshooting notes reads `person.validFrom` and `person.validTo` when creating `UserInfo.Valid`; the cloud now sends those alongside `Valid` for compatibility.\n\nThe repository's `scripts/hikvision_gateway.py` is an older event-only ingest agent and
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
    "validFrom": "2026-10-12T00:00:00",
    "validTo": "2029-10-12T23:59:59",
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
2. For each authorized device, translate `person.validFrom` / `person.validTo` (or `person.Valid` on newer adapters) to `UserInfo.Valid` and use `userType: normal`.
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

## Additional findings from Kerma Windows gateway logs

- The installed gateway's `engine.upsertPerson` queues jobs and returns
  `queuedFor` / `faceQueuedFor`. It does not confirm successful physical
  enrollment. The cloud now records these as `hardwareSync: queued`.
- Historical Windows logs show `NET_DVR_STDXMLConfig` parameter error 17
  on some DS-K2804 controllers, including `restrooms`. Their enrollment
  may require the native HCNetSDK `NET_DVR_SET_CARD` (2561) route.
- The old ISAPI client used `person.doorRights?.[device.id] ?? device.doors`.
  This **must not** be used on production controllers: if rights for a
  controller are absent, a default `device.doors` may grant more doors
  than requested. Require explicit assigned rights and fail closed.
- `RightPlan` cannot be assumed to have an approved schedule simply
  because template 1 exists. Confirm the plan's actual definition and
  assignment on each access controller; do not automatically use 24/7
  outside the existing access level.
- Native SDK confirmation must verify `NET_DVR_CARD_STATUS` and perform a
  readback (GET_CARD) before changing any device state to `verified`.
  Hikvision documents `NET_DVR_SET_CARD` as command 2561, status values
  1000 through 1004, and the return structure NET_DVR_CARD_STATUS.
- Only change/rebuild the installed `src/` TypeScript implementation;
  editing `dist/` alone can be overwritten by a later build.
- To collect **read-only** per-device queue results from the Windows PC,
  run `scripts/audit_gateway_windows.ps1 -CardNo YOUR_10_DIGIT_CARD`
  from the gateway root. Do not include environment secrets in a report.

Reference: https://open.hikvision.com/hardware/v2/%E6%8E%A5%E5%8F%A3%E5%AE%9A%E4%B9%89/NET_DVR_SendWithRecvRemoteConfig%28CARD%29.html

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
