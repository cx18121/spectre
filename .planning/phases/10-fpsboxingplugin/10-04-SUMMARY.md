---
plan: 10-04
status: complete
completed: 2026-05-13
commit: 76565d0
---

# Plan 04 — Engine routing

## What was done

Added `fps-boxing-plugin = { path = "../fps-boxing-plugin" }` to engine-core/Cargo.toml.
Imported `FPSBoxingPlugin` and `FPSBoxingConfig` in main.rs. Registered `"fps_boxing"` in
the plugins HashMap (before `Arc::new(AppState)` per Pitfall 2). Updated `test_state()` in
the HTTP test module to include fps_boxing. Added `post_rooms_fps_boxing_returns_201`
integration test which verifies POST /rooms?game=fps_boxing returns 201 (FPSP-01).

## Verification

- `cargo test -p engine-core post_rooms_fps_boxing`: 1 passed
- Full `cargo test` suite: 0 failures across all crates
  - boxing-core: 18 tests
  - boxing-plugin: 18 tests
  - dance-plugin: 15 tests
  - engine-core lib: 47 tests
  - engine-core bin: 88 tests (includes new fps_boxing test)
  - protocol_roundtrip: 20 tests
  - fps-boxing-plugin: 4 tests
