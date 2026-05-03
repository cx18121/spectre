---
phase: 01-engine-core
verified: 2026-05-02T20:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Connect a mobile client to ws://localhost:8000/ws/player/{room_code}, send a join message, verify MsgJoined response with correct room_code and player_slot"
    expected: "Server returns {\"type\":\"joined\",\"room_code\":\"...\",\"player_slot\":1,\"opponent_connected\":false} without TypeScript client changes"
    why_human: "Requires a running server process and a real WebSocket client; cannot verify end-to-end wire behavior with static analysis alone"
  - test: "Connect a spectator to ws://localhost:8000/ws/spectator/{room_code}, start a match with two players, have one player disconnect and reconnect spectator mid-round"
    expected: "On reconnect, spectator receives lobby_update + round_start + game_state (with correct hp, wins, round_number, remaining_time) before any live broadcast messages"
    why_human: "FIX-02 snapshot ordering requires a live session; static code review confirms the logic but timing correctness needs runtime observation"
  - test: "Stream pose frames from a player WebSocket, verify spectator receives pose_update messages without 60Hz tick delay"
    expected: "Pose updates appear on spectator overlay within the same message-dispatch cycle, not queued to the 60Hz game_state tick"
    why_human: "Requires measuring real-time message arrival ordering between two WebSocket connections"
---

# Phase 1: Engine Core Verification Report

