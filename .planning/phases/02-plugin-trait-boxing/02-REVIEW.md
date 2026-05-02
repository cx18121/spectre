---
phase: 02-plugin-trait-boxing
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - engine/boxing-plugin/src/bot.rs
  - engine/boxing-plugin/src/damage.rs
  - engine/boxing-plugin/src/hit_detection.rs
  - engine/boxing-plugin/src/lib.rs
  - engine/engine-core/src/broadcast.rs
  - engine/engine-core/src/game_loop.rs
  - engine/engine-core/src/input_delay.rs
  - engine/engine-core/src/lib.rs
  - engine/engine-core/src/main.rs
  - engine/engine-core/src/protocol.rs
  - engine/engine-core/src/room.rs
  - engine/engine-core/src/room_manager.rs
  - engine/plugin-trait/src/lib.rs
findings:
  critical: 5
  warning: 5
  info: 2
  total: 12
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-02
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Full review of the plugin-trait / boxing-plugin / engine-core stack implementing the Phase 02 deliverables. The overall architecture is sound: object-safety constraints on `GamePlugin` are correctly satisfied, the RTT fairness delay is correctly implemented, DashMap guards are never held across awaits, FIX-01 (ref_vel survival across rounds) and FIX-02 (wins in snapshot) are correctly implemented, and the solo/bot mode gate (BOX-10) now correctly triggers calibration for a single player.

Five blockers and five warnings were found. The most severe issues are: a room expiry mechanism that is permanently disabled because `last_player_disconnected_at` is never written (rooms accumulate indefinitely); a `max_wins` config field that is silently ignored (every match ends at 2 wins regardless of config); a dead `HeadThroat` body region due to inverted boundary logic; a missing `region` field in the human-hit `you_were_hit` message (inconsistency with both the bot path and the protocol struct); and a `BodyRegion` wire format producing concatenated lowercase (`"headface"`, `"torsoupper"`) rather than snake_case (`"head_face"`, `"torso_upper"`).

---

## Critical Issues

### CR-01: Room Expiry Permanently Disabled — Rooms Leak Indefinitely

**File:** `engine/engine-core/src/room_manager.rs:17,24-30,77`

**Issue:** `RoomHandle.last_player_disconnected_at` is initialized to `None` on line 77 and is **never written** anywhere in the codebase. `is_expired()` (lines 24-30) evaluates `guard.map_or(false, |t| t.elapsed() > Duration::from_secs(600))`, which always returns `false` when the Option is `None`. The `expiry_task` runs every 60 seconds but removes zero rooms. Every room spawned since process start accumulates in the DashMap along with its Tokio actor and broadcast channels. This is a goroutine and memory leak that will eventually exhaust resources on a long-running server.

**Fix:** Thread the same `Arc<Mutex<Option<Instant>>>` pattern used for `match_over_flag` into `RoomState`, then update it when the last player disconnects:

```rust
// room_manager.rs: add to RoomHandle creation:
let last_disconnect = Arc::new(std::sync::Mutex::new(None::<Instant>));

// room.rs: add field to RoomState:
pub last_player_disconnected_at: Arc<std::sync::Mutex<Option<Instant>>>,

// room.rs, PlayerDisconnect handler, after setting connected = false:
let any_connected = state.players.iter().any(|p| p.connected);
if !any_connected {
    if let Ok(mut guard) = state.last_player_disconnected_at.lock() {
        *guard = Some(Instant::now());
    }
}
```

---

### CR-02: `max_wins` Config Value Silently Ignored — Match Always Ends at 2 Wins

**File:** `engine/engine-core/src/room_manager.rs:64` and `engine/engine-core/src/main.rs:32`

