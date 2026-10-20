# Kerma Security V2 — Emergency Door Release

## Status
**NOT COMMISSIONED.** Remote live release is disabled by default. The red button and
simulator can be reviewed safely in a preview environment. This feature is a
SUPPLEMENT to professionally installed, code-compliant, fail-safe local egress.
It must never be treated as the primary emergency release mechanism.

## Controls
- Route: `/emergency`. Visible in desktop and mobile navigation only to
  authenticated `commander` users; all new APIs enforce the role server-side.
- A Commander chooses which physically mapped doors are in the emergency
  egress group. No door is selected by default.
- **SELECT ALL** and **CLEAR ALL** are setup-only batch operations and are
  available before the backend is armed. SELECT ALL includes every physically
  mapped door, which must then be reviewed with EHS: a controller mapping
  is **not** an approval of a fire exit. The group persists across logins
  and reloads, so there is no per-door selection during an emergency.
- `EJECUTAR SIMULACRO` writes a labeled audit incident and **never sends
  hardware commands**.
- `LIBERAR PUERTAS` becomes actionable only when the server has
  `EMERGENCY_RELEASE_ENABLED=true`, at least one mapped eligible door exists,
  and the operator explicitly types `LIBERAR` and checks the confirmation.
- Live mode dispatches existing Gateway `door.open` commands with
  `cmd=alwaysOpen` only for designated doors. Duplicate and invalid physical
  mappings abort before sending anything. Commands have individual success /
  timeout / error results and an audit incident.
- Gateway ACK is reported explicitly as **NOT PHYSICALLY VERIFIED**. The
  dashboard does not mark doors physically unlocked without feedback.
- **No automatic re-lock.** Any eventual reset must be an independently
  authorized, physically supervised site procedure.
- The **FINALIZAR SIMULACRO** action closes an existing simulated incident
  administratively (from `completed` to `closed`) and records the commander,
  time, and audit. It sends **zero hardware commands**, is available for
  completed simulations only, and is not a physical restoration.
- **RESTABLECER PUERTAS FÍSICAS** appears disabled in the interface on purpose.
  It cannot remotely relock doors. Reinstating normal access controls must
  await independently verified evacuation completion and onsite sign-off.
  A live incident cannot be closed with the simulation endpoint.

## Before live commissioning (mandatory)
1. EHS / fire protection specialist approves the egress schedule, applicable
   fire/life-safety requirements and the independently operable **wired**
   fire-alarm and exit-release system, including behavior without power,
   network, cloud, controller, or workstation.
2. Identify each eligible door *and* turnstile physically. Confirm actual
   `gatewayDeviceId`, `doorNo`, egress hardware, power supply, and
   controller/firmware supports the `alwaysOpen` operation. The server only
   knows an ACK, not its real contact state.
3. In a controlled test window, select only approved egress doors in the page,
   test the simulator, and inspect incident data. Verify authorized operators
   can access the page and regular officers cannot.
4. Test the Gateway on a **single supervised output** separately, and verify
   live readback / local observation for release, lock state, alarms, and
   restoration. Include controller/Gateway offline and timeout failures.
5. Obtain written onsite sign-off and verify staffing and documented local
   restoration procedure. Only then set Railway **backend** variable
   `EMERGENCY_RELEASE_ENABLED=true` after confirming all prerequisites.
   The frontend variable is not used for this safety gate.
6. Test a planned supervised live activation and independently verify each exit.
   Review MongoDB `emergency_release_incidents` and the UI. If an ACK is not
   matched by a verified physical release, fail commissioning and turn the
   Railway flag off again.

## Emergency response expectations
The local certified alarm/egress system remains the primary release path.
If V2/Gateway/Railway is unavailable, **do not wait for the web button**;
follow the site's posted local emergency procedures. On a partial/unknown
Gateway response, dispatch personnel to verify the evacuation path. Recording
a simulated incident does not test any hardware.

## API surface
- `GET /api/emergency/status` — authorized dashboard data and recent history.
- `PUT /api/emergency/doors/{doorId}` — `{"eligible":true|false}` (setup only).
- `PUT /api/emergency/doors/bulk` — `{"mode":"select_all_mapped"|"clear_all","confirmation":"CONFIGURAR"}` (setup only; no hardware command).
- `POST /api/emergency/simulate` — audit-only, no controller command.
- `POST /api/emergency/simulations/{incidentId}/close` — `{"confirmation":"FINALIZAR"}`; administrative-only closing of a completed simulation (Commander).
- `POST /api/emergency/activate` — `{"confirmation":"LIBERAR"}`, live
  only when armed server-side.

MongoDB collections: `emergency_release_audit`,
`emergency_release_incidents`, `emergency_release_mutex` and explicit
`doors.emergencyEgress` eligibility.

## Non-goals
This implementation does not integrate with a fire alarm, claim verified
physical unlock/evacuation, monitor relay contacts, replace mechanical exit
hardware, or automatically reset/re-lock doors.
