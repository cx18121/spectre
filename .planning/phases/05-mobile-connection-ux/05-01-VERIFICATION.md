---
phase: 05-mobile-connection-ux
verified: 2026-05-09T00:00:00Z
status: verified
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "QR-scan simulation: open /mobile?server=ws://localhost:3000&room=ABC123&slot=1&game=boxing in a browser"
    expected: "Fast-join view shows 'BOXING · ROOM ABC123 · PLAYER 1' and a 'Join game' button with no form fields (no server URL, no room code input, no slot radio buttons)"
    why_human: "Requires a running browser — cannot verify DOM rendering or layout with grep/static analysis"
  - test: "Tap 'Enter manually' from the fast-join view"
    expected: "Full form expands in-place with all fields visible including the server URL field; no way to collapse back to fast-join view"
    why_human: "Requires interactive browser — showManual state toggle and form appearance cannot be verified programmatically"
  - test: "Connect with an incorrect room code from the fast-join view; expect close code 4004 from server"
    expected: "Error banner shows 'Room ABC123 not found. Check the code or ask the host.' with NO Retry button"
    why_human: "Requires a live server to trigger close code 4004"
  - test: "Connect to an unreachable server from the fast-join view"
    expected: "Error banner shows 'Can't reach the server. Check your connection and try again.' WITH a Retry button that re-attempts connect when tapped"
    why_human: "Requires live network to trigger the WebSocket error event and verify the Retry button fires socket.connect via connectionArgsRef"
  - test: "Open /mobile with no URL params"
    expected: "Full connection form shown immediately — no fast-join view, all fields visible including server URL"
    why_human: "Requires a browser to confirm no fast-join branch rendered when allParamsPrefilled=false"
  - test: "Open /mobile?server=ws://host&room=ABC123 (no slot param)"
    expected: "Full form shown (not fast-join) because slotParam is absent — allParamsPrefilled=false"
    why_human: "Requires a browser to confirm partial-prefill falls through to full form"
---

# Phase 5: Mobile Connection UX Verification Report

