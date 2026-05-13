---
phase: 12-fps-client-scaffold
plan: "02"
subsystem: fps-client
tags: [react, typescript, camera, getUserMedia, permission, vitest]
dependency_graph:
  requires: ["12-01"]
  provides: ["PermissionScreen component", "screen router with permission→warmup transition"]
  affects: ["fps/src/App.tsx", "fps/src/components/PermissionScreen.tsx"]
tech_stack:
  added: []
  patterns: ["getUserMedia on user gesture", "React state screen router", "vitest jsdom component tests"]
key_files:
  created:
    - fps/src/components/PermissionScreen.tsx
    - fps/src/components/PermissionScreen.test.tsx
  modified:
    - fps/src/App.tsx
    - fps/vite.config.ts
decisions:
  - "getUserMedia called only inside button click handler to satisfy browser user-gesture requirement and LBY-03"
  - "vite.config.ts test field uses jsdom environment for component testing"
  - "App.tsx holds cameraStream in state so future screens can access the MediaStream"
metrics:
  duration: "75s"
  completed: "2026-05-13"
  tasks_completed: 2
  files_changed: 4
---

# Phase 12 Plan 02: PermissionScreen Component Summary

**One-liner:** PermissionScreen with getUserMedia on button click, full error handling, and 7 passing vitest tests; App.tsx updated with permission→warmup screen router.

## What Was Built

- `PermissionScreen.tsx`: React component that shows camera-access explanation copy and a CTA button. Calls `getUserMedia` only on button click (never on mount). Handles `NotAllowedError`, `NotFoundError`, and generic `DOMException` with distinct user-readable messages. Shows "Requesting..." disabled button state while the promise is in flight.
- `PermissionScreen.test.tsx`: 7 vitest tests covering all behavioral cases with jsdom + `@testing-library/react`. Navigator.mediaDevices mocked with `vi.fn()`.
- `App.tsx`: Screen router with `AppScreen` union type (`permission | warmup | waiting | game`). `PermissionScreen` renders when `screen === 'permission'`; `handlePermissionGranted` advances to `'warmup'` and stores the `MediaStream` in state.
- `vite.config.ts`: Added `test: { environment: 'jsdom', globals: true }` to enable vitest component testing.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `1fb12e4` | RED | `test(12-02): add failing tests for PermissionScreen` |
| `c64627e` | GREEN | `feat(12-02): implement PermissionScreen component` |
| `29c1fe6` | feat | `feat(12-02): wire PermissionScreen into App.tsx screen router` |

## Test Results

```
Test Files  1 passed (1)
     Tests  7 passed (7)
```

All 7 tests pass. Build (`npm run build`) exits 0 with no TypeScript errors.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Coverage

| Threat | Mitigation Applied |
|--------|--------------------|
| T-12-02-01: getUserMedia without user gesture | Confirmed — `handleAllow` is only called from `onClick`, never from `useEffect` |
| T-12-02-02: MediaStream information disclosure | Accepted — stream held in React state, no video frames transmitted in Phase 12 |
| T-12-02-03: NotAllowedError DoS via retry loop | Accepted — error shown once, no retry loop |

## Self-Check: PASSED

- [x] `fps/src/components/PermissionScreen.tsx` exists
- [x] `fps/src/components/PermissionScreen.test.tsx` exists
- [x] `fps/src/App.tsx` updated with screen router
- [x] All 3 commits exist: `1fb12e4`, `c64627e`, `29c1fe6`
- [x] No STATE.md or ROADMAP.md modified
