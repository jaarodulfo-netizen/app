# Kerma Security V2 — Remote AC onboarding (Gateway V4)

## Why this is needed

The Devices screen previously created only a cloud database record. The local
Windows Gateway uses `config/devices.json` to establish native HCNetSDK
connections; it did not accept remote device-configuration commands. As a
result, the new AC could not be enrolled or selected from Access Levels until
someone manually edited the local JSON and restarted the gateway.

This change makes the Devices → Add Device → Access Controller form send an
authenticated `device.provision` command over the existing outbound Windows
Gateway WebSocket. **It requires one compatible one-time V4 patch to the
Windows Gateway**. Older gateways reject the command and stay unchanged.

## New operator flow

1. Perform the one-time Windows Gateway V4 patch with dry-run SHA checks,
   backup, and controlled service stop/start.
2. Verify the new AC is on the Kerma private LAN and that its SDK port is
   reachable from the Windows Gateway. Its username/password must match
   credential set A/B/C/D already stored **only on the Windows Gateway**.
3. In Devices → Add Device, choose **ACCESS CONTROLLER (AC)**.
4. Enter the AC name, private IP, real door numbers (1–4), optional stable
   Gateway ID (automatically derived from the name if blank), SDK port
   (usually 8000), and the local credential slot. Click **REGISTER AC IN
   GATEWAY**.
5. The cloud authenticates the current commander, validates the request,
   records an audit, and forwards only the connection metadata (no passwords).
6. The Windows Gateway validates the local configuration/duplicate IDs and
   IPs, resolves credentials locally, and performs a native SDK login probe.
   If login fails, nothing is written. If valid, it backs up the local
   configuration and writes the new record atomically.
7. The Gateway briefly re-arms the single native SDK event callback to
   include the new controller while keeping existing configurations and
   access policies. It publishes refreshed inventory to the cloud.
8. Refresh Devices and Access Levels. Only explicitly selected door outputs
   may be used in new/edited access levels. No employee's access rights
   are changed by adding a device.

## Security and recovery

- `/api/devices/provision-controller` requires **commander** permissions.
- No password or credential value is submitted to or stored in Railway; the
  only credential property is a slot label `A`–`D`.
- Only RFC1918 IPv4 LAN targets and SDK `controller` devices with 1–4 real
  door outputs are accepted.
- No on-site controller, card, or physical relay is opened by this operation.
- The new AC is not considered physically commissioned until a controlled
  test verifies card read-back and that each desired door really operates.
- An older Gateway returns an error instead of silently making a cloud-only
  device record.
- A new Gateway JSON backup is created before every remotely provisioned AC.
  If live SDK setup fails, the JSON is restored to its previous contents.
- The first live addition briefly re-arms native SDK event monitoring; make
  the first test during a supervised maintenance window.
- This Gateway patch is installed as compiled JavaScript. An old TypeScript
  build would overwrite these compiled changes; don't rebuild from the old
  archive. Incorporate V4 changes into the canonical source in the next full
  Gateway build.

This flow has been tested with isolated Node.js simulations and static app
checks. Hardware installation and the actual SDK handshake are **not yet
verified**; do not treat a cloud “configured” response as physical access
verification.
