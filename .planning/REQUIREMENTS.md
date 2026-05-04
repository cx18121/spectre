# Requirements: PoseEngine

**Defined:** 2026-05-01
**Core Value:** The engine must make it trivially easy to add a new pose-based game by implementing a well-defined plugin interface — without touching the engine core or understanding its internals.

## v1 Requirements

### Engine Core

- [ ] **ENG-01**: WebSocket server exposes `/ws/player/{room_code}` and `/ws/spectator/{room_code}` endpoints using Axum + Tokio
- [ ] **ENG-02**: Room registry uses DashMap with 6-char alphanumeric code generation; rooms created on demand
- [ ] **ENG-03**: Each room runs as an independent Tokio task (actor model) exclusively owning all per-room state; no cross-room shared mutexes
- [ ] **ENG-04**: 60Hz game loop driven by `tokio::time::interval` with `MissedTickBehavior::Skip` inside the room actor's `select!` loop
- [ ] **ENG-05**: Each player connection has a dedicated outbound Tokio task with a bounded `mpsc` channel; game loop never calls `ws.send().await` directly
- [ ] **ENG-06**: RTT input delay buffer (fairness cutoff) ported from Python `input_delay.py`; plugin receives only already-released frames in each tick
- [ ] **ENG-07**: Pose data fan-out: `MsgPoseUpdate` broadcast to spectators immediately on frame arrival, independent of game loop tick rate
- [ ] **ENG-08**: Two broadcast channels per room — fast path for pose updates, slow path for game state and lifecycle events
- [ ] **ENG-09**: 3.8-second warmup window zeroes the input buffer; plugin receives empty frame slices during warmup
- [ ] **ENG-10**: Round lifecycle managed by engine: on `RoundOver` event from plugin, engine broadcasts `MsgRoundEnd`, increments win counter, calls `on_round_reset`
- [ ] **ENG-11**: Calibration handshake: engine calls `on_calibration_complete(slot, reference_velocity)` after both players submit; game loop starts once both are calibrated
- [ ] **ENG-12**: Static file serving of `mobile/dist` at `/mobile` and `overlay/dist` at `/overlay` (same paths as Python server)
- [ ] **ENG-13**: Joinable Tokio task handles tracked with abort-on-drop guarantee; no zombie game loop tasks after room teardown

### Protocol

- [ ] **PROTO-01**: All wire message types modelled in Rust with `serde_json` using `#[serde(tag = "type")]`; field names, discriminators, and optional fields match `shared/protocol.ts` exactly
- [ ] **PROTO-02**: Golden-file roundtrip tests: each message type serialized in Rust and compared to reference JSON fixtures; suite runs in CI
- [ ] **PROTO-03**: `shared/protocol.ts` kept in sync with Rust models; generation script updated or replaced

### Plugin Trait

- [ ] **PLUG-01**: `GamePlugin` trait defines: `init_state() -> Box<dyn Any + Send>`, `on_tick(&self, ctx: &mut TickContext, state: &mut dyn Any) -> Vec<GameEvent>`, plus `on_player_join`, `on_player_leave`, `on_calibration_complete`, `on_round_reset` with default no-op implementations
- [ ] **PLUG-02**: `TickContext` struct carries: released pose frames per player slot, `TickInfo { tick, elapsed_secs, remaining_secs }`, `RoomView` (read-only player count/slot state), and helper methods for broadcasting and sending to individual players
- [ ] **PLUG-03**: `GameEvent` enum covers at minimum: `Hit { attacker, defender, region, damage, position }`, `RoundOver { winner: Option<u8> }`, `SendToPlayer { slot, payload }`, `CommentaryHint { kind, payload }`
- [ ] **PLUG-04**: Plugin state stored as `Box<dyn Any + Send>` per room in the engine; each plugin downcasts it in its own methods — engine never inspects plugin state
- [ ] **PLUG-05**: Trait is fully object-safe (`Box<dyn GamePlugin + Send>` usable); all methods synchronous (no `async fn`)
- [ ] **PLUG-06**: Engine delivers pose keypoints normalized to hip-centred Y-up coordinates before passing to plugin; plugin never calls coordinate transforms

### Boxing Plugin