**Issue:** `BoxingConfig` in `main.rs` sets `max_wins: 3`. However, `RoomState::new` in `room_manager.rs` is called with the literal `2` as the `max_wins` argument (line 64, comment says "default max_wins"). `RoomState.max_wins` is the value used in `handle_round_over`: `state.wins.iter().any(|&w| w >= state.max_wins)`. `BoxingConfig.max_wins` is stored in `BoxingPlugin.config` but is never read by any game-logic path. Every match therefore ends at the first to 2 wins regardless of the configured value of 3.

**Fix:**

```rust
// room_manager.rs line 64: replace the hardcoded 2 with a value
// sourced from the plugin config or from AppState.
// One approach: expose a max_wins() accessor on GamePlugin:
let state = RoomState::new(
    code.clone(),
    3, // or plugin.max_wins() if the trait exposes it
    pose_tx.clone(),
    game_tx.clone(),
    Arc::clone(&match_over_flag),
    Arc::clone(&plugin),
);
```

---

### CR-03: `HeadThroat` Region Is Unreachable — Logic Error in `refine_head_region`

**File:** `engine/boxing-plugin/src/hit_detection.rs:128-133`

**Issue:** `refine_head_region` is only called when `classify_region` has already returned `BodyRegion::HeadFace`, which requires `wrist_y >= REL_HEAD_Y * scale` (= `1.45 * scale`). Inside `refine_head_region`:

```
mid_head = 1.45 * scale + 0.2 * scale = 1.65 * scale

if wrist_y >= 1.65 * scale  → HeadFace
elif wrist_y >= 1.45 * scale → HeadChin   // always true when the first branch is false,
                                           // because the caller guarantees wrist_y >= 1.45*scale
else                          → HeadThroat // UNREACHABLE: wrist_y >= 1.45 always holds here
```

The `else` branch (line 132) can never execute. `HeadThroat` deals 20–25 damage (the same as `HeadChin`) but is never applied for punch hits. The logic is anatomically inverted: the throat is below the chin, so a wrist arriving at just above `REL_HEAD_Y * scale` should classify as throat, not chin.

**Fix:**

```rust
fn refine_head_region(wrist_y: f64, scale: f64) -> BodyRegion {
    // Divided into three equal bands above head_y:
    // [head_y, head_y+0.1*scale) = throat (lowest)
    // [head_y+0.1*scale, head_y+0.2*scale) = chin
    // [head_y+0.2*scale, ...) = face (highest)
    let throat_y = REL_HEAD_Y * scale;
    let chin_y   = REL_HEAD_Y * scale + 0.10 * scale;
    let face_y   = REL_HEAD_Y * scale + 0.20 * scale;
    if wrist_y >= face_y       { BodyRegion::HeadFace }
    else if wrist_y >= chin_y  { BodyRegion::HeadChin }
    else if wrist_y >= throat_y { BodyRegion::HeadThroat }  // now reachable
    else                        { BodyRegion::HeadFace }    // fallback (shouldn't occur)
}
```

---

### CR-04: Human `you_were_hit` Message Missing `region` Field

**File:** `engine/boxing-plugin/src/lib.rs:159-165`

**Issue:** The `SendToPlayer` payload for a human hit omits the `region` key:

```rust
// lib.rs lines 160-164
json!({
    "type": "you_were_hit",
    "damage": dmg,
    // "region" is absent
})
```

The bot-hit path (`bot.rs:111-115`) includes `"region"`. The canonical `MsgYouWereHit` protocol struct (`protocol.rs:146-151`) declares `region: String` as a required field. Any mobile client reading `msg.region` for haptic feedback or visual hit-zone highlighting receives `undefined` for all human hits while receiving a valid value for bot hits.

**Fix:**

```rust
events.push(GameEvent::SendToPlayer {
    slot: (defender_idx + 1) as u8,
    payload: json!({
        "type": "you_were_hit",
        "region": h.region.to_wire(), // see CR-05 for to_wire()
        "damage": dmg,
    }),
});
```

---

### CR-05: `BodyRegion` Wire Format Produces Concatenated Lowercase, Not Snake_Case

**File:** `engine/engine-core/src/game_loop.rs:200`, `engine/boxing-plugin/src/bot.rs:113`

