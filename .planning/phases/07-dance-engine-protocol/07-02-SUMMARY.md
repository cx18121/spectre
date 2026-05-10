---
phase: 07-dance-engine-protocol
plan: 02
subsystem: engine
tags: [rust, protocol, dance, ts-rs, typescript, websocket]
dependency_graph:
  requires:
    - 07-01 (MsgJoined game_type field, dance plugin structs)
  provides:
    - MsgDanceBeat struct in Rust with ts-rs export
    - MsgDanceScore struct in Rust with ts-rs export
    - Golden-file roundtrip tests for both dance message types
    - shared/protocol.ts updated with MsgDanceBeat, MsgDanceScore, game_type
  affects:
    - engine/engine-core/src/protocol.rs
    - engine/engine-core/tests/protocol_roundtrip.rs
    - engine/engine-core/tests/fixtures/
    - shared/protocol.ts
tech_stack:
  added: []
  patterns:
    - default_type_* + serde default function pattern for discriminator fields
    - Vec<[f64; 4]> for typed keypoint array (4 floats per keypoint)
    - [f64; 2] fixed-size array for two-player score pairs
    - ts-rs #[ts(export)] generates individual .ts files per struct
key_files:
  created:
    - engine/engine-core/tests/fixtures/msg_dance_beat.json
    - engine/engine-core/tests/fixtures/msg_dance_score.json
  modified:
    - engine/engine-core/src/protocol.rs
    - engine/engine-core/tests/protocol_roundtrip.rs
    - shared/protocol.ts
decisions:
  - "ts-rs generates individual .ts files per struct; shared/protocol.ts is hand-maintained and updated manually to reflect generated types"
  - "MsgDanceBeat.beat and total_beats use u64 in Rust (bigint in ts-rs output) but typed as number in hand-maintained protocol.ts for overlay compatibility"
metrics:
  duration: 4 minutes
  completed_date: "2026-05-10T04:24:03Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 7 Plan 02: Dance Protocol Message Types Summary

MsgDanceBeat and MsgDanceScore typed Rust structs with golden-file roundtrip tests and shared/protocol.ts TypeScript interfaces, completing DANCE-03.

## What Was Built

Two new protocol message structs added to `engine/engine-core/src/protocol.rs` following the existing `default_type_*` + `#[derive(Serialize, Deserialize, TS, Clone, Debug)]` + `#[ts(export)]` pattern:

**MsgDanceBeat** — server-to-client dance beat announcement:
- `beat: u64` — current beat number
- `total_beats: u64` — total beats in the round
- `target_pose: Vec<[f64; 4]>` — per-keypoint data `[x, y, z, visibility]`, matching `DancePlugin::on_tick`'s json!() payload shape exactly

**MsgDanceScore** — server-to-client dance score per beat:
- `beat: u64` — beat that was scored
- `scores: [f64; 2]` — cumulative similarity scores for `[player_1, player_2]`, range `[0.0, 1.0]`

Two golden-file fixtures and roundtrip tests were added. All 20 roundtrip tests pass. `shared/protocol.ts` was updated with matching TypeScript interfaces and a corrected header comment.

## TDD Execution

**RED:** Fixture files and failing test functions added without struct definitions. Compiler confirmed `E0425: cannot find type MsgDanceBeat/MsgDanceScore`. Commit: `067abf1`.

**GREEN:** Struct definitions added to protocol.rs. `cargo test --workspace` passed all 20 tests. Commit: `6174043`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (RED) | 067abf1 | test(07-02): add failing roundtrip tests for MsgDanceBeat and MsgDanceScore |
| Task 1 (GREEN) | 6174043 | feat(07-02): add MsgDanceBeat and MsgDanceScore structs to protocol.rs |
| Task 2 | 3501fdf | feat(07-02): update shared/protocol.ts with MsgDanceBeat, MsgDanceScore, game_type |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Both interfaces are fully wired: Rust structs emit real data from DancePlugin, TypeScript interfaces match the wire format.

## Threat Flags

No new security surface introduced. Both message types are server-generated, read-only for overlay consumers, and match the existing `accept` dispositions in the plan's threat model (T-07-05, T-07-06).

## Self-Check: PASSED

- engine/engine-core/src/protocol.rs: MsgDanceBeat and MsgDanceScore structs confirmed
- engine/engine-core/tests/fixtures/msg_dance_beat.json: fixture file confirmed
- engine/engine-core/tests/fixtures/msg_dance_score.json: fixture file confirmed
- engine/engine-core/tests/protocol_roundtrip.rs: both roundtrip tests confirmed
- shared/protocol.ts: MsgDanceBeat, MsgDanceScore, game_type confirmed; no deprecated reference
- cargo test --workspace: 20 tests passed, 0 failed
- tsc --noEmit on overlay: no errors
