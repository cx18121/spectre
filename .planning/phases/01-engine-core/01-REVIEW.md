---
phase: 01-engine-core
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - engine/engine-core/src/main.rs
  - engine/engine-core/src/protocol.rs
  - engine/engine-core/src/room.rs
  - engine/engine-core/src/room_manager.rs
  - engine/engine-core/src/input_delay.rs
  - engine/engine-core/src/broadcast.rs
  - engine/engine-core/src/game_loop.rs
  - engine/engine-core/src/lib.rs
  - engine/engine-core/tests/protocol_roundtrip.rs
  - Dockerfile
  - scripts/capture_fixtures.py
  - scripts/gen_protocol.py
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

The engine-core implementation is well-structured for a real-time WebSocket game server. The actor model, broadcast channel split, and RTT fairness delay are sound architectural choices. However, there are four blocker-level defects: an out-of-bounds panic from unvalidated client input, a `pose_tx` lookup that silently drops a connecting player when room code collision occurs, a room expiry mechanism that is permanently broken (the `RoomHandle.match_over` flag is never set), and an RTT calculation that accepts a client-controlled timestamp with no bounds check. Several important game-event messages also use `try_send` with silent drop on full channel, which can cause players to miss `round_end`/`match_end` events.

---

## Critical Issues

### CR-01: Out-of-bounds panic from unvalidated `player_slot` in join message

**File:** `engine/engine-core/src/main.rs:79` and `engine/engine-core/src/room.rs:175`

**Issue:** The client supplies `player_slot` as a `u8`. `main.rs:79` converts it to a 0-indexed `usize` via `(msg.player_slot as usize).saturating_sub(1)`. For any `player_slot` value of 3 or greater (3-255 from the u8 range), `saturating_sub(1)` produces 2-254. That value is then passed as `slot` through `RoomCmd::PlayerConnect` to `handle_cmd` in `room.rs:175`, where it indexes into `state.players[slot]` — a fixed-size array of length 2. This panics the room actor task for any join message with `player_slot >= 3`.

Because this is a WebSocket server accepting arbitrary client input, any client (or network attacker) can crash any room actor by sending `{"type":"join","room_code":"X","player_slot":3}`.

**Fix:**
```rust
// In main.rs, replace the slot conversion with a bounds check:
let slot_idx: usize = match ws_stream.next().await {
    Some(Ok(Message::Text(raw))) => {
        match serde_json::from_str::<InboundMobileMsg>(&raw) {
            Ok(InboundMobileMsg::Join(msg)) => {
                let slot = (msg.player_slot as usize).saturating_sub(1);
                if slot >= 2 {
                    tracing::warn!("handle_player: invalid player_slot {}, closing", msg.player_slot);
                    return;
                }
                slot
            }
            Ok(_) | Err(_) => {
                tracing::warn!("handle_player: first message was not a join, closing {}", room_code);
                return;
            }
        }
    }
    _ => return,
};
```

---

### CR-02: `pose_tx` lookup uses original `room_code` instead of `actual_code` — silent player drop on collision

**File:** `engine/engine-core/src/main.rs:109`

**Issue:** When a room code collision occurs during `create_room`, the function generates a new unique code and returns it as `actual_code`. The subsequent `cmd_tx` lookup on line 100 correctly uses `actual_code`. However, the `pose_tx` lookup on line 109 continues to use `room_code` (the original, already-occupied code):

```rust
let pose_tx = match app.rooms.rooms.get(&room_code).map(|h| h.pose_tx.clone()) {
```

If `actual_code != room_code` (i.e., the fallback path was taken), this lookup returns `None` and the function returns silently — the player is dropped with no error sent to the client, and the freshly created room actor is orphaned.

**Fix:**
```rust
// Replace room_code with actual_code for the pose_tx lookup:
let pose_tx = match app.rooms.rooms.get(&actual_code).map(|h| h.pose_tx.clone()) {
    Some(tx) => tx,
    None => {
        tracing::error!("room {} missing pose_tx after create_room — logic error", actual_code);
        return;
    }
};
```