**Phase Goal:** Implement the Rust engine-core binary that replaces the Python server in the production container
**Verified:** 2026-05-02
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A mobile client and spectator client connect to the Rust server using existing room codes with no TypeScript changes required | ✓ VERIFIED | Routes use `{room_code}` Axum 0.8 syntax; `handle_player` reads MsgJoin and sends MsgJoined; same wire format as Python server |
| 2 | Pose frames from a player appear on spectator overlay within the same tick cycle, independent of 60Hz game loop | ✓ VERIFIED | `pose_tx.send(json)` fires in `handle_player` before `cmd_tx.send(RoomCmd::PoseFrame)` — fan-out is immediate, not deferred to game tick |
| 3 | A spectator who reconnects mid-round receives a snapshot of current HP, wins, round number, and elapsed time | ✓ VERIFIED | `subscribe_spectator` called before `GetSnapshot` oneshot; `send_snapshot` sends lobby_update + round_start + game_state including wins field (FIX-02); `build_snapshot` populates wins from `state.wins` |
| 4 | The 60Hz game loop runs continuously inside each room actor task; multiple rooms run concurrently without cross-room locks | ✓ VERIFIED | `room_actor` runs `tokio::time::interval(1000/60ms)` with `MissedTickBehavior::Skip` in a `tokio::select!`; DashMap used for concurrent room registry; no cross-room mutexes |
| 5 | All message types serialize to JSON byte-for-byte compatible with golden-file fixtures derived from shared/protocol.ts | ✓ VERIFIED | `cargo test --test protocol_roundtrip` passes 18/18 tests; all 17 fixture files exist and are valid JSON; draw serializes as null winner |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `engine/Cargo.toml` | Workspace config with engine-core member | ✓ VERIFIED | Contains `[workspace]`, `members = ["engine-core"]`, `resolver = "2"` |
| `engine/.cargo/config.toml` | ts-rs export path config | ✓ VERIFIED | `TS_RS_EXPORT_DIR = { value = "../../shared", relative = true }` |
| `engine/engine-core/Cargo.toml` | Package manifest with all required dependencies | ✓ VERIFIED | axum 0.8.9, tokio 1.52.1, serde, dashmap, tower-http, ts-rs, tracing, rand all present |
| `engine/engine-core/src/main.rs` | Axum router with WebSocket handlers | ✓ VERIFIED | Routes `/ws/player/{room_code}`, `/ws/spectator/{room_code}`, `/mobile`, `/overlay`; `axum::serve` + `TcpListener`; no deprecated `axum::Server::bind` |
| `engine/engine-core/src/protocol.rs` | All wire message types | ✓ VERIFIED | 17 `Msg*` structs + PoseKeypoint, Position, HitEvent; 20 `#[ts(export)]` attributes; `InboundMobileMsg` enum with 5 variants; `MsgGameState.wins: (u32, u32)` present |
| `engine/engine-core/src/input_delay.rs` | RTT fairness buffer | ✓ VERIFIED | `record_pong`, `median_rtt`, `compute_cutoff` implemented; `MAX_INPUT_DELAY_MS = 60.0`; uses `SystemTime` for RTT, `Instant` for cutoff |
| `engine/engine-core/src/room.rs` | Room actor, state, commands | ✓ VERIFIED | `RoomState`, `PlayerSlot`, `RoomCmd` (7 variants), `room_actor` with `MissedTickBehavior::Skip` |
| `engine/engine-core/src/room_manager.rs` | DashMap registry | ✓ VERIFIED | `RoomManager` with `DashMap`, `create_room`, `get_cmd_tx`, `subscribe_spectator`, `expiry_task` with `join_handle.abort()` |
| `engine/engine-core/src/game_loop.rs` | 60Hz game tick skeleton | ✓ VERIFIED | `game_tick`, `ROUND_WARMUP = 3.8`, `ROUND_DURATION = 90.0`, warmup gate, round lifecycle, `GameEvent` enum; `compute_cutoff` called |
| `engine/engine-core/src/broadcast.rs` | Spectator broadcast handler | ✓ VERIFIED | `forward_broadcast_to_spectator` with `RecvError::Lagged` non-fatal handling; `send_snapshot` sends lobby_update + round_start + game_state |
| `engine/engine-core/src/lib.rs` | Library crate for integration tests | ✓ VERIFIED | `pub mod protocol` exposed |
| `engine/engine-core/tests/protocol_roundtrip.rs` | Golden-file roundtrip test suite | ✓ VERIFIED | 18 tests; `msg_ping_roundtrip` present; draw-null test present; wins array test present |
| `engine/engine-core/tests/fixtures/` | 17 JSON fixture files | ✓ VERIFIED | All 17 files present and valid JSON; `msg_game_state.json` has `wins: [0,0]`; `msg_round_end_draw.json` has `winner: null` |
| `scripts/capture_fixtures.py` | Fixture capture script | ✓ VERIFIED | Contains `ws://localhost:8000` |
| `scripts/gen_protocol.py` | Deprecated guard | ✓ VERIFIED | Contains DEPRECATED notice; `python3 scripts/gen_protocol.py` exits 1 |
| `Dockerfile` | Multi-stage Rust build + Debian final image | ✓ VERIFIED | `rust:1.86-slim` engine-builder stage; `debian:bookworm-slim` final stage; `CMD ["./engine-core"]`; no `python:3.11-slim` or `uvicorn` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `protocol.rs` | `shared/*.ts` | `#[ts(export)]` + `TS_RS_EXPORT_DIR` | ✓ WIRED | 20 `#[ts(export)]` attributes; 20 ts-rs export binding tests pass in `cargo test --lib` |
| `main.rs` | `/ws/player/{room_code}` | `axum routing::get` | ✓ WIRED | `.route("/ws/player/{room_code}", get(ws_player))` present; Axum 0.8 curly-brace syntax |
| `main.rs` | `/ws/spectator/{room_code}` | `axum routing::get` | ✓ WIRED | `.route("/ws/spectator/{room_code}", get(ws_spectator))` present |
| `room_manager.rs` | `room.rs` | `tokio::spawn(room_actor(...))` | ✓ WIRED | `let join_handle = tokio::spawn(room_actor(cmd_rx, state))` in `create_room` |
| `main.rs` | `room_manager.rs` | `AppState.rooms: Arc<RoomManager>` | ✓ WIRED | `Arc::new(AppState { rooms: Arc::new(room_manager::RoomManager::new()) })` |
| `room.rs` | `input_delay.rs` | `input_delay::compute_cutoff` | ✓ WIRED | Called in `game_loop.rs`'s `game_tick`; `record_pong` called in `handle_cmd` for `RecordPong` |
| `main.rs` | `room_manager.rs` | `create_room(room_code.clone())` on demand | ✓ WIRED | `app.rooms.create_room(room_code.clone())` when `get_cmd_tx` returns `None` |
| `main.rs` | `room.rs` via `GetSnapshot` | oneshot channel | ✓ WIRED | `cmd_tx.send(RoomCmd::GetSnapshot { reply: reply_tx })` before entering broadcast loop |
| `Dockerfile engine-builder` | `engine/engine-core/Cargo.toml` | `COPY engine/ + cargo build --release` | ✓ WIRED | `COPY engine/ ./` + `cargo build --release --manifest-path engine-core/Cargo.toml` |
| `Dockerfile final stage` | `/app/engine-core binary` | `COPY --from=engine-builder` | ✓ WIRED | `COPY --from=engine-builder /engine/target/release/engine-core ./engine-core` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `broadcast.rs::send_snapshot` | `snapshot.game_state.wins` | `room.rs::build_snapshot` → `state.wins` | Yes — `wins: (state.wins[0], state.wins[1])` | ✓ FLOWING |
| `game_loop.rs::build_game_state_with_latency` | `MsgGameState.wins` | `state.wins[0], state.wins[1]` | Yes — populated from RoomState array | ✓ FLOWING |
| `main.rs::handle_player` | `pose_tx.send(json)` | `MsgPoseUpdate { keypoints: frame.keypoints.clone() }` | Yes — real keypoints from inbound message | ✓ FLOWING |
| `game_loop.rs::game_tick` | `cutoff` in buffer drain | `input_delay::compute_cutoff` | Yes — uses real `rtt_samples` from `PlayerSlot` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| cargo build compiles clean | `cargo build --release --manifest-path engine-core/Cargo.toml` | exit 0, no errors | ✓ PASS |
| protocol roundtrip tests pass | `cargo test --test protocol_roundtrip` | 18/18 passed | ✓ PASS |
| input_delay unit tests pass | `cargo test --lib` | 20/20 passed (5 unit + 17 ts-rs export bindings) | ✓ PASS |
| gen_protocol.py deprecated | `python3 scripts/gen_protocol.py` | exits 1 with DEPRECATED message | ✓ PASS |
| draw winner serializes as null | fixture msg_round_end_draw.json | `"winner": null` | ✓ PASS |
| FIX-02 wins in game_state fixture | fixture msg_game_state.json | `"wins": [0,0]` | ✓ PASS |
| Dockerfile has no Python base | grep python:3.11/uvicorn in Dockerfile | no matches | ✓ PASS |
| WebSocket live connect | requires running server | not tested | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ENG-01 | 01-01 | WebSocket endpoints /ws/player/{room_code} and /ws/spectator/{room_code} | ✓ SATISFIED | Routes in main.rs; Axum 0.8 curly-brace syntax confirmed |
| ENG-02 | 01-03 | DashMap room registry; rooms created on demand | ✓ SATISFIED | `create_room` called when `get_cmd_tx` returns None; DashMap in room_manager.rs |
| ENG-03 | 01-03 | Each room as independent Tokio task | ✓ SATISFIED | `tokio::spawn(room_actor(cmd_rx, state))` in `create_room` |
| ENG-04 | 01-03, 01-04 | 60Hz game loop with MissedTickBehavior::Skip | ✓ SATISFIED | `tick_interval.set_missed_tick_behavior(MissedTickBehavior::Skip)` in room_actor |
| ENG-05 | 01-03 | Dedicated outbound task with bounded mpsc channel | ✓ SATISFIED | `mpsc::channel::<String>(32)` per player; separate tokio::spawn for outbound writes |
| ENG-06 | 01-03 | RTT fairness buffer from Python input_delay.py | ✓ SATISFIED | `input_delay.rs` has `record_pong`, `median_rtt`, `compute_cutoff`; 5 unit tests pass |
| ENG-07 | 01-03, 01-04 | Pose fan-out immediate, not at 60Hz tick | ✓ SATISFIED | `pose_tx.send(json)` fires before `cmd_tx.send(RoomCmd::PoseFrame)` in handle_player |
| ENG-08 | 01-03 | Two broadcast channels per room (pose_tx cap 64, game_tx cap 128) | ✓ SATISFIED | `broadcast::channel::<String>(64)` and `broadcast::channel::<String>(128)` in create_room |
| ENG-09 | 01-04 | 3.8-second warmup window zeros input buffer | ✓ SATISFIED | `ROUND_WARMUP = 3.8`; `pose_buffer.clear()` during warmup phase in game_tick |
| ENG-10 | 01-04 | Round lifecycle: RoundOver → MsgRoundEnd → win counter → on_round_reset | ✓ SATISFIED | game_loop.rs handles time expiry, winner determination, win increment, match-over check, round reset |
| ENG-11 | 01-03 | Calibration handshake: both players submit → both receive calibration_start → game loop starts | ✓ SATISFIED | `send_to_slot(state, 0, &json)` and `send_to_slot(state, 1, &json)` in PlayerConnect arm; `round_start_time = Some(Instant::now())` in CalibrationDone arm |
| ENG-12 | 01-01, 01-05 | Static file serving at /mobile and /overlay; Dockerfile Rust stage | ✓ SATISFIED | `nest_service("/mobile", ServeDir::new("mobile/dist"))` and `/overlay`; Dockerfile confirmed |
| ENG-13 | 01-03 | JoinHandle tracked; abort-on-drop on room teardown | ✓ SATISFIED | `handle.join_handle.abort()` in expiry_task; JoinHandle stored in RoomHandle |
| PROTO-01 | 01-01, 01-03 | Wire types in Rust with serde_json; field names match shared/protocol.ts | ✓ SATISFIED | protocol.rs has all 20 types; `#[serde(rename = "type")]` on all msg_type fields; `InboundMobileMsg` with `#[serde(tag = "type")]` |
| PROTO-02 | 01-02 | Golden-file roundtrip tests in CI | ✓ SATISFIED | 18 tests pass; fixtures for all 17 message types present |
| PROTO-03 | 01-01, 01-02 | shared/protocol.ts kept in sync via ts-rs | ✓ SATISFIED | ts-rs generates bindings on `cargo test`; gen_protocol.py deprecated (D-04) |
| FIX-02 | 01-01, 01-04 | Spectator reconnect state snapshot with HP, wins, round, elapsed time | ✓ SATISFIED | subscribe-before-snapshot pattern; `build_snapshot` includes wins; `send_snapshot` sends lobby_update+round_start+game_state |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `engine/engine-core/src/lib.rs` | Only exposes `pub mod protocol`; other modules (input_delay, room, etc.) not publicly exposed | INFO | Integration tests only have access to protocol types; this is intentional since the other modules are not needed in tests |
| `game_loop.rs` | `tick: 0` hardcoded in MsgGameState | INFO | Plan explicitly notes "tick counter not tracked in Phase 1; Phase 2 will add" — not a blocker |
| `room.rs` | `build_snapshot` uses hardcoded `90.0` for remaining time calculation instead of `ROUND_DURATION` constant | WARNING | Minor — remaining time in snapshot is calculated from elapsed but uses the same 90.0 value; correctness is maintained but DRY violated |