**Phase Goal:** Fast-join (QR-linked one-tap screen); hide technical server URL field when params are prefilled; better error messages
**Verified:** 2026-05-09T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scanning a QR code opens a screen showing the game type, room code, and player number with a single 'Join game' button — no form fields visible | VERIFIED | `ConnectionScreen.tsx` lines 43–78: early return when `fastJoin && !showManual` renders only `.fast-join-meta` paragraph (game type + room + player), a single `big-button fast-join-cta` "Join game" button, and "Enter manually" link — no `<input>`, no `<fieldset>`, no `<form>` |
| 2 | The raw server URL field and slot radio buttons are absent from the QR-linked flow | VERIFIED | Slot picker `<fieldset>` is at line 115 (full form branch). Fast-join branch returns early at line 78. Server URL `<input>` is guarded by `(!initialServerUrl \|\| showManual)` at line 88 — with QR params, `initialServerUrl` is non-empty and `showManual=false`, so the field is hidden |
| 3 | Tapping 'Enter manually' in-place reveals all fields (including server URL) and cannot be collapsed | VERIFIED (code) / HUMAN for visual | `setShowManual(true)` on "Enter manually" click causes re-render falling through to the full form; server URL shown because `showManual=true` satisfies `(!initialServerUrl \|\| showManual)`; no `setShowManual(false)` exists in the form, confirming it cannot collapse — visual confirmation needs human |
| 4 | A room-not-found error shows 'Room {CODE} not found. Check the code or ask the host.' — no retry button | VERIFIED | `useGameSocket.ts` line 285: `setErrorMessage(\`Room ${args.roomCode} not found. Check the code or ask the host.\`)` + `setErrorCode('room_not_found')`. `ConnectionScreen.tsx` retry button guarded by `errorCode === 'unreachable'` only — so no retry for `room_not_found` |
| 5 | A slot-taken error shows 'That slot is already taken. Ask the host to assign you a different player slot.' — no retry button | VERIFIED | `useGameSocket.ts` line 279: exact text confirmed. `setErrorCode('slot_taken')`. Retry button not shown (guard is `errorCode === 'unreachable'`) |
| 6 | A server-unreachable error shows 'Can't reach the server. Check your connection and try again.' and a Retry button that re-calls connect with cached args | VERIFIED | Two code paths: `ws.addEventListener('error', ...)` at line 266 and reconnect-exhausted at line 299 — both set same message + `errorCode('unreachable')`. `App.tsx` `handleRetry` (lines 70–74) reads `connectionArgsRef.current` and calls `socket.connect`. `ConnectionScreen.tsx` renders Retry button when `errorCode === 'unreachable'` and passes `onRetry` prop from `App.tsx` |
| 7 | QR codes for P1 and P2 encode URLs with ?game={type} so the fast-join screen can display game type | VERIFIED | `engine/engine-core/src/main.rs` lines 189–190: `format!("{}/mobile?server={}&room={}&slot=1&game={}", ..., game_type)` and `format!("{}/mobile?server={}&room={}&slot=2&game={}", ..., game_type)`. Overlay URL (line 191) unchanged |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `engine/engine-core/src/main.rs` | `?game={type}` appended to p1_url and p2_url | VERIFIED | Lines 189–190: `slot=1&game={}` and `slot=2&game={}` with ASCII-safe comment on line 188 |
| `mobile/src/hooks/useGameSocket.ts` | `errorCode` state + improved error copy | VERIFIED | Line 42: interface field. Line 107: `useState`. Lines 266, 279, 285, 299: all `setErrorCode` calls. Line 376: returned in hook result |
| `mobile/src/App.tsx` | `readInitialGame`, `allParamsPrefilled`, `connectionArgsRef`, `handleRetry` | VERIFIED | Line 29: `readInitialGame`. Line 46: `allParamsPrefilled`. Line 40: `connectionArgsRef`. Lines 70–74: `handleRetry` |
| `mobile/src/components/ConnectionScreen.tsx` | fast-join view, partial-prefill server-hide, error UX with retry | VERIFIED | Lines 43–78: fast-join branch. Line 88: server URL guard. Lines 65, 151: retry button condition |
| `mobile/src/app.css` | CSS classes for fast-join view, retry button, enter-manually link, animations | VERIFIED | Lines 174–272: `.fast-join-meta`, `.fast-join-cta` (hover/active/disabled), `.enter-manually` (hover), `.retry-button` (hover/active/disabled), `.fast-join-header`, `.form-reveal` — all 15 selector lines present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `App.tsx (allParamsPrefilled)` | `ConnectionScreen (fastJoin prop)` | JSX prop | VERIFIED | Line 112: `fastJoin={allParamsPrefilled}` |
| `useGameSocket.ts (errorCode state)` | `App.tsx → ConnectionScreen (errorCode prop)` | `socket.errorCode` | VERIFIED | Line 111: `errorCode={socket.errorCode}` |
| `ConnectionScreen.tsx (onRetry)` | `App.tsx (handleRetry → connectionArgsRef)` | `onRetry` prop callback | VERIFIED | Line 115: `onRetry={handleRetry}`; `handleRetry` reads `connectionArgsRef.current` at line 71 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ConnectionScreen.tsx` fast-join meta | `initialRoomCode`, `initialSlot`, `gameType` | URL params via `readInitialRoomCode`, `readInitialSlot`, `readInitialGame` in `App.tsx` | Yes — reads from `window.location.search` directly | FLOWING |
| `ConnectionScreen.tsx` error banner | `errorMessage`, `errorCode` | WebSocket close/error events in `useGameSocket.ts` | Yes — set by live WS event handlers | FLOWING |
| `App.tsx handleRetry` | `connectionArgsRef.current` | Written by `handleConnect` on every connect call (line 63) | Yes — cached from real connect call | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires a running browser and/or live WebSocket server. The key behaviors (fast-join DOM, error message display, retry trigger) are interactive and cannot be spot-checked with static CLI commands. Routed to Human Verification (Step 8).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MOBILE-01 | 05-01-PLAN.md | QR-linked one-tap join screen instead of full form | SATISFIED | `fastJoin` prop gates fast-join view; `allParamsPrefilled` derives from all 3 URL params present |
| MOBILE-02 | 05-01-PLAN.md | Server URL field hidden when params present; "Enter manually" reveals it | SATISFIED | Server URL `<input>` wrapped in `(!initialServerUrl \|\| showManual)` guard |
| MOBILE-03 | 05-01-PLAN.md | Distinct errors for room-not-found, server-unreachable, slot-taken | SATISFIED | Three distinct `setErrorMessage` + `setErrorCode` paths in `useGameSocket.ts` |

No orphaned requirements: REQUIREMENTS.md maps MOBILE-01, MOBILE-02, MOBILE-03 exclusively to Phase 5. All three are claimed and implemented by 05-01-PLAN.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `mobile/src/components/ConnectionScreen.tsx` | 97, 110 | `placeholder="ws://..."` and `placeholder="ABC123"` | Info | HTML input placeholder attributes — expected UX copy, not implementation stubs |
| `engine/engine-core/src/main.rs` | 160 | `"QR encoding failed..."` error placeholder string | Info | Error-path log message for QR encoding failure — appropriate error handling, not a stub |

No implementation stubs, `return null`, or hardcoded empty data arrays found in any Phase 5 modified file. All data flows are live (URL params, WebSocket events).

### Human Verification Required

#### 1. Fast-join view rendering

**Test:** Open `/mobile?server=ws://localhost:3000&room=ABC123&slot=1&game=boxing` in a mobile browser (or desktop in narrow viewport)
**Expected:** Screen shows "BOXING · ROOM ABC123 · PLAYER 1" (styled `.fast-join-meta`), a "Join game" button, and "Enter manually" text below — no text inputs, no fieldset, no form visible
**Why human:** DOM rendering and CSS layout cannot be verified by static analysis