- [ ] **BOX-01**: Punch detection: wrist speed exceeds calibrated threshold over a 10-frame sliding window; direction and height classify as valid punch
- [ ] **BOX-02**: Kick detection: ankle elevation + speed exceeds calibrated threshold
- [ ] **BOX-03**: Body region classification: 9 regions (head_chin, head_face, head_throat, torso_upper, torso_lower, block_hand, block_forearm, leg_thigh, leg_shin)
- [ ] **BOX-04**: Guard blocking: defender with wrists above guard threshold blocks head/upper-torso hits
- [ ] **BOX-05**: Velocity-scaled damage: damage scales linearly with attacker velocity relative to calibrated `reference_velocity`
- [ ] **BOX-06**: HP tracking: 800 HP per player; round over when HP reaches 0 (KO) or 90-second timer expires (decision by HP)
- [ ] **BOX-07**: Hit cooldown: 12-tick (200ms) per-attacker lockout after each hit to prevent double-counting
- [ ] **BOX-08**: Round draw handling: equal HP at time expiry produces a draw outcome
- [ ] **BOX-09**: Multi-round match: engine-tracked win counter; match ends when a player reaches `max_wins`
- [ ] **BOX-10**: Solo/bot mode: server-injected static pose for P2 slot with scripted random hit timer; three difficulty tiers (easy/normal/hard)

### Bug Fixes

- [ ] **FIX-01**: Calibration persists through rematch — `reference_velocity` stored on `PlayerSlot` for the Room lifetime; `on_round_reset` clears only round-scoped state (HP, cooldown counters, combo trackers)
- [ ] **FIX-02**: Spectator reconnect state restoration — on spectator WebSocket connect, engine sends a snapshot of current HP, wins, round number, and elapsed time before the client enters the live broadcast stream

### Reference Game

- [ ] **GAME2-01**: A second game plugin (dance scoring, pose-match, or equivalent non-combat game) implemented using the `GamePlugin` trait
- [ ] **GAME2-02**: Second game requires zero changes to engine code; any trait additions needed to support it are considered interface bugs

### SDK

- [ ] **SDK-01**: `GamePlugin` trait and all context/event types documented with Rustdoc; method-level documentation explains intent and lifetime guarantees
- [ ] **SDK-02**: Boxing plugin serves as an annotated worked example in the repository README or developer guide
- [ ] **SDK-03**: README explains how to add a new game in concrete steps (implement trait, register plugin, done)

### Lobby UX

- [ ] **LOBBY-01**: Landing page shows SPECTRE title, tagline ("real punches. real fights."), and game type selector (boxing / dance) before creating a room
- [ ] **LOBBY-02**: User selects game type via radio/toggle on the landing page; selection is required before "Create Room" is enabled
- [ ] **LOBBY-03**: "Create Room" POSTs to `/rooms?game={type}`, creates a room for the selected game, and navigates to `/rooms/{code}`
- [ ] **LOBBY-04**: User can join an existing room from the landing page by entering a 6-char code and clicking "Join"
- [ ] **LOBBY-05**: `GET /rooms/{code}` renders a room page with the room code displayed prominently and three connection cards: Player 1, Player 2, Overlay
- [ ] **LOBBY-06**: Each connection card contains a QR code encoding the full prefilled URL (server + room + slot/role params)
- [ ] **LOBBY-07**: Each connection card shows a clickable URL and a copy-to-clipboard button for the prefilled link
- [ ] **LOBBY-08**: Landing page and room page use DESIGN.md color tokens, Inter typography, and component specs

### Mobile Connection UX

- [ ] **MOBILE-01**: When `?server=`, `?room=`, and `?slot=` are all present in the URL (QR-linked), connection screen shows a streamlined one-tap join screen instead of the full form
- [ ] **MOBILE-02**: Full connection form (including raw server URL field) is only shown when params are absent or user explicitly taps "Enter manually"
- [ ] **MOBILE-03**: Connection errors distinguish between room-not-found, server-unreachable, and slot-taken scenarios

### Overlay Fidelity

