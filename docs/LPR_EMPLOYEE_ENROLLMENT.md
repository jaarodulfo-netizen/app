# Kerma Security V2 — Employee vehicles and Hikvision LPR

## Site camera (provided by operator)

- **Model:** Hikvision iDS-TCM403-BI
- **LAN IP:** `192.168.3.1`
- **Connectivity:** the on-site Windows Gateway can contact the private camera LAN; Railway cannot and must not be made to contact RFC1918 device addresses.
- **Credentials:** camera credentials must stay on the local Gateway, never in GitHub, employee records, frontend, or Cloud API JSON.

## Currently implemented in V2

1. Enroll Employee includes optional **EMPLOYEE HAS A VEHICLE** and 1–3 license plates.
2. Edit Employee can change those fields; **SAVE VEHICLE ONLY (NO DOOR SYNC)** does not change door permissions or queue a card/face sync.
3. Plates are validated, normalized to uppercase alphanumeric without spaces/hyphens, and checked for duplicates across **active** employees.
4. Personnel shows license plates with an explicit **LPR NOT CONNECTED** status. Search includes plate identifiers.
5. Offboarded people retain plate history for audit and show **LPR REMOVAL UNVERIFIED**. Offboarding does **not** prove removal from the camera allowlist.
6. An authenticated, read-only API endpoint `GET /api/lpr/gateway-registry` returns active employee plate candidates to the Gateway using the existing `X-API-Key` secret. It does not authorize them on the camera.
7. `GET /api/lpr/camera` returns the configured camera model/IP and `syncSupported: false`. Do not label an employee as granted vehicle access.

This release is deliberately **registry only**, not a physical LPR integration. It adds no barrier commands and changes no existing card or facial enrollment process.

## Read-only camera compatibility test

From the Windows Gateway on the Kerma LAN:

```powershell
py -m pip install requests
py scripts\hikvision_lpr_probe.py
```

The script prompts for the camera password on the local computer (hidden) and sends only GET requests to `192.168.3.1`: device identity, ANPR capability, plate list export and XML template export. Only HTTP response codes are printed. No cards, plates, allowlist entries, barrier states or camera configuration are modified.

Verify the camera's **exact firmware**, installed healthy SD/TF storage, ANPR country configuration (Mexico), network path and supported ISAPI schema **before** adding any write functionality. Hikvision's published ISAPI guide documents variant endpoints such as `GET /ISAPI/ITC/capability` and `GET/PUT /ISAPI/Traffic/channels/1/licensePlateAuditData?fileType=xml`; that is not proof that the site's firmware supports a particular upload payload.

Reference: https://www.hikvisioneurope.com/eu/portal/portal/Technology%20Partner%20Program/02-Solutioins%20of%20Hikvision%20product%20integration/ANPR%20Camera%20Integration%20Solution%20for%207%20series.pdf

## Next step to enable camera synchronization safely

- Implement and install a separate **versioned LPR module** on the local Windows Gateway after probing camera capabilities. No change to the existing access/face gateway sync jobs.
- Use a verified **per-plate add/remove or safe merge** operation; never blindly replace the entire camera allowlist. Capture existing whitelist before any write.
- Carry a stable employee/plate identifier, preserve manual whitelist entries, and reconcile changes and removals. Refuse ambiguous matches or conflicting owners.
- Verify write results through **device readback** and an actual test plate before showing `LPR VERIFIED`. Queued or imported does not prove physical authorization.
- When an employee is offboarded, remove their license plates from the camera and confirm absence. Until then remain `LPR REMOVAL UNVERIFIED`.
- Only after that verification consider linking LPR decisions to a parking barrier; no barrier opening commands are provided in this change.

## Security/regression limits

Never treat vehicle enrollment as a substitute for card/face access rights. No passwords, biometric records or camera credentials are stored with employee plates. Active identity reuse or duplicate plates require operator review. The Web UI is a cloud registry until the on-site Gateway is updated and verified.
