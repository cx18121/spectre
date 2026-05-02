---
phase: 02-plugin-trait-boxing
plan: "06"
subsystem: engine-core
tags: [rust, solo-mode, calibration, bug-fix, gap-closure, BOX-10, CR-01]
dependency_graph:
  requires: [02-05]
  provides: [solo-calibration-start, solo-flow-unblocked]
  affects: [engine/engine-core/src/room.rs]
tech_stack:
  added: []
  patterns: [solo_mode-detection-via-player1-connected, idempotency-guard-round_start_time]
key_files:
  created: []
  modified:
    - engine/engine-core/src/room.rs
decisions:
  - "Solo mode detection uses `!state.players[1].connected` — mirrors existing CalibrationDone pattern exactly"
  - "Solo branch guard includes `slot == 0 && state.round_start_time.is_none()` for slot safety and idempotency"
  - "TDD test placed directly in room.rs test module (same file as implementation) to avoid separate test file dependency"
metrics:
  duration: "2m 17s"
  completed: "2026-05-02T22:56:03Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 02 Plan 06: Solo Calibration Start (CR-01) Summary

Solo player (slot 0) now receives `calibration_start` immediately upon connecting in bot/solo mode via an `else if` branch in the `PlayerConnect` arm of `handle_cmd`, unblocking the entire solo flow that was broken since the two-player condition was the only trigger.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add solo path to PlayerConnect handler | 325adcb | engine/engine-core/src/room.rs |
| 2 | Add unit tests for solo/two-player/idempotency | fd73ec0 | engine/engine-core/src/room.rs |

## What Was Built

### Task 1: Solo path in PlayerConnect (325adcb)

Added an `else if` branch inside `RoomCmd::PlayerConnect` in `handle_cmd`:

```rust
let solo_mode = !state.players[1].connected;
if state.players[0].connected && state.players[1].connected {
    // two-player branch (unchanged)
    ...
    tracing::info!("room {} calibration started (two-player)", state.code);
} else if solo_mode && slot == 0 && state.round_start_time.is_none() {
    // solo branch (new — CR-01 fix)
    use crate::protocol::MsgCalibrationStart;
    if let Ok(json) = serde_json::to_string(&MsgCalibrationStart { ... }) {
        send_to_slot(state, 0, &json);
        tracing::info!("room {} calibration started (solo/bot mode)", state.code);
    }
}
```

Guards:
- `solo_mode = !state.players[1].connected`: detected from engine-owned connection state; client cannot spoof this
- `slot == 0`: only fire when player 0 connects (not if slot 1 connected without slot 0)
- `state.round_start_time.is_none()`: idempotency — do not re-send on reconnect after match started

### Task 2: Unit tests (fd73ec0)

Three tests added to `room::player_connect_tests` in room.rs:

1. `box10_solo_player_connect_sends_calibration_start` — BOX-10/CR-01 regression test; verifies solo player receives calibration_start
2. `two_player_connect_sends_calibration_start_to_both` — both slots receive calibration_start when both connect
3. `solo_reconnect_after_match_started_does_not_resend_calibration_start` — idempotency guard verified

All 91 workspace tests pass (23 boxing-plugin + 30 engine-core main including new tests + 18 protocol roundtrip + 20 engine-core lib).

## Success Criteria Verification

- BOX-10 CR-01 closed: solo player 0 receives `calibration_start` immediately upon connecting when player 1 is not present ✓
- Full solo flow unblocked: `calibration_start` → mobile leaves lobby → `CalibrationDone` sent → `ready_to_start` fires (02-05) → `round_start_time` set → `match_in_progress` true (02-05) → game_tick runs → bot logic reachable ✓
- Two-player mode unaffected: `calibration_start` still sent to both players when both connect ✓
- Idempotency: no second `calibration_start` on reconnect after match has started ✓
- Three unit tests verify the PlayerConnect solo path without a live server ✓
- `cargo test --workspace` exits 0 — all 91 tests pass ✓

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — the solo path sends a real `calibration_start` message through the actual `send_to_slot` helper. No placeholders or stub data.

## Threat Flags

No new security-relevant surface introduced. The solo mode detection relies on `state.players[1].connected` which is engine-owned state (set only by `RoomCmd::PlayerConnect` and `RoomCmd::PlayerDisconnect`). Consistent with threat register entries T-02-24 through T-02-26 documented in the plan.

## Self-Check: PASSED

- `engine/engine-core/src/room.rs` modified and committed in both task commits (325adcb, fd73ec0)
- Commit 325adcb: `git log` confirmed
- Commit fd73ec0: `git log` confirmed
- `cargo test --workspace` exits 0, no FAILED lines
- `grep -c "solo_mode" room.rs` = 6 (>= 6 required by verification check 2)
- `grep -n "else if solo_mode && slot == 0"` = 1 match
- `grep -n "send_to_slot(state, 1"` = 1 match (two-player branch only)