**Issue:** Every region string on the wire is produced by `format!("{:?}", region).to_lowercase()`. Rust's `Debug` derive emits PascalCase variant names; `.to_lowercase()` produces one word: `BodyRegion::HeadFace` → `"headface"`, `BodyRegion::TorsoUpper` → `"torsoupper"`, `BodyRegion::BlockForearm` → `"blockforearm"`. The Python reference server and overlay TypeScript client expect snake_case: `"head_face"`, `"torso_upper"`, `"block_forearm"`. This affects `HitEvent.region` in `MsgGameState.recent_hits` (spectator overlay), the `you_were_hit.region` in bot messages, and any future human-hit `you_were_hit.region` added for CR-04.

**Fix:** Add a `to_wire` method to `BodyRegion` in `plugin-trait/src/lib.rs`:

```rust
impl BodyRegion {
    pub fn to_wire(&self) -> &'static str {
        match self {
            BodyRegion::HeadFace     => "head_face",
            BodyRegion::HeadChin     => "head_chin",
            BodyRegion::HeadThroat   => "head_throat",
            BodyRegion::TorsoUpper   => "torso_upper",
            BodyRegion::TorsoLower   => "torso_lower",
            BodyRegion::BlockHand    => "block_hand",
            BodyRegion::BlockForearm => "block_forearm",
            BodyRegion::LegThigh     => "leg_thigh",
            BodyRegion::LegShin      => "leg_shin",
        }
    }
}
```

Replace all `format!("{:?}", region).to_lowercase()` call sites with `region.to_wire()`.

---

## Warnings

### WR-01: `solo_mode` Predicate Inconsistency Between Engine and Boxing Plugin

**File:** `engine/engine-core/src/game_loop.rs:47` and `engine/boxing-plugin/src/lib.rs:97`