- [ ] **OVERLAY-01**: Achafont restored via `@font-face` from `overlay/public/fonts/Achafont.ttf` (recovered from git history); used for round flash, countdown, KO text, and match end title as specified in DESIGN.md
- [ ] **OVERLAY-02**: Commentary bar matches DESIGN.md exactly: `--bg-mid` at 94% opacity, `backdrop-filter: blur(6px)`, 1px `--accent` at 35% opacity border, SHADOW tag style, blinking cursor
- [ ] **OVERLAY-03**: HP bar track has 1px `--gold` border per DESIGN.md; HUD structural elements use correct elevation/border spec (Level 1: `--gold` 20% opacity + inset highlight)
- [ ] **OVERLAY-04**: All remaining DESIGN.md component gaps verified and closed: win dots snap behavior, HP bar direction (P2 right-to-left), low-HP pulse animation, button hover/active states

### Dance Engine + Protocol Wiring

- [ ] **DANCE-01**: `GamePlugin` trait has a `game_type() -> &'static str` method with a default impl returning `"unknown"`; `BoxingPlugin` returns `"boxing"`, `DancePlugin` returns `"dance"`
- [ ] **DANCE-02**: `RoomHandle` stores `game_type: String`; `MsgJoined` includes a `game_type: String` field; spectator snapshot message includes `game_type`
- [ ] **DANCE-03**: `MsgDanceBeat` (beat number, total beats, target pose keypoints) and `MsgDanceScore` (beat number, per-player cumulative scores) added to `shared/protocol.ts` with full TypeScript types
- [ ] **DANCE-04**: Dance plugin signals calibration is not needed; engine detects this and skips the calibration handshake for dance rooms, proceeding directly to warmup
- [ ] **DANCE-05**: On spectator join mid-dance, engine sends a dance snapshot (current beat, current scores) before switching to live broadcast stream

### Dance UX Design

- [ ] **DDES-01**: DESIGN.md has a Dance Game section covering: score display (cumulative similarity scale), beat indicator (countdown to next beat boundary + current beat number), target pose display spec (static skeleton silhouette at fixed overlay position), round end condition (highest cumulative score wins), match end screen (scores comparison, no KO text)
- [ ] **DDES-02**: PRODUCT.md updated to acknowledge both game modes; dance tone defined as same disciplined dark aesthetic in a "performance" register rather than "combat" — same palette, different emotional register
- [ ] **DDES-03**: Target pose reference visual style defined: skeleton keypoints rendered in `--text-dim`/`--text-secondary` as a static ghost silhouette; fades out and swaps on each `dance_beat` event

### Dance Frontend Implementation

- [ ] **DIMPL-01**: Overlay stores `game_type` from `MsgJoined` in `useSpectatorSocket` state; renders boxing HUD or dance HUD based on `game_type`
- [ ] **DIMPL-02**: Dance HUD shows cumulative scores for P1 and P2, current beat number out of total, and a visual countdown to the next beat scoring moment
- [ ] **DIMPL-03**: `dance_beat` events update a static target pose skeleton rendered in Pixi.js alongside live player silhouettes; skeleton fades in on new target and fades out when swapped
- [ ] **DIMPL-04**: Dance match end screen shows final scores for both players with a winner declaration; no KO text, no HP reference
- [ ] **DIMPL-05**: Mobile connection screen skips the calibration waiting state for dance rooms (`game_type === "dance"` received in `MsgJoined`); proceeds directly to match ready

---

## v2 Requirements

### Commentary

- **COMM-01**: AI commentary engine ported to Rust — Claude API integration via `reqwest` (raw Messages API or `async-anthropic` crate) producing streamed text tokens
- **COMM-02**: ElevenLabs TTS integration — commentary text chunks sent to ElevenLabs, audio chunks broadcast as `commentary_audio` messages
- **COMM-03**: Commentary triggered by `CommentaryHint` events returned from plugins; commentary engine is a separate Tokio task isolated from game loop
- **COMM-04**: Commentary priority queue and cooldown logic ported from Python (prevents rapid-fire commentary)

### AI Game Generation

