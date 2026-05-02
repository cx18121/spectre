---
phase: 02-plugin-trait-boxing
verified: 2026-05-02T23:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Solo/bot mode starts when only one player joins; the bot operates at three selectable difficulty tiers"
  gaps_remaining: []
  regressions: []
---

# Phase 2: Plugin Trait + Boxing Verification Report

**Phase Goal:** The GamePlugin trait is the only interface a game developer needs; the boxing game is a fully working first plugin that proves the trait surface is correct; the calibration-persist bug is fixed
**Verified:** 2026-05-02T23:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap-closure plan 02-06 (CR-01: solo calibration_start)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A developer can implement a new game by writing a single Rust struct that implements GamePlugin — no engine files need to be touched | VERIFIED | `pub trait GamePlugin: Send + Sync` in `engine/plugin-trait/src/lib.rs:132`; `BoxingPlugin` implements it in `boxing-plugin/src/lib.rs:76`; trait surface is stable and self-contained |
| 2 | Two players can complete a full boxing match: calibration, warmup, live rounds with hit detection and guard blocking, KO or time-limit decision, and rematch without recalibration | VERIFIED | Full pipeline wired: CalibrationDone → ready_to_start → game_tick → plugin.on_tick → dispatch_events → handle_round_over → on_round_reset. 91 workspace tests pass. |
| 3 | Calibration established in the first round persists across rematches — players are never forced to recalibrate within the same room session | VERIFIED | `on_round_reset` clears only `hp`, `last_hit_tick`, `combo`, `low_hp_announced`, `first_blood_pending` — never `ref_vel`. `fix01_ref_vel_survives_round_reset` test passes. |
| 4 | Solo/bot mode starts when only one player joins; the bot operates at three selectable difficulty tiers | VERIFIED | CR-01 fixed by plan 02-06: `else if solo_mode && slot == 0 && state.round_start_time.is_none()` at `room.rs:237` sends `calibration_start` to slot 0 alone. Game loop gate fixed by 02-05: `calibrated_ok` allows single-player start. `bot::tick_bot` fires at Easy=(4.5-7.0s), Normal=(2.5-4.5s), Hard=(1.0-2.5s). Four BOX-10 unit tests pass. |
| 5 | Box\<dyn GamePlugin + Send + Sync\> compiles and the trait is confirmed object-safe; all plugin methods are synchronous with no async-trait allocations in the hot path | VERIFIED | `object_safety_box_dyn_game_plugin` test compiles and passes. Zero `async fn` in trait code lines (2 grep matches are comment lines only). |

**Score:** 5/5 truths verified

### Re-verification: Gap Closure Assessment

**Previous gap (previous 02-VERIFICATION.md, status: gaps_found):**
CR-01 — `calibration_start` was gated on `state.players[0].connected && state.players[1].connected` in the `PlayerConnect` handler; solo player never received it; mobile client never left lobby phase; entire solo flow was blocked.

**Gap closure evidence (plan 02-06, commits 325adcb + fd73ec0):**

| Fix | Location | Evidence |
|-----|----------|---------|
| Solo `else if` branch sends `calibration_start` to slot 0 alone | `room.rs:227-244` | `let solo_mode = !state.players[1].connected;` ... `else if solo_mode && slot == 0 && state.round_start_time.is_none()` |
| Three unit tests verify the PlayerConnect solo path | `room.rs:313-425` | `box10_solo_player_connect_sends_calibration_start: ok`, `two_player_connect_sends_calibration_start_to_both: ok`, `solo_reconnect_after_match_started_does_not_resend_calibration_start: ok` |
| `send_to_slot(state, 1, ...)` still appears exactly once (two-player branch only) | `room.rs:234` | Solo branch sends to slot 0 only — confirmed by grep |
| `grep -c "solo_mode" room.rs` = 6 | `room.rs` | PlayerConnect assignment + else-if condition + CalibrationDone assignment + if-branch + log line + test usage |
| `cargo test --workspace` exits 0 — 91 tests | All crates | 23 boxing-plugin + 20 engine-core lib + 30 engine-core bin + 18 protocol roundtrip |

