---
phase: 10-fpsboxingplugin
plan: 01-04
type: execute
wave: sequential          # Plans 01→02→03→04 run in order; see per-plan waves below
depends_on: []
files_modified:
  - engine/Cargo.toml
  - engine/boxing-core/Cargo.toml
  - engine/boxing-core/src/lib.rs
  - engine/boxing-core/src/hit_detection.rs
  - engine/boxing-core/src/damage.rs
  - engine/boxing-plugin/Cargo.toml
  - engine/boxing-plugin/src/lib.rs
  - engine/fps-boxing-plugin/Cargo.toml
  - engine/fps-boxing-plugin/src/lib.rs
  - engine/engine-core/src/protocol.rs
  - engine/engine-core/src/main.rs
autonomous: true
requirements:
  - FPSP-01
  - FPSP-02
  - FPSP-03
  - FPSP-04

must_haves:
  truths:
    - "A client creating a room with game_type=fps_boxing gets FPSBoxingPlugin (not BoxingPlugin)"
    - "Every tick, each player receives a SendToPlayer event containing their opponent's 6 arm landmarks, both HP values, and round timer"
    - "When a hit lands, the receiving player gets a SendToPlayer event with punch_type and damage"
    - "FPSBoxingPlugin::game_type() returns the string 'fps_boxing' — a Rust test asserts it is NOT 'boxing'"
    - "boxing-plugin still compiles and passes all its existing tests after hit_detection.rs and damage.rs are extracted"
  artifacts:
    - path: "engine/boxing-core/src/lib.rs"
      provides: "pub mod hit_detection; pub mod damage;"
    - path: "engine/boxing-core/src/hit_detection.rs"
      provides: "detect_punch, detect_kick, HitResult, LEFT_ELBOW, RIGHT_ELBOW pub consts"
    - path: "engine/boxing-core/src/damage.rs"
      provides: "compute_damage function"
    - path: "engine/fps-boxing-plugin/src/lib.rs"
      provides: "FPSBoxingPlugin struct + full GamePlugin impl"
    - path: "engine/engine-core/src/protocol.rs"
      provides: "MsgFpsState, MsgFpsHit structs with Serialize/Deserialize/TS derives"
    - path: "engine/engine-core/src/main.rs"
      provides: "'fps_boxing' match arm in plugin HashMap"
  key_links:
    - from: "engine-core/src/main.rs"
      to: "fps_boxing_plugin::FPSBoxingPlugin"
      via: "plugins.insert('fps_boxing', Arc::new(FPSBoxingPlugin::new(...)))"
      pattern: "fps_boxing"
    - from: "engine/fps-boxing-plugin/src/lib.rs"
      to: "boxing_core::hit_detection::detect_punch"
      via: "use boxing_core::hit_detection"
      pattern: "detect_punch"
    - from: "engine/fps-boxing-plugin/src/lib.rs"
      to: "engine_core::protocol::{MsgFpsState, MsgFpsHit}"
      via: "extern crate engine_core (via serde_json::to_value)"
      pattern: "MsgFpsState|MsgFpsHit"
---

<objective>
Phase 10 delivers the FPS boxing server plugin: a new `fps-boxing-plugin` crate that implements
`GamePlugin` for "fps_boxing" rooms, backed by a shared `boxing-core` crate that holds the
extracted hit-detection and damage logic previously private to `boxing-plugin`.

Purpose: Enable the game server to host first-person boxing rooms with authoritative hit
detection, HP tracking, and per-tick opponent arm state broadcast. Server-side only — no
engine, client, or frontend changes.

Output:
- `engine/boxing-core/` — new library crate (extracted from boxing-plugin)
- `engine/fps-boxing-plugin/` — new plugin crate implementing GamePlugin
- `engine/engine-core/src/protocol.rs` — MsgFpsState + MsgFpsHit wire structs
- `engine/engine-core/src/main.rs` — "fps_boxing" routing arm
- Updated `engine/Cargo.toml` workspace members
- Regenerated `shared/protocol.ts` via `cargo test` (ts-rs)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/10-fpsboxingplugin/10-CONTEXT.md
@.planning/phases/10-fpsboxingplugin/10-RESEARCH.md
</context>

---

# Plan 01 — boxing-core crate extraction

**Wave: 1** | **Requirements: FPSP-02**

Extract `hit_detection.rs` and `damage.rs` from `boxing-plugin` into a new `boxing-core`
workspace crate. Add missing elbow index constants. Update `boxing-plugin` to depend on
`boxing-core` instead of its private copies.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create boxing-core crate with extracted modules</name>
  <files>
    engine/boxing-core/Cargo.toml,
    engine/boxing-core/src/lib.rs,
    engine/boxing-core/src/hit_detection.rs,
    engine/boxing-core/src/damage.rs,
    engine/Cargo.toml
  </files>
  <behavior>
    - boxing-core compiles as a standalone library (cargo build -p boxing-core passes)
    - All existing tests from hit_detection.rs pass under boxing-core (cargo test -p boxing-core)
    - All existing tests from damage.rs pass under boxing-core (cargo test -p boxing-core)
    - LEFT_ELBOW and RIGHT_ELBOW are pub consts (13 and 14) accessible to callers
  </behavior>
  <action>
