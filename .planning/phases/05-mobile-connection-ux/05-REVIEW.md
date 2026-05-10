---
phase: 05-mobile-connection-ux
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - engine/engine-core/src/main.rs
  - mobile/src/hooks/useGameSocket.ts
  - mobile/src/App.tsx
  - mobile/src/components/ConnectionScreen.tsx
  - mobile/src/app.css
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase implements the fast-join mobile connection UX: QR-code-driven deep-links that pre-fill server URL, room code, slot, and game type so the player taps a single button instead of typing. The engine-side changes add HTML-escaped URL generation, an inline-SVG QR card system, and `ws_url_from_http`/`public_base_url` helpers. The mobile side adds `fastJoin` mode to `ConnectionScreen`, `normalizeWsUrl`/`normalizeHttpUrl` helpers in `useGameSocket`, and CSS for the new fast-join view.

Two blockers exist. First, the `playAgain` function calls a `/rooms/:code/rematch` endpoint that is never registered in `build_app`, so it always silently 404s. Second, the server never sends WebSocket close codes 4000 or 4004 when a slot is occupied or a room is missing, meaning the client's entire slot-taken and room-not-found error UX is unreachable dead code. Four warnings cover: unhandled `clipboard.writeText` rejection, stale `errorCode` state not cleared on reconnect, `safe-area-inset` argument order swap, and `roundNumber` not reset on `disconnect`. Three info items cover dead CSS classes, a magic number, and `isSolo` computed on every render.

---

## Critical Issues

### CR-01: `playAgain` calls a non-existent `/rooms/:code/rematch` endpoint

**File:** `mobile/src/hooks/useGameSocket.ts:314`

**Issue:** `playAgain` issues `POST /rooms/${encodeURIComponent(args.roomCode)}/rematch`. Searching `build_app` in `main.rs` shows only five routes: `GET /`, `POST /rooms`, `GET /rooms/{code}`, `GET /ws/player/{room_code}`, `GET /ws/spectator/{room_code}`. There is no `/rooms/{code}/rematch` route. The `fetch` call will receive a 404, but because neither the `ok` check nor `.catch` handling is present in `playAgain`, the failure is silently swallowed. Players who tap "Play Again" after a match ends receive no feedback and nothing happens.

**Fix:** Either register the route in the engine:

```rust
// in build_app:
.route("/rooms/{code}/rematch", post(rematch_room))
```

Or, if the rematch is meant to be a client-side reconnection flow (re-`connect()` with the same args), remove the fetch call entirely and drive the transition through the existing WebSocket join:

```typescript
const playAgain = useCallback(async () => {
  const args = connectionArgsRef.current;
  if (!args) return;
  // Reset relevant state, then reconnect
  setMatchEnd(null);
  setLastRoundEnd(null);
  setRoundNumber(1);
  open(); // re-uses connectionArgsRef
}, [open]);
```

---

### CR-02: Close codes 4000 and 4004 are never emitted by the server — slot-taken and room-not-found error paths are permanently unreachable

**File:** `mobile/src/hooks/useGameSocket.ts:277-287` / `engine/engine-core/src/main.rs:507-513`

**Issue:** The client's `close` handler branches on `ev.code === 4000` (slot taken) and `ev.code === 4004` (room not found). In `handle_player`, when a slot is already occupied the server does `return` (line 511), which drops the connection with the WebSocket default close code 1006 (abnormal closure) or 1000. It never calls `ws_sink.close(CloseCode::Policy, ...)` with code 4000. Similarly, a missing room causes an early `return` at line 488 — again with no custom close code. The `errorCode: 'slot_taken'` and `errorCode: 'room_not_found'` states are therefore unreachable. Both failure cases fall through to the generic auto-reconnect branch, so the player retries up to five times before seeing the generic "Can't reach the server" message, with no actionable guidance.

**Fix:** Send a custom close frame from the server before returning in each error path:

```rust
// Slot occupied — in handle_player after Ok(None) reply:
let _ = ws_sink.send(Message::Close(Some(axum::extract::ws::CloseFrame {
    code: axum::extract::ws::close_code::POLICY,  // 1008; or use 4000 via Custom(4000)
    reason: "slot taken".into(),
}))).await;
return;

// Room not found — after get_cmd_tx returns None:
let _ = ws_sink.send(Message::Close(Some(axum::extract::ws::CloseFrame {
    code: 4004.into(),
    reason: "room not found".into(),
}))).await;
return;
```

Note: `ws_sink` is not available at the early-return sites before `socket.split()` is called. Refactor so the socket is split before the room/slot lookups, or use the close-before-upgrade pattern (reject the upgrade with an HTTP 404 response from the handler instead).

---

## Warnings

### WR-01: `navigator.clipboard.writeText` rejection is unhandled — silent failure on HTTP or non-focused tab

**File:** `engine/engine-core/src/main.rs:306-315`

**Issue:** `navigator.clipboard.writeText(url).then(...)` has no `.catch()` handler. The Clipboard API requires a secure context (HTTPS or localhost) and a focused/visible page. On an HTTP deployment or when the tab is backgrounded, the Promise rejects and the button text never resets from its default — the user gets no feedback that the copy failed. The error is also unobserved, which triggers an unhandled promise rejection warning in DevTools.

