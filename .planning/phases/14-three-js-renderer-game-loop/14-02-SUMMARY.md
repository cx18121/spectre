---
phase: 14-three-js-renderer-game-loop
plan: 02
subsystem: fps-renderer
tags: [spring-physics, guard-detection, opponent-lerp, game-loop, fps-boxing]
dependency_graph:
  requires: [14-01, 14-01b]
  provides:
    - fps/src/lib/springPhysics.ts (SpringState, stepSpring semi-implicit Euler)
    - fps/src/lib/guardDetection.ts (isGuardPose, GuardState, updateGuard hysteresis)
    - guardStateRef exposed from useGameRenderer return value for Plan 14-04
  affects:
    - fps/src/hooks/useGameRenderer.ts (spring extension, opponent lerp, guard detection)
    - fps/src/components/GameRenderer.tsx (updated to consume new return type)
tech_stack:
  added: []
  patterns:
    - semi-implicit Euler spring integrator (velocity updated before position)
    - exponential lerp for frame-rate-independent opponent arm smoothing (lambda=12)
    - hysteresis gate for guard pose activation (ENTER_FRAMES=3, EXIT_FRAMES=5)
    - rolling 5-frame keypoint buffer for wrist peak speed computation
key_files:
  created:
    - fps/src/lib/springPhysics.ts
    - fps/src/lib/guardDetection.ts
  modified:
    - fps/src/hooks/useGameRenderer.ts
    - fps/src/components/GameRenderer.tsx
decisions:
  - "Spring target mapped as peakSpeed / 4.0 clamped to [0, 1] — speed 4 m/s = full extension; tune 4.0 against live webcam"
  - "Forearm scale.z = 1.0 + spring.pos * 0.4 — 40% max Z-axis stretch at full extension"
  - "Guard comparison uses raw MediaPipe keypoints (positive-down Y): shoulder.y - wrist.y > 0.05 means wrist raised above shoulder"
  - "opponentCurrentRef initialized to origin Vector3s and lerped each frame; opponentTargetRef updated only when new MsgFpsState arrives"
  - "GameRenderer.tsx prefixes guardStateRef with _ to suppress unused-variable linting while exposing the API for Plan 14-04"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-15T05:09:15Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 14 Plan 02: Spring Physics + Guard Detection + Opponent Lerp Summary

Semi-implicit Euler spring integrator and guard detection with hysteresis added as pure library modules; `useGameRenderer` wired with forearm Z-stretch driven by wrist peak speed, frame-rate-independent exponential opponent arm lerp (lambda=12), and per-frame guard detection exposing `guardStateRef` for Plan 14-04 damage reduction.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create springPhysics.ts and guardDetection.ts pure utility modules | a585cba |
| 2 | Wire spring extension, opponent lerp, guard detection into useGameRenderer | 87c569f |

## What Was Built

**Task 1 — Pure Utility Modules:**
- `springPhysics.ts`: `SpringState { pos, vel }` + `stepSpring()` semi-implicit Euler (velocity updated before position). stiffness=300, damping=18 → under-damped ζ≈0.52. T-14-02-02: NaN guards on target and state.pos to prevent divergence.
- `guardDetection.ts`: `isGuardPose()` checks both wrists above both shoulders using raw MediaPipe Y (positive-down): `shoulder.y - wrist.y > 0.05`. `updateGuard()` hysteresis: ENTER_FRAMES=3 (activate), EXIT_FRAMES=5 (deactivate), consecutive counter reset on direction change.

**Task 2 — useGameRenderer Integration:**
- `springStateRef`: `{ left: { pos: 0, vel: 0 }, right: { pos: 0, vel: 0 } }` — one spring per arm.
- `frameBufferRef`: rolling 5-frame `TimedFrame[]` buffer populated each frame from current keypoints; drives `computeWristPeakSpeed()`.
- Spring extension: `peakSpeed / 4.0` → target, `stepSpring()` called per arm, `forearm.scale.z = 1.0 + spring.pos * 0.4`. Fast punches overshoot and spring back.
- `opponentTargetRef` / `opponentCurrentRef`: targets updated from each `MsgFpsState`; current lerped toward target each frame with `alpha = 1 - Math.exp(-12 * dt)`. Opponent arms animate smoothly between 30Hz server ticks.
- Guard detection: `isGuardPose(keypoints)` + `updateGuard(guardStateRef.current, rawGuard)` called every tick. `guardStateRef` returned from hook.
- Return type changed from `void` to `{ guardStateRef: React.MutableRefObject<GuardState> }`.
- `GameRenderer.tsx`: destructures `guardStateRef` as `_guardStateRef` (unused in this plan, ready for Plan 14-04).
- T-14-02-04: `frameBufferRef.current = []` on unmount cleanup.

## Deviations from Plan

None — plan executed exactly as written. Pre-existing `useCalibration.test.ts` TS2345 errors cause `tsc -b` to fail; this is documented as out-of-scope in 14-01-SUMMARY.md. `npx vite build` exits 0.

## Known Stubs

- `peakSpeed / 4.0` speed→target mapping — 4.0 m/s threshold needs tuning against live webcam feel.
- `forearm.scale.z = 1.0 + spring.pos * 0.4` — 40% stretch scale factor needs tuning against live webcam.
- `anchorOffset = (0, -0.25*WORLD_SCALE, -0.4*WORLD_SCALE)` — inherited [ASSUMED A4] stub from Plan 14-01; tune against live webcam.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-14-02-02 | stepSpring NaN guard: `if (!isFinite(target)) return`; `if (!isFinite(state.pos)) { state.pos = 0; state.vel = 0; }` |
| T-14-02-04 | frameBufferRef cleared on useEffect cleanup (unmount) |
| T-14-02-01 | Accepted — opponent arm positions are visual only, no game logic impact |
| T-14-02-03 | Accepted — guardStateRef is client-side cosmetic; server is authoritative for damage |

## Self-Check: PASSED

Files created:
- fps/src/lib/springPhysics.ts: FOUND
- fps/src/lib/guardDetection.ts: FOUND

Files modified:
- fps/src/hooks/useGameRenderer.ts: FOUND
- fps/src/components/GameRenderer.tsx: FOUND

Commits:
- a585cba: FOUND (Task 1)
- 87c569f: FOUND (Task 2)

Build: `npx vite build` exits 0, 36+ modules transformed.