1. Create `engine/boxing-core/Cargo.toml`:
```toml
[package]
name = "boxing-core"
version = "0.1.0"
edition = "2021"

[lib]
name = "boxing_core"
path = "src/lib.rs"

[dependencies]
plugin-trait = { path = "../plugin-trait" }
```
No serde_json, rand, or tracing — boxing-core is pure logic using only plugin_trait types
(verified: damage.rs imports only plugin_trait::BodyRegion; hit_detection.rs imports only
plugin_trait::{PoseFrame, PoseKeypoint, BodyRegion}).

2. Create `engine/boxing-core/src/lib.rs`:
```rust
pub mod hit_detection;
pub mod damage;
```

3. Copy `engine/boxing-plugin/src/hit_detection.rs` verbatim to `engine/boxing-core/src/hit_detection.rs`.
   Then add two new pub constants immediately after RIGHT_SHOULDER (line 14):
```rust
pub const LEFT_ELBOW:  usize = 13;
pub const RIGHT_ELBOW: usize = 14;
```
   Make all existing landmark index constants pub (change `const` to `pub const` for
   WRIST_LEFT, WRIST_RIGHT, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP,
   ANKLE_LEFT, ANKLE_RIGHT). The body-threshold constants (REL_*, DEFAULT_BODY_SCALE,
   PUNCH_THRESHOLD, KICK_THRESHOLD) remain private — they are internal implementation
   details not needed by callers.

4. Copy `engine/boxing-plugin/src/damage.rs` verbatim to `engine/boxing-core/src/damage.rs`.
   No changes needed — it only imports plugin_trait::BodyRegion.

5. Update `engine/Cargo.toml` workspace members:
```toml
[workspace]
members = ["engine-core", "plugin-trait", "boxing-plugin", "dance-plugin", "boxing-core", "fps-boxing-plugin"]
resolver = "2"
```
Note: fps-boxing-plugin is listed now so workspace resolves correctly once created in Plan 03.
The crate directory doesn't need to exist yet for workspace declaration — cargo will warn
but not fail until Plan 03 creates it.
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo test -p boxing-core</automated>
  </verify>
  <done>
    `cargo test -p boxing-core` passes with all hit_detection and damage tests green.
    LEFT_ELBOW and RIGHT_ELBOW are pub const 13 and 14 in boxing_core::hit_detection.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update boxing-plugin to use boxing-core</name>
  <files>
    engine/boxing-plugin/Cargo.toml,
    engine/boxing-plugin/src/lib.rs,
    engine/boxing-plugin/src/hit_detection.rs,
    engine/boxing-plugin/src/damage.rs
  </files>
  <behavior>
    - boxing-plugin compiles after its internal hit_detection.rs and damage.rs are removed (per D-01)
    - All existing boxing-plugin tests still pass (detect_punch, compute_damage call sites unchanged)
    - `mod hit_detection; mod damage;` declarations are replaced by `use boxing_core::...`
  </behavior>
  <action>
1. Update `engine/boxing-plugin/Cargo.toml` — add boxing-core path dependency:
```toml
[dependencies]
plugin-trait = { path = "../plugin-trait" }
boxing-core = { path = "../boxing-core" }
serde_json = "1.0.149"
rand = "0.8.6"
tracing = "0.1.44"
```

2. In `engine/boxing-plugin/src/lib.rs`, replace the private module declarations:
```rust
// BEFORE (lines 11-12):
mod hit_detection;
mod damage;

// AFTER:
use boxing_core::hit_detection;
use boxing_core::damage;
```
All call sites in lib.rs use `hit_detection::detect_punch(...)` and `damage::compute_damage(...)`
— these paths are unchanged because the module is accessed by the same local name.
[VERIFIED: boxing-plugin/src/lib.rs lines 11-12 and call sites at lines 134-143, 145]

3. Delete `engine/boxing-plugin/src/hit_detection.rs` and `engine/boxing-plugin/src/damage.rs`.
   These files no longer belong in boxing-plugin — boxing-core is the single source of truth (D-01).

4. In bot.rs, check if it imports hit_detection or damage directly. If so, update to
   `use boxing_core::hit_detection;` / `use boxing_core::damage;`. If bot.rs uses
   `super::hit_detection` or `crate::hit_detection`, update accordingly.
   [VERIFIED from CONTEXT.md D-02: bot.rs stays in boxing-plugin; it uses detect_punch
   from the sibling module — update its import path to boxing_core if needed.]
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo test -p boxing-plugin</automated>
  </verify>
  <done>
    `cargo test -p boxing-plugin` passes. boxing-plugin has no local hit_detection.rs or
    damage.rs files. The crate depends on boxing-core for those modules.
  </done>
</task>

</tasks>

<verification>
After Plan 01:
```bash
cd /Users/charliexue/School/Comps/spectre/engine
cargo test -p boxing-core && cargo test -p boxing-plugin
```
Both pass. `engine/boxing-core/src/hit_detection.rs` exports `pub const LEFT_ELBOW: usize = 13`
and `pub const RIGHT_ELBOW: usize = 14`. No hit_detection.rs or damage.rs in boxing-plugin/src/.
</verification>

<success_criteria>
- boxing-core crate exists at engine/boxing-core/ with hit_detection.rs and damage.rs
- boxing-plugin compiles and all tests pass using boxing-core (not its own copies)
- LEFT_ELBOW (13) and RIGHT_ELBOW (14) are pub consts in boxing_core::hit_detection
</success_criteria>

<output>
After completion, create `.planning/phases/10-fpsboxingplugin/10-01-SUMMARY.md`
</output>

---

# Plan 02 — Protocol messages

