---
phase: 04-lobby-ux
verified: 2026-05-05T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open server URL in browser, verify SPECTRE heading and game picker are displayed; click BOXING tile and confirm Create Room button enables"
    expected: "BOXING tile gains crimson border/background; Create Room button changes from 0.5 opacity/no-pointer-events to fully clickable with accent border"
    why_human: "CSS class toggling via JS onclick cannot be verified without a live browser"
  - test: "Click Create Room after selecting a game, confirm navigation to /rooms/{code}"
    expected: "Browser navigates to /rooms/XXXXXX; page shows room code prominently, game badge, subtitle, and three QR cards"
    why_human: "fetch() + window.location.href redirect requires a live browser"
  - test: "Scan the P1 QR code on a physical phone; confirm the mobile app opens with server, room, and slot prefilled"
    expected: "Mobile app connection screen shows the room code and slot=1 pre-populated; player can connect without typing"
    why_human: "QR scanning and mobile app parameter intake require physical devices"
  - test: "On landing page, type a 6-char room code in the Join field and click Join Room; confirm navigation to /mobile?room=...&server=..."
    expected: "Browser navigates to /mobile with room= and server= query params matching typed code and window.location.origin"
    why_human: "window.location.origin redirect requires a live browser"
  - test: "Verify room page renders correctly on a viewport <600px (mobile width)"
    expected: "QR card grid collapses from 3 columns to 1 column; all cards still readable"
    why_human: "Responsive CSS breakpoint behavior requires a browser at specified viewport width"
  - test: "Click Copy Link button on any QR card; confirm clipboard receives the URL and button shows 'Copied!' for ~2 seconds"
    expected: "navigator.clipboard.writeText fires; button text changes to 'Copied!' with gold border; reverts after 2000ms"
    why_human: "Clipboard API and timeout behavior require a live browser context"
---

# Phase 4: Lobby UX Verification Report

