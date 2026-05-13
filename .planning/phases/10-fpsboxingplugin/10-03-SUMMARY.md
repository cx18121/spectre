---
plan: 10-03
status: complete
completed: 2026-05-13
commit: f7331d4
---

# Plan 03 — FPSBoxingPlugin crate

## What was done

Created `engine/fps-boxing-plugin/` crate implementing `GamePlugin` for fps_boxing rooms.
Added `fps-boxing-plugin` to workspace Cargo.toml. FPSBoxingPlugin calls boxing-core for
hit detection and damage calculation. Per-tick MsgFpsState is sent to each player with their
opponent's 6 arm landmarks. MsgFpsHit is sent to the defending player on confirmed hits.
ref_vel survives on_round_reset (FIX-01).

## Verification

- `cargo test -p fps-boxing-plugin`: 4 passed
  - game_type_is_fps_boxing
  - fps_state_emits_two_send_to_player
  - fps_hit_sent_to_defender_on_confirmed_hit
  - fix01_ref_vel_survives_round_reset
