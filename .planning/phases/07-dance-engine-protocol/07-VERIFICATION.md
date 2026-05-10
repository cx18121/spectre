---
phase: 07-dance-engine-protocol
verified: 2026-05-10T12:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "Spectator snapshot message includes game_type (DANCE-02) — game_type: 'dance' now present in dance_snapshot JSON payload at engine/dance-plugin/src/lib.rs:216"
  gaps_remaining: []
  regressions: []
---

# Phase 7: Dance Engine + Protocol — Verification Report

**Phase Goal:** game_type propagated through MsgJoined and spectator snapshot; dance calibration skip; MsgDanceBeat/MsgDanceScore TypeScript types
**Verified:** 2026-05-10T12:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (07-03 plan)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BoxingPlugin returns game_type "boxing"; DancePlugin returns game_type "dance" | VERIFIED | `engine/boxing-plugin/src/lib.rs:215` returns `"boxing"`; `engine/dance-plugin/src/lib.rs:203` returns `"dance"`; trait default at `plugin-trait/src/lib.rs:328` returns `"unknown"` |
| 2 | Dance rooms skip calibration_start and proceed directly to match start when both players connect | VERIFIED | `engine/engine-core/src/room.rs:268+300` branch on `plugin.requires_calibration()`; dance path sets sentinel velocities `Some(0.0)` on both slots and broadcasts `MsgMatchStart` + `MsgRoundStart` immediately |
| 3 | game_loop::game_tick allows dance rooms to tick (sentinel velocities bypass calibrated_ok gate) | VERIFIED | `engine/engine-core/src/game_loop.rs:49-55` checks `reference_velocity.is_some()`; sentinel `Some(0.0)` set in room.rs:281-282 satisfies the gate; solo path at game_loop.rs:389+399 also covered |
| 4 | MsgJoined sent to players includes game_type field populated from room state | VERIFIED | `engine/engine-core/src/main.rs:531` calls `get_room_game_type()`; `engine/engine-core/src/protocol.rs:119` has `game_type: String` with serde default "unknown"; fixture `msg_joined.json` contains `"game_type": "boxing"` |
| 5 | Spectator joining mid-dance receives dance_snapshot before entering the live broadcast stream | VERIFIED | `engine/engine-core/src/broadcast.rs:74-80` sends `plugin_snapshot` after `game_state`; `handle_spectator` in main.rs calls `send_snapshot` before entering live broadcast |
| 6 | cargo test --workspace passes with no errors | VERIFIED | 153 tests pass: 29 boxing-plugin + 10 dance-plugin + 39 room-manager + 55 engine-core + 20 protocol roundtrip; 0 failures |
| 7 | MsgDanceBeat and MsgDanceScore structs exist in Rust with correct field shapes | VERIFIED | `engine/engine-core/src/protocol.rs:224-246` defines both structs with `#[derive(Serialize, Deserialize, TS, Clone, Debug)]` + `#[ts(export)]`; fields match DancePlugin on_tick payload exactly |
| 8 | Golden-file roundtrip tests for MsgDanceBeat and MsgDanceScore pass | VERIFIED | `engine/engine-core/tests/protocol_roundtrip.rs:214+229` — both test functions present; 20-test protocol suite passes |
| 9 | shared/protocol.ts contains MsgDanceBeat and MsgDanceScore TypeScript interfaces | VERIFIED | Lines 171-184 of shared/protocol.ts define both interfaces; target_pose typed as `Array<[number, number, number, number]>`; MsgJoined includes `game_type` at line 62; both interfaces in union types at lines 199+214 |
| 10 | Spectator snapshot message includes game_type (DANCE-02 gap closure) | VERIFIED | `engine/dance-plugin/src/lib.rs:216` now includes `"game_type": "dance"` in the json! block of spectator_snapshot(); new unit test `spectator_snapshot_includes_game_type` at line 574 confirms field presence; dance-plugin test count increased from 9 to 10 |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `engine/plugin-trait/src/lib.rs` | game_type(), requires_calibration(), spectator_snapshot() trait methods with defaults | VERIFIED | All three methods at lines 328, 333, 338; defaults "unknown", true, None |
| `engine/dance-plugin/src/lib.rs` | DancePlugin overrides for all three new methods; spectator_snapshot includes game_type field | VERIFIED | game_type() at line 203, requires_calibration() at line 205, spectator_snapshot() at line 207 with "game_type": "dance" at line 216 |
| `engine/boxing-plugin/src/lib.rs` | BoxingPlugin explicit game_type override | VERIFIED | game_type() at line 215 returns "boxing" |
| `engine/engine-core/src/protocol.rs` | MsgJoined with game_type field; MsgDanceBeat; MsgDanceScore | VERIFIED | game_type serde default at line 108; game_type field at line 119; MsgDanceBeat at line 224; MsgDanceScore at line 240 |
| `engine/engine-core/src/room.rs` | game_type on RoomState, calibration skip branch, build_snapshot extension | VERIFIED | game_type: String at line 62; plugin_snapshot at line 114; requires_calibration branches at lines 268+300; plugin_snapshot in build_snapshot at lines 170, 200-201, 208-209 |
| `engine/engine-core/src/broadcast.rs` | plugin_snapshot send in send_snapshot | VERIFIED | Lines 74-80 send plugin_snapshot payload after game_state |
| `engine/engine-core/src/main.rs` | MsgJoined.game_type population | VERIFIED | get_room_game_type call at line 531; game_type passed at line 538 |
| `engine/engine-core/tests/fixtures/msg_joined.json` | Updated fixture with game_type field | VERIFIED | Contains `"game_type": "boxing"` |
| `engine/engine-core/tests/fixtures/msg_dance_beat.json` | Golden-file fixture for MsgDanceBeat roundtrip | VERIFIED | Contains `{"type": "dance_beat", "beat": 3, "total_beats": 16, "target_pose": [[0.1, 0.5, 0.0, 0.99], [0.2, 0.4, 0.0, 0.95]]}` |
| `engine/engine-core/tests/fixtures/msg_dance_score.json` | Golden-file fixture for MsgDanceScore roundtrip | VERIFIED | Contains `{"type": "dance_score", "beat": 3, "scores": [0.82, 0.74]}` |
| `engine/engine-core/tests/protocol_roundtrip.rs` | Roundtrip tests for both new message types | VERIFIED | msg_dance_beat_roundtrip at line 214; msg_dance_score_roundtrip at line 229 |
| `shared/protocol.ts` | MsgDanceBeat and MsgDanceScore TypeScript interfaces; updated header; no deprecated Python reference | VERIFIED | Both interfaces at lines 171-184; header at lines 1-2 references Rust source; `grep "gen_protocol\|protocol.py"` returns no output |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `engine/plugin-trait/src/lib.rs` | `engine/dance-plugin/src/lib.rs` | impl GamePlugin for DancePlugin — fn requires_calibration | WIRED | DancePlugin::requires_calibration() returns false at line 205; DancePlugin::spectator_snapshot() confirmed at line 207 |
| `engine/engine-core/src/room.rs` | plugin-trait GamePlugin trait | state.plugin.requires_calibration() | WIRED | Calls at lines 268 and 300 in handle_cmd(PlayerConnect) two-player and solo paths |
| `engine/engine-core/src/room.rs` | `engine/engine-core/src/broadcast.rs` | RoomSnapshot.plugin_snapshot | WIRED | plugin_snapshot field at room.rs:114; consumed in broadcast.rs:74 |
| `engine/engine-core/src/protocol.rs` | `shared/protocol.ts` | hand-maintained after ts-rs export + cargo test | WIRED | MsgDanceBeat and MsgDanceScore appear in shared/protocol.ts lines 171-184; in union types at 199+214 |
| `engine/engine-core/tests/fixtures/msg_dance_beat.json` | `engine/engine-core/tests/protocol_roundtrip.rs` | fixture() loader | WIRED | msg_dance_beat_roundtrip at line 214 loads fixture; test passes |
| `DancePlugin::spectator_snapshot()` | dance_snapshot wire payload | serde_json::json! macro — "game_type": "dance" | WIRED | Line 216 in dance-plugin/src/lib.rs; gap-closure confirmed; unit test spectator_snapshot_includes_game_type at line 574 asserts field |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| DancePlugin::spectator_snapshot | beat: s.beats_scored, scores: s.scores, game_type: "dance" | DanceState — live game state updated per tick by on_tick | Yes — reads from live DanceState during active round; game_type is a static constant | FLOWING |
| MsgJoined.game_type | game_type from get_room_game_type | RoomHandle.game_type set at room creation from plugin.game_type() | Yes — read from DashMap at player connection time | FLOWING |
| MsgDanceBeat/MsgDanceScore | Emitted by DancePlugin::on_tick via GameEvent::SendToPlayer | DancePlugin::on_tick processes real pose frames and emits typed events | Yes — struct shapes match json!() payloads in on_tick; target_pose populated from keypoint data | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| cargo test --workspace exits 0 | `/Users/charliexue/.cargo/bin/cargo test --workspace` | 153 tests: 29+10+39+55+20 passed; 0 failed | PASS |
| game_type defaults in plugin-trait | `grep "fn game_type" engine/plugin-trait/src/lib.rs` | `fn game_type(&self) -> &'static str { "unknown" }` at line 328 | PASS |
| DancePlugin requires_calibration returns false | `grep "fn requires_calibration" engine/dance-plugin/src/lib.rs` | `fn requires_calibration(&self) -> bool { false }` at line 205 | PASS |
| dance_snapshot includes game_type field | `sed -n '207,225p' engine/dance-plugin/src/lib.rs` | json! block at line 216 has `"game_type": "dance"` | PASS |
| spectator_snapshot_includes_game_type unit test | `grep "spectator_snapshot_includes_game_type" engine/dance-plugin/src/lib.rs` | Test at line 574; covered in 10-test dance-plugin suite (was 9 before gap closure) | PASS |
| msg_joined.json fixture has game_type | `cat engine/engine-core/tests/fixtures/msg_joined.json` | `"game_type": "boxing"` present | PASS |
| shared/protocol.ts has no deprecated Python reference | `grep "gen_protocol\|protocol.py" shared/protocol.ts` | No output | PASS |
| MsgDanceBeat and MsgDanceScore in shared/protocol.ts union types | `grep "MsgDanceBeat\|MsgDanceScore" shared/protocol.ts` | Lines 171, 179, 199, 200, 214, 215 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DANCE-01 | 07-01-PLAN.md | GamePlugin trait game_type() method; BoxingPlugin returns "boxing", DancePlugin returns "dance" | SATISFIED | plugin-trait:328 (default "unknown"); dance-plugin:203 ("dance"); boxing-plugin:215 ("boxing") |
| DANCE-02 | 07-01-PLAN.md + 07-03-PLAN.md (gap closure) | RoomHandle stores game_type; MsgJoined includes game_type; spectator snapshot message includes game_type | SATISFIED | RoomHandle.game_type in room_manager.rs; MsgJoined.game_type in protocol.rs:119; dance_snapshot includes "game_type": "dance" at dance-plugin:216 |
| DANCE-03 | 07-02-PLAN.md | MsgDanceBeat and MsgDanceScore added to shared/protocol.ts with full TypeScript types | SATISFIED | protocol.ts lines 171-184; both in union types; game_type in MsgJoined at line 62 |
| DANCE-04 | 07-01-PLAN.md | Dance plugin signals no calibration needed; engine skips handshake for dance rooms | SATISFIED | requires_calibration() returns false; room.rs:268+300 branch skips calibration_start; sets sentinel Some(0.0) |
| DANCE-05 | 07-01-PLAN.md | Spectator mid-dance receives dance snapshot (beat, scores) before live broadcast | SATISFIED | broadcast.rs:74-80 sends plugin_snapshot; dance_snapshot delivers type, game_type, beat, scores |

### Anti-Patterns Found

No anti-patterns found. No TODO/FIXME/PLACEHOLDER comments in any modified files. No stub implementations or hardcoded empty returns in production code paths. The `"game_type": "dance"` in the json! block is a static string constant — correct and intentional per design.

### Human Verification Required

None. All success criteria are verifiable from code and test results.

### Gaps Summary

No gaps. The single gap from initial verification (DANCE-02: spectator snapshot missing game_type field) was closed by plan 07-03, which added `"game_type": "dance"` to the `json!` block in `DancePlugin::spectator_snapshot()` at `engine/dance-plugin/src/lib.rs:216`, accompanied by a TDD unit test (`spectator_snapshot_includes_game_type` at line 574). All 10 observable truths are verified. All 5 DANCE requirements are satisfied. 153 workspace tests pass with 0 failures.

---

_Verified: 2026-05-10T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
