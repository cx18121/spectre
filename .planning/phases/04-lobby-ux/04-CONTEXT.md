# Phase 4: Lobby UX - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers two host-facing pages served directly from the Rust server: (1) a landing page where someone selects a game, creates a room, or joins an existing room by code; and (2) a room page at `/rooms/{code}` showing three QR code cards (P1, P2, Overlay) with prefilled connection URLs. The goal is that a host opens the server URL, selects boxing or dance, creates a room, and immediately hands phones to two players who scan QR codes — no typing required. Phase 4 also extends DESIGN.md with a Lobby section before any implementation begins.

</domain>

<decisions>
## Implementation Decisions

### Phase order — DESIGN.md first
- **D-01:** DESIGN.md must be extended with a Lobby section before any HTML/CSS is written. The existing DESIGN.md covers the overlay/game HUD only; it does not specify lobby-specific components (game picker tiles, room cards, QR card layout, landing page sections). Phase 4 starts with a plan that writes this design spec, and subsequent plans implement against it.
- **D-02:** The lobby implementation uses DESIGN.md tokens (OKLCH palette, Inter type scale, spacing, button spec) for consistency. Visual styling decisions (selected tile colors, card borders, etc.) are captured in the DESIGN.md extension, not here.

### Game picker control
- **D-03:** Game picker is big clickable tiles — Boxing and Dance as two side-by-side full-width cards. Clicking selects the game; "Create Room" is disabled until a selection is made (LOBBY-02). 
- **D-04:** Each tile shows the game name only (BOXING / DANCE) in large type — no sub-descriptors. Clean, fast, matches the "tight utility" feel of the landing page.
- **D-05:** Selected state visual treatment (border color, background fill) is defined in the DESIGN.md Lobby extension (D-01), not locked here.

### Landing page layout
- **D-06:** Tight utility feel — SPECTRE as a compact header, not a dramatic hero. Gets to the game picker immediately. The page opens efficiently; the game itself provides the drama.
- **D-07:** Section order (top to bottom): SPECTRE header → game picker tiles → Create Room button → visual separator → Join by code section.
- **D-08:** Join section sits below Create Room with a visual break (separator or spacer). The two entry points — create a new room vs. join an existing one — are distinct and unambiguous.

### Join by code behavior
- **D-09:** "Join" is Kahoot-style: a player on their phone opens the server URL, types the 6-char room code, taps Join, and arrives in the mobile connection screen with the room pre-filled. This is a player flow, not a host recovery flow.
- **D-10:** Join navigates to `/mobile?room={CODE}` — the mobile connection app with the room code prefilled. The server URL (`?server=`) is auto-injected from the current page's origin (via `window.location.origin` in the generated JS, or baked into the HTML by the Rust handler using `PUBLIC_URL`). Player still selects their slot in the mobile connection screen.
- **D-11:** The join redirect must not navigate to `/rooms/{code}` (the QR card room page is a host tool, not a player tool).

### Room page structure
- **D-12:** `/rooms/{code}` is a separate GET route returning its own HTML page — not a SPA route or client-side navigation. Rust handles `GET /rooms/{code}` and generates the page server-side including QR codes.
- **D-13:** Three QR cards arranged in a horizontal 3-column grid: P1 | P2 | Overlay. Cards stack to a single column on narrow screens (mobile-responsive CSS grid).
- **D-14:** Each card contains: label (PLAYER 1 / PLAYER 2 / OVERLAY), QR code image, the prefilled URL as a clickable link, and a copy-to-clipboard button (LOBBY-07).
- **D-15:** Per-card color treatment (P1 crimson border vs P2 steel border vs neutral) is defined in the DESIGN.md Lobby extension.

### QR code generation
- **D-16:** Rust `qrcode` crate generates QR codes. Rendering format (inline SVG vs base64 PNG) is Claude's discretion — inline SVG preferred (no separate HTTP round-trip, scales perfectly, text-based so the HTML template stays readable).
- **D-17:** Each QR encodes the full prefilled connection URL:
  - P1: `{PUBLIC_URL}/mobile?server={WS_URL}&room={CODE}&slot=1`
  - P2: `{PUBLIC_URL}/mobile?server={WS_URL}&room={CODE}&slot=2`
  - Overlay: `{PUBLIC_URL}/overlay?server={WS_URL}&room={CODE}`
  where `WS_URL` is the WebSocket form of `PUBLIC_URL` (e.g., `wss://...`).
- **D-18:** Public base URL strategy: use a `PUBLIC_URL` env var (already present in STACK.md; set in Railway). For local dev, fall back to extracting the `Host` header from the incoming Axum request. Decision on exact implementation is deferred to 04-02 plan (noted as a blocker in STATE.md).