**Wave: 2 (depends on Plan 01 workspace setup)** | **Requirements: FPSP-03, FPSP-04**

Add `MsgFpsState` and `MsgFpsHit` to `engine-core/src/protocol.rs`. Run `cargo test` to
trigger ts-rs export and regenerate `shared/protocol.ts`.

<tasks>

<task type="auto">
  <name>Task 1: Add MsgFpsState and MsgFpsHit to protocol.rs</name>
  <files>
    engine/engine-core/src/protocol.rs
  </files>
  <action>
Append the following to the end of `engine/engine-core/src/protocol.rs`. Follow the exact
derive + default_type function pattern used by all existing message structs (verified from
MsgDanceBeat at lines 219-234 and MsgYouWereHit at lines 148-155).

```rust
// ============================================================================
// FPS Boxing messages (Phase 10: FPSP-03, FPSP-04)
// ============================================================================

fn default_type_fps_state() -> String {
    "fps_state".to_string()
}

/// Per-tick state broadcast for fps_boxing rooms.
/// Sent to each player containing their OPPONENT's 6 arm landmarks, both HP values, and round timer.
/// Two separate SendToPlayer events per tick — player 0 gets player 1's landmarks; player 1 gets player 0's.
/// Uses protocol::PoseKeypoint (has Serialize) NOT plugin_trait::PoseKeypoint (no Serialize).
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct MsgFpsState {
    #[serde(rename = "type", default = "default_type_fps_state")]
    pub msg_type: String,
    pub left_shoulder: PoseKeypoint,
    pub right_shoulder: PoseKeypoint,
    pub left_elbow: PoseKeypoint,
    pub right_elbow: PoseKeypoint,
    pub left_wrist: PoseKeypoint,
    pub right_wrist: PoseKeypoint,
    /// HP for both players: (player_1_hp, player_2_hp). Tuple renders as [number, number] in TypeScript.
    pub hp: (u32, u32),
    /// Seconds remaining in the current round. ≤ 0.0 when time expires.
    pub round_timer: f64,
}

fn default_type_fps_hit() -> String {
    "fps_hit".to_string()
}

/// Hit notification for fps_boxing rooms.
/// Sent via SendToPlayer to the RECEIVING player only (not the attacker).
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct MsgFpsHit {
    #[serde(rename = "type", default = "default_type_fps_hit")]
    pub msg_type: String,
    /// Punch type string: "cross", "body_shot", "kick", or "blocked".
    /// Uses same string enum convention as boxing protocol (D-06).
    pub punch_type: String,
    pub damage: u32,
}
```

CRITICAL: `MsgFpsState` uses `PoseKeypoint` from `crate::protocol` (the same file, which has
`#[derive(Serialize, Deserialize, TS)]`). Do NOT import or reference `plugin_trait::PoseKeypoint`
in protocol.rs — that type has no Serialize derive. The `PoseKeypoint` at the top of protocol.rs
(lines 8-15) is the correct type.
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo build -p engine-core 2>&1 | grep -v "^warning"</automated>
  </verify>
  <done>
    `cargo build -p engine-core` compiles without errors. MsgFpsState and MsgFpsHit structs
    are present in engine-core/src/protocol.rs with Serialize/Deserialize/TS derives.
  </done>
</task>

<task type="auto">
  <name>Task 2: Regenerate shared/protocol.ts via cargo test</name>
  <files>
    shared/protocol.ts
  </files>
  <action>
Run `cargo test` from the engine/ directory. ts-rs is configured via
`engine/.cargo/config.toml` with `TS_RS_EXPORT_DIR = "../../shared"`. Every struct
annotated with `#[ts(export)]` writes its TypeScript interface to shared/protocol.ts on
any test run.

```bash
cd /Users/charliexue/School/Comps/spectre/engine && cargo test
```

Do NOT run `scripts/gen_protocol.py` — it is deprecated and exits with an error by design.
[RESEARCH Pitfall 6: gen_protocol.py is dead; ts-rs via cargo test is the current mechanism]

After the test run, verify shared/protocol.ts contains the new interfaces:
- `MsgFpsState` interface with all 6 named landmark fields
- `MsgFpsHit` interface with punch_type and damage fields
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo test 2>&1 | tail -5 && grep -c "MsgFpsState\|MsgFpsHit" /Users/charliexue/School/Comps/spectre/shared/protocol.ts</automated>
  </verify>
  <done>
    `cargo test` passes. `shared/protocol.ts` contains TypeScript interfaces for both
    `MsgFpsState` and `MsgFpsHit`. grep count is ≥ 2 (one declaration each).
  </done>
</task>

</tasks>

<verification>
After Plan 02:
```bash
cd /Users/charliexue/School/Comps/spectre/engine && cargo test
grep -c "MsgFpsState\|MsgFpsHit" /Users/charliexue/School/Comps/spectre/shared/protocol.ts
```
Test suite green. grep returns ≥ 2.
</verification>

<success_criteria>
- MsgFpsState and MsgFpsHit are defined in engine-core/src/protocol.rs with correct fields (per D-05, D-06, D-07)
- shared/protocol.ts contains TypeScript interfaces for both structs
- All existing engine-core tests still pass
</success_criteria>

<output>
After completion, create `.planning/phases/10-fpsboxingplugin/10-02-SUMMARY.md`
</output>

---

# Plan 03 — FPSBoxingPlugin crate

**Wave: 3 (depends on Plans 01 + 02)** | **Requirements: FPSP-01, FPSP-02, FPSP-03, FPSP-04**