**Issue:** The engine evaluates solo mode as `!state.players[1].connected` (true whenever P2 is absent, regardless of P1). The boxing plugin evaluates it as `ctx.room.slots[0].connected && !ctx.room.slots[1].connected` (true only when P1 is also present). These diverge when P1 disconnects from an active solo match: the engine keeps `match_in_progress = true` (P1's `reference_velocity` is still `Some`), but the plugin receives `slots[0].connected = false` and computes `solo_mode = false`, so the bot does not fire. The inconsistency produces undefined behavior on P1 disconnect in solo mode.

**Fix:** Introduce a `solo_mode: bool` field on `RoomState`, set once at match start in the `CalibrationDone` handler (`state.solo_mode = !state.players[1].connected`), and pass it as a read-only field to both the engine's `game_tick` and (via `RoomView`) the plugin's `on_tick`.

---

### WR-02: `build_snapshot` Ignores Warmup Period — Stale `remaining_time` for Reconnecting Spectators

**File:** `engine/engine-core/src/room.rs:157-158`

**Issue:** `build_snapshot` computes `remaining = (90.0_f64 - elapsed).max(0.0)` where `elapsed = round_start_time.elapsed()`. The live game loop uses `ROUND_DURATION - (warmup_elapsed - ROUND_WARMUP)` (game_loop.rs:81-82), correctly subtracting the 3.8-second warmup from the countdown. The snapshot does not subtract `ROUND_WARMUP`, so a reconnecting spectator receives a `remaining_time` up to 3.8 seconds lower than the live broadcast shows. Additionally, the literal `90.0` duplicates `ROUND_DURATION`; if that constant changes the snapshot silently diverges.

**Fix:**

```rust
// room.rs, build_snapshot, replace lines 157-158:
use crate::game_loop::{ROUND_DURATION, ROUND_WARMUP};
let elapsed = state.round_start_time.map_or(0.0, |t| t.elapsed().as_secs_f64());
let live_elapsed = (elapsed - ROUND_WARMUP).max(0.0);
let remaining = (ROUND_DURATION - live_elapsed).max(0.0);
```

---

### WR-03: P2 Mid-Game Disconnect Silently Activates Bot Mode

**File:** `engine/engine-core/src/game_loop.rs:47`

**Issue:** `solo_mode` is re-derived from `!state.players[1].connected` on every tick. When P2 disconnects during a live two-player match, `game_tick` immediately switches to bot mode on the next tick. P1 starts absorbing scripted bot damage with no notification that the mode changed. No round-end or pause event is emitted on P2 disconnect (room.rs:290-302 only updates the lobby broadcast). This is a direct consequence of the stateless `solo_mode` derivation.

**Fix:** Same as WR-01 — use a `solo_mode: bool` set once at match start. P2 disconnect during a live match should emit a `RoundOver` (forfeit) or pause signal, handled separately from the bot-mode path.

---

### WR-04: Kick Region Uses Attacker's Absolute Ankle Y, Not Defender's Body Frame

**File:** `engine/boxing-plugin/src/hit_detection.rs:264-265`

**Issue:** `detect_kick` classifies the hit region as `LegThigh` if `ankle_pos.y >= 0.0`, else `LegShin`. This uses the attacker's ankle Y in the attacker's own Y-up frame, not the defender's body position. Punch detection correctly compares `wrist_pos.y` against `def_scale`-derived thresholds. A tall attacker kicking from a high position always gets `LegThigh` even when the kick contacts the defender's shin; a short attacker always gets `LegShin`. Neither result correlates with the defender's actual body geometry.

**Fix:**

```rust
// detect_kick: classify against defender's frame, then restrict to leg regions
let region = classify_region(ankle_pos.y, def_scale);
let region = match region {
    BodyRegion::LegThigh | BodyRegion::LegShin => region,
    BodyRegion::TorsoLower => BodyRegion::LegThigh, // high kick hits thigh
    _ => BodyRegion::LegThigh,
};
```

---

### WR-05: `player_slot=0` in Join Maps to Slot 0 Without Rejection or Warning

**File:** `engine/engine-core/src/main.rs:90-94`

**Issue:** `(msg.player_slot as usize).saturating_sub(1)` maps `player_slot=0` to `slot_idx=0`, the same as `player_slot=1`. A client with an off-by-one bug sending `player_slot=0` silently joins as player 1 instead of being rejected. The guard `slot >= 2` only rejects values >= 3 (after subtraction), leaving the 0→0 mapping undetected.

**Fix:**

```rust
if msg.player_slot == 0 || msg.player_slot > 2 {
    tracing::warn!("handle_player: invalid player_slot {}, closing", msg.player_slot);
    return;
}
let slot = (msg.player_slot as usize) - 1;
```

---

## Info

### IN-01: `BoxingConfig.max_wins` Is a Dead Field

**File:** `engine/boxing-plugin/src/lib.rs:33`, `engine/engine-core/src/main.rs:32`

**Issue:** `BoxingConfig.max_wins` is stored in `BoxingPlugin.config` but never read by any code path. The actual win threshold comes from `RoomState.max_wins` (set independently in `room_manager.rs`). The field misleads integrators into thinking it controls match length (see CR-02 for the related blocker).

**Fix:** Either remove the field from `BoxingConfig`, or plumb its value through to `RoomState::new` to actually control match length.

---

### IN-02: `emit_commentary_hint` Hardcodes `max_hp = 800.0`

**File:** `engine/boxing-plugin/src/lib.rs:250`

**Issue:** HP percentage thresholds for commentary events use `let max_hp = 800.0_f64` with an inline comment noting that `self.config.hp` would be better but `self` is not in scope. If `BoxingConfig.hp` is set to a non-800 value, commentary events (`"low_hp"`, `"comeback"`) fire at wrong thresholds.

**Fix:** Pass `config_hp: u32` as a parameter to `emit_commentary_hint` and call it with `self.config.hp` from `on_tick` where `&self` is available.

---

_Reviewed: 2026-05-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