#### 2. Enter manually toggle (non-reversible)

**Test:** From the fast-join view above, tap "Enter manually"
**Expected:** Full form appears in-place with all three fields visible: server URL input (pre-filled with the ws:// URL), room code input, and Player 1/Player 2 radio buttons. No way to return to fast-join view (no back/collapse button).
**Why human:** Requires interactive state change in a live browser

#### 3. Room-not-found error (no Retry)

**Test:** From the fast-join view with an invalid room code (e.g. `?room=XXXXXX`), tap "Join game"
**Expected:** Error banner appears: "Room XXXXXX not found. Check the code or ask the host." — NO Retry button visible
**Why human:** Requires a live server to send WebSocket close code 4004

#### 4. Server-unreachable error with Retry button

**Test:** From the fast-join view pointing at a server that is not running, tap "Join game"
**Expected:** Error banner appears: "Can't reach the server. Check your connection and try again." — WITH a "RETRY" button. Tapping Retry attempts reconnect without re-entering the form.
**Why human:** Requires a network condition (server down) to trigger `ws.addEventListener('error', ...)` path

#### 5. Bare open (no params) shows full form

**Test:** Open `/mobile` with no query params
**Expected:** Full connection form shown immediately — all fields visible including server URL, room code, and slot picker. No fast-join view.
**Why human:** Requires browser to confirm `allParamsPrefilled=false` branches correctly

#### 6. Partial-prefill falls through to full form

**Test:** Open `/mobile?server=ws://host&room=ABC123` (slot param absent)
**Expected:** Full form shown — `allParamsPrefilled` is false because `slotParam` is null, so no fast-join view
**Why human:** Requires browser DOM inspection

### Gaps Summary

No gaps found. All 7 must-have truths are VERIFIED by static code analysis. All 5 required artifacts exist, are substantive, wired, and carry real data. All 3 key links are verified. Requirement coverage is complete (MOBILE-01, MOBILE-02, MOBILE-03). No blocking anti-patterns detected.

The 6 human verification items are standard interactive/browser-dependent checks that cannot be resolved programmatically — they do not indicate missing implementation, only that final confirmation requires a running browser.

---

_Verified: 2026-05-09T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