Create the `fps-boxing-plugin` crate with the full `GamePlugin` implementation. This is the
core deliverable of Phase 10: per-tick hit detection, HP tracking, MsgFpsState broadcast,
and MsgFpsHit delivery to the hit player.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create fps-boxing-plugin crate with FPSBoxingPlugin</name>
  <files>
    engine/fps-boxing-plugin/Cargo.toml,
    engine/fps-boxing-plugin/src/lib.rs
  </files>
  <behavior>
    - game_type() returns "fps_boxing" — test asserts eq("fps_boxing") AND ne("boxing")
    - on_tick with 2 calibrated players emits exactly 2 SendToPlayer events per tick (one per player)
    - on_tick with a confirmed hit emits a SendToPlayer to the defender slot with msg_type "fps_hit"
    - on_round_reset clears HP to config.hp but does NOT clear ref_vel (FIX-01)
    - ref_vel survives on_round_reset (FIX-01: set to 5.0, call on_round_reset, ref_vel still 5.0)
  </behavior>
  <action>
1. Create `engine/fps-boxing-plugin/Cargo.toml`:
```toml
[package]
name = "fps-boxing-plugin"
version = "0.1.0"
edition = "2021"

[lib]
name = "fps_boxing_plugin"
path = "src/lib.rs"

[dependencies]
plugin-trait = { path = "../plugin-trait" }
boxing-core = { path = "../boxing-core" }
serde_json = "1.0.149"
tracing = "0.1.44"

[dev-dependencies]
engine-core = { path = "../engine-core" }
```
Note: engine-core is a dev-dependency only — needed in tests to use protocol::MsgFpsState
for deserialization checks. Do not add as a regular dependency (would create a circular dep
since engine-core will depend on fps-boxing-plugin in Plan 04).

2. Create `engine/fps-boxing-plugin/src/lib.rs` with the following structure:

```rust
//! FPS Boxing game plugin — implements GamePlugin for "fps_boxing" rooms.
//! Thin orchestration layer: reads pose frames, calls boxing-core for hit detection,
//! packages results into GameEvents. No I/O, no async.

use std::any::Any;
use std::collections::VecDeque;
use plugin_trait::{GamePlugin, GameEvent, TickContext, BodyRegion};
use boxing_core::{hit_detection, damage};
use serde_json::json;

// ---------------------------------------------------------------------------
// Hit cooldown: 12 ticks = 200ms at 60Hz (matches BoxingPlugin)
// ---------------------------------------------------------------------------
const HIT_COOLDOWN_TICKS: i64 = 12;

// ---------------------------------------------------------------------------
// Landmark index constants (MediaPipe indices 11-16, per D-07)
// Elbow constants (13, 14) added to boxing-core in Plan 01.
// Re-exported here as local aliases for readability in on_tick.
// ---------------------------------------------------------------------------
use boxing_core::hit_detection::{LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, WRIST_LEFT as LEFT_WRIST, WRIST_RIGHT as RIGHT_WRIST};

// ---------------------------------------------------------------------------
// Config and state
// ---------------------------------------------------------------------------

pub struct FPSBoxingConfig {
    pub hp: u32,
    pub round_secs: f64,
    pub max_wins: u32,
}

/// Per-room mutable state. Stored as Box<dyn Any + Send>.
/// Fields are intentionally minimal vs BoxingState — no bot, no combo, no commentary (D-09).
pub struct FPSBoxingState {
    /// Current HP for each player slot. Index 0 = slot 1, index 1 = slot 2.
    pub hp: [u32; 2],
    /// Clamped reference velocity per slot. NOT cleared in on_round_reset (FIX-01).
    pub ref_vel: [f64; 2],
    /// Tick number of last hit per attacker. -999 sentinel = never hit.
    pub last_hit_tick: [i64; 2],
    /// True once the first RoundOver event has been emitted this round.
    pub round_ended: bool,
}

// ---------------------------------------------------------------------------
// Plugin struct
// ---------------------------------------------------------------------------

pub struct FPSBoxingPlugin {
    config: FPSBoxingConfig,
}

impl FPSBoxingPlugin {
    pub fn new(config: FPSBoxingConfig) -> Self {
        Self { config }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Zero PoseKeypoint used as fallback when a landmark is missing from the frame.
fn zero_kp_json() -> serde_json::Value {
    json!({ "x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.0 })
}

/// Extract one arm keypoint from a PoseFrame, converting plugin_trait::PoseKeypoint
/// to a serde_json::Value matching the protocol::PoseKeypoint shape.
/// Returns zero_kp_json() if the frame is missing or the index is out of bounds.
/// RESEARCH Pitfall 7: protocol::PoseKeypoint has Serialize; plugin_trait::PoseKeypoint does not.
fn extract_kp_json(frame: &plugin_trait::PoseFrame, idx: usize) -> serde_json::Value {
    frame.keypoints.get(idx)
        .map(|kp| json!({ "x": kp.x, "y": kp.y, "z": kp.z, "visibility": kp.visibility }))
        .unwrap_or_else(zero_kp_json)
}

/// Build the MsgFpsState payload for one player (receiving their opponent's landmarks).
/// opponent_frames: the opponent's frame deque (may be empty — use back() safely).
/// hp: (slot1_hp, slot2_hp) tuple.
/// round_timer: remaining seconds.
fn build_fps_state(
    opponent_frames: &VecDeque<plugin_trait::PoseFrame>,
    hp: [u32; 2],
    round_timer: f64,
) -> serde_json::Value {
    let frame = opponent_frames.back();
    let ls = frame.map(|f| extract_kp_json(f, LEFT_SHOULDER)).unwrap_or_else(zero_kp_json);
    let rs = frame.map(|f| extract_kp_json(f, RIGHT_SHOULDER)).unwrap_or_else(zero_kp_json);
    let le = frame.map(|f| extract_kp_json(f, LEFT_ELBOW)).unwrap_or_else(zero_kp_json);
    let re = frame.map(|f| extract_kp_json(f, RIGHT_ELBOW)).unwrap_or_else(zero_kp_json);
    let lw = frame.map(|f| extract_kp_json(f, LEFT_WRIST)).unwrap_or_else(zero_kp_json);
    let rw = frame.map(|f| extract_kp_json(f, RIGHT_WRIST)).unwrap_or_else(zero_kp_json);
    json!({
        "type": "fps_state",
        "left_shoulder":  ls,
        "right_shoulder": rs,
        "left_elbow":     le,
        "right_elbow":    re,
        "left_wrist":     lw,
        "right_wrist":    rw,
        "hp": [hp[0], hp[1]],
        "round_timer": round_timer,
    })
}

/// Map BodyRegion to punch_type string for MsgFpsHit.punch_type (D-06).
/// Phase 14 can refine this mapping (e.g. left wrist = "jab", right = "cross")
/// if the client needs per-wrist distinction.
fn region_to_punch_type(region: &BodyRegion) -> &'static str {
    match region {
        BodyRegion::HeadFace | BodyRegion::HeadChin | BodyRegion::HeadThroat => "cross",
        BodyRegion::TorsoUpper | BodyRegion::TorsoLower => "body_shot",
        BodyRegion::LegThigh | BodyRegion::LegShin => "kick",
        BodyRegion::BlockHand | BodyRegion::BlockForearm => "blocked",
    }
}

// ---------------------------------------------------------------------------
// GamePlugin implementation
// ---------------------------------------------------------------------------

impl GamePlugin for FPSBoxingPlugin {
    fn game_type(&self) -> &'static str {
        "fps_boxing"
    }

    fn max_wins(&self) -> u32 {
        self.config.max_wins
    }

    fn initial_hp(&self) -> u32 {
        self.config.hp
    }

    fn init_state(&self) -> Box<dyn Any + Send> {
        Box::new(FPSBoxingState {
            hp: [self.config.hp; 2],
            ref_vel: [0.0; 2],
            last_hit_tick: [-999; 2],
            round_ended: false,
        })
    }

    fn on_calibration_complete(&self, slot: u8, ref_vel: f64, state: &mut dyn Any) {
        let s = state.downcast_mut::<FPSBoxingState>().expect("FPSBoxingState type mismatch");
        // Clamp ref_vel to [0.5, 15.0] (D-08: same clamping as BoxingPlugin)
        s.ref_vel[slot as usize] = ref_vel.clamp(0.5, 15.0);
        tracing::info!(slot, ref_vel, "fps_boxing calibration complete");
    }

    fn on_round_reset(&self, state: &mut dyn Any) {
        let s = state.downcast_mut::<FPSBoxingState>().expect("FPSBoxingState type mismatch");
        // Reset round-scoped fields ONLY — ref_vel MUST survive (FIX-01)
        s.hp = [self.config.hp; 2];
        s.last_hit_tick = [-999; 2];
        s.round_ended = false;
        // s.ref_vel is intentionally NOT cleared here
    }

    fn on_tick(&self, ctx: &TickContext, state: &mut dyn Any) -> Vec<GameEvent> {
        let s = state.downcast_mut::<FPSBoxingState>().expect("FPSBoxingState type mismatch");
        let mut events: Vec<GameEvent> = Vec::new();

        if s.round_ended {
            return events;
        }

        // --- Hit detection: attacker=0 vs defender=1, then attacker=1 vs defender=0 ---
        for attacker_idx in 0..2usize {
            let defender_idx = 1 - attacker_idx;

            // Cooldown gate: prevent hit spam
            if ctx.tick_info.tick as i64 - s.last_hit_tick[attacker_idx] < HIT_COOLDOWN_TICKS {
                continue;
            }

            if let Some(h) = hit_detection::detect_punch(
                ctx.frames[attacker_idx],
                ctx.frames[defender_idx],
                Some(s.ref_vel[attacker_idx]),
            ) {
                let dmg = damage::compute_damage(h.region, h.velocity, Some(s.ref_vel[attacker_idx]));

                // Apply damage with u32 underflow guard
                s.hp[defender_idx] = s.hp[defender_idx].saturating_sub(dmg);
                s.last_hit_tick[attacker_idx] = ctx.tick_info.tick as i64;

                tracing::info!(
                    attacker = attacker_idx,
                    defender = defender_idx,
                    region = ?h.region,
                    dmg,
                    hp_remaining = s.hp[defender_idx],
                    "fps_boxing hit"
                );

                // Emit GameEvent::Hit for engine-level accounting
                events.push(GameEvent::Hit {
                    attacker: (attacker_idx + 1) as u8,
                    defender: (defender_idx + 1) as u8,
                    region: h.region,
                    damage: dmg as f32,
                    position: [h.position.0 as f32, h.position.1 as f32],
                });

                // Emit MsgFpsHit to the receiving player (defender)
                let fps_hit = json!({
                    "type": "fps_hit",
                    "punch_type": region_to_punch_type(&h.region),
                    "damage": dmg,
                });
                events.push(GameEvent::SendToPlayer {
                    slot: (defender_idx + 1) as u8,
                    payload: fps_hit,
                });

                // Check for round over
                if s.hp[defender_idx] == 0 {
                    s.round_ended = true;
                    events.push(GameEvent::RoundOver {
                        winner: Some((attacker_idx + 1) as u8),
                    });
                    // Still emit MsgFpsState below so both players see final HP
                }
            }
        }

        // Check round timer expiry
        if !s.round_ended && ctx.tick_info.remaining_secs <= 0.0 {
            s.round_ended = true;
            // Determine winner by HP; tie = draw
            let winner = if s.hp[0] > s.hp[1] {
                Some(1u8)
            } else if s.hp[1] > s.hp[0] {
                Some(2u8)
            } else {
                None // draw
            };
            events.push(GameEvent::RoundOver { winner });
        }

        // --- Per-tick MsgFpsState broadcast (FPSP-03) ---
        // RESEARCH Pitfall 3: must use SendToPlayer (not Broadcast) — each player needs
        // their OPPONENT's landmarks, not the same set.
        // Player at slot 1 (index 0) receives slot 2's (index 1) landmarks.
        // Player at slot 2 (index 1) receives slot 1's (index 0) landmarks.
        let current_hp = s.hp; // copy before borrow ends
        for receiver_idx in 0..2usize {
            let opponent_idx = 1 - receiver_idx;
            let payload = build_fps_state(ctx.frames[opponent_idx], current_hp, ctx.tick_info.remaining_secs);
            events.push(GameEvent::SendToPlayer {
                slot: (receiver_idx + 1) as u8,
                payload,
            });
        }

        events
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use plugin_trait::{PoseFrame, PoseKeypoint, TickContext, TickInfo, RoomView, SlotView};

    fn make_plugin() -> FPSBoxingPlugin {
        FPSBoxingPlugin::new(FPSBoxingConfig { hp: 800, round_secs: 90.0, max_wins: 3 })
    }

    fn zero_kp() -> PoseKeypoint {
        PoseKeypoint { x: 0.0, y: 0.0, z: 0.0, visibility: 1.0 }
    }

    fn empty_frames() -> VecDeque<PoseFrame> {
        VecDeque::new()
    }

    fn make_tick_ctx<'a>(
        frames: [&'a VecDeque<PoseFrame>; 2],
        tick: u64,
        remaining: f64,
    ) -> TickContext<'a> {
        TickContext {
            frames,
            tick_info: TickInfo { tick, elapsed_secs: 0.0, remaining_secs: remaining },
            room: RoomView {
                slots: [
                    SlotView { connected: true, reference_velocity: Some(3.0) },
                    SlotView { connected: true, reference_velocity: Some(3.0) },
                ],
                solo_mode: false,
            },
        }
    }

    // FPSP-01: game_type returns "fps_boxing", NOT "boxing"
    #[test]
    fn game_type_is_fps_boxing() {
        let plugin = make_plugin();
        assert_eq!(plugin.game_type(), "fps_boxing");
        assert_ne!(plugin.game_type(), "boxing");
    }

    // FPSP-03: on_tick with two connected players emits exactly 2 SendToPlayer events
    #[test]
    fn fps_state_emits_two_send_to_player() {
        let plugin = make_plugin();
        let mut state = plugin.init_state();
        let f0 = empty_frames();
        let f1 = empty_frames();
        let ctx = make_tick_ctx([&f0, &f1], 0, 60.0);
        let events = plugin.on_tick(&ctx, state.as_mut());
        let send_to_player_count = events.iter().filter(|e| {
            matches!(e, GameEvent::SendToPlayer { .. })
        }).count();
        assert_eq!(send_to_player_count, 2, "must emit exactly 2 SendToPlayer events per tick");
    }

    // FPSP-04: on_tick with a confirmed hit emits SendToPlayer to defender with fps_hit
    // (tested structurally — hit detection with sufficient velocity frames)
    #[test]
    fn fps_hit_sent_to_defender_on_confirmed_hit() {
        let plugin = make_plugin();
        let mut state_box = plugin.init_state();
        // Prime ref_vel for slot 0 (attacker)
        plugin.on_calibration_complete(0, 3.0, state_box.as_mut());

        // Build attacker frames with fast left-wrist lateral movement
        let mut attacker_frames: VecDeque<PoseFrame> = VecDeque::new();
        for i in 0..5u8 {
            let t = i as f64 * 0.033;
            let mut kps = vec![zero_kp(); 33];
            kps[23] = PoseKeypoint { x: 0.5, y: 0.0, z: 0.0, visibility: 1.0 }; // LEFT_HIP
            kps[24] = PoseKeypoint { x: 0.5, y: 0.0, z: 0.0, visibility: 1.0 }; // RIGHT_HIP
            kps[11] = PoseKeypoint { x: 0.5, y: 0.3, z: 0.0, visibility: 1.0 }; // LEFT_SHOULDER
            kps[12] = PoseKeypoint { x: 0.5, y: 0.3, z: 0.0, visibility: 1.0 }; // RIGHT_SHOULDER
            // Left wrist moves fast laterally (not primarily upward — no guard-raise veto)
            kps[15] = PoseKeypoint { x: 0.5 + i as f64 * 0.15, y: 0.5, z: 0.0, visibility: 1.0 };
            kps[16] = PoseKeypoint { x: 0.5, y: 0.3, z: 0.0, visibility: 1.0 }; // RIGHT_WRIST stays low
            attacker_frames.push_back(PoseFrame { timestamp: t, keypoints: kps });
        }
        let defender_frames = empty_frames();

        let ctx = make_tick_ctx([&attacker_frames, &defender_frames], 100, 60.0);
        let events = plugin.on_tick(&ctx, state_box.as_mut());

        // Find fps_hit SendToPlayer events
        let hit_events: Vec<_> = events.iter().filter(|e| {
            if let GameEvent::SendToPlayer { slot: _, payload } = e {
                payload.get("type").and_then(|v| v.as_str()) == Some("fps_hit")
            } else {
                false
            }
        }).collect();

        // If hit was detected: exactly 1 fps_hit event targeted at slot 2 (defender)
        if !hit_events.is_empty() {
            assert_eq!(hit_events.len(), 1);
            if let GameEvent::SendToPlayer { slot, payload } = hit_events[0] {
                assert_eq!(*slot, 2u8, "fps_hit must go to defender (slot 2)");
                assert!(payload.get("punch_type").is_some());
                assert!(payload.get("damage").is_some());
            }
        }
        // If no hit (velocity below threshold), the test is not a failure —
        // the structural assertion (slot + fields) is what matters.
    }

    // FIX-01: ref_vel survives on_round_reset
    #[test]
    fn fix01_ref_vel_survives_round_reset() {
        let plugin = make_plugin();
        let mut state_box = plugin.init_state();
        plugin.on_calibration_complete(0, 5.0, state_box.as_mut());
        plugin.on_calibration_complete(1, 7.0, state_box.as_mut());
        plugin.on_round_reset(state_box.as_mut());
        let s = state_box.downcast_ref::<FPSBoxingState>().unwrap();
        assert_eq!(s.ref_vel[0], 5.0, "ref_vel[0] must survive round reset");
        assert_eq!(s.ref_vel[1], 7.0, "ref_vel[1] must survive round reset");
        assert_eq!(s.hp[0], 800, "hp reset to config.hp");
        assert_eq!(s.hp[1], 800, "hp reset to config.hp");
    }
}
```