Note: `actual_code` must be in scope at this point. The `None => return` branch on the `cmd_tx` lookup above also needs to be reachable with `actual_code`, so the variable must be hoisted out of the inner block.

---

### CR-03: Room expiry never fires — `RoomHandle.match_over` is never set

**File:** `engine/engine-core/src/room_manager.rs:21-27` and `engine/engine-core/src/game_loop.rs:116`

**Issue:** The expiry check `is_expired()` requires `self.match_over.load(...)` to be `true`. `RoomHandle.match_over` is a separate `AtomicBool` field on the handle struct. The only code that marks a match as over is `game_loop.rs:116` which sets `state.match_over = true` — this is `RoomState.match_over`, a plain `bool` inside the actor, not `RoomHandle.match_over`. The `RoomCmd::MarkMatchOver` command exists but is never sent anywhere in the codebase. As a result `RoomHandle.match_over` is always `false`, `is_expired()` always returns `false`, and rooms accumulate indefinitely in memory — the expiry task silently does nothing.

Additionally, `last_player_disconnected_at` in `RoomHandle` is never updated when a player disconnects (`handle_cmd` in `room.rs:236` sets the state's `connected = false` but has no way to reach the `RoomHandle`).

**Fix:**
Send `RoomCmd::MarkMatchOver` from `game_loop.rs` after setting `state.match_over = true`, and handle it in the actor by signaling back to the handle. The cleanest path is to add an `Arc<AtomicBool>` shared between `RoomState` and `RoomHandle`:

```rust
// In room_manager.rs: share the AtomicBool
let match_over_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
let state = RoomState::new(code.clone(), 2, pose_tx.clone(), game_tx.clone(), Arc::clone(&match_over_flag));
let handle = RoomHandle { ..., match_over: match_over_flag, ... };

// In game_loop.rs: set the shared flag instead of state.match_over
state.match_over_flag.store(true, std::sync::atomic::Ordering::Relaxed);
```

Also update `PlayerDisconnect` handling to record the disconnect time on the shared handle, or add a `last_activity` timestamp to `RoomState` that the expiry task can compare via a read-only snapshot command.

---

### CR-04: RTT computed from client-controlled `original_t` with no validation

**File:** `engine/engine-core/src/input_delay.rs:8-19`

**Issue:** `record_pong` computes RTT as `(now_secs - original_t) * 1000.0` where `original_t` is the `t` field from the client's pong message — a value the client chose freely. There is no validation or clamping of the resulting RTT before it is pushed into `rtt_samples`. A client can manipulate this in two ways:

1. **Negative RTT**: Send `original_t` equal to a future Unix timestamp (e.g., `now + 10`). This produces `rtt = -10000.0 ms`. `median_rtt` returns a negative value, causing `compute_cutoff` to set the cutoff *in the future* (`Instant::now() - (-x ms)` overflows and falls back to `Instant::now()`). This effectively disables input delay for that player, giving them an unfair advantage.
2. **Inflated RTT**: Send `original_t` as `0` or a very old epoch. This produces an enormous RTT, causing `compute_cutoff` to apply the maximum 60 ms delay regardless of actual network conditions — handicapping the opponent.

**Fix:**
```rust
pub fn record_pong(samples: &mut Vec<f64>, original_t: f64) -> f64 {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    let rtt = (now_secs - original_t) * 1000.0;
    // Clamp: reject nonsensical RTT values (negative or > 5 seconds)
    if rtt < 0.0 || rtt > 5000.0 {
        tracing::warn!("record_pong: implausible RTT {:.1}ms, discarding", rtt);
        return 0.0;
    }
    samples.push(rtt);
    if samples.len() > 10 {
        let drain_to = samples.len() - 10;
        samples.drain(0..drain_to);
    }
    rtt
}
```

---

## Warnings

### WR-01: TOCTOU race in `create_room` allows duplicate room creation

**File:** `engine/engine-core/src/room_manager.rs:46-81`

**Issue:** The check `if !self.rooms.contains_key(&room_code)` on line 46 and the subsequent `self.rooms.insert(code.clone(), handle)` on line 81 are two separate DashMap operations with no atomic guarantee between them. Two concurrent `handle_player` calls for the same new room code can both observe `contains_key` returning `false`, both call `create_room`, and both insert their own `RoomHandle` for the same key. DashMap's `insert` overwrites the previous entry, orphaning the first room actor (its task keeps running but the handle is gone — it will run until the channel is dropped, which happens only when the second `RoomHandle`'s `cmd_tx` is dropped). The first player then ends up associated with the orphaned actor's `cmd_tx` (returned by the first `create_room` call) while the second player's room lookup returns the second actor. The two players are in different actors and will never interact.