**Full solo flow is now unblocked:**
`calibration_start (02-06) → mobile leaves lobby → CalibrationDone sent → ready_to_start fires (02-05) → round_start_time set → match_in_progress true (02-05) → game_tick runs → plugin.on_tick with RoomView.slots[1].connected=false → bot::tick_bot fires at difficulty-tuned interval`

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `engine/plugin-trait/src/lib.rs` | GamePlugin trait, TickContext, GameEvent (5 vars), BodyRegion (9 vars) | VERIFIED | 156 lines; all types exported |
| `engine/plugin-trait/Cargo.toml` | Crate manifest | VERIFIED | `name = "plugin-trait"` present |
| `engine/boxing-plugin/src/lib.rs` | BoxingPlugin, BoxingState, GamePlugin impl, FIX-01 test | VERIFIED | 439 lines; full impl present |
| `engine/boxing-plugin/src/hit_detection.rs` | detect_punch, detect_kick, apply_guard, HitResult | VERIFIED | 355 lines; all functions present |
| `engine/boxing-plugin/src/damage.rs` | compute_damage, 9-region base_damage | VERIFIED | 64 lines; all 9 BodyRegion match arms |
| `engine/boxing-plugin/src/bot.rs` | Difficulty enum, BOT_KPS[33], tick_bot, 3 difficulty tiers | VERIFIED | 118 lines; BOT_KPS has 33 entries; Easy/Normal/Hard intervals correct |
| `engine/engine-core/src/game_loop.rs` | normalize_to_y_up, plugin.on_tick, dispatch_events, handle_round_over, solo_mode gate | VERIFIED | 420 lines; all functions present |
| `engine/engine-core/src/room.rs` | RoomState.plugin_state, lifecycle hooks, solo PlayerConnect path | VERIFIED | 426 lines; all wiring and solo path present |
| `engine/engine-core/src/main.rs` | BoxingPlugin::new construction | VERIFIED | `BoxingPlugin::new(boxing_config)` at line 35 |
| `engine/engine-core/Cargo.toml` | boxing-plugin and plugin-trait deps | VERIFIED | Both path deps present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine-core/src/main.rs` | `boxing-plugin/src/lib.rs` | `BoxingPlugin::new` | WIRED | `main.rs:35`: `Arc::new(BoxingPlugin::new(boxing_config))` |
| `engine-core/src/game_loop.rs` | `plugin-trait/src/lib.rs` | `plugin.on_tick` call | WIRED | `game_loop.rs:137`: `state.plugin.on_tick(&ctx, &mut *state.plugin_state)` |
| `engine-core/src/room.rs` | `plugin-trait/src/lib.rs` | `Arc<dyn GamePlugin + Send + Sync>` field | WIRED | `room.rs:46`: `pub plugin: Arc<dyn GamePlugin + Send + Sync>` |
| `boxing-plugin/src/lib.rs` | `plugin-trait/src/lib.rs` | `impl GamePlugin for BoxingPlugin` | WIRED | `lib.rs:76`: `impl GamePlugin for BoxingPlugin` |
| `boxing-plugin/src/lib.rs` | `boxing-plugin/src/bot.rs` | `bot::tick_bot` | WIRED | `lib.rs:99`: `bot::tick_bot(self.config.bot_difficulty, ...)` in solo branch |
| `boxing-plugin/src/lib.rs` | `boxing-plugin/src/hit_detection.rs` | `hit_detection::detect_punch` | WIRED | `lib.rs:130`: `hit_detection::detect_punch(ctx.frames[attacker_idx], ...)` |
| `room.rs PlayerConnect` | mobile client | `calibration_start` solo path | WIRED | `room.rs:237-244`: `else if solo_mode && slot == 0 && state.round_start_time.is_none()` sends `calibration_start` |
| `game_loop.rs handle_round_over` | `boxing-plugin/src/lib.rs` | `on_round_reset` | WIRED | `game_loop.rs:310`: `state.plugin.on_round_reset(&mut *state.plugin_state)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `game_loop.rs dispatch_events` | `GameEvent::Hit.damage` | `boxing_plugin::on_tick` → `compute_damage` | Yes — computed from real ref_vel and limb velocity | FLOWING |
| `game_loop.rs dispatch_events` | `state.recent_hits` | `HitEvent` accumulated from `GameEvent::Hit` | Yes — populated each tick from real events | FLOWING |
| `game_loop.rs build_game_state_with_latency` | `tick: state.tick` | `state.tick += 1` in live phase | Yes — real tick counter, not hardcoded 0 | FLOWING |
| `room.rs CalibrationDone` | `state.round_start_time` | Set when `ready_to_start` — including solo path | Yes — real Instant::now() | FLOWING |

### Behavioral Spot-Checks

