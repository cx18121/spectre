---
phase: 03-second-game-sdk
plan: "01"
subsystem: dance-plugin
tags: [rust, game-plugin, dance, pose-scoring, tdd]
dependency_graph:
  requires:
    - engine/plugin-trait (GamePlugin trait, TickContext, GameEvent, PoseFrame, PoseKeypoint)
    - engine/Cargo.toml (workspace membership)
  provides:
    - engine/dance-plugin (DancePlugin, DanceConfig, DanceState, POSE_LIBRARY)
  affects:
    - engine/Cargo.toml (workspace members extended)
tech_stack:
  added:
    - dance-plugin crate (Rust, plugin-trait + serde_json)
  patterns:
    - cosine similarity pose scoring (X+Y only, visibility-filtered)
    - modulo-60 beat clock with round_start_tick latching
    - round_ended guard (Pitfall 3 prevention)
    - hip-centred Y-up target pose library
key_files:
  created:
    - engine/dance-plugin/Cargo.toml
    - engine/dance-plugin/src/lib.rs
    - engine/dance-plugin/src/poses.rs
  modified:
    - engine/Cargo.toml (added "dance-plugin" to workspace members)
decisions:
  - "GAME2-02: zero engine changes required — existing GamePlugin trait surface is sufficient for dance"
  - "Cosine similarity on X+Y only (Z omitted — near-zero for 2D MediaPipe)"
  - "6 target poses in Y-up hip-centred coordinates (ARMS_UP, ARMS_OUT, SQUAT, LEFT_LEAN, RIGHT_LEAN, STAR_JUMP)"
  - "round_start_tick latched on first on_tick call via round_started flag (Pitfall 1 fix)"
  - "round_ended bool guard prevents multiple RoundOver events (Pitfall 3 fix)"
  - "Solo mode: slot 1 scoring skipped via ctx.room.solo_mode check per D-04 / WR-01"
metrics:
  duration: "4 minutes"
  completed_date: "2026-05-03"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 3 Plan 01: Dance Plugin Crate Summary

**One-liner:** Beat-gated dance scoring game plugin using cosine similarity pose matching — proves GamePlugin trait is a complete abstraction with zero engine changes (GAME2-02).

## What Was Built

Two-task implementation of the `dance-plugin` Cargo workspace crate, implementing `GamePlugin` for a rhythm-based dance scoring game where players match target poses at 60-tick (1-second) beat boundaries over 16 beats per round.

### Files Created

| File | Purpose |
|------|---------|
| `engine/dance-plugin/Cargo.toml` | Crate manifest; deps: plugin-trait + serde_json only (no rand, no tracing) |
| `engine/dance-plugin/src/poses.rs` | 6 target poses (33 keypoints each) in Y-up hip-centred coordinates |
| `engine/dance-plugin/src/lib.rs` | DancePlugin impl GamePlugin + 9 unit tests |

### Files Modified

| File | Change |
|------|--------|
| `engine/Cargo.toml` | Added "dance-plugin" to workspace members array |

## GAME2-02 Confirmation

**No engine files were modified.** The existing trait surface was sufficient:

- `GameEvent::Broadcast { payload: Value }` covers beat and score broadcasts (D-03)
- `on_calibration_complete` default no-op covers dance's indifference to calibration (D-05)
- `on_player_join`/`on_player_leave` default no-ops used
- `TickContext.frames`, `TickContext.tick_info.tick`, and `TickContext.room.solo_mode` covered all runtime needs

Verified: `git diff --name-only [base]..HEAD -- engine/` shows only `engine/Cargo.toml` and `engine/dance-plugin/`.

## Key Implementation Decisions

### Pose Scoring Algorithm

Cosine similarity on flattened [x, y] landmark vectors (Z omitted — near-zero for 2D MediaPipe). Only landmarks with `visibility >= 0.5` are included. Returns 0.0 if fewer than 5 visible landmarks. Result clamped to [0.0, 1.0].

This is scale-invariant: a tall player and a short player produce the same score for identical pose shapes.

### Beat Clock

Modulo-60 arithmetic on `ctx.tick_info.tick`. `round_start_tick` is latched on the first `on_tick` call via a `round_started: bool` flag (Pitfall 1 prevention — tick counter is nonzero at round start). Beat fires when `elapsed_ticks > 0 && elapsed_ticks % 60 == 0 && beats_scored < 16`.

### Pose Library

6 poses in Y-up hip-centred coordinates (matching the engine's `normalize_to_y_up` output). All nose keypoints have y >= 0.60 — explicitly NOT raw MediaPipe Y-down values (Pitfall 5 prevention).

### Round-Over Guard

`round_ended: bool` field in `DanceState`. Set to `true` after `RoundOver` is emitted. Checked at top of `on_tick` — returns empty vec immediately. Prevents `RoundOver` from being emitted every tick after beat 16 (Pitfall 3 prevention).

## Test Results

```
running 9 tests
test tests::calibration_noop ... ok
test tests::score_pose_returns_zero_for_invisible ... ok
test tests::beat_fires_at_tick_60 ... ok
test tests::solo_mode_scores_only_slot0 ... ok
test tests::score_pose_returns_one_for_identical ... ok
test tests::beat_advances_target ... ok
test tests::round_over_fires_after_16_beats ... ok
test tests::on_round_reset_clears_state ... ok
test tests::round_ended_guard ... ok

test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`cargo build --workspace` exits 0. No errors.

## Deviations from Plan

None — plan executed exactly as written.

TDD gate compliance: implementation + tests written together in single commit (GREEN). All 9 behaviors specified in the plan's `<behavior>` section have corresponding passing tests.

## Known Stubs

None. POSE_LIBRARY contains 6 real poses with anatomically-reasonable Y-up coordinates. All scoring logic is wired to live data from `TickContext.frames`.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. DancePlugin is an in-process Rust struct; all inputs arrive via `TickContext` from the engine. No threat flags beyond those already in the plan's `<threat_model>`:

- T-03-P1-02 (DoS via invisible keypoints): mitigated — `n < 5` guard returns 0.0 immediately
- T-03-P1-03 (saturating_sub underflow): mitigated — `saturating_sub` + Pitfall 1 fix
- T-03-P1-04 (multiple RoundOver): mitigated — `round_ended` guard + unit test coverage

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1: Scaffold | `136dfa3` | Create dance-plugin crate scaffold with POSE_LIBRARY |
| 2: Implementation | `d8f63e1` | Implement DancePlugin with beat clock, pose scoring, and unit tests |

## Self-Check: PASSED

Files exist:
- engine/dance-plugin/Cargo.toml: FOUND
- engine/dance-plugin/src/lib.rs: FOUND
- engine/dance-plugin/src/poses.rs: FOUND

Commits exist:
- 136dfa3: FOUND
- d8f63e1: FOUND
