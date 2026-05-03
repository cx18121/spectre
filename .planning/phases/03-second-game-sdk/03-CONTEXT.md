# Phase 3: Second Game + SDK - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers two things: (1) a second game plugin — a rhythm/dance scoring game — implemented using only the existing `GamePlugin` trait with zero engine changes, proving the trait generalizes beyond boxing; and (2) an SDK documentation package (`docs/GAME-SDK.md` + Rustdoc on the trait) sufficient for a developer or LLM to implement a new game from scratch. The phase also adds a per-room game selection mechanism (HTTP endpoint + static lobby UI) so players can choose boxing or dance when creating a room.

</domain>

<decisions>
## Implementation Decisions

### Second Game: Dance Scoring (GAME2-01)
- **D-01:** The second game is a rhythm/beat-gated dance scoring game. The server cycles through a library of target poses, broadcasting the current target at each beat. Players score based on keypoint similarity between their pose and the target within each beat window.
- **D-02:** Beat interval is 60 ticks (1 second at 60Hz). One round = 16 beats. `RoundOver` fires after beat 16; `winner = Some(slot)` for the player with the higher cumulative score, or `None` for a draw. This is a completely different win condition from boxing (score-based vs HP-based).
- **D-03:** The server broadcasts the current target pose + beat number via `GameEvent::Broadcast` at each beat transition. No new GameEvent variants or trait methods required — existing `Broadcast { payload: Value }` carries the target pose JSON.
- **D-04:** Solo mode: single player scores alone with no bot opponent. `RoundOver` fires after 16 beats with a single-player score. No bot logic in the dance plugin (contrast with boxing's `tick_bot`).
- **D-05:** Calibration: dance plugin's `on_calibration_complete` is a no-op (no reference velocity needed). `CalibrationDone` from the mobile client still serves as the "ready to start" signal — the engine flow is unchanged; the plugin just ignores the ref_vel value.
- **D-06:** If implementing the dance game reveals any missing trait surface (GAME2-02), those are treated as interface bugs: fix the trait and update boxing accordingly before closing the phase. Phase does not ship if engine changes were required.

### Plugin Selection (per-room, HTTP endpoint)
- **D-07:** Game selection is per-room via a new HTTP endpoint: `POST /rooms?game=boxing` or `POST /rooms?game=dance`. The server creates a room with the appropriate plugin and returns the room code as JSON. Mobile client joins via room code through the existing WebSocket endpoint — no TypeScript changes required.
- **D-08:** Axum serves a simple static HTML page at `/` (the server root) — a lobby UI with game picker buttons (Boxing / Dance) and a room code display. No build step, no framework. Clicking a button POSTs to `/rooms?game=X`, gets the code back, and displays it for the player to enter in the mobile client.
- **D-09:** The room manager holds a plugin registry: a map of `game_name → Arc<dyn GamePlugin + Send + Sync>`. Both `BoxingPlugin::new(config)` and `DancePlugin::new(config)` are instantiated at startup in `main.rs`. Room creation picks the right `Arc` from the registry based on the `game` query param. The room actor already stores `Arc<dyn GamePlugin + Send + Sync>` — it just receives the right one at creation time (no architectural change to `room.rs` beyond passing the selected plugin).

### SDK Documentation (SDK-01..03)
- **D-10:** The developer guide lives at `docs/GAME-SDK.md`. The root `README.md` links to it and includes a one-paragraph "How to add a game" teaser pointing to the guide.
- **D-11:** `docs/GAME-SDK.md` structure: trait interface reference (every method documented with: what it does, when it's called, what to return, what NOT to do) + a boxing plugin walkthrough section (method-by-method narrative through the boxing implementation as the canonical worked example) + a "quick-start boilerplate" section (minimal struct skeleton a developer copies). Target length: 500–800 lines.
- **D-12:** Rustdoc (`///` comments) on the `GamePlugin` trait and all context/event types is refreshed and polished as part of this phase (SDK-01). The `plugin-trait/src/lib.rs` already has comments; Phase 3 ensures they are complete and accurate, including lifetime guarantees and method-call order guarantees.

### Claude's Discretion
- Scoring algorithm for pose similarity (cosine similarity between landmark vectors, or joint angle distance, or per-keypoint Euclidean distance — any reasonable metric is acceptable)
- Target pose library: number of poses (5–10 is suggested), specific MediaPipe keypoint values, and pose names/labels
- When within a beat window to sample the player's pose for scoring (best frame, average, or last frame before beat transition)
- URL shape for the room creation response (`{ "room_code": "ABC123" }` or similar)
- Error handling for unknown `?game=` values (400 response with error JSON)
- CSS styling of the static lobby HTML (minimal is fine; no design system needed)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 Outputs (Phase 3 builds directly on these)
- `engine/plugin-trait/src/lib.rs` — The full `GamePlugin` trait, `TickContext`, `GameEvent`, `PoseKeypoint`, `PoseFrame`, `BodyRegion`, `RoomView`, `SlotView`, `TickInfo` — the complete interface the dance plugin must implement. READ THIS FIRST.
- `.planning/phases/02-plugin-trait-boxing/02-CONTEXT.md` — All Phase 2 implementation decisions (D-01..08); especially D-02 (events-only messaging), D-03 (GameEvent variants), D-04 (bot mode pattern), D-05 (plugin registration in main.rs — Phase 3 changes this to a registry)

### Boxing Plugin (worked example and pattern source)
- `engine/boxing-plugin/src/lib.rs` — Complete `BoxingPlugin` impl: `init_state`, `on_tick`, `on_calibration_complete`, `on_round_reset`, `on_player_join`; the dance plugin mirrors this structure
- `engine/boxing-plugin/src/bot.rs` — Bot logic pattern: `tick_bot`, `BOT_KPS`, `Difficulty` — NOT needed for dance (no bot), but shows how plugin-internal state machines work
- `engine/boxing-plugin/src/hit_detection.rs` — Pose math pattern: how to process `TickContext.frames` and extract keypoint data for game logic

### Engine Wiring (integration points Phase 3 modifies)
- `engine/engine-core/src/main.rs` — Current plugin instantiation: `Arc::new(BoxingPlugin::new(boxing_config))`. Phase 3 converts this to a plugin registry and adds the `POST /rooms` route.
- `engine/engine-core/src/room.rs` — `RoomState.plugin: Arc<dyn GamePlugin + Send + Sync>` field; room actor lifecycle hooks; how plugin is passed at room creation
- `engine/engine-core/src/room_manager.rs` — Room creation flow; Phase 3 adds game selection to room creation

### Requirements (Phase 3 scope)
- `.planning/REQUIREMENTS.md` — GAME2-01, GAME2-02, SDK-01, SDK-02, SDK-03 are the full Phase 3 requirement list

### Project Decisions
- `.planning/PROJECT.md` — Core Value ("trivially easy to add a new game"), Key Decisions table, constraints (wire protocol unchanged, no TypeScript client changes)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `engine/plugin-trait/src/lib.rs` — `PoseKeypoint` struct with `x, y, z, visibility: f64` — dance scoring algorithm uses these directly for pose comparison
- `engine/boxing-plugin/src/lib.rs` `init_state()` pattern — returns a `Box<dyn Any + Send>` containing the plugin's state struct; dance plugin follows the same pattern with `DanceState { beat_count, scores, target_index, last_beat_tick }`
- Existing `GameEvent::Broadcast { payload: Value }` — dance uses this to push `{ "type": "dance_beat", "target_pose": [...], "beat": N }` at each beat transition

### Established Patterns
- Events-only messaging (Phase 2 D-02): `on_tick` returns `Vec<GameEvent>`; no direct send methods. Dance plugin emits `Broadcast` events for beat transitions — same pattern as boxing's `SendToPlayer` for HP updates.
- Plugin state downcast pattern: `state.downcast_mut::<DanceState>().expect("dance state type mismatch")` — mirrors boxing's `BoxingState` downcast.
- `RoomView.solo_mode`: set once at CalibrationDone, stable for the room lifetime. Dance reads this to skip two-player score comparison in solo.
- `TickInfo.tick` as the beat clock: `if (tick_info.tick - round_start_tick) % 60 == 0` triggers a beat — no separate timer needed.

### Integration Points
- `engine-core/src/main.rs`: Phase 3 adds a `HashMap<&str, Arc<dyn GamePlugin + Send + Sync>>` registry; `POST /rooms?game=X` handler looks up the plugin and passes it to `room_manager.create_room(plugin)`.
- `engine-core/src/room_manager.rs`: `create_room` signature gains a `plugin: Arc<dyn GamePlugin + Send + Sync>` parameter (or the registry is passed in and the manager does the lookup).
- Axum router: new routes `POST /rooms` and `GET /` (static HTML lobby) added alongside existing `/ws/player/{code}` and `/ws/spectator/{code}`.
- `room.rs` `RoomState`: no structural change needed — `plugin` field already exists as `Arc<dyn GamePlugin>`.

</code_context>

<specifics>
## Specific Ideas

- Dance target pose library: a small set of static poses (5–10) defined as `const [PoseKeypoint; 33]` arrays in `dance-plugin/src/poses.rs` — mirrors the boxing plugin's `BOT_KPS` pattern in `bot.rs`. Each pose can be named (e.g., `ARMS_UP`, `SQUAT`, `LEFT_LEAN`) for the broadcast payload.
- Beat broadcast payload shape: `{ "type": "dance_beat", "beat": 4, "total_beats": 16, "target_pose": [[x,y,z,vis], ...] }` — sent via `GameEvent::Broadcast` at each beat boundary.
- Score broadcast: after scoring each beat, emit `GameEvent::Broadcast { payload: { "type": "dance_score", "scores": [p1_total, p2_total], "beat": N } }` so the overlay can display live scores.
- The `docs/GAME-SDK.md` boxing walkthrough should cross-reference the specific line ranges in `boxing-plugin/src/lib.rs` to make it easy for an LLM to navigate to the relevant code.
- Static lobby HTML can be embedded as a `const &str` in `main.rs` or served from an in-memory `Bytes` response — no file system dependency for the HTML.

</specifics>

<deferred>
## Deferred Ideas

- Audio cue integration for dance (beat sounds) — would require a new wire message type and client changes; v2 scope
- Score history / match replay — natural extension of the event stream pattern (Phase 2 D-02 deferred this too)
- AI game generation (AI-01) — Claude generates a `GamePlugin` from a plain-English description; explicitly deferred until SDK is proven
- Commentary for dance (COMM-01..04) — dance could emit `CommentaryHint` events the same way boxing does; v2 scope
- Per-user high scores / persistent leaderboard — no external store in this project; out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 3-Second Game + SDK*
*Context gathered: 2026-05-02*
