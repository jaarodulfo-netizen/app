# Kerma Security — Device Inventory Reconciliation (Nov 2026)

## The incident

After Windows Gateway V4.1 deployment, the Hub successfully registered
`kerma-monterrey` and 17 locally configured devices. The Devices page also
contained manually entered cloud records with recently reassigned LAN IPs:
several turnstile facial terminals, two Technicians Inventory terminals,
additional ACs including `1-AC3`.

The prior app conflated "present in the cloud database" and "reported by the
Windows Gateway". In particular, physically connected devices may coexist
with unlinked records bearing current LAN IPs, and a device's IP may be reused
when the LAN is renumbered.

## What this version changes

- Adds **Devices → RECONCILE**, accessible to commanders only, via
  `GET /api/devices/reconciliation`.
- Displays active Gateway-linked identities separately from cloud-only
  records and lists duplicate display IPs, including conflicts between a
  manual record and a registered record.
- No automatic linking by device name, IP, or guessed face-terminal order.
  Exact same-name suggestions are explicitly marked **unverified**.
- The main card labels/online counters only count a physical device as
  linked after an authenticated Gateway inventory registration.
- Existing unlinked AC rows can open the remote controller enrollment dialog
  with their name and IP pre-filled. Registration requires explicit
  confirmation that the hardware is genuinely NEW and **not** an existing AC
  whose IP/name changed. The existing V4.1 endpoint and Gateway handler
  authenticate and add new ACs; no employee rights are added automatically.
- No dangerous writes to MongoDB devices/doors, no deletion, no new Gateway
  instances, no emergency door commands.

## What this version cannot do safely

The current Windows Gateway V4.1 registration advertises id/name/role/doors
and connectivity, **not** its currently configured IP, serial number, or a
verified hardware identity binding. Existing face terminals cannot currently
have their endpoint IP changed remotely. An IP given in a cloud record is
not proof that the physical device at that IP is the existing device with
a certain immutable Gateway ID.

To reconcile existing facial terminals with changed IPs, first obtain
authenticated physical identity (serial/model or a device-side equivalent)
and compare it to the original Gateway identity. Then implement and test a
separate identity-verified remote endpoint update on the Windows agent
with per-device rollback and event-stream recovery; do not assume that
the existing V4.1 remote **AC creation** command is an IP-change command.

The current new-IP inventory values in Devices are displayed and preserved,
but **are not silently pushed into the Windows Gateway**. A separate
controlled hardware-backed change is required before claiming an existing
face terminal has switched endpoints.

## On-site operational safety

Avoid deleting unlinked rows or changing access policies until the physical
identity is verified. Test face/card events and a single assigned door after
each real device reconnection, in a supervised period. Do not change the
Gateway ID, reset the hardware, or assume NOT LINKED means no access.
