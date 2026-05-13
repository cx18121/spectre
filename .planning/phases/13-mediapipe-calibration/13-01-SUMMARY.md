---
phase: 13-mediapipe-calibration
plan: "01"
subsystem: fps/hooks
tags: [mediapipe, pose-detection, one-euro-filter, smoothing, web-worker, tdd]
dependency_graph:
  requires:
    - "fps/src/workers/pose.worker.ts (Phase 12 — no changes)"
    - "fps/src/hooks/useWarmup.ts (Phase 12 — provides workerRef)"
    - "shared/protocol.ts (PoseKeypoint type)"
  provides:
    - "fps/src/hooks/usePose.ts — detection loop hook accepting pre-warmed workerRef"
    - "fps/src/hooks/useOneEuroFilter.ts — OneEuroFilter wrapper for PoseKeypoint smoothing"
  affects:
    - "Plan 13-02+ (calibration hook will import usePose and useOneEuroFilter)"
tech_stack:
  added:
    - "1eurofilter@1.3.0 — OneEuroFilter npm package (runtime dependency)"
  patterns:
    - "rAF/rVFC capture loop with OffscreenCanvas zero-copy bitmap transfer"
    - "workerBusyRef backpressure — skips frames while worker is processing"
    - "useRef-based stateful filter map (lazy-init per landmark axis)"
key_files:
  created:
    - fps/src/hooks/usePose.ts
    - fps/src/hooks/usePose.test.ts
    - fps/src/hooks/useOneEuroFilter.ts
    - fps/src/hooks/useOneEuroFilter.test.ts
  modified:
    - fps/package.json
    - fps/package-lock.json
decisions:
  - "usePose accepts workerRef as third parameter (not spawning its own Worker) to reuse the pre-warmed PoseLandmarker from useWarmup"
  - "supportsOffscreen() is a function (not a const) so test stubs applied after module import are picked up"
  - "GPU timing warn threshold is 25ms rolling average over 10 samples to avoid false positives from single-frame spikes"
  - "useOneEuroFilter uses lazy-init per filter key (not 99 pre-allocated instances) for cleaner code and same behavior"
metrics:
  duration: "~18 minutes"
  completed: "2026-05-13T15:43:30Z"
  tasks_completed: 3
  files_created: 4
  files_modified: 2
---

# Phase 13 Plan 01: usePose and useOneEuroFilter hooks Summary

**One-liner:** Off-thread pose detection hook (usePose) accepting pre-warmed workerRef + OneEuroFilter smoothing hook with 99 stateful filter instances stored in useRef.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Install 1eurofilter package | 21f4ced | fps/package.json |
| 2 RED | usePose failing tests | d05f789 | fps/src/hooks/usePose.test.ts |
| 2 GREEN | usePose implementation | dd5b228 | fps/src/hooks/usePose.ts, usePose.test.ts |
| 3 RED | useOneEuroFilter failing tests | 47789cb | fps/src/hooks/useOneEuroFilter.test.ts |
| 3 GREEN | useOneEuroFilter implementation | 2eb5b7e | fps/src/hooks/useOneEuroFilter.ts |

## Test Results

- usePose: 6/6 tests pass
- useOneEuroFilter: 6/6 tests pass
- Full fps/ suite: 45/45 tests pass (33 prior + 12 new)
- `npm run build` exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] supportsOffscreen must be a function, not a module-level const**
- **Found during:** Task 2 GREEN
- **Issue:** The plan shows `const supportsOffscreen = typeof OffscreenCanvas !== 'undefined'` at module level. When Vitest loads the module before test stubs are applied, this const evaluates to `false`, causing the rAF loop to never call `postMessage`. Tests 2, 4, and 6 failed with `detectCalls.length === 0`.
- **Fix:** Changed to `function supportsOffscreen() { return typeof OffscreenCanvas !== 'undefined'; }` so the check runs at frame time after test stubs are in place.
- **Files modified:** fps/src/hooks/usePose.ts
- **Commit:** dd5b228

**2. [Rule 1 - Bug] Test file uses ESM import instead of require()**
- **Found during:** Task 2 RED
- **Issue:** The plan template used `require('./usePose')` inside renderHook callbacks. Vitest with ESM modules does not support CJS require() for local TS modules. Tests all failed with "Cannot find module './usePose'".
- **Fix:** Changed test imports to standard ESM `import { usePose } from './usePose'` at the top of the file.
- **Files modified:** fps/src/hooks/usePose.test.ts
- **Commit:** dd5b228 (updated test in the same GREEN commit)

## TDD Gate Compliance

- RED commit (test(13-01): add failing tests for usePose): d05f789 — PASS
- GREEN commit (feat(13-01): implement usePose hook): dd5b228 — PASS
- RED commit (test(13-01): add failing tests for useOneEuroFilter): 47789cb — PASS
- GREEN commit (feat(13-01): implement useOneEuroFilter hook): 2eb5b7e — PASS

## Known Stubs

None — both hooks are fully wired. usePose posts to the real workerRef and exposes real React state. useOneEuroFilter applies real filter math from the 1eurofilter package.

## Threat Surface Scan

No new threat surface beyond what the plan's threat model covers. Both hooks operate entirely on the main thread reading from and writing to React state. No new network endpoints, auth paths, or file access patterns introduced.

## Self-Check: PASSED

All 5 key files exist. All 5 commits verified in git history. 45/45 tests pass. Build exits 0.
