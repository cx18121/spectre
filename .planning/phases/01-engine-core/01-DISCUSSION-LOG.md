# Phase 1: Engine Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 1-Engine Core
**Areas discussed:** Crate layout, Protocol sync (PROTO-03), Commentary in Phase 1, Room expiry / cleanup

---

## Crate layout

### Q1: Project structure

| Option | Description | Selected |
|--------|-------------|----------|
| Cargo workspace | Root Cargo.toml with engine-core as first member; Phase 2 adds plugin-trait and boxing-plugin | ✓ |
| Single flat crate | One Cargo.toml at repo root; split later in Phase 2 | |

**User's choice:** Cargo workspace  
**Notes:** None

### Q2: Where does Rust code live?

| Option | Description | Selected |
|--------|-------------|----------|
| engine/ at repo root | Rust workspace at engine/; Python server stays at server/ until cutover | ✓ |
| Replace server/ in-place | Delete server/ and put Cargo.toml there | |

**User's choice:** engine/ at repo root  
**Notes:** Python server retained in parallel during development

### Q3: Module structure

| Option | Description | Selected |
|--------|-------------|----------|
| Responsibility-mapped modules | main.rs, protocol.rs, room.rs, room_manager.rs, input_delay.rs, broadcast.rs, game_loop.rs | ✓ |
| Flatter (fewer files) | Combine room + manager + game_loop into one file | |

**User's choice:** Responsibility-mapped modules  
**Notes:** Mirrors Python module layout for traceable port

---

## Protocol sync (PROTO-03)

### Q1: Source of truth

| Option | Description | Selected |
|--------|-------------|----------|
| Rust models → generate TS | ts-rs derives shared/protocol.ts from Rust; gen_protocol.py replaced | ✓ |
| Keep gen_protocol.py, add Rust validation | Python stays source of truth; Rust validates via golden-file tests | |
| Manual + golden-file enforcement only | No code gen in either direction | |

**User's choice:** Rust models → generate TS  
**Notes:** gen_protocol.py is retired; ts-rs #[derive(TS)] + cargo test exports bindings

### Q2: Code gen library

| Option | Description | Selected |
|--------|-------------|----------|
| ts-rs | #[derive(TS)] macro, mature serde interop, per-struct export | ✓ |
| typeshare | Scans whole codebase, single output file, multi-language | |
| Let researcher evaluate | Don't lock in | |

**User's choice:** ts-rs  
**Notes:** ts-rs version 10

### Q3: Golden-file fixture derivation

| Option | Description | Selected |
|--------|-------------|----------|
| Run Python server, capture real messages | scripts/capture_fixtures.py connects to Python server and records each message type | ✓ |
| Derive from shared/protocol.ts by hand | Hand-write JSON samples | |
| Generate from Rust structs using Default | Self-consistent but circular | |

**User's choice:** Run Python server, capture real messages  
**Notes:** Fixtures saved to engine/engine-core/tests/fixtures/*.json

---

## Commentary in Phase 1

### Q1: Commentary handling in Rust server

| Option | Description | Selected |
|--------|-------------|----------|
| Stub — accept events, drop silently | Rust never sends commentary_text/audio; overlay handlers never fire | ✓ |
| Remove from overlay for Phase 1 | Disable overlay commentary handlers (requires TS client changes) | |
| Port commentary in Phase 1 | Full Claude API + ElevenLabs in Phase 1 | |

**User's choice:** Stub — accept events, drop silently  
**Notes:** No TypeScript client changes required

### Q2: CommentaryHint in GameEvent enum

| Option | Description | Selected |
|--------|-------------|----------|
| No — commentary events are Phase 2 concern | Don't define commentary variants in Phase 1 | |
| Define the event shape, emit nothing | Declare CommentaryHint in GameEvent enum, never produce it | |

**User's choice:** Free-text — "commentary is honestly very very low priority. i think having a queue/event enum for all the events in the game is relevant though"  
**Notes:** Define a `GameEvent` enum in Phase 1 for internal game events. Commentary-related variants deferred to Phase 2+. Enum established now so Phase 2 extends without renaming.

---

## Room expiry / cleanup

### Q1: Include room expiry?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — TTL cleanup in Phase 1 | Background Tokio task on 60s interval, remove expired rooms from DashMap | ✓ |
| Defer — ship without room expiry | Same as Python; rooms accumulate until restart | |

**User's choice:** Yes — include TTL cleanup in Phase 1  
**Notes:** None

### Q2: Expiry trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Match over + all sockets gone for 10 minutes | match_over == true AND all player WS handles None for >10 min | ✓ |
| Any inactivity >30 minutes | No message received for 30 min regardless of match state | |
| Match over + room idle >5 minutes | More aggressive 5-minute cutoff post-match | |

**User's choice:** Match over + all sockets gone for 10 minutes  
**Notes:** Preserves rooms between rounds and during reconnect windows

---

## Claude's Discretion

- Internal error handling in WebSocket path (log-and-continue from Python is reasonable default)
- Exact Cargo dependency versions (researcher picks current stable)
- Whether game_loop.rs placeholder runs a no-op tick or minimal warmup counter before Phase 2 boxing logic lands

## Deferred Ideas

- Commentary path (COMM-01..04) — Phase 2/v2
- `CommentaryHint` GameEvent variant — Phase 2
- Horizontal scaling / room sharding — out of scope
- Reference velocity clamping — Phase 2 (boxing plugin concern)