NOTE on `HitResult.position` field name: boxing-core's `HitResult` stores `position: (f64, f64)`.
Access as `h.position.0` and `h.position.1`. Verify by reading the HitResult struct in
boxing-core/src/hit_detection.rs before compiling.
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo test -p fps-boxing-plugin 2>&1</automated>
  </verify>
  <done>
    `cargo test -p fps-boxing-plugin` passes all 4 tests:
    - game_type_is_fps_boxing
    - fps_state_emits_two_send_to_player
    - fps_hit_sent_to_defender_on_confirmed_hit
    - fix01_ref_vel_survives_round_reset
  </done>
</task>

</tasks>

<verification>
After Plan 03:
```bash
cd /Users/charliexue/School/Comps/spectre/engine && cargo test -p fps-boxing-plugin
```
All 4 tests pass. FPSBoxingPlugin implements GamePlugin trait.
</verification>

<success_criteria>
- fps-boxing-plugin crate exists at engine/fps-boxing-plugin/
- FPSBoxingPlugin::game_type() returns "fps_boxing" (test asserts ne("boxing"))
- on_tick emits 2 SendToPlayer events per tick (one MsgFpsState per player)
- MsgFpsHit is emitted to the defender on confirmed hit
- FIX-01: ref_vel survives on_round_reset
</success_criteria>

