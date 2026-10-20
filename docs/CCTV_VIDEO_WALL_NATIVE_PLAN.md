# Kerma CCTV video wall — visual controls and streaming boundary

## Current implementation

The web video wall is integrated into Kerma V2. Available controls:

- NVR-based channel tree and search; drag/drop camera to windows
- 1×1 / 2×2 / 3×3 / 4×4 layouts, persisted in browser
- Double-click a camera to focus its window; double-click again to restore
- Hide/show camera tree, browser fullscreen, detached pop-up video wall
- JPEG frame requests run **sequentially** per tile (no overlapping polling);
  inactive browser tabs pause the polling to limit Gateway/NVR load

**Important:** The local Gateway currently exposes the `nvr.snapshot`
command which returns JPEG still images. This is NOT the continuous
RTSP/video channel used by Hikvision iVMS. The UI states this explicitly.

## Requirement for native, fluid CCTV

To achieve iVMS-like live video (not pictures), the **local Windows Gateway**
must provide authenticated continuous camera streams:

1. Connect to NVR RTSP main/substreams from inside the LAN, with channel
   credentials retained locally and never sent to the browser or repository.
2. Transcode or forward these streams in a browser-compatible protocol
   such as WebRTC (preferred for low latency) or HLS/LL-HLS.
3. Serve streams through an authorized reverse proxy/secure tunnel with
   per-user CCTV permissions; the existing snapshot API cannot replace this.
4. Handle simultaneous camera viewing, stream lifecycle/reconnection,
   bitrate/substream selection, and device failures without loading 16
   full-resolution decoders onto a single computer.
5. Verify live streams on LAN and remotely before retiring JPEG fallback.

Do not put NVR RTSP credentials into browser JavaScript or publicly exposed
Railway variables. Railway cannot directly reach private 192.168.x.x NVR IPs
without an authorized private network tunnel.

The backend already includes an RTSP → HLS converter for sources that the
backend can directly reach, but synced NVR channels normally have `rtsp: ""`
and private IP addresses. Therefore this is not yet a native live-video path
for current onsite NVRs.

This change only upgrades the wall UX and snapshot request lifecycle;
it does not claim WebRTC, PTZ, playback archive, or native Hikvision SDK.
