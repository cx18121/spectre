# Phase 5: Mobile Connection UX — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 4 (3 modified + 1 CSS additions)
**Analogs found:** 4 / 4 (all files are being modified, not created — each file is its own analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `mobile/src/App.tsx` | component / orchestrator | request-response, event-driven | `mobile/src/App.tsx` (self — additive) | exact |
| `mobile/src/components/ConnectionScreen.tsx` | component | request-response | `mobile/src/components/ConnectionScreen.tsx` (self — additive) | exact |
| `mobile/src/hooks/useGameSocket.ts` | hook / service | event-driven (WebSocket) | `mobile/src/hooks/useGameSocket.ts` (self — additive) | exact |
| `mobile/src/app.css` | config / stylesheet | — | `mobile/src/app.css` (self — additive) | exact |
| `engine/engine-core/src/main.rs` | utility / handler | request-response (HTTP) | `engine/engine-core/src/main.rs` (self — single-line change) | exact |

> All Phase 5 changes are purely additive to existing files. The analogs are the files themselves. Pattern excerpts below capture the exact patterns to extend.

---

## Pattern Assignments

### `mobile/src/App.tsx` (component / orchestrator, request-response)

**Analog:** `mobile/src/App.tsx` — existing param-reading pattern

**Imports pattern** (lines 1–5):
```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionScreen } from './components/ConnectionScreen';
import { GameScreen } from './components/GameScreen';
import { useGameSocket } from './hooks/useGameSocket';
import './app.css';
```
All four of `useCallback`, `useEffect`, `useRef`, `useState` are already imported. `useRef` is already used (`persistedRef`). Phase 5 adds a second `useRef` for `connectionArgsRef` — no new imports needed.

**URL param reading pattern** (lines 9–27 — canonical shape to copy for `readInitialGame`):
```typescript
function readInitialServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('server') ??
    window.localStorage.getItem(SERVER_URL_STORAGE_KEY) ??
    ''
  );
}

function readInitialRoomCode(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('room')?.toUpperCase() ?? '';
}

function readInitialSlot(): 1 | 2 {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('slot');
  return v === '2' ? 2 : 1;
}
```
**Copy pattern:** `readInitialGame()` follows the same shape — `new URLSearchParams(window.location.search).get('game') ?? null`. Return type `string | null` (not `string`) because absence is meaningful (no game type label shown).

**State initialization pattern** (lines 30–33):
```typescript
const [serverUrl, setServerUrl] = useState(readInitialServerUrl);
const [roomCode, setRoomCode] = useState(readInitialRoomCode);
const [playerSlot, setPlayerSlot] = useState<1 | 2>(readInitialSlot);
const isSolo = new URLSearchParams(window.location.search).get('solo') === '1';
```
**Copy pattern:** `allParamsPrefilled` is a plain boolean derived from `URLSearchParams` once at init — not state. `gameType` uses `useState<string | null>(readInitialGame)`. `connectionArgsRef` follows the existing `persistedRef` shape: `useRef<{ serverUrl: string; roomCode: string; slot: 1 | 2 } | null>(null)`.

**handleConnect pattern** (lines 49–54 — the function to extend for caching):
```typescript
const handleConnect = (server: string, room: string, slot: 1 | 2) => {
  setServerUrl(server);
  setRoomCode(room);
  setPlayerSlot(slot);
  socket.connect(server, room, slot);
};
```
**Copy pattern:** Phase 5 extends this to also write `connectionArgsRef.current = { serverUrl: server, roomCode: room, slot }` before the `socket.connect` call. New `handleRetry` reads from `connectionArgsRef.current` and calls `socket.connect` directly.

**ConnectionScreen usage pattern** (lines 85–93 — the JSX to extend with new props):
```tsx
<ConnectionScreen
  initialServerUrl={serverUrl}
  initialRoomCode={roomCode}
  initialSlot={playerSlot}
  status={socket.status}
  errorMessage={socket.errorMessage}
  onConnect={handleConnect}
/>
```
**Copy pattern:** Phase 5 adds `fastJoin={allParamsPrefilled}`, `gameType={gameType}`, `errorCode={socket.errorCode}`, and `onRetry={handleRetry}` to this JSX spread.

---

### `mobile/src/components/ConnectionScreen.tsx` (component, request-response)

**Analog:** `mobile/src/components/ConnectionScreen.tsx` — existing form component

**Imports pattern** (lines 1–2):
```typescript
import { useState, type FormEvent } from 'react';
import type { SocketStatus } from '../hooks/useGameSocket';
```
Phase 5 adds no new imports. `useState` is already imported for the new `showManual` state variable.

**Props interface pattern** (lines 4–11):
```typescript
interface ConnectionScreenProps {
  initialServerUrl: string;
  initialRoomCode: string;
  initialSlot: 1 | 2;
  status: SocketStatus;
  errorMessage: string | null;
  onConnect: (serverUrl: string, roomCode: string, slot: 1 | 2) => void;
}
```
**Copy pattern:** Phase 5 extends this interface with:
```typescript
  fastJoin: boolean;
  gameType: string | null;
  errorCode: 'unreachable' | 'room_not_found' | 'slot_taken' | null;
  onRetry: () => void;
```

**Component local state pattern** (lines 21–25):
```typescript
const [serverUrl, setServerUrl] = useState(initialServerUrl);
const [roomCode, setRoomCode] = useState(initialRoomCode);
const [slot, setSlot] = useState<1 | 2>(initialSlot);
const connecting = status === 'connecting';
```
**Copy pattern:** Phase 5 adds `const [showManual, setShowManual] = useState(false);` following the same shape.

**Fast-join conditional render — insert ABOVE the existing `return` block:**
```tsx
if (fastJoin && !showManual) {
  return (
    <div className="connection-screen">
      <h1 className="title">Spectre</h1>
      <p className="fast-join-meta">
        {gameType ? `${gameType.toUpperCase()} · ` : ''}
        ROOM {roomCode} · PLAYER {slot}
      </p>
      <button
        className="big-button fast-join-cta"
        onClick={() => onConnect(initialServerUrl, initialRoomCode, initialSlot)}
        disabled={connecting}
        style={{ marginTop: 32 }}
      >
        {connecting ? 'Joining...' : 'Join game'}
      </button>
      <button className="enter-manually" onClick={() => setShowManual(true)}>
        Enter manually
      </button>
      {errorMessage ? (
        <div className="error-banner">
          {errorMessage}
          {errorCode === 'unreachable' && (
            <button
              className="retry-button"
              onClick={onRetry}
              disabled={connecting}
            >
              Retry
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

**Server URL field visibility pattern** — the existing field (lines 40–50) is conditionally rendered. Phase 5 wraps it:
```tsx
{/* Show server URL field when: no ?server= param was given, OR user tapped "Enter manually" */}
{(!initialServerUrl || showManual) && (
  <label className="field">
    <span>Server URL</span>
    <input ... />
  </label>
)}
```
The condition `showServerUrl = !initialServerUrl || showManual` (from RESEARCH.md Pitfall 5) must be evaluated using the `initialServerUrl` prop (the value read from `?server=` at page load), not the mutable `serverUrl` state — because the state may be empty string initially even when the param was present.

**Error banner pattern** (line 98 — existing, extend with Retry):
```tsx
{errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
```
**Copy pattern:** Phase 5 extends this to:
```tsx
{errorMessage ? (
  <div className="error-banner">
    {errorMessage}
    {errorCode === 'unreachable' && (
      <button className="retry-button" onClick={onRetry} disabled={connecting}>
        Retry
      </button>
    )}
  </div>
) : null}
```
The `disabled={connecting}` guard on Retry mirrors the existing `disabled={connecting || !serverUrl || !roomCode}` on the Connect button (line 92) — same pattern, same purpose.

**Submit / big-button pattern** (lines 89–95):
```tsx
<button
  type="submit"
  className="big-button"
  disabled={connecting || !serverUrl || !roomCode}
>
  {connecting ? 'Connecting...' : 'Connect'}
</button>
```
The fast-join "Join game" button is NOT type="submit" (no form wrapper in fast-join view). It is a plain `<button>` with `onClick`. The existing `.big-button` class is reused + `.fast-join-cta` for the tint override.

---

### `mobile/src/hooks/useGameSocket.ts` (hook / service, event-driven)

**Analog:** `mobile/src/hooks/useGameSocket.ts` — existing WS event handler

**Return type extension pattern** (lines 25–49 — `UseGameSocketResult` interface):
```typescript
export interface UseGameSocketResult {
  ...
  errorMessage: string | null;
  ...
}
```
**Copy pattern:** Phase 5 adds `errorCode: 'unreachable' | 'room_not_found' | 'slot_taken' | null` to this interface. A parallel state variable `const [errorCode, setErrorCode] = useState<'unreachable' | 'room_not_found' | 'slot_taken' | null>(null)` is added alongside `errorMessage`.

**Error event handler pattern** (lines 261–264 — the `ws.addEventListener('error', ...)` block):
```typescript
ws.addEventListener('error', () => {
  setStatus('error');
  setErrorMessage('Connection error');
});
```
**Copy pattern:** Phase 5 replaces this with:
```typescript
ws.addEventListener('error', () => {
  setStatus('error');
  setErrorMessage("Can't reach the server. Check your connection and try again.");
  setErrorCode('unreachable');
});
```

**Close code handler pattern** (lines 266–295 — the `ws.addEventListener('close', ...)` block):
```typescript
if (ev.code === 4000) {
  setStatus('error');
  setErrorMessage('Room is full.');
  return;
}
if (ev.code === 4004) {
  setStatus('error');
  setErrorMessage('Room not found.');
  return;
}
// ... auto-reconnect ...
} else {
  setStatus('error');
  setErrorMessage('Could not reconnect.');
}
```
**Copy pattern:** Phase 5 replaces copy strings and sets errorCode in tandem:
- `4000` path: `setErrorMessage('That slot is already taken. Ask the host to assign you a different player slot.'); setErrorCode('slot_taken');`
- `4004` path: `setErrorMessage(\`Room ${args.roomCode} not found. Check the code or ask the host.\`); setErrorCode('room_not_found');`
  - Note: `args.roomCode` is available via `connectionArgsRef.current?.roomCode` in the open closure.
- Reconnect-exhausted path: `setErrorMessage("Can't reach the server. Check your connection and try again."); setErrorCode('unreachable');`

**`errorCode` must be reset to `null` on each new `connect()` call** — the same place `errorMessage` is reset (before `ws = new WebSocket(...)`). Find the existing `setErrorMessage(null)` reset and add `setErrorCode(null)` alongside it.

---

### `mobile/src/app.css` (stylesheet, new CSS classes)

**Analog:** `mobile/src/app.css` — existing `.big-button`, `.error-banner`, `.slot-option`, `.calibration-overlay` patterns

**Token reference** (lines 3–14 — all tokens used by Phase 5 already declared):
```css
:root {
  --bg-deep:        oklch(7% 0.008 22);
  --bg-surface:     oklch(17% 0.01 22);
  --accent:         oklch(44% 0.22 22);
  --accent-bright:  oklch(60% 0.25 22);
  --text-primary:   oklch(95% 0.008 85);
  --text-secondary: oklch(65% 0.008 85);
  --text-dim:       oklch(38% 0.006 85);
}
```
No new tokens. Phase 5 uses only the tokens above.

**Button base pattern** (lines 136–162 — `.big-button` to extend with `.fast-join-cta`):
```css
.big-button {
  background: var(--accent);
  color: var(--text-primary);
  font: inherit;
  font-weight: 800;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid var(--accent-bright);
  border-radius: 4px;
  min-height: 52px;
  padding: 14px 20px;
  cursor: pointer;
  transition: background 0.1s, transform 0.08s;
}
.big-button:active { background: var(--accent-bright); transform: scale(0.98); }
.big-button:disabled { background: var(--bg-surface); border-color: var(--text-dim); color: var(--text-dim); cursor: not-allowed; }
```
**Copy pattern:** `.fast-join-cta` overrides background and border — do NOT duplicate all properties, just override:
```css
.fast-join-cta {
  background: color-mix(in oklch, var(--accent) 15%, transparent);
  border: 1px solid var(--accent);
}
.fast-join-cta:hover {
  background: color-mix(in oklch, var(--accent) 25%, transparent);
  border-color: var(--accent-bright);
}
.fast-join-cta:active { transform: scale(0.97); }
.fast-join-cta:disabled { opacity: 0.6; }
```

**Error banner pattern** (lines 164–172 — `.error-banner` to remain unchanged):
```css
.error-banner {
  background: rgba(226, 91, 91, 0.15);
  border: 1px solid rgba(226, 91, 91, 0.4);
  color: #ff9b9b;
  padding: 12px;
  border-radius: 8px;
  text-align: center;
  font-size: 0.95rem;
}
```
Phase 5 adds `.retry-button` inside `.error-banner` — the banner's `text-align: center` means the retry button inherits centering; override with `display: block; margin: 8px auto 0` as specified.

**Animation pattern** (lines 510–517 — `.calibration-fade` uses opacity transition — copy this approach):
```css
.calibration-fade {
  opacity: 0;
  pointer-events: none;
}
/* The calibration-overlay itself has: transition: opacity 0.5s ease-out; */
```
**Copy pattern for fast-join animation:** Same opacity + transform approach, no height animation:
```css
.fast-join-header {
  transition: opacity 100ms ease-out;
}
.fast-join-header.hidden {
  opacity: 0;
  pointer-events: none;
}
.form-reveal {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}
.form-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

**New classes to add** (append to the Connection screen section, after `.error-banner`):
1. `.fast-join-meta` — metadata row (Inter 800 12px, letter-spacing 0.10em, uppercase, `--text-primary`)
2. `.fast-join-cta` — "Join game" button override (see above)
3. `.enter-manually` — de-emphasized text link (Inter 400 12px, `--text-secondary`, min-height 44px via padding)
4. `.retry-button` — secondary/outline button inside error banner
5. `.fast-join-header` — animated wrapper for metadata row (opacity transition)
6. `.form-reveal` — animated wrapper for full form reveal

---

### `engine/engine-core/src/main.rs` (handler / utility, request-response)

**Analog:** `engine/engine-core/src/main.rs` — `room_page_html` function

**Function signature** (line 186 — no change needed, `game_type: &str` already a parameter):
```rust
fn room_page_html(code: &str, game_type: &str, base_url: &str) -> String {
```

**QR URL format strings** (lines 188–190 — the exact lines to modify):
```rust
// Current:
let p1_url = format!("{}/mobile?server={}&room={}&slot=1", base_url, ws_url, code);
let p2_url = format!("{}/mobile?server={}&room={}&slot=2", base_url, ws_url, code);
let overlay_url = format!("{}/overlay?server={}&room={}", base_url, ws_url, code);
```
**Copy pattern:** Only P1 and P2 get `&game={}`. Overlay does NOT.
```rust
// After Phase 5:
let p1_url = format!("{}/mobile?server={}&room={}&slot=1&game={}", base_url, ws_url, code, game_type);
let p2_url = format!("{}/mobile?server={}&room={}&slot=2&game={}", base_url, ws_url, code, game_type);
let overlay_url = format!("{}/overlay?server={}&room={}", base_url, ws_url, code); // unchanged
```
`game_type` values are "boxing" and "dance" — ASCII-safe, no URL encoding needed. Add a comment noting the ASCII-safe assumption.

---

## Shared Patterns

### URL Parameter Reading
**Source:** `mobile/src/App.tsx` lines 9–27
**Apply to:** `readInitialGame()` function added in `App.tsx`

Pattern: standalone top-level function, returns typed value, reads `new URLSearchParams(window.location.search)` at call time.

```typescript
function readInitialGame(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('game');
}
```

### Conditional Disabled State on Buttons
**Source:** `mobile/src/components/ConnectionScreen.tsx` line 92
**Apply to:** Fast-join "Join game" button and Retry button in `ConnectionScreen.tsx`

Pattern: `disabled={connecting}` guard prevents concurrent connection attempts.

```tsx
<button disabled={connecting}>...</button>
```

### OKLCH Color Token Usage
**Source:** `mobile/src/app.css` lines 3–14
**Apply to:** All new CSS classes in `app.css`

Pattern: use `var(--token-name)` and `color-mix(in oklch, var(--token) X%, transparent)` — never hard-coded hex/rgb for UI elements. Hard-coded colors (`rgba(226, 91, 91, ...)`) appear only in the existing `.error-banner` rule for legacy reasons; new Phase 5 classes use tokens.

### Transition Pattern (no height animation)
**Source:** `mobile/src/app.css` lines 511–517 (`.calibration-overlay`, `.calibration-fade`)
**Apply to:** `.fast-join-header` and `.form-reveal` classes in `app.css`

Pattern: animate only `opacity` and `transform: translateY`. Never `height`, `max-height`, or layout-affecting properties.

---

## No Analog Found

None. All Phase 5 changes target existing files with established patterns. No new file is created.

---

## Implementation Order

Per RESEARCH.md recommendation — two sequential tasks, each independently releasable:

1. **Task 1 (Rust):** `engine/engine-core/src/main.rs` — lines 188–189, add `&game={}` to `p1_url` and `p2_url`. One-line change per URL.
2. **Task 2 (React):** `useGameSocket.ts` error copy + errorCode → `App.tsx` new params + retry wiring → `ConnectionScreen.tsx` fast-join view + error UX → `app.css` new classes.

---

## Metadata

**Analog search scope:** `mobile/src/`, `engine/engine-core/src/`
**Files read:** `App.tsx`, `ConnectionScreen.tsx`, `useGameSocket.ts` (lines 1–100, 250–309), `app.css`, `main.rs` (lines 183–201)
**Pattern extraction date:** 2026-05-09
