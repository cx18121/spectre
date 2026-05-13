---
plan: 10-02
status: complete
completed: 2026-05-13
commit: 96e40bf
---

# Plan 02 — Protocol messages

## What was done

Added `MsgFpsState` and `MsgFpsHit` structs to `engine/engine-core/src/protocol.rs` with
`Serialize/Deserialize/TS/Clone/Debug` derives and `#[ts(export)]`. Added matching TypeScript
interfaces to `shared/protocol.ts`.

## Deviations

- PLAN.md stated `cargo test` writes directly to `shared/protocol.ts`. In practice, ts-rs writes
  individual `.ts` files to `engine/engine-core/bindings/`. The `shared/protocol.ts` is a
  hand-curated consolidation. Updated `shared/protocol.ts` manually per the actual project workflow.

## Verification

- `cargo build -p engine-core`: compiles without errors
- `grep -c "MsgFpsState\|MsgFpsHit" shared/protocol.ts`: returns 2
