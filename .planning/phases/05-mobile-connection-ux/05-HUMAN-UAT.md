---
status: partial
phase: 05-mobile-connection-ux
source: [05-01-VERIFICATION.md]
started: 2026-05-10T01:00:00Z
updated: 2026-05-10T01:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. QR-scan simulation — fast-join view renders correctly
expected: Open `/mobile?server=ws://localhost:3000&room=ABC123&slot=1&game=boxing` in a browser — fast-join view shows "BOXING · ROOM ABC123 · PLAYER 1" and a single "Join game" button with no form fields (no server URL input, no room code input, no slot radio buttons)
result: [pending]

### 2. "Enter manually" toggle reveals full form
expected: Tap "Enter manually" from fast-join view — full form expands in-place with all fields visible including the server URL field; no way to collapse back to fast-join view
result: [pending]

### 3. Room-not-found error — no Retry button
expected: Connect with an incorrect room code from fast-join view; expect close code 4004 from server — error banner shows "Room ABC123 not found. Check the code or ask the host." with NO Retry button
result: [pending]

### 4. Server-unreachable error — Retry button present and functional
expected: Connect to an unreachable server from fast-join view — error banner shows "Can't reach the server. Check your connection and try again." WITH a Retry button that re-attempts connect when tapped
result: [pending]

### 5. Bare /mobile — full form shown
expected: Open `/mobile` with no URL params — full connection form shown immediately, no fast-join view, all fields visible including server URL
result: [pending]

### 6. Partial-prefill — full form shown (not fast-join)
expected: Open `/mobile?server=ws://host&room=ABC123` (no slot param) — full form shown, not fast-join, because slotParam is absent and allParamsPrefilled=false
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