**Phase Goal:** A host can open the server URL, select a game, create a room, and immediately hand phones to two players — each player scans a QR code and is connected without typing anything.
**Verified:** 2026-05-05
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Landing page shows SPECTRE branding with boxing/dance selector; "Create Room" is disabled until a game is selected | ✓ VERIFIED | `LOBBY_HTML` const contains `SPECTRE` heading, `real punches. real fights.` tagline, BOXING/DANCE tiles with `selectGame('boxing')` / `selectGame('dance')` onclick; `.btn-create` CSS has `pointer-events: none; opacity: 0.5` by default; `.btn-create.enabled` class added only after `selectGame()` runs |
| 2 | After creating a room, host arrives at `/rooms/{code}` with three QR code cards (P1, P2, Overlay) | ✓ VERIFIED | `GET /rooms/{code}` route registered at `main.rs:36`; `get_room_page` handler at line 248 returns 200 HTML with `.qr-card.p1`, `.qr-card.p2`, `.qr-card.overlay` divs; `get_rooms_code_returns_200_for_existing_room` test passes |
| 3 | Scanning the P1 QR code on a phone opens the mobile app with server, room, and slot all prefilled — no typing required | ✓ VERIFIED | `room_page_html()` constructs `p1_url = format!("{}/mobile?server={}&room={}&slot=1", base_url, ws_url, code)` (line 86); SVG QR generated via `generate_qr_svg(&p1_url)`; wss:// scheme derived from https:// via `ws_url_from_http()` |
| 4 | A guest can join an existing room from the landing page by entering a 6-char code | ✓ VERIFIED | `joinRoom()` JS function at `main.rs:721-726` reads input value, navigates to `/mobile?room=…&server=…` using `window.location.origin`; `Join a Room` section label and join input present; Join Room button disabled (pointer-events:none) when input empty |
| 5 | The page matches DESIGN.md — correct OKLCH tokens, Inter font, no neon/glassmorphism | ✓ VERIFIED | LOBBY_HTML and `room_page_html()` both embed full `:root` with 9 OKLCH tokens (35 `oklch()` occurrences in main.rs); Inter loaded via Google Fonts; no `backdrop-filter`, `text-shadow`, `neon`, `glow`, or `linear-gradient` found; `## Lobby` section added to DESIGN.md verbatim from 04-UI-SPEC.md |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `DESIGN.md` | Lobby section with game picker, landing page, room page, QR card specs | ✓ VERIFIED | `## Lobby` section present (grep returns 1); contains Game picker (3 matches), QR Card (2), Room Page (2), `--accent-p2` (7), `--gold` (6), `160px` (2), `min-height 80px` (1); all pre-existing sections intact |
| `engine/engine-core/Cargo.toml` | qrcode crate dependency | ✓ VERIFIED | `qrcode = { version = "0.14", default-features = false, features = ["svg"] }` at line 29 |
| `engine/engine-core/src/room_manager.rs` | game_type field on RoomHandle | ✓ VERIFIED | `pub game_type: String` at line 22; `get_room_game_type()` helper at line 119; all 6 test call sites pass `"boxing".to_string()` as third argument |
| `engine/engine-core/src/main.rs` | GET /rooms/{code} route, QR generation, LOBBY_HTML rewrite | ✓ VERIFIED | Route registered at line 36; `generate_qr_svg()` at line 71; `room_page_html()` at line 84; `public_base_url()` at line 45; `ws_url_from_http()` at line 61; `room_not_found_html()` at line 208; `LOBBY_HTML` rewritten with full SPECTRE landing page at line 522 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `build_app` | `GET /rooms/{code}` | `.route("/rooms/{code}", get(get_room_page))` | ✓ WIRED | `main.rs:36` |
| `get_room_page` handler | `AppState.rooms` | `rooms.get_room_game_type(code)` | ✓ WIRED | `main.rs:254` |
| QR URL builder | `PUBLIC_URL` env var / Host header | `public_base_url()` helper | ✓ WIRED | `main.rs:45-57`; checks `PUBLIC_URL` first, falls back to Host header |
| `LOBBY_HTML` game picker tiles | `selectedGame` JS variable | `onclick="selectGame('boxing')"` / `onclick="selectGame('dance')"` | ✓ WIRED | `main.rs:649-651`; `selectGame()` sets `selectedGame` and adds `.enabled` class |
| `LOBBY_HTML` Create Room button | `POST /rooms` | `createRoom()` JS function | ✓ WIRED | `main.rs:685-709`; POSTs to `/rooms?game=` + selectedGame, navigates to `/rooms/` + room_code on 200 |
| `LOBBY_HTML` Join Room button | `/mobile?room=&server=` | `joinRoom()` JS function using `window.location.origin` | ✓ WIRED | `main.rs:721-726`; navigates to `/mobile?room=…&server=…` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `room_page_html()` | `p1_url`, `p2_url`, `overlay_url` | `base_url` from `public_base_url()` + `ws_url_from_http()` + room `code` + hardcoded slot numbers | Yes — server constructs URLs from real base URL and actual room code looked up from DashMap | ✓ FLOWING |
| `get_room_page` handler | `game_type` | `app.rooms.get_room_game_type(&code_upper)` → DashMap lookup → stored `RoomHandle.game_type` | Yes — stored at `create_room` time, retrieved on demand | ✓ FLOWING |
| `generate_qr_svg()` | SVG bytes | `qrcode::QrCode::new(url.as_bytes())` with real URL string | Yes — encodes the full prefilled URL | ✓ FLOWING |
| `LOBBY_HTML` | `selectedGame` | JS state variable set by `selectGame()` onclick | Yes — live JS state, drives POST game param | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `GET /rooms/XXXXXX` returns 404 HTML | cargo test `get_rooms_code_returns_404_for_unknown_code` | PASSED | ✓ PASS |
| `POST /rooms?game=boxing` + `GET /rooms/{code}` returns 200 HTML | cargo test `get_rooms_code_returns_200_for_existing_room` | PASSED | ✓ PASS |
| `GET /` returns 200 with SPECTRE + selectGame assertions | cargo test `get_lobby_contains_boxing_and_dance_buttons` | PASSED | ✓ PASS |
| All engine-core tests (47 bin + 18 protocol roundtrip) | `cargo test -p engine-core` | 65 passed, 0 failed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LOBBY-01 | 04-03 | Landing page shows SPECTRE title, tagline, game type selector | ✓ SATISFIED | `LOBBY_HTML` contains SPECTRE heading, `real punches. real fights.`, BOXING/DANCE tiles |
| LOBBY-02 | 04-03 | User selects game type; selection required before Create Room enabled | ✓ SATISFIED | `selectGame()` toggles `.enabled` class; `.btn-create` default has `pointer-events:none` |
| LOBBY-03 | 04-03 | Create Room POSTs to `/rooms?game={type}`, navigates to `/rooms/{code}` | ✓ SATISFIED | `createRoom()` at `main.rs:693-696` |
| LOBBY-04 | 04-03 | User can join existing room from landing page by entering 6-char code | ✓ SATISFIED | `joinRoom()` at `main.rs:721-726` with 6-char maxlength input |
| LOBBY-05 | 04-02 | `GET /rooms/{code}` renders room page with room code and three connection cards | ✓ SATISFIED | Handler at `main.rs:248`; returns HTML with `.qr-card.p1`, `.p2`, `.overlay` |
| LOBBY-06 | 04-02 | Each connection card contains a QR code encoding the full prefilled URL | ✓ SATISFIED | `generate_qr_svg()` called with full URL including server+room+slot; inline SVG embedded in card |
| LOBBY-07 | 04-02 | Each connection card shows a clickable URL and copy-to-clipboard button | ✓ SATISFIED | `<a href="{p1_url}" target="_blank">` + `<button class="copy-btn" onclick="copyLink(this, '{p1_url}')">` |
| LOBBY-08 | 04-01, 04-02, 04-03 | Pages use DESIGN.md color tokens, Inter typography, component specs | ✓ SATISFIED | `## Lobby` section in DESIGN.md; both LOBBY_HTML and room_page_html embed 9 OKLCH `:root` tokens; Inter from Google Fonts |

