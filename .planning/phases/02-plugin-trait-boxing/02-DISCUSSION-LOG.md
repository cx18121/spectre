# Phase 2: Plugin Trait + Boxing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 02-plugin-trait-boxing
**Areas discussed:** Messaging API, Bot mode location, Plugin registration, Plugin init config

---

## Messaging API

| Option | Description | Selected |
|--------|-------------|----------|
| Events only | Plugin returns Vec<GameEvent>; SendToPlayer is a variant; no ctx send methods. Engine dispatches all events after tick. Pure function — easy unit test. | ✓ |
| Context methods only | ctx.send_to_player() / ctx.broadcast() during tick. GameEvent covers game-state effects only. Ergonomic but harder to test without mocking TickContext. | |
| Both coexist | Context methods for fire-and-forget; GameEvent for state effects. Two paths to the same result. | |

**User's choice:** Events only  
**Notes:** User asked for clarification on the difference between options 1 and 2, then asked which makes engine expansion easier. Chose events-only after understanding that it makes the engine the extension point — all game effects flow as data the engine can intercept (v2 commentary routing, replay, rate limiting).

---

## Bot Mode Location

| Option | Description | Selected |
|--------|-------------|----------|
| Boxing plugin | Plugin checks RoomView, fabricates poses and scripted hit events internally. Engine never knows about bot. | ✓ |
| Engine fake player | Engine injects a fake PlayerSlot with synthetic frames. Plugin treats bot frames like real frames. Requires engine to carry boxing-specific pose data. | |
| New plugin method | Add on_bot_tick(slot, difficulty) to the trait. Engine calls it for empty slots. Bloats the trait; every future plugin must stub it. | |

**User's choice:** Boxing plugin  
**Notes:** Preserves engine/game separation. Engine stays game-agnostic.

---

## Plugin Registration

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcode in main.rs | Box::new(BoxingPlugin::new(config)) in Phase 2. Engine is already generic. Phase 3 adds a match branch. | ✓ |
| CLI arg now | --game boxing|dance routing in main.rs. Slightly more Phase 2 code; Phase 3 adds a branch. | |
| Cargo feature flag | --features boxing vs --features dance. Separate compile-time builds. Adds Cargo.toml complexity. | |

**User's choice:** Hardcode in main.rs  
**Notes:** Engine is generic (Box<dyn GamePlugin + Send>); it just happens to be compiled with boxing for Phase 2. Phase 3 changes one line.

---

## Plugin Init Config

| Option | Description | Selected |
|--------|-------------|----------|
| Constructor params | BoxingPlugin::new(BoxingConfig { hp, round_secs, max_wins, bot_difficulty }). Trait stays clean. Config is boxing-owned. | ✓ |
| Hardcoded constants | const HP: u32 = 800 etc. in boxing crate. Zero plumbing but requires recompile to change. | |
| init_state receives config | fn init_state(&self, config: serde_json::Value). Most flexible but leaks game-specific blobs into the trait interface. | |

**User's choice:** Constructor params  
**Notes:** `GamePlugin::init_state()` takes no arguments; config is a boxing-level concern set in main.rs.

---

## Claude's Discretion

- `BodyRegion` enum variant naming convention (Rust style for the 9 regions from BOX-03)
- Internal module layout within `boxing-plugin` crate
- Exact `RoomView` fields (depends on Phase 1 engine-core output)
- Bot difficulty hit-interval ranges for each tier
- Whether `BoxingConfig` derives `serde::Deserialize`

## Deferred Ideas

- CLI/env-based plugin selection — Phase 3 adds routing when second game exists
- Commentary engine consumer of `CommentaryHint` — v2 scope (COMM-01..04)
- Replay/event logging via event stream — natural extension of events-only design; not Phase 2 scope
