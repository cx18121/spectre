---
plan: 10-01
status: complete
completed: 2026-05-13
commit: 3fab219
---

# Plan 01 — boxing-core crate extraction

## What was done

Created `engine/boxing-core/` workspace crate by extracting `hit_detection.rs` and `damage.rs`
from `boxing-plugin`. Added `pub const LEFT_ELBOW: usize = 13` and `pub const RIGHT_ELBOW: usize = 14`
to `hit_detection.rs`, and made all landmark index constants `pub`. Updated workspace `Cargo.toml`
to include `boxing-core`. Updated `boxing-plugin` to depend on `boxing-core` instead of private copies;
deleted its local `hit_detection.rs` and `damage.rs`.

## Deviations

- Plan assumed `fps-boxing-plugin` could be listed in workspace `Cargo.toml` before the crate
  directory exists (claiming cargo warns but doesn't fail). This was wrong — cargo fails hard.
  Added `fps-boxing-plugin` to workspace in Plan 03 when the crate is created instead.

## Verification

- `cargo test -p boxing-core`: 18 passed
- `cargo test -p boxing-plugin`: 18 passed
