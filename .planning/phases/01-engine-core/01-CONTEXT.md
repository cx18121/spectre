# Phase 1: Engine Core - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a Rust Axum + Tokio WebSocket server that replaces the Python FastAPI server with byte-for-byte wire protocol compatibility. The room-actor concurrency model is in place, the 60Hz game loop runs, the spectator snapshot bug (FIX-02) is fixed, and all message types pass golden-file roundtrip tests. TypeScript clients (mobile, overlay) are untouched. The boxing game logic and plugin trait are Phase 2 scope.

</domain>

<decisions>
## Implementation Decisions

### Crate Layout

- **D-01:** Cargo workspace at `engine/` (repo root). Root `Cargo.toml` declares `[workspace]` with `engine-core` as the first member. Phase 2 will add `plugin-trait` and `boxing-plugin` as additional workspace members.
- **D-02:** Python server stays at `server/` until Phase 1 cutover is complete — both can run independently during development. Dockerfile switches to the Rust binary at end of Phase 1.
- **D-03:** `engine/engine-core/src/` uses responsibility-mapped modules mirroring the Python layout: `main.rs` (Axum routes + startup), `protocol.rs` (serde models), `room.rs` (RoomState, PlayerSlot, actor task), `room_manager.rs` (DashMap registry), `input_delay.rs` (RTT fairness buffer), `broadcast.rs` (spectator fan-out), `game_loop.rs` (60Hz tick loop).

### Protocol Sync Strategy

- **D-04:** Rust serde models are the new source of truth for the wire protocol. `shared/protocol.ts` is generated from Rust using **ts-rs** (`#[derive(TS)]` macro). The existing `gen_protocol.py` is replaced. Running `cargo test` exports TypeScript bindings.
- **D-05:** Golden-file JSON fixtures for PROTO-02 roundtrip tests are captured by running the Python server and recording real message instances via `scripts/capture_fixtures.py`. Fixtures are stored at `engine/engine-core/tests/fixtures/*.json`. This guarantees fixtures reflect actual Python server behavior, not manual transcription.

### Commentary

- **D-06:** Commentary is v2 scope. The Phase 1 Rust server never sends `commentary_text` or `commentary_audio` messages. The overlay's commentary handlers simply never fire — this is handled gracefully; no TypeScript changes required.
- **D-07:** A `GameEvent` enum is defined in Phase 1 for all internal game loop events (this is relevant for the overall architecture). Commentary-related variants (e.g., `CommentaryHint`) are deferred to Phase 2+. The enum shape is established now so Phase 2 can extend it without renaming.

### Room Lifecycle

- **D-08:** Room expiry is included in the Rust rewrite. A background Tokio task scans the DashMap every 60 seconds and removes rooms where `match_over == true` AND all player WebSocket handles have been `None` for more than 10 minutes.

### Claude's Discretion

- Internal error handling strategy within the WebSocket path (log-and-continue pattern from Python is a reasonable default to port)
- Exact Cargo dependency versions (axum, tokio, dashmap, serde, ts-rs, etc.) — researcher should pick current stable versions
- Whether `game_loop.rs` placeholder (before boxing logic arrives in Phase 2) runs a trivial no-op tick or a minimal warmup counter

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Wire Protocol (highest priority)
- `shared/protocol.ts` — TypeScript wire contract; Rust serde models must match every field name, discriminator, and optional field exactly
- `server/protocol.py` — Python source of truth for current message shapes; the capture fixture script runs against the Python server

### Engine Requirements (Phase 1 scope)
- `.planning/REQUIREMENTS.md` — ENG-01..13, PROTO-01..03, FIX-02 are the full Phase 1 requirement list; read traceability section

### Existing Python Implementation (port reference)
- `server/main.py` — Axum routes mirror: `/ws/player/{room_code}`, `/ws/spectator/{room_code}`, static file serving at `/mobile` and `/overlay`
- `server/rooms.py` — RoomState, PlayerSlot, RoomManager: actor state layout to port
- `server/game_loop.py` — 60Hz async loop, warmup gating (`_ROUND_WARMUP = 3.8`), round lifecycle, input buffer drain
- `server/input_delay.py` — RTT fairness cutoff algorithm to port exactly
- `server/broadcast.py` — spectator fan-out pattern

### Project Decisions
- `.planning/PROJECT.md` — Key Decisions table (Axum+Tokio, wire protocol unchanged, commentary ported last)
- `.planning/codebase/ARCHITECTURE.md` — data flow diagrams, component responsibilities, anti-patterns to avoid
- `.planning/codebase/CONCERNS.md` — known bugs and fragile areas (Python server); the spectator win-counter bug (FIX-02) must be fixed in Phase 1

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/protocol.ts`: Complete wire message type definitions — the Rust `protocol.rs` must reproduce every type here; use it as the spec checklist
- `server/input_delay.py`: RTT fairness buffer logic (compute_cutoff, record_pong, median_rtt) — straight port to Rust, algorithm unchanged
- `server/broadcast.py`: Fan-out pattern — simple loop over spectator WS set; the Rust version uses a `tokio::sync::broadcast` channel instead

### Established Patterns
- Server is single source of truth; clients are pure I/O devices — this pattern is preserved and strengthened in Rust (room actor owns all state)
- Two-channel message split: fast path for `pose_update`, slow path for `game_state` and lifecycle events — ENG-08 requirement; mirrors the existing Python separation
- Pose fan-out happens immediately on WebSocket message arrival, independent of the 60Hz tick — not in the game loop; critical for low-latency overlay rendering

### Integration Points
- Dockerfile: multi-stage build currently builds overlay + mobile, then copies into Python image. Phase 1 adds a Rust build stage; the final image swaps the Python server for the Rust binary. Static `mobile/dist` and `overlay/dist` are still COPY'd in.
- `railway.toml`: unchanged shape; the Dockerfile builder entry point changes from `python main.py` to the Rust binary

</code_context>

<specifics>
## Specific Ideas

- The workspace layout should anticipate Phase 2: `engine/Cargo.toml` declares `[workspace]` with `members = ["engine-core"]`; Phase 2 adds `"plugin-trait"` and `"boxing-plugin"` to that list without restructuring.
- ts-rs version 10 (`ts-rs = "10"` in Cargo.toml); `#[derive(TS)] #[ts(export)]` on each protocol struct; `cargo test` writes bindings to `shared/` (or a designated bindings output dir).
- Fixture capture script: `scripts/capture_fixtures.py` — connects to Python server, triggers each message type, saves to `engine/engine-core/tests/fixtures/*.json`.
- Room cleanup: `retain` on DashMap keyed on `is_expired()` — expired = `match_over && all_sockets_gone_for > 10 minutes`.

</specifics>

<deferred>
## Deferred Ideas

- Commentary path (COMM-01..04) — Claude API + ElevenLabs TTS in Rust — explicitly Phase 2/v2 scope per PROJECT.md
- `CommentaryHint` GameEvent variant — defer to Phase 2 when plugin trait and commentary infrastructure land together
- Horizontal scaling / room sharding — out of scope per REQUIREMENTS.md
- Reference velocity validation / clamping (security concern from CONCERNS.md) — belongs in Phase 2 with the boxing plugin that uses it

</deferred>

---

*Phase: 1-Engine Core*
*Context gathered: 2026-05-02*