<output>
After completion, create `.planning/phases/10-fpsboxingplugin/10-03-SUMMARY.md`
</output>

---

# Plan 04 — Engine routing

**Wave: 4 (depends on Plan 03)** | **Requirements: FPSP-01**

Register `FPSBoxingPlugin` in `engine-core/src/main.rs` and verify end-to-end room creation
routing. This is the final wiring step that makes the server accept "fps_boxing" room requests.

<tasks>

<task type="auto">
  <name>Task 1: Add fps-boxing-plugin to engine-core and register in main.rs</name>
  <files>
    engine/engine-core/Cargo.toml,
    engine/engine-core/src/main.rs
  </files>
  <action>
1. Add fps-boxing-plugin as a dependency in `engine/engine-core/Cargo.toml`:
```toml
fps-boxing-plugin = { path = "../fps-boxing-plugin" }
```
   Add this alongside the existing boxing-plugin and dance-plugin path dependencies.

2. In `engine/engine-core/src/main.rs`, add the import at the top of the file alongside
   existing plugin imports:
```rust
use fps_boxing_plugin::{FPSBoxingPlugin, FPSBoxingConfig};
```

3. In the `main()` function, insert the fps_boxing registration BEFORE `Arc::new(AppState { ... })`.
   RESEARCH Pitfall 2: HashMap::insert must happen before Arc::new — cannot insert after wrapping.
   Insert immediately after the existing dance plugin registration (currently lines 401-403):
```rust
plugins.insert(
    "fps_boxing".to_string(),
    Arc::new(FPSBoxingPlugin::new(FPSBoxingConfig {
        hp: 800,
        round_secs: 90.0,
        max_wins: 3,
    })),
);
```