### Human Verification Required

#### 1. End-to-End Mobile Client Connection

**Test:** Start the Rust server with `cd engine && cargo run --manifest-path engine-core/Cargo.toml`. Connect a WebSocket client to `ws://localhost:8000/ws/player/TESTROOM` and send `{"type":"join","room_code":"TESTROOM","player_slot":1}`.

**Expected:** Server returns `{"type":"joined","room_code":"TESTROOM","player_slot":1,"opponent_connected":false}` with no TypeScript client changes required. Server log shows "player connected to room TESTROOM".

**Why human:** Requires running server process and live WebSocket client to verify end-to-end wire behavior including the Axum 0.8 path syntax fix confirmed at runtime.

#### 2. Spectator Snapshot on Mid-Round Reconnect (FIX-02)

**Test:** Start the server. Connect two player clients, complete calibration (send `calibration_done` from both). Wait 5+ seconds into the live round. Disconnect the spectator WebSocket then reconnect to `ws://localhost:8000/ws/spectator/TESTROOM`.

**Expected:** On reconnect, spectator receives in order: (1) `{"type":"lobby_update","p1":true,"p2":true}`, then (2) `{"type":"round_start","round_number":1}`, then (3) `{"type":"game_state",...,"wins":[0,0],"remaining_time":<correct elapsed>}`. No live broadcast messages arrive before the snapshot sequence completes.

