# Phase 5: Mobile Connection UX - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 transforms the mobile connection screen so that players who scan a QR code arrive at a one-tap join screen — not a technical form. When all three URL params are present (`?server=`, `?room=`, `?slot=`), the app shows a streamlined fast-join view with game type, room code, player number, and a single "Join game" button. The full form (including server URL) is accessible via "Enter manually" for power users or debugging. Error messages are improved with distinct copy and, where appropriate, retry actions.

This phase is TypeScript/React only — changes live in `mobile/src/`. One small Rust touch: the room page handler must add `?game=` to the QR-encoded URLs so the fast-join screen can display the game type.

</domain>

<decisions>
## Implementation Decisions

### Fast-join screen (all 3 params present: ?server= + ?room= + ?slot=)
- **D-01:** Trigger condition is strict — ALL THREE of `?server=`, `?room=`, and `?slot=` must be present to show the fast-join view. Any subset falls through to the full form.
- **D-02:** Fast-join screen shows: game type + room code + player number (e.g., "BOXING · ROOM ABC123 · PLAYER 1") and a single "Join game" button. Server URL is never shown.
- **D-03:** To display game type, the Rust room page handler adds `?game=boxing` or `?game=dance` to each QR-encoded URL. Mobile reads `?game=` from URL params and shows it in the fast-join view. If `?game=` is absent (e.g., old QR), fall back to showing room code + player number only (no game type label).
- **D-04:** Button label: "Join game" (not "Connect").

### Partial prefill handling (?server= + ?room= only, no ?slot=)
- **D-05:** This is the landing page join flow (Kahoot-style). Show the full connection form with: server URL field hidden (it's in the URL, not shown to the player), room code pre-typed, slot picker (P1 / P2) visible and required. Player picks their slot and taps Connect.
- **D-06:** Server URL is hidden whenever `?server=` param is present — regardless of fast-join or partial-prefill mode. "Enter manually" reveals it.

### "Enter manually" escape hatch
- **D-07:** "Enter manually" is a de-emphasized text link on the fast-join screen (exact placement is Claude's discretion).
- **D-08:** Tapping it in-place expands the form to reveal all hidden fields (including server URL). One-way — no collapse back to fast-join view.
- **D-09:** The escape hatch only appears when the fast-join view is active (i.e., all 3 params present). The partial-prefill form doesn't need it since server URL is already hidden but the form is otherwise full.

### Error message UX (MOBILE-03)
- **D-10:** Three distinct error scenarios, already differentiated by WS close codes in `useGameSocket.ts`:
  - **Room not found** (close code `4004`): improved copy — something like "Room ABC123 not found. Check the code or ask the host." No retry button.
  - **Slot taken / room full** (close code `4000`): improved copy — something like "That slot is already taken." No retry button.
  - **Server unreachable** (generic WS error event): improved copy — something like "Can't reach the server. Check your connection." + **Retry button** that re-triggers the connection attempt.
- **D-11:** Retry button for server-unreachable errors only. It re-calls `onConnect` with the same params (server URL, room code, slot) — no form re-entry needed.

### Claude's Discretion
- Exact placement of "Enter manually" link within the fast-join screen
- Animation/transition when expanding from fast-join to full form (simple CSS is fine)
- Visual styling of the fast-join screen (use DESIGN.md tokens — same OKLCH palette and Inter type scale as Phase 4 lobby pages)
- Room code display format in fast-join header (e.g., all caps, letter-spacing)
- Whether to display player number as "PLAYER 1" or "P1" in the fast-join header

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Mobile connection screen (primary target)
- `mobile/src/components/ConnectionScreen.tsx` — current full-form implementation; Phase 5 refactors this component to support fast-join view and conditional field visibility
- `mobile/src/App.tsx` — param-reading functions (`readInitialServerUrl`, `readInitialRoomCode`, `readInitialSlot`) and `ConnectionScreen` usage; Phase 5 adds `readInitialGame()` and fast-join detection logic here

### WebSocket error handling
- `mobile/src/hooks/useGameSocket.ts` — lines 261–295: WS error and close handlers; close code `4000` = slot taken, `4004` = room not found, generic error event = server unreachable. Phase 5 improves error copy and adds retry action for the unreachable case.

### Rust room page (small touch)
- `engine/engine-core/src/main.rs` — `GET /rooms/{code}` handler and QR URL construction (from Phase 4); Phase 5 adds `?game={type}` to the three QR-encoded URLs (P1, P2, Overlay)

### Design system
- `DESIGN.md` — OKLCH color tokens, Inter type scale, button spec, spacing. Phase 5 mobile UI must use the same tokens as Phase 4 lobby pages.

### Requirements
- `.planning/REQUIREMENTS.md` — MOBILE-01, MOBILE-02, MOBILE-03 are the full Phase 5 requirement list

### Phase 4 QR URL scheme (what we're building on top of)
- `.planning/phases/04-lobby-ux/04-CONTEXT.md` — D-17: QR URL structure (`?server=`, `?room=`, `?slot=`); D-10: landing page join navigates to `/mobile?room=CODE&server=ORIGIN` (no `?slot=`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConnectionScreen.tsx` — existing form component; Phase 5 extends it with a fast-join conditional view rather than replacing it wholesale. The `initialServerUrl`, `initialRoomCode`, `initialSlot` props already carry the prefilled values.
- `useGameSocket.ts` — `connect(serverUrl, roomCode, slot)` callback; Retry button calls this with the same args stored from the previous attempt.

### Established Patterns
- URL param reading in `App.tsx` — `readInitialServerUrl/RoomCode/Slot()` pattern; Phase 5 adds `readInitialGame()` following the same shape.
- WS close code differentiation — already in `useGameSocket.ts`; Phase 5 maps each code to improved user-facing copy and optional retry UI.
- `errorMessage` state flows from `useGameSocket` → `App` → `ConnectionScreen` as a prop; Retry button will need a new `onRetry` prop or can reuse `onConnect` with cached args.

### Integration Points
- `App.tsx` detects fast-join mode: `allParamsPrefilled = !!serverParam && !!roomParam && !!slotParam`; passes a `fastJoin: boolean` prop (or equivalent) to `ConnectionScreen`.
- Rust handler: add `?game={room.game_type}` to QR URL strings in the `GET /rooms/{code}` handler — single-line change per QR card.

</code_context>

<specifics>
## Specific Ideas

- Fast-join header display inspired by the Phase 4 "tight utility" aesthetic — large type for the key info (game + room + slot), minimal chrome, single prominent action button.
- "Enter manually" as small, de-emphasized text beneath the button — players who scanned a QR won't notice it; players who need it will find it.

</specifics>

<deferred>
## Deferred Ideas

- Slot pre-selection on the landing page join (currently player chooses in the mobile connection screen) — future UX improvement
- "Back to fast-join" collapse after "Enter manually" — deliberate one-way; not worth the complexity
- Game type display when `?game=` param is absent — graceful fallback to room + player number only

</deferred>

---

*Phase: 5-Mobile Connection UX*
*Context gathered: 2026-05-09*