**Fix:**

```javascript
navigator.clipboard.writeText(url).then(function() {
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(function() {
    btn.textContent = 'Copy Link';
    btn.classList.remove('copied');
  }, 2000);
}).catch(function() {
  btn.textContent = 'Failed';
  setTimeout(function() { btn.textContent = 'Copy Link'; }, 2000);
});
```

---

### WR-02: `errorCode` and `errorMessage` not cleared on `disconnect()` — stale error survives reconnect

**File:** `mobile/src/hooks/useGameSocket.ts:326-349`

**Issue:** `disconnect()` resets status, phase, lastHit, opponentConnected, assignedSlot, rttMs, highLatency, matchEnd, lastRoundEnd, and rttSamples — but not `errorMessage` or `errorCode`. If a player hits an error (e.g. "That slot is already taken"), then the parent calls `disconnect()` followed by `connect()` with different args, the error banner remains visible during and after the new connection attempt until the server's `joined` message arrives. The comment in `open()` at line 229 does clear these, so they are eventually cleared when a new `open()` fires, but `disconnect()` itself leaves the UI in an inconsistent state (error banner shown, status `disconnected`).

**Fix:**

```typescript
const disconnect = useCallback(() => {
  intentionalCloseRef.current = true;
  clearTimers();
  // ... existing timer cleanup ...
  setStatus('disconnected');
  setPhase('lobby');
  setErrorMessage(null);   // add
  setErrorCode(null);      // add
  setLastHit(null);
  // ... rest unchanged ...
}, []);
```

---

### WR-03: `safe-area-inset` arguments swapped in `.connection-screen` padding

**File:** `mobile/src/app.css:37`

**Issue:** The padding declaration is:
```css
padding: 24px max(24px, env(safe-area-inset-left)) 24px max(24px, env(safe-area-inset-right));
```
In the CSS `padding` shorthand with four values the order is `top right bottom left`. This places `safe-area-inset-left` on the **right** side and `safe-area-inset-right` on the **left** side. On a device with a notch or dynamic island (where `safe-area-inset-left` and `safe-area-inset-right` can differ, e.g. landscape-adjacent orientations, or future notch designs), the safe area will be applied to the wrong physical edge.

**Fix:**

```css
padding: 24px max(24px, env(safe-area-inset-right)) 24px max(24px, env(safe-area-inset-left));
```

---

### WR-04: `roundNumber` not reset in `disconnect()` — stale round number shown after reconnect

**File:** `mobile/src/hooks/useGameSocket.ts:326-349`

**Issue:** `disconnect()` does not call `setRoundNumber(1)`. If a match ends at round 3, the player disconnects (or the component dismounts and remounts), and they reconnect to a new room, the game screen will display "Round 3" until the server sends a `round_start` message. The `calibration_start` handler (line 178) does reset `roundNumber`, so the problem only manifests in the window between reconnect and the first server-driven round reset.

**Fix:** Add `setRoundNumber(1)` to `disconnect()`:

```typescript
setMatchEnd(null);
setLastRoundEnd(null);
setRoundNumber(1);   // add this line
rttSamplesRef.current = [];
```

---

## Info

### IN-01: Dead CSS classes — `.fast-join-header`, `.form-reveal` — defined but never applied in JSX

**File:** `mobile/src/app.css:258-273`

**Issue:** `.fast-join-header`, `.fast-join-header.hidden`, `.form-reveal`, and `.form-reveal.visible` define a transition animation system (opacity + transform). No element in `ConnectionScreen.tsx` uses these class names. The fast-join view instead does a conditional render (`if (fastJoin && !showManual) return ...`) with no animation applied. These rules are dead code — they add maintenance burden without effect.

**Fix:** Remove the dead CSS rules, or wire them up if the animation was intended (apply `.fast-join-header` to the header wrapper and `.form-reveal` to the form container, toggling `.hidden`/`.visible` based on `showManual`).

---

### IN-02: `isSolo` computed outside hooks on every render

**File:** `mobile/src/App.tsx:38`

**Issue:**
```tsx
const isSolo = new URLSearchParams(window.location.search).get('solo') === '1';
```
This constructs a `URLSearchParams` object on every render. `window.location.search` is stable for the lifetime of the SPA (no router), so this never changes. Compare with `readInitialServerUrl`/`readInitialRoomCode` which are passed as lazy initialisers to `useState` (called once).

**Fix:** Lift to a constant outside the component, or use the same lazy-useState pattern as the other params:
```tsx
const [isSolo] = useState(() =>
  new URLSearchParams(window.location.search).get('solo') === '1'
);
```

---

### IN-03: Magic number `2000` for clipboard reset delay matches `HIT_FLASH_MS` coincidentally

**File:** `engine/engine-core/src/main.rs:309`

**Issue:** The `setTimeout(..., 2000)` for the "Copied!" → "Copy Link" button reset is an inline magic number. While 2000 ms is a reasonable value, it is embedded in the HTML string template with no named constant or comment explaining the intent. If the delay needs adjustment later it requires searching inside a string literal.

**Fix:** Add a comment:
```javascript
}, 2000); // 2 s — long enough to read, short enough to re-copy
```
Or hoist to a `var COPY_RESET_MS = 2000;` at the top of the script block.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
