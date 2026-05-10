# Phase 5: Mobile Connection UX - Research

**Researched:** 2026-05-09
**Domain:** React/TypeScript UI refactor + Rust URL string change
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fast-join triggers only when ALL THREE of `?server=`, `?room=`, and `?slot=` are present. Any subset falls through to the full form.
- **D-02:** Fast-join screen shows: game type + room code + player number (e.g., "BOXING · ROOM ABC123 · PLAYER 1") and a single "Join game" button. Server URL is never shown.
- **D-03:** Rust room page handler adds `?game=boxing` or `?game=dance` to each QR-encoded P1/P2 URL. Mobile reads `?game=` and shows it in the fast-join view. If `?game=` is absent (old QR), fall back to room code + player number only.
- **D-04:** Button label: "Join game" (not "Connect").
- **D-05:** Partial-prefill flow (server + room, no slot): full form with server URL hidden, room pre-filled, slot picker visible and required.
- **D-06:** Server URL hidden whenever `?server=` param is present, regardless of view mode. "Enter manually" reveals it.
- **D-07:** "Enter manually" is a de-emphasized text link on the fast-join screen. Exact placement is Claude's discretion.
- **D-08:** "Enter manually" expands the form to reveal all hidden fields in-place. One-way — no collapse back.
- **D-09:** "Enter manually" escape hatch only appears when fast-join view is active (all 3 params present).
- **D-10:** Three distinct error scenarios differentiated by WS close codes in `useGameSocket.ts`:
  - Room not found (close code 4004): "Room ABC123 not found. Check the code or ask the host." No retry.
  - Slot taken (close code 4000): "That slot is already taken. Ask the host to assign you a different player slot." No retry.
  - Server unreachable (generic WS error event): "Can't reach the server. Check your connection and try again." + Retry button.
- **D-11:** Retry button for server-unreachable only. Re-calls `onConnect` with cached (serverUrl, roomCode, slot) — no form re-entry.

### Claude's Discretion

- Exact placement of "Enter manually" link within the fast-join screen
- Animation/transition when expanding from fast-join to full form (simple CSS is fine)
- Visual styling of the fast-join screen (use DESIGN.md tokens — same OKLCH palette and Inter type scale as Phase 4 lobby pages)
- Room code display format in fast-join header (e.g., all caps, letter-spacing)
- Whether to display player number as "PLAYER 1" or "P1" in the fast-join header

### Deferred Ideas (OUT OF SCOPE)

- Slot pre-selection on the landing page join — future UX improvement
- "Back to fast-join" collapse after "Enter manually" — deliberate one-way; not worth the complexity
- Game type display when `?game=` param is absent — graceful fallback already specified (room + player number only)

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOBILE-01 | When `?server=`, `?room=`, and `?slot=` are all present in the URL (QR-linked), connection screen shows a streamlined one-tap join screen instead of the full form | Addressed by fast-join view in `ConnectionScreen.tsx` + `allParamsPrefilled` flag in `App.tsx` |
| MOBILE-02 | Full connection form (including raw server URL field) is only shown when params are absent or user explicitly taps "Enter manually" | Addressed by conditional rendering of server URL field + "Enter manually" toggle |
| MOBILE-03 | Connection errors distinguish between room-not-found, server-unreachable, and slot-taken scenarios | Addressed by mapping existing WS close codes (4004, 4000, error event) to distinct copy + retry logic in `useGameSocket.ts` / `ConnectionScreen.tsx` |

</phase_requirements>

---

## Summary

Phase 5 is a focused UI refactor with a small Rust change. It has no new dependencies, no new build infrastructure, and no changes to the WebSocket protocol. All work is confined to three files: `mobile/src/App.tsx`, `mobile/src/components/ConnectionScreen.tsx`, and `engine/engine-core/src/main.rs`.

The mobile side adds a conditional fast-join view to `ConnectionScreen` that renders when `fastJoin === true`. The full form remains but its fields are conditionally hidden. A new `onRetry` prop enables the retry button for server-unreachable errors. `App.tsx` gains `readInitialGame()`, the `allParamsPrefilled` boolean, and a `useRef` to cache connection args for retry.

The Rust change is a one-liner in `room_page_html`: append `?game={game_type}` to the P1 and P2 QR URLs. The overlay URL does not get `?game=` (the overlay does not show a fast-join screen).

The UI-SPEC (05-UI-SPEC.md) is fully specified and approved. No design decisions remain open. Research confirms that all required CSS tokens already exist in `mobile/src/app.css`, all required JS patterns already exist in `App.tsx`, and the WS close code differentiation already exists in `useGameSocket.ts`. This phase is purely additive — no existing logic is deleted.

