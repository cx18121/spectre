---
phase: 12-fps-client-scaffold
plan: "04"
subsystem: fps-client
tags: [mediapipe, pose-worker, warmup, react, tdd, app-routing]
dependency_graph:
  requires:
    - "12-02: PermissionScreen"
    - "12-03: useGameSocket + WaitingScreen"
  provides:
    - "fps/src/workers/pose.worker.ts — MediaPipe pose worker (GPU→CPU fallback)"
    - "useWarmup hook — spawns worker on mount, status machine (idle→loading→ready/error)"
    - "WarmupScreen component — loading/error states driven by useWarmup"
    - "App.tsx final wiring — permission→warmup→waiting screen router"
  affects:
    - "fps/src/App.tsx"
    - "fps/src/hooks/useWarmup.ts"
    - "fps/src/components/WarmupScreen.tsx"
    - "fps/src/workers/pose.worker.ts"
tech_stack:
  added: []
  patterns:
    - "TDD: RED then GREEN commits for useWarmup (6 tests) and WarmupScreen (4 tests)"
    - "Worker kept alive across warmup→waiting transition — Phase 13 reuses initialized PoseLandmarker"
    - "useWarmup called unconditionally at App mount so worker loads before user grants permission"
key_files:
  created:
    - fps/src/workers/pose.worker.ts
    - fps/src/hooks/useWarmup.ts
    - fps/src/hooks/useWarmup.test.ts
    - fps/src/components/WarmupScreen.tsx
    - fps/src/components/WarmupScreen.test.tsx
  modified:
    - fps/src/App.tsx
decisions:
  - "Worker not terminated in useEffect cleanup — kept alive for Phase 13 PoseLandmarker reuse (WCI-03 requirement)"
  - "useWarmup called at App() mount level (not inside warmup conditional) so WASM pre-warms before permission prompt"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-13"
  tasks_completed: 2
  tests_added: 10
  files_created: 5
  files_modified: 1
---

# Phase 12 Plan 04: WarmupScreen + App.tsx Final Wiring Summary

**One-liner:** MediaPipe pose worker spawned on page load, blocks game start until WASM ready, full screen router permission→warmup→waiting wired with WebSocket connecting on warmup complete.

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | Copy pose.worker.ts + implement useWarmup | c901811 (RED), 73f01e5 (GREEN) | 6 |
| 2 | WarmupScreen + final App.tsx wiring | b58e114 (RED), a230260 (GREEN), 485ae22 (App) | 4 |

## Test Results

- **Total tests:** 33 pass, 0 fail (all fps/ tests)
- **Added this plan:** 10 tests (6 useWarmup + 4 WarmupScreen)
- **Build:** `npm run build` exits 0, no TypeScript errors

## Verification

```
No cleanup function — correct: worker stays alive     # useWarmup has no terminate in cleanup
useWarmup called at App() mount level (not in conditional)
All 3 screen imports present: PermissionScreen, WarmupScreen, WaitingScreen
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all screen transitions are wired with real logic.

## Threat Surface

T-12-04-02 (DoS via CDN unavailability) is mitigated: worker posts `{ type: 'error' }` on any init failure and WarmupScreen renders the error message to the user.

## Self-Check: PASSED

- fps/src/workers/pose.worker.ts: EXISTS
- fps/src/hooks/useWarmup.ts: EXISTS
- fps/src/hooks/useWarmup.test.ts: EXISTS
- fps/src/components/WarmupScreen.tsx: EXISTS
- fps/src/components/WarmupScreen.test.tsx: EXISTS
- fps/src/App.tsx: MODIFIED (full router wired)
- Commits c901811, 73f01e5, b58e114, a230260, 485ae22: EXIST
- All 33 tests pass, build clean
