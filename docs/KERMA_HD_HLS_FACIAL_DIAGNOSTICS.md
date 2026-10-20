# Kerma CCTV HD continuous HLS and facial-relay diagnostics

## Deploy architecture

The Windows Gateway now establishes **two independent outbound, authenticated**
WebSockets toward the Kerma V2 backend:

- `/gateway`: doors, people, access events, native card sync, facial diagnostics.
  This link MUST NOT transfer video and remains the operational access channel.
- `/gateway-video`: **video ONLY**. Requests restricted in both client and
  backend to `nvr.hls.start` and `nvr.hls.fetch`. Any physical access command
  on this link is rejected.

The Windows Gateway locally connects to the Hikvision NVR RTSP endpoints using
the credentials stored in its existing private `config/nvrs.json` / `.env`
configuration. It converts RTSP/H.265 or H.264 to browser-compatible H.264 HLS
using FFmpeg. No NVR credentials are sent to Railway or the browser.

The browser plays HLS through `hls.js` using a signed, user-bound URL.
The backend checks **current CCTV permission and active account status on
every playlist/segment request** (not only when initially issued), including
after a Commander removes that permission.

An older Windows Gateway without the video agent cannot start HLS. Kerma
falls back to visible snapshot mode; **do not confuse that with continuous HD**.

## Video profiles and honest limits

| View | Target | Limits |
| --- | --- | --- |
| Single focused tile (1x1) | Main NVR stream, up to 1920x1080, H.264 20 fps | 2 concurrent main transcodes |
| Grid tile (2x2/3x3/4x4) | Sub NVR stream, up to 960x540, H.264 12 fps | 8 total encoders |
| Legacy/failure fallback | Polling JPEG snapshots | NOT continuous video |

Full HD requires a real HD input from the NVR, a reachable RTSP channel,
FFmpeg installed on Windows and sufficient CPU/uplink. Segment duration is
2 seconds; expect **several seconds of latency**, not sub-second WebRTC.
The 4x4 grid may need a capacity increase, hardware acceleration or additional
gateway workers beyond the present eight-stream safety cap. Capacity control
prevents unbounded FFmpeg creation.

Production validation not yet performed: real camera picture quality,
sustained CPU, video jitter, stream restarts, disk use and bandwidth across
the real NVRs. These all require the updated **local** Windows Gateway.

## Windows patch

Run `ACTUALIZAR-KERMA-CCTV-HD.bat` from the separately supplied
`Kerma-Gateway-CCTV-HD-Facial-Safety-Update.zip` on the actual onsite machine.
The updater finds the Gateway folder or opens a folder picker and creates
backups of only the changed source/compiled code. It **never** copies or changes
`.env`, credentials, stored personnel, configuration, Hikvision SDK DLLs or
SQLite. This operation intentionally **does not auto-kill a running Gateway**.
Restart during a supervised maintenance window. Check `ffmpeg.exe` is in
PATH or set `FFMPEG_PATH`.

Do NOT use this patch for a Gateway whose source layout no longer matches
`Kerma-Gateway-Windows`. Keep a Windows backup before commissioning.
No credentials are included in this source/compiled-code-only patch.

## Facial output: momentary pulse versus remain-open

- Hikvision's manuals document momentary `Open Door` and `Remain Open` as
  distinct functions on **supported** models. Hardware compatibility is not
  universal.
- On the legacy Windows Gateway, `SyncEngine.openDoor()` used to fall back
  to Hik-Connect `openDoor()` whenever a local command failed. That cloud
  fallback is only momentary; a failed `alwaysOpen` could therefore seem
  successful even though the relay soon reclosed.
- The supplied Windows patch changes fallback logic: **only `cmd=open` may
  fall back**. `alwaysOpen` and `close` must succeed locally or report
  a failure. No repeated pulses or timer tricks are introduced.
- Commander-only `GET /api/emergency/facial-diagnostics/{gatewayDeviceId}`
  reads DeviceInfo, capabilities and door status through the existing Gateway
  **without actuating any output**. The panel makes this explicit.
- The one-door physical-test route continues to block facial terminals for
  sustained release until hardware compatibility is established, and the
  overall 35-door emergency release remains disabled by default.

**Commissioning:** confirm exact model/firmware and the
`/ISAPI/AccessControl/RemoteControl/door/capabilities` response. Have qualified
EHS/fire-safety and access-control personnel verify NO/NC wiring, fail-safe
egress, backup power, magnetic/strike lock type and local independent emergency
release. A successful Gateway ACK is never proof of physical safety.

## Release verification

- Backend and frontend builds must both be SUCCESS.
- Until the local patch is installed, video stays in snapshot fallback.
- On a supervised Windows machine, run `ffmpeg -version`, start Gateway,
  verify a **separate** video WebSocket registration in its log, then focus
  one test camera. Watch 1080p H.264 status, playback continuity, CPU usage,
  outbound WAN bandwidth, reconnect after disconnect and a second user.
- Check Andrea-style no-CCTV accounts get HTTP 403 on live start, token reuse
  after permission revocation and camera/NVR list access.
- For a facial model, run the new **read-only** diagnostic and share its
  model/firmware/capabilities output, then plan a locally supervised relay
  test only if supported. Never test during actual evacuation.
