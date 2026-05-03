---
phase: 03-second-game-sdk
plan: "03"
subsystem: sdk-docs
tags: [rust, docs, rustdoc, game-sdk, plugin-trait]
dependency_graph:
  requires:
    - engine/plugin-trait (GamePlugin trait — source of truth for all doc comments)
    - engine/boxing-plugin/src/lib.rs (boxing walkthrough source; line-range cross-references)
    - engine/dance-plugin/src/lib.rs (confirms zero-engine-change abstraction — GAME2-02)
  provides:
    - engine/plugin-trait/src/lib.rs (expanded Rustdoc on all 7 methods and 8 types)
    - docs/GAME-SDK.md (800-line developer guide: trait reference + walkthrough + boilerplate)
    - README.md (teaser section linking to GAME-SDK.md)
  affects:
    - Any developer or LLM adding a new game (SDK-01, SDK-02, SDK-03 closed)
tech_stack:
  added: []
  patterns:
    - Rustdoc /// template: Called when / Contract / Return / Do NOT sections on every method
    - SDK developer guide: trait reference + walkthrough + boilerplate + registration steps
decisions:
  - "SDK-01: Rustdoc expanded on all 7 GamePlugin methods and all 8 types in plugin-trait/src/lib.rs"
  - "SDK-02: docs/GAME-SDK.md boxing walkthrough cross-references actual line numbers in boxing-plugin/src/lib.rs"
  - "SDK-03: README.md teaser section links to docs/GAME-SDK.md with brief 3-sentence preamble"
  - "Rustdoc bracket warnings fixed by wrapping array index notation in backticks or escaping brackets"
key_files:
  created:
    - docs/GAME-SDK.md
  modified:
    - engine/plugin-trait/src/lib.rs (doc comments only — no code changes)
    - README.md (added 'Adding a new game' section)
metrics:
  duration: "7 minutes"
  completed_date: "2026-05-03"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 3 Plan 03: SDK Documentation Summary

**One-liner:** Full SDK documentation package — Rustdoc on all 7 GamePlugin methods and 8 types, 800-line developer guide with boxing walkthrough and quick-start boilerplate, README teaser section — closes SDK-01/02/03.

## What Was Built

Two-task documentation pass finalizing the SDK for the `GamePlugin` trait interface.

### Task 1: Rustdoc on plugin-trait/src/lib.rs (SDK-01)

Expanded all `///` doc comments in `engine/plugin-trait/src/lib.rs` using the Rustdoc template from RESEARCH.md Pattern 8 (Called when / Contract / Return / Do NOT). No code was changed — doc comments only.

**Methods documented (7):** `init_state`, `on_tick`, `max_wins`, `on_player_join`, `on_player_leave`, `on_calibration_complete`, `on_round_reset`.

**Types documented (8):** `PoseKeypoint`, `PoseFrame`, `BodyRegion`, `GameEvent`, `TickInfo`, `SlotView`, `RoomView`, `TickContext`.

**Key cross-references added:**
- PLUG-06 coordinate system (Y-up, hip-centred) documented on PoseKeypoint and TickContext
- FIX-01 calibration-persist pattern documented on `on_calibration_complete` and `on_round_reset`
- WR-01 `solo_mode` anti-pattern documented on `RoomView`
- D-08 velocity clamping range documented on `on_calibration_complete`

**Rustdoc fix:** Three `broken_intra_doc_links` warnings from array index notation (`frames[0]`, `slots[1]`) were fixed by wrapping in backticks and escaping brackets. `cargo doc --package plugin-trait` exits 0 with no warnings.

### Task 2: docs/GAME-SDK.md and README.md (SDK-02, SDK-03)

**docs/GAME-SDK.md** (800 lines, 4 sections):

| Section | Lines (approx) | Content |
|---------|---------------|---------|
| 1. Trait Interface Reference | ~400 | All 7 methods + 8 types with signatures, lifecycle docs, examples |
| 2. Boxing Plugin Walkthrough | ~185 | Line-range narrative through boxing-plugin/src/lib.rs (init_state, on_tick, on_calibration_complete, on_round_reset, max_wins, on_player_join/leave) |
| 3. Quick-Start Boilerplate | ~115 | Complete copyable DancePlugin-style skeleton with Cargo.toml comment |
| 4. Registering Your Plugin | ~45 | 3-step registration: workspace member + dep + registry insert |