**Primary recommendation:** Implement in two sequential tasks. Task 1: Rust `?game=` param addition (single-line change, verified by reading the handler). Task 2: React fast-join view + error UX improvements. Each task is independently releasable and low-risk.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fast-join view rendering | Browser / Client (React) | — | Purely UI conditional render in `ConnectionScreen.tsx`; no server involvement at render time |
| URL param reading + fast-join detection | Browser / Client (App.tsx) | — | `URLSearchParams` at app init; already established pattern |
| `?game=` param injection into QR URLs | API / Backend (Rust) | — | `room_page_html` constructs the QR URLs server-side; single-line change |
| Error message differentiation | Browser / Client (useGameSocket.ts) | — | WS close codes already parsed there; copy and retry UI live in ConnectionScreen |
| CSS animation (fast-join → full form) | Browser / Client (app.css) | — | Pure CSS transition; no JS animation library needed |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x (already in project) | Component rendering | Existing stack |
| TypeScript | 5.x (already in project) | Type safety | Existing stack |
| Vite | 5.x (already in project) | Build tool | Existing stack |

No new dependencies required for this phase. [VERIFIED: codebase inspection of `mobile/src/`]

### CSS Approach

Hand-rolled CSS in `mobile/src/app.css`. All required OKLCH tokens already declared in `:root`. Phase 5 adds new CSS rules (new classes for fast-join view, retry button, "Enter manually" link) to the existing file without introducing any new styling approach. [VERIFIED: `mobile/src/app.css` lines 1-14]

---

## Architecture Patterns

### System Architecture Diagram

```
QR Scan (mobile browser)
        |
        v
URL: /mobile?server=WS_URL&room=CODE&slot=N&game=TYPE
        |
        v
App.tsx — readInitialGame(), readInitialServerUrl/RoomCode/Slot()
        |
        +---> allParamsPrefilled === true?
        |           |
        |          YES --> ConnectionScreen (fastJoin=true, gameType="boxing"|null)
        |           |           |
        |           |    Fast-join view: metadata row + "Join game" button
        |           |           |
        |           |    "Join game" tap --> onConnect(server, room, slot)
        |           |           |           [caches args in useRef for retry]
        |           |           |
        |           |    "Enter manually" tap --> setState(showManual=true)
        |           |           |               [one-way, reveals full form]
        |           |
        |          NO --> ConnectionScreen (fastJoin=false)
        |                       |
        |               ?server= present? --> hide server URL field
        |               ?room= present?   --> pre-fill room code
        |               ?slot= absent?    --> show slot picker (partial-prefill)
        |
        v
useGameSocket.connect(serverUrl, roomCode, slot)
        |
        +---> WS close 4004 --> errorMessage = "Room {CODE} not found..."
        +---> WS close 4000 --> errorMessage = "That slot is already taken..."
        +---> WS error event --> errorMessage = "Can't reach the server..."
                                 + show Retry button
```

### Recommended File Change Structure

```
engine/engine-core/src/
  main.rs              # Add ?game={game_type} to p1_url and p2_url (lines 188-189)

mobile/src/
  App.tsx              # Add readInitialGame(), allParamsPrefilled, connectionArgsRef, onRetry handler
  components/
    ConnectionScreen.tsx  # Add fastJoin/gameType/onRetry props + fast-join view + error UX
  app.css              # Add .fast-join-meta, .enter-manually, .retry-button CSS classes
```

### Pattern 1: Fast-Join Detection in App.tsx

**What:** Read all four URL params at startup; compute `allParamsPrefilled` boolean; cache connection args for retry.

**When to use:** Fires once at mount; params are read at init time (existing pattern).

```typescript
// Source: existing readInitialServerUrl() pattern in mobile/src/App.tsx
function readInitialGame(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('game');
}

// In App():
const serverParam = new URLSearchParams(window.location.search).get('server');
const roomParam = new URLSearchParams(window.location.search).get('room');
const slotParam = new URLSearchParams(window.location.search).get('slot');
const allParamsPrefilled = !!serverParam && !!roomParam && !!slotParam;

const [gameType] = useState<string | null>(readInitialGame);
const connectionArgsRef = useRef<{ serverUrl: string; roomCode: string; slot: 1 | 2 } | null>(null);

const handleConnect = (server: string, room: string, slot: 1 | 2) => {
  connectionArgsRef.current = { serverUrl: server, roomCode: room, slot };
  setServerUrl(server);
  setRoomCode(room);
  setPlayerSlot(slot);
  socket.connect(server, room, slot);
};

const handleRetry = () => {
  const args = connectionArgsRef.current;
  if (!args) return;
  socket.connect(args.serverUrl, args.roomCode, args.slot);
};
```