### Plan structure
- **D-19:** Phase 4 now has 3 plans (not 2):
  - 04-01-PLAN.md — Extend DESIGN.md with a Lobby section (game picker tiles, landing page layout, room cards, QR card spec, join section, typography and color treatments)
  - 04-02-PLAN.md — Rust: `GET /rooms/{code}` route, QR generation, room page HTML with 3 QR cards
  - 04-03-PLAN.md — Landing page rewrite: SPECTRE header, game picker tiles, Create Room flow, Join by code flow; follows the new DESIGN.md Lobby spec

### Claude's Discretion
- QR code SVG vs base64 PNG rendering format (SVG recommended)
- Exact DESIGN.md Lobby section content beyond the structural decisions captured above
- How `PUBLIC_URL` env var fallback works in Axum (Host header extraction)
- Auto-injection of `?server=` into Join redirect (use `window.location.origin` in the JS, or server-render it into the HTML)
- Room page 404 behavior when the code doesn't exist (show error inline or redirect to landing page)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design system (to be extended in 04-01)
- `DESIGN.md` — existing color tokens, type scale, spacing, button spec, elevation levels. Phase 4 adds a Lobby section here before building anything. READ BEFORE DESIGNING OR IMPLEMENTING.

### Existing lobby code (to be replaced)
- `engine/engine-core/src/main.rs` — current `LOBBY_HTML` const (lines 297–405) and `lobby_html()` handler (line 407); `POST /rooms` handler; Axum router (`build_app`). Phase 4 replaces `LOBBY_HTML` and adds `GET /rooms/{code}` route.

### Mobile + overlay URL params (QR link targets)
- `mobile/src/App.tsx` — reads `?server=`, `?room=`, `?slot=` params; `readInitialServerUrl`, `readInitialRoomCode`, `readInitialSlot`. QR codes for P1/P2 must include all three. Join redirect uses `?room=` (slot chosen by player in the mobile UI).
- `overlay/src/App.tsx` — reads `?server=` and `?room=` params; defaults to `ws://localhost:8002` and `MOCK01`. Overlay QR must include both.

### Environment / deployment
- `.planning/codebase/STACK.md` — `PUBLIC_URL` env var already defined in the Python server's env model; Railway sets it. Rust server adopts the same convention.

### Phase 4 requirements
- `.planning/REQUIREMENTS.md` — LOBBY-01 through LOBBY-08 are the full Phase 4 requirement list; read traceability section for phase mapping.

### Project constraints
- `.planning/PROJECT.md` — ENG-12 (static files at `/mobile` and `/overlay`); constraints section (wire protocol unchanged, no TypeScript client changes).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/engine-core/src/main.rs` `LOBBY_HTML` const — existing color token CSS vars, button styles, and `createRoom` JS function are a starting point. Phase 4 rewrites this but can port the working `POST /rooms` fetch logic.
- `engine/engine-core/src/main.rs` `build_app` router — adding `GET /rooms/{code}` follows the same Axum `.route()` pattern already established.

### Established Patterns
- Server-rendered HTML as `const &str` in `main.rs` — Phase 3 established this pattern; Phase 4 follows it. No build step, no file system dependency for the HTML.
- `axum::response::Html(...)` response type — used by `lobby_html()`; room page handler uses the same type.
- `POST /rooms?game={type}` already returns `{ "room_code": "ABC123" }` JSON — Create Room JS calls this, receives the code, and navigates to `/rooms/{CODE}`.

### Integration Points
- Axum router: new `GET /rooms/{code}` route added to `build_app` alongside existing `/`, `/rooms` (POST), `/ws/player/{room_code}`, `/ws/spectator/{room_code}`.
- `RoomManager` (or `AppState.rooms`): `GET /rooms/{code}` handler needs to verify the room exists before rendering the page; returns 404 HTML or redirect if not found.
- `qrcode` Rust crate: added to `engine/engine-core/Cargo.toml`; used in the `GET /rooms/{code}` handler to generate 3 QR SVG strings inline.
- `PUBLIC_URL` env var: read in `main.rs` at startup; passed into `AppState` or used directly in the room page handler to construct prefilled URLs.

</code_context>

<specifics>
## Specific Ideas

- Kahoot-style join: the landing page is the entry point for players on their phones (not just for the host). Typing a code → `/mobile?room={CODE}&server={ORIGIN}` is the intended UX reference.
- The "tight utility" feel means the landing page is functional-first — SPECTRE is a compact header, not a hero section. Appropriate for an app the host opens repeatedly.
- Create Room click: after the `POST /rooms` succeeds, the JS navigates via `window.location.href = '/rooms/' + code` — no full page reload needed, just a standard navigation.

</specifics>

<deferred>
## Deferred Ideas

- Room-not-found error handling in Join (Phase 5 scope — MOBILE-03 covers connection error differentiation)
- Slot selection on the Join redirect — currently player chooses slot in the mobile connection screen; a future improvement could let them pre-select on the landing page
- Landing page used as a display/cast target (e.g., showing room code prominently on a TV) — not in scope

</deferred>

---

*Phase: 4-Lobby UX*
*Context gathered: 2026-05-03*