**Fix:**
Use DashMap's `entry` API for atomic insert-or-get:
```rust
use dashmap::mapref::entry::Entry;

pub fn create_room(&self, room_code: String) -> String {
    let code = match self.rooms.entry(room_code.clone()) {
        Entry::Vacant(e) => {
            // atomically claim this slot
            let code = room_code.clone();
            // build handle and insert ...
            e.insert(handle);
            code
        }
        Entry::Occupied(_) => {
            // fallback: generate unique code ...
        }
    };
    code
}
```
Note: since spawning the actor task must happen before inserting, the actor spawn and insert cannot both be inside the `entry` critical section atomically. A practical fix is to use `rooms.entry(code).or_insert_with(|| { spawn actor; handle })` shaped carefully, or to accept a small window and rely on the `slot already occupied` reply to reject the second joiner gracefully.

---

### WR-02: Critical game-event messages silently dropped on full player channel

**File:** `engine/engine-core/src/room.rs:105`, `engine/engine-core/src/game_loop.rs:85`, `engine/engine-core/src/game_loop.rs:112`, `engine/engine-core/src/game_loop.rs:139`

**Issue:** `send_to_slot` uses `try_send` (non-blocking, capacity 32). Game-loop code also calls `tx.try_send` directly on lines 85, 112, and 139. These paths send `round_end`, `match_end`, and `round_start` — messages the client must receive to drive UI state transitions. If the player's outbound task is even momentarily busy (slow WebSocket flush), these messages are silently discarded. There is no retry, logging, or disconnection signal on drop.

**Fix:**
For game-event messages that must be delivered (round lifecycle, match end), use `.send().await` instead of `try_send`, or at minimum log when the message is dropped:
```rust
// Replace silent try_send with a logged variant for high-priority messages:
if tx.try_send(json.clone()).is_err() {
    tracing::warn!("player {} outbound channel full, dropping {:?}", slot + 1, msg_type);
}
```
For absolute reliability, increase channel capacity (currently 32) or use unbounded channels for these specific paths.

---

### WR-03: `forward_broadcast_to_spectator` can starve one channel under high-frequency pose traffic

**File:** `engine/engine-core/src/broadcast.rs:14-40`

**Issue:** The `tokio::select!` loop picks randomly between `game_rx` and `pose_rx` when both have messages ready. Under sustained pose traffic (2 players × 60 fps = 120 messages/sec on `pose_rx`), `game_rx` will win the random selection only half the time — but `pose_rx` will *always* have a pending message when `select!` checks. In practice this means the per-tick `game_state` (60 Hz on `game_rx`) will be sent far less frequently to spectators than the pose updates, and could be lagged systematically if pose bursts arrive faster than the spectator's WebSocket can drain them.

**Fix:**
Prioritize `game_rx` (authoritative game state) by using `biased` select:
```rust
tokio::select! {
    biased;
    result = game_rx.recv() => { /* ... */ }
    result = pose_rx.recv() => { /* ... */ }
}
```
Or, more robustly, drain `game_rx` fully before processing pose messages within each loop iteration.

---

### WR-04: `capture_fixtures.py` is incompatible with the Rust server's join-first protocol

**File:** `scripts/capture_fixtures.py:28-32`

