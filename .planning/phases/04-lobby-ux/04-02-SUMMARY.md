---
phase: "04"
plan: "02"
subsystem: engine-core
tags: [rust, axum, qr-code, room-page, lobby, server-rendered-html]
dependency_graph:
  requires:
    - "04-01"  # DESIGN.md Lobby section (color tokens, typography, room page spec)
  provides:
    - "GET /rooms/{code} route with QR cards HTML"
    - "RoomHandle.game_type field"
    - "RoomManager.get_room_game_type() helper"
  affects:
    - "engine/engine-core/src/main.rs"
    - "engine/engine-core/src/room_manager.rs"
tech_stack:
  added:
    - "qrcode = { version = \"0.14\", default-features = false, features = [\"svg\"] }"
  patterns:
    - "Inline SVG QR code generation via qrcode crate"
    - "PUBLIC_URL env var with Host header fallback for base URL"
    - "Server-rendered HTML with format!() macro and CSS {{ }} escaping"
key_files:
  created: []
  modified:
    - "engine/engine-core/Cargo.toml"
    - "engine/engine-core/src/room_manager.rs"
    - "engine/engine-core/src/main.rs"
decisions:
  - "Used inline SVG (not base64 PNG) for QR codes — no extra HTTP round-trip, scales perfectly"
  - "public_base_url() prefers PUBLIC_URL env var over Host header — mitigates T-04-02-02 host header injection in prod"
  - "ws_url_from_http() derives wss:// from https:// and ws:// from http:// for correct WebSocket URLs"
  - "get_room_page handler normalizes room code to uppercase before lookup"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-06T03:00:34Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 4 Plan 02: Room Page QR Cards Summary

Rust Axum `GET /rooms/{code}` route serving server-rendered HTML with three inline SVG QR cards (P1 slot=1, P2 slot=2, Overlay), generated using the `qrcode` crate with DESIGN.md color tokens and Inter typography.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add game_type to RoomHandle and qrcode crate dependency | c063fad | engine/engine-core/Cargo.toml, engine/engine-core/src/room_manager.rs, engine/engine-core/src/main.rs |
| 2 | Implement GET /rooms/{code} handler with QR cards HTML | 8888ac8 | engine/engine-core/src/main.rs |

## What Was Built

**Task 1 — game_type field + qrcode crate:**
- Added `qrcode = { version = "0.14", default-features = false, features = ["svg"] }` to Cargo.toml
- Added `pub game_type: String` field to `RoomHandle` struct
- Updated `RoomManager::create_room()` signature to accept `game_type: String` as third parameter
- Added `RoomManager::get_room_game_type()` helper that returns `Option<String>` without holding DashMap guard
- Updated `create_room` call site in main.rs to pass `game.to_string()`
- Updated all 6 test call sites in room_manager.rs tests to pass `"boxing".to_string()`

**Task 2 — GET /rooms/{code} route:**
- Added `.route("/rooms/{code}", get(get_room_page))` to `build_app`
- `public_base_url()`: checks `PUBLIC_URL` env var first, falls back to Host header; uses `http://` for localhost, `https://` otherwise
- `ws_url_from_http()`: converts `https://` → `wss://` and `http://` → `ws://`
- `generate_qr_svg()`: uses `qrcode::QrCode` + `qrcode::render::svg` with dark color `#0c0809` (--bg-deep) and light color `#f5efe4` (--text-primary), fixed 160×160px
- `room_page_html()`: builds P1/P2/Overlay URLs with correct params, generates 3 SVGs, returns full HTML with DESIGN.md tokens (OKLCH vars, Inter font, 3-column grid, per-card borders)
- `room_not_found_html()`: returns 404 page with exact copywriting from UI-SPEC
- `get_room_page` handler: 200 HTML for known rooms, 404 HTML for unknown rooms, normalizes code to uppercase
- Two new tests: `get_rooms_code_returns_404_for_unknown_code` and `get_rooms_code_returns_200_for_existing_room`

## Verification

All cargo tests pass:
- `engine-core` bin: 45 passed, 0 failed
- `engine-core` lib: 37 passed, 0 failed  
- `protocol_roundtrip`: 18 passed, 0 failed
- doc-tests: 0 passed (no doc tests)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

The `get_room_page` handler is a new network endpoint introduced as part of this plan. It is already covered in the plan's `<threat_model>`:
- T-04-02-01: Room code path param spoofing — mitigated by uppercase normalization, no auth required by design
- T-04-02-02: Host header injection — mitigated by PUBLIC_URL env var preference
- T-04-02-05: XSS in onclick attrs — URLs constructed from server-controlled values only (PUBLIC_URL + server-generated room codes)

No additional threat surface beyond what was planned.

## Known Stubs

None. The route is fully functional: QR SVGs are generated inline, prefilled URLs use correct params, copy buttons invoke `navigator.clipboard.writeText`.

## Self-Check: PASSED

Files verified to exist:
- engine/engine-core/Cargo.toml: contains `qrcode`
- engine/engine-core/src/room_manager.rs: contains `pub game_type: String` and `get_room_game_type`
- engine/engine-core/src/main.rs: contains `get_room_page`, `generate_qr_svg`, `public_base_url`, `ws_url_from_http`, `room_not_found_html`

Commits verified:
- c063fad: feat(04-02): add game_type to RoomHandle and qrcode crate dependency
- 8888ac8: feat(04-02): implement GET /rooms/{code} with QR card HTML