**README.md**: Added "Adding a new game" section (5 sentences) after "Project layout" and before "Tech stack". Plain prose, no bullets, no emojis — consistent with existing README voice.

## Rustdoc Coverage

| Method/Type | Called when | Contract | Return | Do NOT |
|-------------|-------------|----------|--------|--------|
| `init_state` | yes | yes | yes | yes |
| `on_tick` | yes | yes | yes | yes |
| `max_wins` | yes | yes | yes | yes |
| `on_player_join` | yes | yes | yes | yes |
| `on_player_leave` | yes | yes | yes | yes |
| `on_calibration_complete` | yes | yes | yes | yes |
| `on_round_reset` | yes | yes | yes | yes |
| `PoseKeypoint` | n/a | Y-up coords | n/a | yes |
| `PoseFrame` | n/a | usage in on_tick | n/a | n/a |
| `BodyRegion` | n/a | to_wire() | n/a | yes |
| `GameEvent` | n/a | 5 variants described | n/a | yes (RoundOver once) |
| `TickInfo` | n/a | tick/elapsed/remaining | n/a | n/a |
| `SlotView` | n/a | connected/ref_vel | n/a | n/a |
| `RoomView` | n/a | slots/solo_mode | n/a | yes (WR-01) |
| `TickContext` | n/a | frames/tick_info/room | n/a | yes (lifetime) |

## GAME-SDK.md Line Count and Section Breakdown

```
$ wc -l docs/GAME-SDK.md
800 docs/GAME-SDK.md
```

Sections confirmed present:
- "## 1. Trait Interface Reference" — line 12
- "## 2. Boxing Plugin Walkthrough" — line 407
- "## 3. Quick-Start Boilerplate" — line 593
- "## 4. Registering Your Plugin" — line 735

boxing-plugin references: 12 occurrences (walkthrough cross-references confirmed).

## SDK Requirement Closure

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SDK-01 | CLOSED | `grep -c "Called when:" engine/plugin-trait/src/lib.rs` → 7; `cargo doc --package plugin-trait` exits 0 |
| SDK-02 | CLOSED | docs/GAME-SDK.md section 2 (Boxing Plugin Walkthrough) with line-range cross-references to boxing-plugin/src/lib.rs |
| SDK-03 | CLOSED | README.md "Adding a new game" section with link to docs/GAME-SDK.md; GAME-SDK.md section 4 (Registering) covers 3-step process |

## Deviations from Plan

None — plan executed exactly as written.

The only deviation from the plan's draft doc comments was fixing three Rustdoc
`broken_intra_doc_links` warnings: array index expressions like `frames[0]` and `slots[1]`
in doc comment text were being parsed as intra-doc links. Fixed by wrapping in backticks
or escaping brackets. This is a Rule 1 auto-fix (cargo doc warnings are build failures in CI).

## Known Stubs

None. All documentation references real code with accurate line numbers. The quick-start
boilerplate in GAME-SDK.md is a skeleton by design — not a stub — and is clearly labeled
"Copy this skeleton to implement a new game."

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. This plan writes
only `///` Rustdoc comments and Markdown files. The SDK documentation intentionally
describes the engine's existing HTTP endpoints (POST /rooms, GET /) and WebSocket endpoints
(ws/player/{code}) but introduces no new ones. No threat flags.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1: Rustdoc refresh | `a2193db` | expand Rustdoc on all GamePlugin methods and types (SDK-01) |
| 2: GAME-SDK.md + README | `392a29a` | create GAME-SDK.md developer guide and README teaser (SDK-02, SDK-03) |

## Self-Check: PASSED

Files exist:
- engine/plugin-trait/src/lib.rs: FOUND
- docs/GAME-SDK.md: FOUND
- README.md: FOUND
- .planning/phases/03-second-game-sdk/03-03-SUMMARY.md: FOUND

Commits exist:
- a2193db: FOUND
- 392a29a: FOUND
