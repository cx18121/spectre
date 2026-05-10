---
status: testing
phase: 04-lobby-ux
source: [04-VERIFICATION.md]
started: 2026-05-05T00:00:00Z
updated: 2026-05-05T00:00:00Z
---

## Current Test

number: 1
name: Game picker selection enables Create Room
expected: |
  Click BOXING tile → tile gains crimson border/background; Create Room button changes from `opacity: 0.5; pointer-events: none` to fully clickable with accent border. Same for DANCE (steel-blue accent).
awaiting: user response

## Tests

### 1. Game picker selection enables Create Room
expected: Click BOXING tile → tile gains crimson border/background; Create Room button changes from `opacity: 0.5; pointer-events: none` to fully clickable with accent border. Same for DANCE (steel-blue accent).
result: [pending]

### 2. Create Room flow navigates to /rooms/{code}
expected: After selecting a game, click Create Room → button shows `Creating...` → browser navigates to `/rooms/XXXXXX`; page shows room code prominently, game type badge, subtitle, and three QR cards (P1 crimson, P2 steel, Overlay gold).
result: [pending]

### 3. Physical QR scan prefills mobile app
expected: Scan the P1 QR code on a phone → mobile app opens with server, room, and slot=1 pre-populated; player connects without typing. P2 prefills slot=2. Overlay prefills server+room only.
result: [pending]

### 4. Guest join flow navigates to /mobile
expected: On landing page, type a 6-char code in the Join field (auto-uppercases as typed) → click Join Room → browser navigates to `/mobile?room=ABC123&server={origin}`. Join Room button disabled when input is empty.
result: [pending]

### 5. Room page responsive collapse
expected: At viewport <600px the QR card grid collapses from 3 columns to 1 column; all cards still readable; touch targets remain ≥44px.
result: [pending]

### 6. Copy Link clipboard feedback
expected: Click Copy Link on any QR card → `navigator.clipboard.writeText` fires (URL on clipboard); button text changes to `Copied!` with gold border; reverts to `Copy Link` after ~2 seconds.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
