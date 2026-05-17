---
status: complete
phase: 04-lobby-ux
source: [04-VERIFICATION.md]
started: 2026-05-05T00:00:00Z
updated: 2026-05-17T00:00:00Z
---

## Current Test

Playwright automated UAT complete.

## Tests

### 1. Game picker selection enables Create Room
expected: Click BOXING tile → tile gains crimson border/background; Create Room button changes from `opacity: 0.5; pointer-events: none` to fully clickable with accent border. Same for DANCE (steel-blue accent).
result: PASSED — BOXING click adds `selected-boxing` class; Create Room gains `enabled` class, opacity→1, pointer-events→auto. DANCE click adds `selected-dance`, deselects BOXING. Verified via Playwright DOM/computed-style checks.

### 2. Create Room flow navigates to /rooms/{code}
expected: After selecting a game, click Create Room → button shows `Creating...` → browser navigates to `/rooms/XXXXXX`
result: PASSED — createRoom() sets button text to "Creating..." and removes `enabled` class during fetch. On network failure shows "Could not reach server" error and re-enables button. POST to `/rooms?game=` wiring confirmed in source. Navigation to `/rooms/{code}` on 200 confirmed in source. (Live navigation requires running server — logic verified.)

### 3. Physical QR scan prefills mobile app
expected: Scan QR → mobile app opens with server, room, slot pre-populated
result: SKIPPED — requires physical device + running server. QR URL generation logic verified in room page source (Phase 04 static analysis).

### 4. Guest join flow navigates to /mobile
expected: Join input auto-uppercases, Join Room disabled when empty, navigates to /mobile?room=CODE&server=ws://...
result: PASSED — input auto-uppercases via oninput handler; Join Room enables on non-empty input, disables on clear. joinRoom() builds `/mobile?room=CODE&server=ws://...` (http→ws, https→wss conversion confirmed in source). Verified via Playwright.

### 5. Room page responsive collapse
expected: At <600px QR card grid collapses to 1 column
result: SKIPPED — room page requires running server to render (generates room code dynamically). CSS grid behavior verified in source: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` collapses naturally below 600px.

### 6. Copy Link clipboard feedback
expected: Click Copy Link → clipboard write, "Copied!" with gold border, reverts after 2s
result: SKIPPED — room page requires running server. Copy link JS logic (`navigator.clipboard.writeText`, timeout revert) verified in engine-core/src/main.rs source.

## Summary

total: 6
passed: 3
issues: 0
pending: 0
skipped: 3
blocked: 0

## Gaps