| Behavior | Result | Status |
|----------|--------|--------|
| `cargo test --workspace` — 91 tests total | 91 passed; 0 failed | PASS |
| BOX-10 solo gate: `box10_solo_mode_gate_allows_single_player` | ok | PASS |
| BOX-10 solo calibration_start: `box10_solo_player_connect_sends_calibration_start` | ok | PASS |
| BOX-10 idempotency: `solo_reconnect_after_match_started_does_not_resend_calibration_start` | ok | PASS |
| BOX-10 two-player unaffected: `two_player_connect_sends_calibration_start_to_both` | ok | PASS |
| FIX-01: `fix01_ref_vel_survives_round_reset` | ok | PASS |
| BOX-08 draw: `check_round_over_draw_equal_hp` | ok | PASS |
| PLUG-05 object safety: `object_safety_box_dyn_game_plugin` | ok (compiles) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PLUG-01 | 02-01 | GamePlugin trait with 6 methods | SATISFIED | `plugin-trait/src/lib.rs:132`; init_state, on_tick, on_player_join, on_player_leave, on_calibration_complete, on_round_reset |
| PLUG-02 | 02-01, 02-04 | TickContext with TickInfo, RoomView | SATISFIED | `plugin-trait/src/lib.rs:84,110`; `game_loop.rs:115-134` constructs TickContext each tick |
| PLUG-03 | 02-01 | GameEvent 5 variants | SATISFIED | `plugin-trait/src/lib.rs:59`; Hit, RoundOver, SendToPlayer, Broadcast, CommentaryHint |
| PLUG-04 | 02-01, 02-04 | plugin_state as Box\<dyn Any + Send\> | SATISFIED | `room.rs:48`; engine never inspects; only plugin downcasts |
| PLUG-05 | 02-01 | Object-safe, no async fn | SATISFIED | Zero async fn in trait code; `object_safety_box_dyn_game_plugin` compiles |
| PLUG-06 | 02-04 | Engine normalizes to hip-centred Y-up | SATISFIED | `game_loop.rs:16`: `fn normalize_to_y_up`; called before TickContext at line 110-113 |
| BOX-01 | 02-02 | Punch detection via wrist speed | SATISFIED | `hit_detection.rs:169`: `pub fn detect_punch` with 10-frame peak_speed sliding window |
| BOX-02 | 02-02 | Kick detection via ankle elevation + speed | SATISFIED | `hit_detection.rs:237`: `pub fn detect_kick` with REL_KICK_MID_Y threshold |
| BOX-03 | 02-02 | 9 body regions | SATISFIED | `plugin-trait/src/lib.rs:39`: BodyRegion enum; grep confirms 9 variants |
| BOX-04 | 02-02 | Guard blocking | SATISFIED | `hit_detection.rs:139`: `fn apply_guard` reclassifies head/torso hits to BlockHand/BlockForearm |
| BOX-05 | 02-02 | Velocity-scaled damage | SATISFIED | `damage.rs:24`: `pub fn compute_damage`; t = vel/(2*ref_vel); 5 unit tests pass |
| BOX-06 | 02-03 | HP tracking, KO and time-limit round-over | SATISFIED | `lib.rs:215`: `fn check_round_over`; KO at hp==0, time at remaining_secs<=0.0 |
| BOX-07 | 02-02 | 12-tick hit cooldown | SATISFIED | `lib.rs:19`: `const HIT_COOLDOWN_TICKS: i64 = 12`; enforced at `lib.rs:119` |
| BOX-08 | 02-03 | Draw on equal HP at time expiry | SATISFIED | `lib.rs:224`: `Ordering::Equal => None`; `check_round_over_draw_equal_hp` test passes |
| BOX-09 | 02-03, 02-04 | Multi-round win counter | SATISFIED | `game_loop.rs:272`: `state.wins[(w - 1) as usize] += 1`; match ends at max_wins |
| BOX-10 | 02-03, 02-05, 02-06 | Solo/bot mode with 3 difficulty tiers | SATISFIED | tick_bot present; 3 difficulty tiers (Easy/Normal/Hard); full solo flow unblocked; 4 unit tests pass |
| FIX-01 | 02-03 | Calibration persists through rematch | SATISFIED | `on_round_reset` never touches `ref_vel`; 2 regression tests pass |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `engine-core/src/game_loop.rs` | 105, 139 | "placeholder" in comment | INFO | Comment documents removal of WR-05 placeholder; actual implementation present — not a stub |

No blockers or warnings found.

### Human Verification Required

None. All must-haves are verified programmatically. Phase goal is achieved.

### Gaps Summary

No gaps. All 5 observable truths verified. All 17 Phase 2 requirements satisfied. `cargo test --workspace` exits 0 with 91 tests passing including all BOX-10 solo mode tests and FIX-01 regression tests.

---

_Verified: 2026-05-02T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
