# AC-only V5: add a new Hikvision DS-K2804 without editing Windows JSON per device

**Scope:** New SDK-based access controllers only. NOT IP remapping, existing
controllers, employee/card synchronization, facial devices, emergency release,
or door rights.

## Why V4.1 was rolled back

The V4.1 add-on also replaced `dist/sync/engine.js`,
`dist/sdk/hcnetsdk.js`, and `dist/sdk/events.js`, thereby affecting iVMS legacy
Person ID/card behavior. That was beyond the requested remote AC enrollment.

**AC-only V5 leaves those three files unchanged.** Its Windows install replaces
only the original compiled `dist/gateway/agent.js` (SHA256
`1C03BF467014154D55530AC4FA22127612471A8D54B4C745F652AB87489D2A07`)
and adds one `dist/gateway/device-provision.js` module, with an agent backup
and strict hash validation. It deliberately refuses unknown Gateway versions.

## Operational workflow

1. One-time maintenance: verify Gateway works after rollback; take backup.
   Extract `Kerma_AC_Solo_V5_2026-11-05.zip` on the Windows Gateway PC and
   execute `Instalar-Solo-AC-V5.ps1 -GatewayRoot ...` without `-Apply`.
2. If and only if hashes match, stop Gateway and its automatic restart,
   install using `-Apply -GatewayStopped`, then start Gateway normally once.
3. Check app `/api/gateway/status`: `acStagingReady=true` for agent
   `0.5.0-ac-only`. The AC registration form is disabled until this is true.
4. The admin enters **new** AC ID/name/IP, native SDK port (typically 8000),
   local password slot A/B/C/D, and physical outputs. No passwords travel to
   Railway. Browser confirms that device is truly new.
5. Authenticated outbound Gateway command `device.provision` checks the
   on-disk config for IP/ID collisions across ALL local devices (including
   disabled); refuses config drift; resolves only local credentials; checks
   native SDK login **without changing persons/rights/doors**.
6. The agent backs up `config/devices.json` and atomically **stages** just
   the new AC. It responds `STAGED; restartRequired=true` and does **not**
   alter the running SyncEngine, re-arm events, or claim the AC is ONLINE.
7. During a supervised maintenance period, the operator restarts Gateway
   with its ordinary Windows starter. The original engine reads the new AC
   normally at startup. After reboot: check new Gateway inventory and native
   card/event/door behavior before granting employee access.
8. To identify IP owner without PowerShell, the admin uses **RECONCILE**.
   New read-only command `device.inventory` reads `config/devices.json`
   and returns only IDs, names, IPs, roles, outputs, and enabled flags.
   It never exposes secrets. The UI blocks a duplicate visible IP.

## Important limitations

- The new AC can be added to the config **without manually editing JSON**,
  but activation is intentionally deferred until a controlled Gateway restart.
- This remains a **simulation-tested patch**; has not been verified on the
  user's live hardware, nor can a cloud deploy install code on their Windows PC.
- It will NOT rename, transfer or auto-link a reused IP. A reported collision
  (e.g. `192.168.3.219`) must be physically investigated, not overridden.
- It does not update existing facial/controller IPs after a renumbering.
- It cannot guarantee error-free operation on an untested SDK device. The
  on-site first attempt should be supervised with a known-good rollback.
- An old build of the Gateway TypeScript sources may overwrite the compiled
  agent, so do not run build/update scripts from an outdated archive.
- Rollback restores only the agent and removes the extra module, with hash
  checks. It does not remove any AC that was later staged in devices.json.