All 8 requirements (LOBBY-01 through LOBBY-08) are covered. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `engine/engine-core/src/main.rs` | 71 | `QrCode::new(b"error").unwrap()` in fallback — panic if fallback also fails | ⚠️ Warning | Code-review WR-01: silent "error" QR on oversized URL; no logging; functional for realistic URL lengths |
| `engine/engine-core/src/main.rs` | 45-58, 84-205 | Host header interpolated raw into HTML `href`, link text, and `onclick` JS string | ⚠️ Warning | Code-review BLK-01: reflected XSS vector in local-dev / no-`PUBLIC_URL` deployments; mitigated in prod by `PUBLIC_URL` env var |
| `engine/engine-core/src/main.rs` | 61-67 | `ws_url_from_http()` silently returns unchanged string if `PUBLIC_URL` lacks scheme | ⚠️ Warning | Code-review BLK-02: malformed QR URLs if operator sets `PUBLIC_URL=hostname.com` without `https://` |
| `engine/engine-core/src/room_manager.rs` | 200-216 | `expiry_task` calls `is_expired()` while holding DashMap shard read-lock | ⚠️ Warning | Code-review WR-06: theoretical lock-order inversion; not a current deadlock risk |

**Classification note:** The two code-review BLK items are security robustness concerns, not functional gaps blocking the phase goal. Per verification instructions, code-review findings are advisory and not auto-fail criteria. No functional stub or missing wiring is present. The QR URL construction, routing, and HTML generation all produce correct output for valid inputs.

### Human Verification Required

#### 1. Game Picker Selection + Create Room Flow

**Test:** Open the server (`http://localhost:8000/`) in a browser. Observe the landing page. Click the BOXING tile. Observe the tile and Create Room button state.
**Expected:** BOXING tile acquires crimson border (`var(--accent)`) and tinted background; Create Room button becomes fully clickable (opacity 1, pointer-events auto); clicking Create Room shows "Creating..." then navigates to `/rooms/XXXXXX`
**Why human:** CSS class toggling via JS onclick and `window.location.href` redirect cannot be verified without a live browser

#### 2. QR Code Scan on Physical Device

**Test:** After creating a room, scan the P1 QR code on a phone. Observe the mobile app connection screen.
**Expected:** The mobile app opens (via `/mobile`) with `?server=wss://host&room=XXXXXX&slot=1` all prefilled in the URL; no manual typing required; player can tap Connect directly
**Why human:** Requires physical mobile device with camera and the mobile app built and served

#### 3. Guest Join Flow

**Test:** On the landing page, type a 6-char code (e.g. an existing room code) in the "Room Code" input. Observe that characters are uppercased as typed. Click "Join Room".
**Expected:** Join Room button enables when first character is typed; clicking navigates to `/mobile?room=XXXXXX&server=http://localhost:8000`
**Why human:** Input uppercasing behavior and `window.location.origin` redirect require a live browser

#### 4. Room Page Responsive Collapse

**Test:** Open a room page at `/rooms/XXXXXX` with a browser viewport width below 600px (or using DevTools device emulation).
**Expected:** The 3-column QR card grid collapses to a 1-column layout; card order is P1, P2, Overlay; all cards remain readable
**Why human:** CSS `@media (max-width: 599px)` breakpoint requires a browser viewport

#### 5. Copy Link Button Feedback

**Test:** On the room page, click the "Copy Link" button on any QR card.
**Expected:** `navigator.clipboard.writeText()` fires; button text changes to "Copied!" and border turns gold; button reverts to "Copy Link" after approximately 2 seconds
**Why human:** Clipboard API and `setTimeout` behavior require a live browser context

#### 6. 404 Page for Unknown Room Code

**Test:** Navigate to `/rooms/ZZZZZZ` (a code that doesn't exist) in a browser.
**Expected:** Page displays "Room not found" heading, error body text, and a "Back to Lobby" link pointing to `/`
**Why human:** While the 404 status code is verified by cargo tests, the visual presentation and link functionality require a browser

---

### Gaps Summary

No functional gaps. All 5 Success Criteria from ROADMAP.md are verified by code inspection and automated tests. All 8 requirements (LOBBY-01 through LOBBY-08) have supporting implementation evidence. The 6 human verification items listed above are UX behaviors that require a live browser or physical device — they cannot be confirmed programmatically. The code-review security findings (BLK-01 XSS, BLK-02 scheme validation) are advisory notes, not functional blockers for the phase goal.

---

_Verified: 2026-05-05_
_Verifier: Claude (gsd-verifier)_
