---
phase: 01-engine-core
plan: "05"
subsystem: infra
tags: [docker, rust, axum, multi-stage-build, debian, websocket]

# Dependency graph
requires:
  - phase: 01-engine-core/01-02
    provides: Cargo workspace, protocol types, and roundtrip test fixtures
  - phase: 01-engine-core/01-04
    provides: Axum server main.rs with WebSocket handlers and game loop
provides:
  - Multi-stage Dockerfile building Rust engine-core binary (rust:1.86-slim + debian:bookworm-slim)
  - Production container running engine-core binary on port 8000
  - WebSocket endpoints /ws/player/{room_code} and /ws/spectator/{room_code} verified working
  - Phase 1 cutover: Python server removed from final Docker image
affects: [02-mobile-ui, 02-overlay-ui, ci, deployment, railway]

# Tech tracking
tech-stack:
  added: [rust:1.86-slim (Docker build stage), debian:bookworm-slim (final image base)]
  patterns:
    - Multi-stage Docker build with dependency layer caching (dummy main.rs pattern)
    - Axum 0.8 path parameter syntax uses curly braces {param} not colon :param

key-files:
  created: []
  modified:
    - Dockerfile
    - engine/engine-core/src/main.rs

key-decisions:
  - "Use rust:1.86-slim (Debian-based) + debian:bookworm-slim to avoid glibc mismatch — NOT rust:alpine"
  - "Layer-cache Cargo.toml files with dummy main.rs before copying real source for fast Docker rebuilds"
  - "Python server not included in final Docker image (stays at server/ for dev reference only, D-02)"
  - "Axum 0.8 requires {room_code} curly-brace path syntax — colon syntax :room_code is Axum 0.7"

patterns-established:
  - "Docker multi-stage Rust: rust:1.86-slim build stage + debian:bookworm-slim final stage"
  - "Cargo layer caching: COPY Cargo.toml files → dummy main.rs → cargo build → COPY real src → touch → cargo build"

requirements-completed: [ENG-12]

# Metrics
duration: 40min
completed: 2026-05-02
---

# Phase 01 Plan 05: Dockerfile Rust Engine Stage Summary

**Multi-stage Dockerfile with rust:1.86-slim build stage and debian:bookworm-slim final image running engine-core binary on port 8000, replacing the Python server**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-05-02T11:46:07Z
- **Completed:** 2026-05-02T12:22:34Z
- **Tasks:** 1 auto task + 1 checkpoint (human-verify, approved)
- **Files modified:** 2

## Accomplishments
- Replaced python:3.11-slim final Docker image with debian:bookworm-slim running engine-core Rust binary
- Added engine-builder stage using rust:1.86-slim with Cargo dependency layer caching (dummy main.rs pattern)
- Preserved overlay-builder and mobile-builder Node stages and static asset COPY paths unchanged
- Verified WebSocket endpoints /ws/player/{room_code} and /ws/spectator/{room_code} with 101 responses
- cargo test --test protocol_roundtrip: 18/18 passed

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Dockerfile with Rust build stage and Debian final image** - `0e21f14` (feat)

**Deviation fix (main branch):** `8108b91` (fix) — Axum 0.8 path syntax correction

## Files Created/Modified
- `Dockerfile` - Added engine-builder stage (rust:1.86-slim), replaced python:3.11-slim final stage with debian:bookworm-slim; CMD switches from `python main.py` to `./engine-core`
- `engine/engine-core/src/main.rs` - Fixed route path syntax from `:room_code` to `{room_code}` for Axum 0.8 compatibility

## Decisions Made
- Used `rust:1.86-slim` (Debian bookworm) paired with `debian:bookworm-slim` final stage — same glibc, no exec format errors. `rust:alpine` was explicitly rejected (musl vs glibc mismatch, Pitfall 5 from research).
- Dummy `main.rs` layer caching pattern: copy Cargo.toml files, generate placeholder binary to cache dependency downloads, then copy real source and touch to trigger rebuild. This keeps Docker layer cache warm across source-only changes.
- Python server files (`server/`, `requirements.txt`) are not copied into the final image. The Python server remains at `server/` for local development reference only (D-02 decision).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Axum 0.8 path parameter syntax requires `{room_code}` not `:room_code`**
- **Found during:** Checkpoint verification (human-verify) — WebSocket connections were refused with routing errors at runtime
- **Issue:** Axum 0.7 used Express-style colon syntax (`:room_code`); Axum 0.8 changed to curly-brace syntax (`{room_code}`). The plan's task action used the old syntax, which compiled without error but silently failed to match routes at runtime.
- **Fix:** Changed both routes in `engine/engine-core/src/main.rs`:
  - `/ws/player/:room_code` → `/ws/player/{room_code}`
  - `/ws/spectator/:room_code` → `/ws/spectator/{room_code}`
- **Files modified:** `engine/engine-core/src/main.rs`
- **Verification:** `wscat -c ws://localhost:8000/ws/player/TESTROOM` → 101 Switching Protocols; `wscat -c ws://localhost:8000/ws/spectator/TESTROOM` → 101 Switching Protocols
- **Committed in:** `8108b91` — committed directly on main branch after worktree merge

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was required for WebSocket routing to function. No scope creep. The Axum 0.8 curly-brace pattern is now established for all future plans.

## Issues Encountered
- The Axum 0.8 path syntax change is a silent API breakage — routes compile correctly with `:param` syntax but no request ever matches. The fix was discovered during the human-verify checkpoint when WebSocket connections were tested end-to-end. Future plans creating new Axum routes must use `{param}` syntax.

## User Setup Required
None - no external service configuration required. The Dockerfile switch from Python to Rust is transparent to Railway (railway.toml `build.builder = "DOCKERFILE"` unchanged).

## Next Phase Readiness
- Phase 1 cutover complete: Rust engine-core binary is the production artifact
- Dockerfile verified locally; Docker build not tested in CI yet (Railway will build on push)
- `cargo test --test protocol_roundtrip` passes 18/18 — protocol contract is solid
- Phase 2 (mobile UI, overlay UI) can reference the WebSocket endpoints `/ws/player/{room_code}` and `/ws/spectator/{room_code}` — these are now confirmed live

---
*Phase: 01-engine-core*
*Completed: 2026-05-02*