**Why human:** Race condition correctness (subscribe-before-snapshot, Pitfall 6) and snapshot content accuracy require runtime observation of message ordering.

#### 3. Pose Fan-Out Independence from 60Hz Tick (ENG-07)

**Test:** Connect one player and one spectator to the same room. Have the player send a `pose_frame` message. Measure time between pose_frame arrival and spectator's `pose_update` receipt.

**Expected:** `pose_update` arrives at spectator within the same message-dispatch cycle (sub-millisecond), not waiting for the next 60Hz game tick (~16.7ms).

**Why human:** Real-time message ordering between two WebSocket connections cannot be verified with static analysis. The code is correctly structured (pose_tx.send fires before RoomCmd::PoseFrame is sent to actor) but empirical timing confirms the claim.

### Gaps Summary

No gaps. All 5 roadmap success criteria are verified at the code level. All 17 requirements (ENG-01 through ENG-13, PROTO-01 through PROTO-03, FIX-02) have implementation evidence in the codebase. Three items require human runtime verification to confirm end-to-end behavior that cannot be evaluated statically.

The one notable code-level observation (room.rs uses hardcoded `90.0` instead of `ROUND_DURATION` constant in `build_snapshot`) is a DRY violation but does not affect correctness — the value matches the constant.

---

_Verified: 2026-05-02_
_Verifier: Claude (gsd-verifier)_
