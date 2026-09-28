# AegisNet · Security Command OS — PRD

## Original Problem Statement
"lets create a SAAS where i can connect it through a gateway to check building access, map layout to place doors and open them remotely, need to add nvrs to be able to view video in real time, need to be able to enroll new employees and add card number, face and sincronize it with our facial scanners and card readers, need to have real time events of access on the building... but i just want the design of the saas page... technologic, good looking, like a professional security app and not just another web page"

User choices: design-only first version; black background with blueish degrading colors.

## Product
AegisNet Security Command OS — a dark, SOC-grade SaaS interface for building access control: gateways, door remote control, NVR live video, biometric + RFID enrollment, and a real-time access event audit trail.

## User Personas
- Security operations officer monitoring a building live
- Facility admin enrolling employees and managing hardware
- Shift commander reviewing access audit trails

## Architecture
- Frontend-only React SPA (design-first, all data simulated client-side)
- `/app/frontend/src/context/SecurityContext.jsx` — live state: doors, events stream (5.2s generator), employees, remote-open actions
- `/app/frontend/src/data/mockData.js` — cameras, doors, employees, devices, event generator
- Pages: Dashboard, FloorMap, LiveFeeds, Employees, Devices, Events
- Components: Sidebar, Topbar, FloorPlan (SVG blueprint), EventsFeed, PageHeader, Logo (SVG mark, also favicon)
- Styling: Tailwind + custom theme in index.css (Orbitron/Rajdhani/Plus Jakarta Sans/JetBrains Mono, scanlines, grid, noise, marquee, radar sweep)
- Motion: framer-motion (masked hero reveal, staggered panels, event row entrances), lenis smooth scroll
- Backend (FastAPI/MongoDB) untouched — reserved for real gateway/NVR integration

## Implemented (2026-07 / build 1)
- Dashboard: kinetic masked hero reveal, animated stat counters, live events feed, mini door grid, gateway mesh health, NVR quick view, editorial marquee
- Floor Map: SVG blueprint of Floor 04 with 8 pulsing door nodes (locked/unlocked/alarm/releasing), door detail panel with assigned camera feed, remote open with latch-release animation + 10s auto-relock, alarm silence
- Live Feeds: 6-channel NVR grid (4 live CCTV-treated feeds + 2 NO SIGNAL static channels), REC blinking, live timestamps, motion badges, PTZ hover controls, fullscreen channel modal
- Employees: credential cards (photo, RFID, face-sync %, access level), copy card number, per-user device sync, enroll modal with animated face-capture scan and auto card generation
- Devices: gateway/NVR/facial scanner/card reader matrix with IP, firmware, signal bars, online/degraded/offline states, sync actions
- Events Log: searchable/filterable (door, result, method) live audit trail with stream pause toggle and export stub
- All verified via Playwright: page loads, door remote open + toast, camera zoom modal, full enroll flow (scan → submit → card appears), events filtering, devices page

## Branding update (build 2)
- Kerma Games logo (wordmark SVG from kermagames.com) in the sidebar, bulldog icon as favicon, browser title "Kerma · Security Command OS", hero eyebrow rebranded to KERMA GAMES

## Warm accent blend (build 3)
- Kerma orange-gold (#FEE396 / #EA7F2B) woven through: gold corner frames, hero gradient tail, enroll CTA, alerts pill/bar, radar core, marquee dots, motion badges, remote-event icons, selected-door ring

## Officer Login (build 3)
- Full JWT auth (FastAPI + MongoDB + bcrypt + PyJWT, Bearer tokens, 12h sessions)
- Full lockout: visitors only see the Kerma login screen
- Commander (juan.alvarez@kermagames.com) seeds on startup only when missing
- Commander creates officer accounts at /officers — backend generates a temporary password shown once; officers are forced through a password-rotation screen on first login
- Domain allowlist enforced server-side: only @kermagames.com and @trivelta.com
- Brute-force lockout: 5 failed attempts = 15 min
- Officers nav hidden from non-commanders; officers API rejects non-commanders with 403
- Verified: curl chain (domain reject, login, me, rotate, create officer, domain-reject on create) + Playwright e2e (visitor lockout, temp login, forced rotation, console, officer nav hidden, logout)

## Login Motion + Session Audit (build 4)
- "CLEARANCE GRANTED" radar-sweep interstitial (Kerma icon core, gold/cyan conic sweep, contact pings, progress bar) plays between sign-in and the console
- Every login records a session (IP, browser/OS, signed-in and last-active times); JWTs carry a session id so revoked sessions die instantly
- Officers page shows LAST LOGIN per account, a LIVE badge counting sessions active in the last 30 min (auto-refresh 15s), and an expandable per-officer session audit trail
- Verified: curl chain for session records + Playwright e2e (splash mid-transition, dashboard after, expanded session rows)

## Real Registry Management (build 5)
- Employees, cameras and devices (gateways/NVRs/facial scanners/card readers) are now persisted in MongoDB with full add/delete — all sample/fictitious data removed, system starts empty
- Enrollment: enroll modal saves to the registry; each card has a two-step DELETE (revoke) action
- Live Feeds: ADD CAMERA modal (label, location, assigned NVR, optional snapshot URL); channels without a frame show "AWAITING FIRST FRAME"; hover a tile to delete; PTZ overlay kept
- Access Devices: ADD DEVICE modal (type/name/IP/firmware); per-card delete; deleting an NVR unassigns its cameras
- Dashboard stats, gateway mesh, camera quick view and marquee now compute from real data; empty states with CTAs everywhere
- Floor map doors remain a sample layout (door placement editor is a separate future step)
- Verified: curl CRUD chain (create/list/delete for all three collections) + Playwright e2e (add NVR, enroll + delete employee, add camera, empty states)

## Mocked / Not Real Yet
- ALL data is simulated (no real gateway, NVR, scanner, or reader connectivity)
- No backend persistence; state resets on reload
- No authentication
- Video tiles are treated stills, not RTSP streams

## Backlog
- P0: Real backend (FastAPI + MongoDB) persisting employees, doors, events
- P0: Auth (login for officers/admins)
- P1: Gateway integration layer (WebSocket/MQTT) for real door controllers + real event stream
- P1: NVR RTSP/ONVIF stream proxy for true live video
- P1: Face enrollment via device camera capture
- P2: Multi-building/floor switching, door scheduling, anti-passback rules engine
- P2: Alert rules + notifications (email/SMS), CSV/PDF audit export
- P2: Occupancy analytics and heatmaps