**Issue:** The script connects to `/ws/player/TESTFIX` and immediately awaits a message from the server (line 31: `joined_raw = await ws.recv()`). The Rust server requires the client to send a `MsgJoin` message first — only after receiving a valid join does `handle_player` send `MsgJoined` back (line 136 of `main.rs`). The script never sends a join message, so the server will wait for one and never send `MsgJoined`. The `ws.recv()` call will block until the server times out or the connection is dropped. The `msg_joined.json` fixture in the repository was captured from the old Python server and does not test the Rust server's actual join handshake.

**Fix:**
```python
async with websockets.connect(f"{base}/ws/player/TESTFIX") as ws:
    # Rust server requires join-first
    await ws.send(json.dumps({"type": "join", "room_code": "TESTFIX", "player_slot": 1}))
    joined_raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
    (FIXTURES_DIR / "msg_joined.json").write_text(joined_raw)
    print(f"captured msg_joined: {joined_raw[:80]}")
    # ... rest of capture
```

---

### WR-05: `processed_frames` grows without bound during a match

**File:** `engine/engine-core/src/game_loop.rs:51-61`

**Issue:** `game_tick` drains frames from `pose_buffer` into `processed_frames` (line 54-55) every tick. In Phase 1, `processed_frames` is never read or cleared except at round reset (line 127). At 60 fps per player over a 90-second round, this accumulates up to ~5,400 frames per player per round (each frame contains 33 `PoseKeypoint` structs at 4×f64 = 32 bytes each, ~105 KB per player per round). Over a multi-round match this grows monotonically and is never reclaimed until round end. If hit detection is not implemented before the buffer overflows memory, this will become a problem.

**Fix:**
Add a capacity cap on `processed_frames` matching `pose_buffer`'s 180-frame cap, or clear it after each tick since Phase 1 does not consume it:
```rust
// After draining into processed_frames, if Phase 1 doesn't use them, clear immediately:
for player in state.players.iter_mut() {
    player.processed_frames.clear(); // Phase 1: no consumer; clear to bound memory
}
```

---

## Info

### IN-01: `tick` field in `MsgGameState` is always 0

**File:** `engine/engine-core/src/game_loop.rs:168`

**Issue:** The `tick` field is hardcoded to `0` in all emitted `MsgGameState` messages. The protocol test fixture `msg_game_state.json` has `tick: 42` — this passes the roundtrip test only because the test checks `orig["tick"] == round["tick"]`, not that tick is non-zero. Clients or overlays that use `tick` for deduplication, ordering, or animation scheduling will receive no useful information.

**Fix:** Add a `tick: u64` counter to `RoomState` and increment it each time `game_tick` emits a `game_state`:
```rust
state.tick += 1;
// ... in build_game_state_with_latency:
tick: state.tick,
```

---

### IN-02: Hardcoded listen address and port with no environment override

**File:** `engine/engine-core/src/main.rs:36`

**Issue:** `TcpListener::bind("0.0.0.0:8000")` is hardcoded. In containerized or multi-environment deployments it is conventional to allow port configuration via an environment variable.

**Fix:**
```rust
let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8000".to_string());
let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
tracing::info!("engine-core listening on {}", addr);
```

---

### IN-03: `lib.rs` exports only `protocol` module — internal modules inaccessible for integration testing

**File:** `engine/engine-core/src/lib.rs:1-2`

**Issue:** `lib.rs` only re-exports `pub mod protocol`. Modules `room`, `room_manager`, `game_loop`, `input_delay`, and `broadcast` are not exported. Integration tests in `tests/` can only test protocol (de)serialization. Game-loop logic, input-delay math, and room state transitions cannot be integration-tested without either making those modules `pub` in `lib.rs` or duplicating the logic in test helpers.

**Fix:** Expose internal modules for testing:
```rust
pub mod protocol;
pub mod room;
pub mod room_manager;
pub mod input_delay;
pub mod broadcast;
pub mod game_loop;
```
Or, if keeping modules private is intentional, add `#[doc(hidden)]` exports behind a `#[cfg(test)]` feature gate.

---

_Reviewed: 2026-05-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
