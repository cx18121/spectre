---
phase: 02-plugin-trait-boxing
plan: "03"
subsystem: boxing-plugin
tags: [boxing, game-plugin, bot-mode, fix-01, tdd, rust]
dependency_graph:
  requires:
    - "02-01"  # plugin-trait crate (GamePlugin trait, TickContext, GameEvent)
    - "02-02"  # boxing-plugin hit_detection.rs and damage.rs
  provides:
    - BoxingPlugin (full GamePlugin implementation)
    - BoxingState (per-room mutable game state)
    - BoxingConfig (construction-time configuration)
    - Difficulty enum (bot difficulty tiers)
    - tick_bot (bot hit fabrication)
    - BOT_KPS (static bot pose)
  affects:
    - engine-core (will wire BoxingPlugin in Phase 3+)
tech_stack:
  added:
    - tracing = "0.1.44" (for on_player_join/on_player_leave event logging)
  patterns:
    - TDD RED/GREEN cycle for BoxingPlugin trait implementation
    - Box<dyn Any + Send> downcast pattern for plugin state
    - saturating_sub for safe HP arithmetic
    - f64::clamp for ref_vel bounds enforcement (D-08)
    - BOT_REGIONS array with weighted region distribution
key_files:
  created: []
  modified:
    - engine/boxing-plugin/src/bot.rs
    - engine/boxing-plugin/src/lib.rs
    - engine/boxing-plugin/Cargo.toml
decisions:
  - "FIX-01 enforced: on_round_reset explicitly does NOT clear ref_vel; comment references bug in server/rooms.py line 64"
  - "bot_next_hit_at intentionally not reset on round reset — matches Python behavior (timer continues across rematch)"
  - "VecDeque import guarded with #[cfg(test)] to avoid unused import warning in production builds"
  - "BOT_KPS pub const: present for future engine-core wiring; currently unused but kept for Phase 3 engine integration"
  - "emit_commentary_hint uses hardcoded 800.0 as max_hp — fn has no self, spec value is 800"
metrics:
  duration: "4m40s"
  completed: "2026-05-02"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 02 Plan 03: BoxingPlugin GamePlugin Implementation Summary

**One-liner:** Complete BoxingPlugin implementing GamePlugin via TDD — bot.rs with 33-landmark static pose and difficulty tiers, lib.rs with full on_tick/on_round_reset/on_calibration_complete including FIX-01 regression guard and BOX-08 draw handling.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement bot.rs — static pose, difficulty tiers, tick_bot (BOX-10) | d22e5e7 | engine/boxing-plugin/src/bot.rs |
| 2 (RED) | Add failing tests for BoxingPlugin GamePlugin impl | 9e9f321 | engine/boxing-plugin/src/lib.rs |
| 2 (GREEN) | Implement BoxingPlugin, BoxingState, full GamePlugin impl | 84a4e0d | engine/boxing-plugin/src/lib.rs, engine/boxing-plugin/Cargo.toml |

## Test Results

`cargo test -p boxing-plugin` exits 0. All 23 tests pass:

- **hit_detection tests (6):** detect_punch empty frames, body_scale normal/clamped, is_primarily_upward, guard-raise veto
- **damage tests (5):** compute_damage at ref_vel, zero velocity, double ref_vel, no ref_vel, extreme velocity
- **lib tests (12):** fix01_ref_vel_survives_round_reset, fix01_ref_vel_slot1_also_survives_reset, d08_ref_vel_clamped_below_minimum, d08_ref_vel_clamped_above_maximum, on_round_reset_clears_hp_to_config_value, on_round_reset_clears_cooldowns, check_round_over_ko_player1, check_round_over_ko_player2, check_round_over_draw_equal_hp, check_round_over_decision_by_hp, object_safety_box_dyn_game_plugin, on_tick_time_expired_returns_round_over

## Verification Checks

- `cargo test -p boxing-plugin` exits 0: PASS
- `grep "ref_vel.clamp(0.5, 15.0)" boxing-plugin/src/lib.rs`: PASS
- `grep "fix01_ref_vel_survives_round_reset" boxing-plugin/src/lib.rs`: PASS
- `grep "object_safety_box_dyn_game_plugin" boxing-plugin/src/lib.rs`: PASS
- `grep "check_round_over_draw_equal_hp" boxing-plugin/src/lib.rs`: PASS
- `grep -c "BOT_KPS\[" boxing-plugin/src/bot.rs` returns 0 (BOT_KPS declared as const): PASS
- `grep "pub const BOT_KPS" boxing-plugin/src/bot.rs`: PASS
- FIX-01: `grep -v '^//' lib.rs | grep -c "ref_vel = None"` returns 0: PASS

## Deviations from Plan

None — plan executed exactly as written.

Minor auto-fix: removed top-level `use std::collections::VecDeque` from lib.rs (unused in production code; only used in tests). Guarded with `#[cfg(test)]` to eliminate compiler warning while keeping tests compilable.

## Known Stubs

None — all code is wired and functional. `BOT_KPS` is `pub const` with data but not yet consumed by engine-core. This is by design: Phase 3 (engine wiring) will reference it when constructing synthetic bot frames for the TickContext.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All threat model items from the plan's STRIDE register have been addressed:

- **T-02-10** (ref_vel tampering): `ref_vel.clamp(0.5, 15.0)` in on_calibration_complete — MITIGATED
- **T-02-11** (bot in multiplayer): bot activates only when `slots[1].connected == false` — MITIGATED
- **T-02-12** (FIX-01 regression via on_round_reset): explicit unit test `fix01_ref_vel_survives_round_reset` + code comment — MITIGATED
- **T-02-13** (fake first_blood via crafted poses): commentary events are no-op in Phase 2 — ACCEPTED
- **T-02-14** (extreme bot damage on Hard): difficulty set server-side in BoxingConfig — ACCEPTED

## TDD Gate Compliance

- RED gate commit: `9e9f321 test(02-03): add failing tests for BoxingPlugin GamePlugin impl (TDD RED)` — PRESENT
- GREEN gate commit: `84a4e0d feat(02-03): implement BoxingPlugin, BoxingState, full GamePlugin impl (TDD GREEN)` — PRESENT
- REFACTOR gate: Not needed (no cleanup required)

## Self-Check: PASSED

Files exist:
- `engine/boxing-plugin/src/bot.rs` — FOUND
- `engine/boxing-plugin/src/lib.rs` — FOUND
- `engine/boxing-plugin/Cargo.toml` — FOUND (tracing dependency added)

Commits exist:
- d22e5e7 (bot.rs implementation) — FOUND
- 9e9f321 (TDD RED) — FOUND
- 84a4e0d (TDD GREEN) — FOUND