[VERIFIED: `mobile/src/App.tsx` — existing param-reading pattern, `useRef` and `useCallback` already imported]

### Pattern 2: Conditional View in ConnectionScreen

**What:** Props-driven view switching — `fastJoin` boolean controls which JSX branch renders.

**When to use:** When all 3 params are present. One-way state `showManual` enables the "Enter manually" expansion path.

```typescript
// Source: pattern derived from existing ConnectionScreen.tsx + 05-CONTEXT.md D-01/D-08
const [showManual, setShowManual] = useState(false);

// Fast-join view
if (fastJoin && !showManual) {
  return (
    <div className="connection-screen">
      <h1 className="title">Spectre</h1>
      <p className="fast-join-meta">
        {gameType ? `${gameType.toUpperCase()} · ` : ''}
        ROOM {roomCode} · PLAYER {slot}
      </p>
      <button className="big-button ..." onClick={handleJoin} disabled={connecting}>
        {connecting ? 'Joining...' : 'Join game'}
      </button>
      <button className="enter-manually" onClick={() => setShowManual(true)}>
        Enter manually
      </button>
      {errorBanner}
    </div>
  );
}

// Full form (existing form, with server field conditionally hidden)
```

[VERIFIED: `mobile/src/components/ConnectionScreen.tsx` — existing component shape; pattern is additive]

### Pattern 3: Rust `?game=` URL Addition

**What:** Append `?game={game_type}` to the P1 and P2 QR URLs in `room_page_html`.

**When to use:** Single change in the format strings at lines 188-189.

```rust
// Source: engine/engine-core/src/main.rs lines 188-189 (current)
let p1_url = format!("{}/mobile?server={}&room={}&slot=1", base_url, ws_url, code);
let p2_url = format!("{}/mobile?server={}&room={}&slot=2", base_url, ws_url, code);

// After Phase 5 change:
let p1_url = format!("{}/mobile?server={}&room={}&slot=1&game={}", base_url, ws_url, code, game_type);
let p2_url = format!("{}/mobile?server={}&room={}&slot=2&game={}", base_url, ws_url, code, game_type);
// NOTE: overlay_url does NOT get ?game= — overlay has no fast-join screen
```

[VERIFIED: `engine/engine-core/src/main.rs` line 186-190 — `game_type` is already a parameter of `room_page_html`; no new argument needed]

### Pattern 4: Error Copy + Retry in ConnectionScreen

**What:** Map error string patterns to distinct rendered output. Add inline Retry button inside `.error-banner` for the unreachable case.

The current error strings are set in `useGameSocket.ts` (lines 263, 275, 279). Phase 5 replaces those strings with improved copy AND updates ConnectionScreen to detect which error variant it received and optionally render the Retry button.

Two implementation options:

**Option A (recommended):** Replace the raw string in `useGameSocket.ts` with a structured error object `{ code: 'unreachable' | 'room_not_found' | 'slot_taken', message: string }` and pass it through. ConnectionScreen reads `code` to decide whether to show Retry.

**Option B (simpler, fits existing prop interface):** Keep `errorMessage: string | null` but add a parallel `errorCode: 'unreachable' | 'room_not_found' | 'slot_taken' | null` prop. ConnectionScreen renders Retry only when `errorCode === 'unreachable'`.

Option B requires fewer prop interface changes and is recommended for minimal surface area. [ASSUMED — both options are valid; planner should choose based on preference]

### CSS Animation: Fast-Join to Full Form

