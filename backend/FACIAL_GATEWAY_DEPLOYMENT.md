# Facial enrollment gate — Kerma Windows Gateway

This repository is the V2 cloud backend/frontend. The **active Windows
Gateway** is a separate installed application and is NOT updated by deploying
this repository. Deploying this backend patch alone does not resolve the
terminal-side `employeeNoNotExist` or `fetch failed` errors.

## Invariants for Gateway enrollment

1. The ONLY physical targets are the exact entries in the person's
   `doorRights` map, keyed by `gatewayDeviceId`. Never infer permissions
   from a job's presence, an access-level name or an online device list.
2. A selected terminal's personal record must be created/updated successfully
   (Hikvision employee number / `employeeNo`) BEFORE attempting its card
   or face credentials. Handle asynchronous ISAPI responses and read back the
   person record; do not treat HTTP queue acceptance as completed enrollment.
3. Send the **same** `person.id` consistently as the terminal employeeNo on
   person, card and facial requests. Preserve leading zeroes. Do not migrate
   existing iVMS IDs without explicit mapping approval.
4. Map V2 `person.validFrom` and `person.validTo` to the **firmware-specific
   valid-time fields** on the terminal's user enrollment request. Enable the
   validity range and use local (Monterrey) wall-clock time. Avoid
   timezone-offset / UTC conversions that shift the intended dates.
5. The user-approved **All-Day Authorized** schedule applies only to
   authorized access points. Card controllers may require their approved
   `cardPlanTemplateNo`; facial terminals use their model-specific
   ISAPI schedule fields. Do not invent a template ID or grant all doors.
6. A facial photo must be actual JPEG bytes (not just a .jpg filename).
   The backend now does this conversion only when facial targets are selected.
7. Mark a facial device VERIFIED only after read-back for the correct
   employeeNo, validity period and credentials. Controller `GET_CARD`
   verification does not imply face enrollment success.
8. Removing an access right must be implemented as an explicit safe physical
   revocation, not merely omitting a device from future upserts.

## Read-only validation before deploying local changes

- Capture a working user's terminal UserInfo/Valid and credential read-back
  from one selected facial terminal, masking personally identifying data.
- Compare the exact request/response from a failing enrollment, especially
  `employeeNoNotExist` and the time validity block.
- Verify each terminal's ISAPI compatibility, connectivity and alertStream
  separately. A 404 event stream is not evidence that the card/face record
  was created.
- Stage a backup of Windows Gateway `dist`, `src` (if present), config
  and its SQLite database. Do not re-run the original AutoSync installer.

## Acceptance criteria

- Employee authorized for one facial terminal receives employee, card and
  face on only that terminal, with V2 validity dates honored.
- The same employee is absent from an unselected terminal.
- New user, existing user update, expiry and permission revocation are all
  tested independently.
- The six SDK card controllers remain functional after rollout.