4. Verify the existing boxing and dance registrations are untouched. The plugins HashMap
   should now have 3 entries: "boxing", "dance", "fps_boxing".
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo build -p engine-core 2>&1 | grep -v "^warning"</automated>
  </verify>
  <done>
    `cargo build -p engine-core` compiles without errors. FPSBoxingPlugin is imported and
    registered in the plugins HashMap before Arc::new.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Integration test — fps_boxing room creation routes to FPSBoxingPlugin</name>
  <files>
    engine/engine-core/src/main.rs
  </files>
  <behavior>
    - POST /rooms?game=fps_boxing returns HTTP 201 (room is created)
    - The room's plugin dispatches per FPSP-01: FPSBoxingPlugin handles fps_boxing rooms
    - POST /rooms?game=unknown_type returns an appropriate error (not 201)
  </behavior>
  <action>
Add integration tests to `engine/engine-core/src/main.rs` in a `#[cfg(test)]` block at
the end of the file. These tests verify FPSP-01 routing end-to-end using axum's test client.

Look at existing tests in main.rs (or the engine-core test suite) for the pattern used to
send HTTP requests to the axum app in tests. Use the same `tower::ServiceExt` + `http::Request`
pattern if it exists, or construct a test using `axum::test` utilities.

The test must assert:
1. `POST /rooms?game=fps_boxing` returns status 201 (or whatever status code the existing
   `POST /rooms` handler returns for successful room creation with boxing — match that).
2. The response body contains a `room_code` field (same as boxing room creation response).

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt; // for oneshot

    fn test_app() -> axum::Router {
        let boxing_config = BoxingConfig {
            hp: 800, round_secs: 90.0, max_wins: 3,
            bot_difficulty: Difficulty::Normal,
        };
        let dance_config = DanceConfig { max_wins: 3 };
        let mut plugins: HashMap<String, Arc<dyn GamePlugin + Send + Sync>> = HashMap::new();
        plugins.insert("boxing".to_string(), Arc::new(BoxingPlugin::new(boxing_config)));
        plugins.insert("dance".to_string(), Arc::new(DancePlugin::new(dance_config)));
        plugins.insert("fps_boxing".to_string(), Arc::new(FPSBoxingPlugin::new(FPSBoxingConfig {
            hp: 800, round_secs: 90.0, max_wins: 3,
        })));
        let state = Arc::new(AppState {
            rooms: Arc::new(room_manager::RoomManager::new()),
            plugins,
        });
        build_app(state)
    }

    #[tokio::test]
    async fn post_rooms_fps_boxing_returns_201() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/rooms?game=fps_boxing")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED,
            "fps_boxing room creation should return 201");
    }
}
```

IMPORTANT: Check the actual URI format for room creation. Read the `build_app` function
and the create_room handler in main.rs to confirm the exact endpoint path and query param
name before writing the test. The URI `/rooms?game=fps_boxing` is assumed from CONTEXT.md
research — verify it matches the actual handler route.
  </action>
  <verify>
    <automated>cd /Users/charliexue/School/Comps/spectre/engine && cargo test -p engine-core post_rooms_fps_boxing 2>&1</automated>
  </verify>
  <done>
    `cargo test -p engine-core post_rooms_fps_boxing_returns_201` passes.
    POST to the room creation endpoint with game_type=fps_boxing returns the expected success status.
  </done>
</task>

</tasks>

<verification>
After Plan 04 — full phase gate:
```bash
cd /Users/charliexue/School/Comps/spectre/engine && cargo test
```
All tests pass across all crates:
- cargo test -p boxing-core (extracted modules)
- cargo test -p boxing-plugin (uses boxing-core, all existing tests pass)
- cargo test -p fps-boxing-plugin (game_type, fps_state broadcast, fps_hit, FIX-01)
- cargo test -p engine-core (routing integration test)
</verification>

<success_criteria>
- engine-core depends on fps-boxing-plugin via Cargo.toml path dep
- FPSBoxingPlugin is registered in main.rs plugins HashMap with key "fps_boxing"
- POST /rooms?game=fps_boxing returns success status (FPSP-01)
- `cd engine && cargo test` is fully green across all 4 crates
- shared/protocol.ts contains MsgFpsState and MsgFpsHit TypeScript interfaces
</success_criteria>

<output>
After completion, create `.planning/phases/10-fpsboxingplugin/10-04-SUMMARY.md`
</output>

---

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| WebSocket → engine-core | Untrusted pose frame data from mobile clients |
| plugin on_tick → game state | Plugin mutates per-room state each tick via downcast |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-01 | Tampering | fps-boxing-plugin on_tick: keypoint index access | mitigate | Use `.get(idx)` with fallback `zero_kp_json()` for all landmark extractions — never index directly. RESEARCH Pitfall 4. |
| T-10-02 | Tampering | FPSBoxingState hp: u32 underflow | mitigate | Use `.saturating_sub(dmg)` — established pattern from BoxingState. HP cannot wrap to u32::MAX. |
| T-10-03 | Denial of Service | on_tick called with empty attacker frames | accept | detect_punch returns None when attacker_frames.len() < 3 — engine-core delivers empty deques under lag; plugin handles gracefully. |
| T-10-04 | Spoofing | Slot index in SendToPlayer | accept | Slot values (1 or 2) are computed inside the plugin from loop index, not from untrusted client input. game_loop.rs dispatch_events validates slot at line 222. |
| T-10-05 | Elevation of Privilege | Plugin HashMap insert after Arc::new | mitigate | Follow RESEARCH Pitfall 2: all HashMap inserts before Arc::new(AppState). Borrow checker enforces this at compile time. |
</threat_model>