Per D-07 (Claude's discretion) and UI-SPEC constraint ("Never animate `height`"):

```css
/* Source: 05-UI-SPEC.md — Expansion animation section */
.form-reveal {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}
.form-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Fast-join metadata fade-out */
.fast-join-header {
  transition: opacity 100ms ease-out;
}
.fast-join-header.hidden {
  opacity: 0;
  pointer-events: none;
}
```

Sequential: fast-join fades (100ms) then form appears (150ms). [VERIFIED: 05-UI-SPEC.md animation section]

### Anti-Patterns to Avoid

- **Do not animate `height` directly:** DESIGN.md forbids animating height. Use `opacity` + `transform: translateY`. [VERIFIED: 05-UI-SPEC.md]
- **Do not show the fast-join view when only 2 of 3 params are present:** D-01 is strict — all three required. A partial match must fall through to the full form.
- **Do not add `?game=` to the overlay QR URL:** The overlay app has no fast-join screen and does not read `?game=`. Only P1 and P2 URLs need it.
- **Do not replace `errorMessage` with structured type without updating App.tsx flow:** The error flows from `useGameSocket` → App state → ConnectionScreen prop. All three layers must be updated consistently.
- **Do not use `.big-button` for the Retry button:** The UI-SPEC specifies Retry as a secondary/outline style (smaller, `--bg-surface` background, `--text-dim` border) to maintain visual hierarchy. [VERIFIED: 05-UI-SPEC.md Retry button spec]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS animation sequencing | Custom JS animation loop | CSS transitions with sequential class toggling via `setTimeout` or React state | Two-step animation is simple enough for CSS; adding a JS animation library is disproportionate |
| URL param parsing | Custom regex/split | `new URLSearchParams(window.location.search)` | Already used in App.tsx; browser-native API |

**Key insight:** This phase has no problems that require non-trivial libraries. All complexity is in conditional rendering logic, which React handles naturally.

---

## Common Pitfalls

### Pitfall 1: `?game=` URL-encoding in Rust

**What goes wrong:** `game_type` values like "boxing" are ASCII-safe, but the pattern `format!("...&game={}", game_type)` would embed a raw string without percent-encoding. If a future game type had spaces or special characters this would silently produce a malformed URL.

**Why it happens:** Rust's `format!` does no URL encoding.

**How to avoid:** For the current game types ("boxing", "dance"), raw insertion is safe. If future game types can contain non-ASCII or special characters, wrap with a URL encoder. For this phase, a code comment noting the assumption is sufficient.

**Warning signs:** QR code scans silently fail to parse the `?game=` param.

### Pitfall 2: `allParamsPrefilled` computed from stale URLSearchParams

**What goes wrong:** If `URLSearchParams` is instantiated multiple times in different places, they could theoretically diverge (e.g., one call reads the param, URL changes). In practice, URL params don't change after page load for this app.

**How to avoid:** Compute `allParamsPrefilled` once at init alongside the other `readInitial*` calls. Store it in state or a ref so it doesn't recompute.

### Pitfall 3: Retry re-connects while already connecting

**What goes wrong:** User taps Retry while a connection attempt is still in progress, creating multiple concurrent WS connections.

**How to avoid:** Disable the Retry button when `status === 'connecting'`. The existing `onConnect` already has `disabled={connecting}` on the Connect button — apply same guard to Retry. [VERIFIED: `ConnectionScreen.tsx` line 93]

### Pitfall 4: "Enter manually" one-way toggle lost on error

**What goes wrong:** User taps "Enter manually", form expands, user tries to connect, gets an error. The component re-renders but `showManual` state persists correctly — this is actually fine, as the state lives in the component.

**How to avoid:** No action needed. `showManual` is local component state and survives re-renders. Just ensure it is NOT reset when `errorMessage` changes.

### Pitfall 5: Server URL field visibility when `showManual` expands

**What goes wrong:** D-08 says "Enter manually" reveals ALL hidden fields including server URL. If the server URL field is hidden via `!serverParam` condition and the "Enter manually" expansion only clears `fastJoin` conditional, the server URL field might remain hidden.

**How to avoid:** Track server URL visibility as: `showServerUrl = !serverParam || showManual`. The server field renders when either there was no `?server=` param OR the user explicitly tapped "Enter manually". [VERIFIED: 05-CONTEXT.md D-06 and D-08]

---

## Code Examples

### Current error strings in useGameSocket.ts (to be replaced)

```typescript
// Source: mobile/src/hooks/useGameSocket.ts lines 261-294 (verified)
ws.addEventListener('error', () => {
  setStatus('error');
  setErrorMessage('Connection error');       // → "Can't reach the server. Check your connection and try again."
});

if (ev.code === 4000) {
  setErrorMessage('Room is full.');          // → "That slot is already taken. Ask the host to assign you a different player slot."
}
if (ev.code === 4004) {
  setErrorMessage('Room not found.');        // → "Room {CODE} not found. Check the code or ask the host."
}
// Note: 'Could not reconnect.' string on line 294 is for auto-reconnect exhaustion — also needs improvement (→ same unreachable copy or distinct copy)
```

### New props for ConnectionScreen

```typescript
// Source: 05-UI-SPEC.md Prop Interface Notes
interface ConnectionScreenProps {
  initialServerUrl: string;
  initialRoomCode: string;
  initialSlot: 1 | 2;
  status: SocketStatus;
  errorMessage: string | null;
  errorCode: 'unreachable' | 'room_not_found' | 'slot_taken' | null;  // NEW
  fastJoin: boolean;          // NEW
  gameType: string | null;    // NEW
  onConnect: (serverUrl: string, roomCode: string, slot: 1 | 2) => void;
  onRetry: () => void;        // NEW
}
```

### "Join game" button style (from UI-SPEC)

```css
/* Source: 05-UI-SPEC.md — "Join game" button spec */
/* Reuses .big-button but overrides background to match lobby tint pattern */
.fast-join-cta {
  background: color-mix(in oklch, var(--accent) 15%, transparent);
  border: 1px solid var(--accent);
}
.fast-join-cta:hover {
  background: color-mix(in oklch, var(--accent) 25%, transparent);
  border-color: var(--accent-bright);
}
.fast-join-cta:active {
  transform: scale(0.97);
}
.fast-join-cta:disabled {
  opacity: 0.6;
}
```

### Retry button style (from UI-SPEC)

```css
/* Source: 05-UI-SPEC.md — Retry button spec */
.retry-button {
  display: block;
  margin: 8px auto 0;
  min-height: 44px;
  border-radius: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--text-dim);
  color: var(--text-primary);
  font: inherit;
  font-weight: 800;
  font-size: 0.875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0 16px;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.retry-button:hover {
  border-color: color-mix(in oklch, var(--accent) 60%, transparent);
  background: color-mix(in oklch, var(--accent) 8%, transparent);
}
.retry-button:active {
  transform: scale(0.97);
}
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 5 is a pure code change within an already-running dev stack (React/Vite mobile app + Rust engine). No external tools, databases, or services beyond what is already in use are required. The Rust build toolchain is required to compile the engine change but is assumed present from earlier phases.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic "Connection error" copy | Distinct copy per error code | Phase 5 | Players see actionable messages |
| Full form always shown | Conditional fast-join view | Phase 5 | QR-scan flow is one tap |
| QR URLs without `?game=` | QR URLs include `?game={type}` | Phase 5 | Fast-join can display game type |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Option B (parallel `errorCode` prop) is preferred over Option A (structured error object) for minimal surface area | Architecture Patterns, Pattern 4 | If planner prefers Option A, the prop interface and useGameSocket change surface area grows slightly |
| A2 | `reconnect exhausted → 'Could not reconnect.'` string should also receive the unreachable copy treatment | Code Examples | If left as-is, the reconnect-exhausted path shows inconsistent copy |

---

## Open Questions

1. **Error code for auto-reconnect exhaustion (`Could not reconnect.` at line 294 of useGameSocket.ts)**
   - What we know: This fires when the auto-reconnect loop hits `MAX_RECONNECT_ATTEMPTS`. It is a different code path from the immediate WS error event.
   - What's unclear: Should this also show Retry? Or is it the same "server unreachable" bucket?
   - Recommendation: Treat it as server-unreachable (same copy + Retry button). The player's remedy is the same: check connection and try again.

---

## Security Domain

No new attack surface introduced. Phase 5 only reads URL params that already exist and adds one param (`?game=`). The `game_type` value appended in Rust is already HTML-escaped via `html_escape()` for the display path, and is appended to QR URLs as an ASCII-safe string ("boxing" or "dance") whose values are server-controlled (not user-controlled input). No new auth, no new server endpoints, no new data persistence.

ASVS V5 (Input Validation): The `?game=` param on the mobile side is read-only display metadata. It is never sent to the server or used in any security decision — if it contains unexpected content, the worst outcome is a garbled metadata row display.

---

## Sources

### Primary (HIGH confidence)
- `mobile/src/components/ConnectionScreen.tsx` — verified current component shape, props, form structure
- `mobile/src/App.tsx` — verified existing `readInitial*` pattern, existing `useRef`, `useState` usage
- `mobile/src/hooks/useGameSocket.ts` — verified WS close code handling (4000, 4004), error event handler, `errorMessage` state
- `mobile/src/app.css` — verified all OKLCH tokens exist, `.big-button` spec, `.error-banner` spec, `.connection-screen` layout
- `engine/engine-core/src/main.rs` — verified `room_page_html` signature (takes `game_type: &str`), exact lines 188-190 to modify, current URL format strings
- `05-UI-SPEC.md` — verified complete visual spec for all new components

### Secondary (MEDIUM confidence)
- `05-CONTEXT.md` — all implementation decisions locked and cited above
- `DESIGN.md` referenced by CONTEXT and UI-SPEC for color tokens and typography rules

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing tech verified in codebase
- Architecture: HIGH — all files identified and read; change surface is small and additive
- Pitfalls: HIGH — derived from direct code reading, not speculation
- UI spec: HIGH — 05-UI-SPEC.md is complete and approved

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (stable — React 18 patterns, no fast-moving dependencies)
