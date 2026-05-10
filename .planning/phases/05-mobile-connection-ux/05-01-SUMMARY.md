---
phase: 05-mobile-connection-ux
plan: 01
subsystem: mobile-frontend
tags: [mobile, ux, react, rust, qr, fast-join, error-handling]
dependency_graph:
  requires: []
  provides:
    - fast-join view for QR-linked players
    - errorCode state in useGameSocket
    - server URL hiding when prefilled
    - Retry button for server-unreachable errors
  affects:
    - engine/engine-core/src/main.rs
    - mobile/src/hooks/useGameSocket.ts
    - mobile/src/App.tsx
    - mobile/src/components/ConnectionScreen.tsx
    - mobile/src/app.css
tech_stack:
  added: []
  patterns:
    - fast-join conditional render on allParamsPrefilled
    - errorCode parallel state alongside errorMessage
    - connectionArgsRef caching for retry without re-reading URL params
key_files:
  created: []
  modified:
    - engine/engine-core/src/main.rs
    - mobile/src/hooks/useGameSocket.ts
    - mobile/src/App.tsx
    - mobile/src/components/ConnectionScreen.tsx
    - mobile/src/app.css
decisions:
  - "errorCode as parallel state (not parsed from errorMessage string) — avoids fragile string matching at render time"
  - "connectionArgsRef in App.tsx (not inside useGameSocket) — App owns retry UX; hook owns connection logic"
  - "allParamsPrefilled computed at render from URLSearchParams — computed once from URL, not re-computed on state changes"
metrics:
  duration: ~8 minutes
  completed: "2026-05-10T01:19:33Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 5 Plan 01: Mobile Connection UX Summary

**One-liner:** QR-linked fast-join screen with one-tap join, server URL hiding, and three distinct error messages with Retry for server-unreachable.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ?game= to QR URLs in Rust room page handler | 9e20aee | engine/engine-core/src/main.rs |
| 2 | React fast-join view, server-hide, and error UX improvements | bc2b51f | mobile/src/hooks/useGameSocket.ts, mobile/src/App.tsx, mobile/src/components/ConnectionScreen.tsx, mobile/src/app.css |

## What Was Built

### Task 1: Rust QR URL update
In `engine/engine-core/src/main.rs`, the `room_page_html` function's P1 and P2 URL format strings now append `&game={game_type}`. This enables the mobile fast-join screen to display the game type (boxing/dance) without any additional server call. The overlay URL is unchanged — it has no fast-join screen.

### Task 2: React UX overhaul

**useGameSocket.ts:**
- Added `errorCode: 'unreachable' | 'room_not_found' | 'slot_taken' | null` to the `UseGameSocketResult` interface and as parallel state
- Replaced generic "Connection error" with "Can't reach the server. Check your connection and try again." + `errorCode: 'unreachable'`
- Replaced "Room is full." with "That slot is already taken. Ask the host to assign you a different player slot." + `errorCode: 'slot_taken'`
- Replaced "Room not found." with "Room {CODE} not found. Check the code or ask the host." + `errorCode: 'room_not_found'`
- Replaced "Could not reconnect." with the same unreachable message (reconnect-exhausted path)

**App.tsx:**
- Added `readInitialGame()` function for `?game=` URL param
- Added `gameType` state, `connectionArgsRef`, and `allParamsPrefilled` computation
- Extended `handleConnect` to cache args in `connectionArgsRef` for retry
- Added `handleRetry` useCallback that re-calls `socket.connect` with cached args
- Extended `<ConnectionScreen>` JSX with `errorCode`, `fastJoin`, `gameType`, `onRetry` props

**ConnectionScreen.tsx:**
- Extended props interface with `errorCode`, `fastJoin`, `gameType`, `onRetry`
- Added `showManual` local state for escape-hatch toggle
- Added fast-join conditional render (before main return): shows game type, room code, player number, and a single "Join game" button; "Enter manually" link toggles to full form
- Conditionally hides server URL field in full form when `initialServerUrl` is present (D-06/D-08)
- Extended both error banners (fast-join view and full form) with Retry button, shown only when `errorCode === 'unreachable'`

**app.css:**
- Added `.fast-join-meta`, `.fast-join-cta` (and hover/active/disabled states), `.enter-manually` (and hover), `.retry-button` (and hover/active/disabled states), `.fast-join-header`, `.form-reveal` — all using OKLCH design token variables

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired: game type from URL → display, error codes from socket state → UI, retry from cached args → socket.connect.

## Threat Flags

No new threat surface beyond what was analyzed in the plan's threat model:
- `?game=` is display-only, never sent to server (T-05-01)
- Room code in error message is non-sensitive (T-05-03)

## Self-Check: PASSED

All key files exist. Both task commits verified (9e20aee, bc2b51f). TypeScript and Rust builds pass with zero errors.