- **AI-01**: Claude generates a `GamePlugin` implementation from a plain-English game description (deferred until SDK is proven)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| WASM / dynamic plugin loading | Compile-time native Rust is sufficient; runtime plugin loading adds significant complexity |
| Async plugin methods | Breaks object safety; `async-trait` allocates per call at 60Hz; all side effects via returned `GameEvent` |
| Plugin-visible WebSocket types | Transport layer internals stay in engine; plugin uses `send_to_player` / `broadcast` helpers |
| User accounts / authentication | 6-char room code model retained; security model unchanged from Python |
| Horizontal scaling / room sharding | Single-process Tokio is sufficient for current use case |
| Persistent state (match history, ratings) | No external store; server restart clears all rooms |
| Browser-based game IDE | Deferred until AI generation is tackled |
| TypeScript client changes | Mobile and overlay apps are unchanged; engine must speak existing wire protocol |
| Python server kept running in parallel | Full cutover on completion; no hybrid deployment |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Pending |
| ENG-02 | Phase 1 | Pending |
| ENG-03 | Phase 1 | Pending |
| ENG-04 | Phase 1 | Pending |
| ENG-05 | Phase 1 | Pending |
| ENG-06 | Phase 1 | Pending |
| ENG-07 | Phase 1 | Pending |
| ENG-08 | Phase 1 | Pending |
| ENG-09 | Phase 1 | Pending |
| ENG-10 | Phase 1 | Pending |
| ENG-11 | Phase 1 | Pending |
| ENG-12 | Phase 1 | Pending |
| ENG-13 | Phase 1 | Pending |
| PROTO-01 | Phase 1 | Pending |
| PROTO-02 | Phase 1 | Pending |
| PROTO-03 | Phase 1 | Pending |
| FIX-02 | Phase 1 | Pending |
| PLUG-01 | Phase 2 | Pending |
| PLUG-02 | Phase 2 | Pending |
| PLUG-03 | Phase 2 | Pending |
| PLUG-04 | Phase 2 | Pending |
| PLUG-05 | Phase 2 | Pending |
| PLUG-06 | Phase 2 | Pending |
| BOX-01 | Phase 2 | Pending |
| BOX-02 | Phase 2 | Pending |
| BOX-03 | Phase 2 | Pending |
| BOX-04 | Phase 2 | Pending |
| BOX-05 | Phase 2 | Pending |
| BOX-06 | Phase 2 | Pending |
| BOX-07 | Phase 2 | Pending |
| BOX-08 | Phase 2 | Pending |
| BOX-09 | Phase 2 | Pending |
| BOX-10 | Phase 2 | Pending |
| FIX-01 | Phase 2 | Pending |
| GAME2-01 | Phase 3 | Pending |
| GAME2-02 | Phase 3 | Pending |
| SDK-01 | Phase 3 | Pending |
| SDK-02 | Phase 3 | Pending |
| SDK-03 | Phase 3 | Pending |

| LOBBY-01 | Phase 4 | Pending |
| LOBBY-02 | Phase 4 | Pending |
| LOBBY-03 | Phase 4 | Pending |
| LOBBY-04 | Phase 4 | Pending |
| LOBBY-05 | Phase 4 | Pending |
| LOBBY-06 | Phase 4 | Pending |
| LOBBY-07 | Phase 4 | Pending |
| LOBBY-08 | Phase 4 | Pending |
| MOBILE-01 | Phase 5 | Pending |
| MOBILE-02 | Phase 5 | Pending |
| MOBILE-03 | Phase 5 | Pending |
| OVERLAY-01 | Phase 6 | Pending |
| OVERLAY-02 | Phase 6 | Pending |
| OVERLAY-03 | Phase 6 | Pending |
| OVERLAY-04 | Phase 6 | Pending |

| DANCE-01 | Phase 7 | Pending |
| DANCE-02 | Phase 7 | Pending |
| DANCE-03 | Phase 7 | Pending |
| DANCE-04 | Phase 7 | Pending |
| DANCE-05 | Phase 7 | Pending |
| DDES-01 | Phase 8 | Pending |
| DDES-02 | Phase 8 | Pending |
| DDES-03 | Phase 8 | Pending |
| DIMPL-01 | Phase 9 | Pending |
| DIMPL-02 | Phase 9 | Pending |
| DIMPL-03 | Phase 9 | Pending |
| DIMPL-04 | Phase 9 | Pending |
| DIMPL-05 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 67 total (39 engine/plugin + 15 UI + 13 dance)
- Mapped to phases: 67/67
- Unmapped: 0

---
*Requirements defined: 2026-05-01*
*Last updated: 2026-05-03 — added DANCE, DDES, DIMPL requirements for phases 7–9*
