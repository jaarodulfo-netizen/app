# Kerma Security V2 — current iVMS hardware inventory, 2026-11-10

Source: operator-supplied screenshot of iVMS-4200 device list, 2026-11-10.
This is **iVMS metadata**, not an authenticated report from the Kerma Windows Gateway.
The operator reports the whole site has been re-IP'd. The screenshot shows "Online"
in iVMS for every listed device.

## Correct iVMS reference

| iVMS name | IPv4 | Device class | Notes |
| --- | --- | --- | --- |
| 1-AC1 1st Floor 1st AC | 192.168.3.201 | Hikvision access controller | Former cloud label possibly "1st Floor AC", identity NOT verified |
| 1-AC2 1st Floor 2nd AC | 192.168.3.203 | Hikvision access controller | Former cloud label possibly "1st Floor 2nd AC", identity NOT verified |
| **1-AC3** | **192.168.3.222** | **Hikvision access controller** | **Pending Kerma Gateway linkage and permission sync** |
| 2-AC1 Restrooms | 192.168.3.204 | Hikvision access controller | Former cloud label possibly "Restrooms", identity NOT verified |
| 2-AC6 2nd Floor Access Control | 192.168.3.202 | Hikvision access controller | Former cloud label possibly "2nd Floor AC", identity NOT verified |
| 3-AC1 3rd Floor AC | 192.168.3.209 | Hikvision access controller | Former cloud label possibly "3rd Floor AC", identity NOT verified |
| B-AC1 Break Room | 192.168.3.214 | Hikvision access controller | Former cloud label possibly "Break Room", identity NOT verified |
| MG-AC1 | 192.168.3.215 | Hikvision door station | NOT a DS-K2804 four-door access controller |
| MG-AC2 | 192.168.3.216 | Hikvision door station | NOT a DS-K2804 four-door access controller |
| NVR1 | 192.168.3.101 | NVR | Not part of AC provisioning |
| NVR2 | 192.168.3.102 | NVR | Not part of AC provisioning |
| NVR3 | 192.168.3.103 | NVR | Not part of AC provisioning |

Avoid guessing complete serial numbers or the port from the truncated screenshots.
Typical Hikvision SDK port 8000 must be verified at each device.

## Why 1-AC3 is visible but does not receive permissions

The earlier cloud "Register Device" action may have created a display-only record with
`gatewayRegistered=false`, no stable physical `gatewayDeviceId`, and no actual door outputs.
The cloud sends employee `person.upsert` jobs to the **on-prem Windows Gateway**, which
dispatches only to a physically known controller identity. A matching cloud name/IP is not
sufficient. The authenticated Gateway must register real device ID/door outputs before
new doors appear in Access Levels.

Neither Railway nor the cloud web server can directly access `192.168.3.222`.

## Operator-safe diagnosis for 1-AC3

1. In **Access Devices → RECONCILE** compare `1-AC3 / 192.168.3.222` with the
   **iVMS CURRENT IP REFERENCE** table. It explicitly distinguishes cloud-only,
   cloud-linked and the on-site Windows config when V5 inventory is supported.
2. On the Windows Gateway, check `192.168.3.222:8000`, inspect the **effective
   active Gateway installation** and read-only `config/devices.json`. One safe
   helper is `scripts/Test-Kerma-AC3-ReadOnly.ps1 -GatewayRoot <actual path>`.
   It prints only id/name/IP/role/enabled/doors and TCP connection success, not passwords.
3. If `1-AC3` is missing locally, this is **local Gateway device configuration**,
   not an Access Levels problem. The staged-only AC V5 add-on, if installed on Windows,
   can register a *truly new* controller using SDK login and credential slot A/B/C/D.
   A cloud-only record **must not be duplicated**. If V5 is not installed, use a
   supervised, backed-up local Gateway configuration workflow.
4. If present locally with correct **verified device identity**, check whether the
   normal Gateway startup/connection advertises `role: controller`, a stable unique
   `id`, and real `doors` outputs. Cloud matching by IP/name alone is insufficient.
   Verify the record appears as **GATEWAY LINKED** and its output doors appear in
   **Enrollment → Access Levels**.
5. Add the intended physical outputs to the correct Access Level. Extending an
   existing level can broaden access for *all* employees assigned to it; check the
   eligible staff and doors before committing. The cloud then queues updated
   `person.upsert` requests. This is **not proof of device programming**.
6. Verify actual card enrollment **by readback on 1-AC3**, perform a controlled
   authorized test, and confirm denied entry for an unauthorized test card.
   Only then report physical access verification.

## Strict safety rules

- This reference **does not rewrite** the site's Windows Gateway JSON, Hikvision
  controller network configuration, cloud Gateway IDs, cards, facial access,
  emergency egress, access levels or employee permissions.
- Do not force-merge existing cloud records by similarly named device or matching
  IP. The screenshot does not give usable full serial numbers.
- Old static startup seed IPs may remain in pre-existing cloud records. Treat them
  as stale *display* fields; do not conclude the Gateway is connected to those IPs.
- The two `MG-` entries are **door stations**; never provision as four-door ACs.
- Stop if multiple local devices claim the same IP or the Gateway has a different
  owner/ID than the screenshot; investigate physical identity before changing it.
