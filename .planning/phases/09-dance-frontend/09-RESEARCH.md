# Phase 9: Dance Frontend - Research

**Researched:** 2026-05-10
**Domain:** React overlay state management, Pixi.js v8 Graphics API, mobile React phase routing
**Confidence:** HIGH

---

## Summary

Phase 9 implements the dance game frontend across three surfaces: the spectator overlay (new
`DanceHud` component + target pose skeleton in Pixi.js + dance match end screen), the
`useSpectatorSocket` hook (new state fields for `game_type`, dance scores, beat, and snapshot
handling), and the mobile `GameScreen` (calibration skip when `game_type === "dance"`).

The protocol is already fully wired from Phase 7: `MsgJoined.game_type`, `MsgDanceBeat`, and
`MsgDanceScore` all exist in `shared/protocol.ts`. The design spec is locked in
`09-UI-SPEC.md`. The implementation is purely additive — no existing boxing behavior changes.

The main technical risk is the Pixi.js skeleton animation: the overlay does not currently have
gsap installed. The UI-SPEC calls for gsap to drive `Graphics.alpha` tweens for the
150ms fade-out / 150ms fade-in skeleton swap. Gsap is not in `overlay/package.json` —
the plan must either install gsap or implement the skeleton fade via a `requestAnimationFrame`
ticker directly on the Pixi app instance (which is already running in `PixiCanvas.tsx`). A
`requestAnimationFrame` approach avoids adding a dependency.

**Primary recommendation:** Implement all four plans in dependency order: socket state
(09-01) → HUD component (09-02) → Pixi skeleton (09-03) → match end + mobile (09-04). The
`gameType` state from 09-01 drives all conditional rendering in 09-02 through 09-04.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `game_type` storage and routing | Frontend hook (`useSpectatorSocket`) | — | Message arrives via WebSocket; hook owns all WS state |
| Dance score state (`danceScores`) | Frontend hook | — | Updated on `dance_score` events; same pattern as boxing stats |
| Beat state (`danceBeat`) | Frontend hook | — | Updated on `dance_beat` events; feeds both HUD and Pixi skeleton |
| Dance HUD (scores + beat indicator) | Browser / React component | — | Pure display layer over hook state |
| Target pose skeleton | Browser / Pixi.js canvas | React hook (ref passing) | Pixi owns rendering; hook owns data; PixiCanvas bridges them |
| Beat indicator bar drain | Browser / CSS | Browser / JS timer | CSS `transition: width linear` for drain; JS resets width on event |
| Dance match end screen | Browser / React component | — | Replaces boxing match-end content; same `.match-end-overlay` shell |
| Mobile calibration skip | Browser / React mobile component | Mobile WebSocket hook | `useGameSocket` receives `joined` with `game_type`; `GameScreen` checks it |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIMPL-01 | Overlay stores `game_type` from `MsgJoined`; renders boxing HUD or dance HUD based on `game_type` | `useSpectatorSocket` does not currently handle `joined` messages at all — this is new. `MsgJoined` is typed in `shared/protocol.ts` with `game_type: string`. `App.tsx` renders `<HudLayer>` unconditionally — must become conditional. |
| DIMPL-02 | Dance HUD shows cumulative P1/P2 scores, beat number / total, countdown bar | `danceScores` from `dance_score` events; `danceBeat` from `dance_beat` events. New `DanceHud` component. Beat bar drains via CSS `transition: width {ms}ms linear`, resets via `transition: width 0ms`. |
| DIMPL-03 | `dance_beat` events update a target pose skeleton in Pixi.js with fade in/out animation | New `Graphics` object in existing Pixi.js `skeletonContainer`. Uses `CONNECTIONS` from `skeleton.ts`. Data: `MsgDanceBeat.target_pose: Array<[number, number, number, number]>`. Fade via `requestAnimationFrame` on Pixi ticker (gsap not yet installed). |
| DIMPL-04 | Dance match end shows final scores + winner declaration; no KO text, no HP | New content branch inside existing `.match-end-overlay` shell. `RoundOverlay.tsx` must check `gameType` to render dance vs boxing content. |
| DIMPL-05 | Mobile skips calibration for dance rooms (`game_type === "dance"` in `MsgJoined`) | `useGameSocket` currently transitions to `'calibration'` on `calibration_start`. For dance, server never sends `calibration_start` — but `useGameSocket` also never reads `game_type` from `joined`. Must store `game_type` from `joined` and use it in `GameScreen` to gate `CalibrationOverlay` rendering. |
</phase_requirements>

---

## Standard Stack

### Core (all already in use — no new installs required for core)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.2.0 | Component tree and state | Existing codebase |
| Pixi.js | ^8.18.1 [VERIFIED: package.json] | 2D canvas rendering | Existing codebase — `PixiCanvas.tsx` |
| TypeScript | ~6.0.2 [VERIFIED: package.json] | Type safety | Existing codebase |

### Animation — Key Gap Found

gsap is **not** installed in `overlay/package.json`. [VERIFIED: overlay/package.json inspection]

The UI-SPEC motion contract specifies "Use gsap (already imported in overlay) for skeleton alpha
transitions" — this was an incorrect assumption in the spec. gsap must be either installed or
the skeleton fade must use the Pixi ticker directly.

**Recommended approach:** Use the Pixi `app.ticker.add()` handler already running in `PixiCanvas.tsx`
to animate `skeletonGraphics.alpha` manually using `ticker.elapsedMS`. This avoids adding a
new dependency. A simple linear interpolation function driven by `performance.now()` inside the
Pixi ticker handler is sufficient for a 150ms ease-out-quart / 150ms ease-in fade.

**Alternative:** Install gsap (`npm install gsap` in `overlay/`). gsap's `gsap.to(obj, { alpha: 0, duration: 0.15, ease: "power4.out" })` is idiomatic. However, this adds a production dependency for a single animation.

**Decision for planner:** Document the gsap-absent gap. Plan 09-03 must either install gsap or implement the ticker-driven fade. Both are valid. The ticker approach is zero-dependency and consistent with the existing Pixi patterns.

### Supporting (existing, referenced by this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `overlay/src/lib/skeleton.ts` | — | `CONNECTIONS` array (35 bone pairs) | Draw skeleton bone lines in Pixi Graphics |
| `overlay/src/hooks/useSpectatorSocket.ts` | — | WebSocket state management | Add dance state fields here |
| `overlay/src/components/HudLayer.tsx` | — | Boxing HUD pattern to mirror | DanceHud adapts its two-row `.hud-band` structure |
| `overlay/src/components/RoundOverlay.tsx` | — | Boxing round/match end overlay | Dance match end replaces content in `.match-end-overlay` shell |

---

## Architecture Patterns

### System Architecture Diagram

```
WebSocket (server)
    │
    ▼
useSpectatorSocket (hook)
    ├── existing: gameState, roundState, matchWinner, wins, poseStreamRef
    └── NEW: gameType, danceScores, danceBeat
               │
               ├─────────────────────────────────────┐
               ▼                                     ▼
         App.tsx render branch                 PixiCanvas.tsx
         gameType === 'boxing'                  (new skeletonGfx ref)
              → <HudLayer>                      dance_beat ref → redraw + fade
         gameType === 'dance'
              → <DanceHud>                 dance_score → update bar fill %
                    │
                    ├── Row 1: P1 | BeatIndicator | P2
                    └── Row 2: score | vs | score

         RoundOverlay.tsx (reads gameType)
              gameType === 'boxing' → existing ko-text + match-end-title
              gameType === 'dance'  → dance score row + WINNER label

mobile/useGameSocket.ts
    ├── existing: 'joined' → sets assignedSlot, opponentConnected
    └── NEW: 'joined' → also store gameType
              │
              ▼
         GameScreen.tsx
              phase === 'calibration' && gameType !== 'dance'
                  → <CalibrationOverlay> (unchanged)
              phase === 'calibration' && gameType === 'dance'
                  → skip (proceed directly to match)
```

### Recommended Project Structure (new files only)

```
overlay/src/
├── components/
│   ├── DanceHud.tsx          # NEW — plan 09-02
│   ├── HudLayer.tsx          # UNCHANGED (boxing-only)
│   ├── RoundOverlay.tsx      # MODIFIED — dance match end branch — plan 09-04
│   └── PixiCanvas.tsx        # MODIFIED — skeleton Graphics + fade — plan 09-03
└── hooks/
    └── useSpectatorSocket.ts # MODIFIED — game_type + dance state — plan 09-01

mobile/src/
├── hooks/
│   └── useGameSocket.ts      # MODIFIED — store gameType from joined — plan 09-04
└── components/
    └── GameScreen.tsx        # MODIFIED — calibration skip gate — plan 09-04
```

### Pattern 1: Game-Type Routing in App.tsx

The existing `App.tsx` renders `<HudLayer>` unconditionally. Phase 9 makes it conditional
on `gameType`. `gameType` starts as `null` (before `joined` arrives) and should show
nothing — neither HUD — until the game type is known.

```typescript
// Source: overlay/src/App.tsx (current) — to be modified
// BEFORE:
<HudLayer connected={connected} ... />

// AFTER (pattern):
{gameType === 'boxing' && (
  <HudLayer connected={connected} ... />
)}
{gameType === 'dance' && (
  <DanceHud danceScores={danceScores} danceBeat={danceBeat} connected={connected} />
)}
```

The `gameType` state is `null` before `MsgJoined` arrives. Neither HUD renders during
this window — the overlay shows only the Pixi canvas and the waiting overlay.

### Pattern 2: `useSpectatorSocket` Dance State Fields

The spectator socket currently has no `joined` message handler. `MsgJoined` is part of
`InboundServerMsg` but `ServerMessage` (the union used for the spectator) does NOT currently
include `MsgJoined`. The spectator hook uses `isIncomingMessage` to filter by type string —
it simply warns on unknown types.

To handle `joined`, either:
- Add `MsgJoined` to the `IncomingMessage` type union in `useSpectatorSocket.ts`, or
- Handle it as a raw type string check (`parsed.type === 'joined'`)

```typescript
// Source: overlay/src/hooks/useSpectatorSocket.ts (current)
// Add to SpectatorSocketState interface:
gameType: 'boxing' | 'dance' | null
danceScores: [number, number]
danceBeat: { beat: number; totalBeats: number; targetPose: Array<[number, number, number, number]> } | null

// Add to message handler:
if (parsed.type === 'joined') {
  const gt = (parsed as { game_type?: string }).game_type
  if (gt === 'boxing' || gt === 'dance') setGameType(gt)
  return
}
if (parsed.type === 'dance_score') {
  setDanceScores([(parsed as MsgDanceScore).scores[0], (parsed as MsgDanceScore).scores[1]])
  return
}
if (parsed.type === 'dance_beat') {
  const msg = parsed as MsgDanceBeat
  setDanceBeat({ beat: msg.beat, totalBeats: msg.total_beats, targetPose: msg.target_pose })
  return
}
if (parsed.type === 'dance_snapshot') {
  // Snapshot on spectator join mid-dance — same shape as dance_score but type is dance_snapshot
  // Treat as initial danceScores update
  const snap = parsed as { beat: number; scores: [number, number] }
  setDanceScores([snap.scores[0], snap.scores[1]])
  return
}
```

**Note:** `MsgDanceBeat.beat` and `total_beats` are typed as `bigint` in the ts-rs-generated
binding file (`.claude/worktrees/shared/MsgDanceBeat.ts`), but `shared/protocol.ts` (the
canonical source) types them as `number`. Use `shared/protocol.ts` types — the worktree
bindings are intermediate artifacts. [VERIFIED: shared/protocol.ts line 172-178]

### Pattern 3: Beat Indicator Bar (CSS Transition Technique)

The draining bar resets to 100% then drains linearly to 0%. The CSS transition
technique requires toggling the transition duration to 0ms for the reset snap, then
back to `beat_duration_ms` for the drain.

```typescript
// React pattern — inside DanceHud.tsx
// beatBarRef: React.RefObject<HTMLDivElement>
// On new dance_beat event:

// Step 1: hard snap to 100% (no transition)
barEl.style.transition = 'width 0ms'
barEl.style.width = '100%'

// Step 2: force layout reflow so the snap is committed before drain starts
void barEl.offsetWidth  // triggers reflow

// Step 3: set drain transition
barEl.style.transition = `width ${beatDurationMs}ms linear`
barEl.style.width = '0%'
```

**Beat duration calculation:** `dance_beat` events arrive once per beat. The beat duration
in ms is the wall-clock delta between consecutive `dance_beat` events. Track `lastBeatTime`
with `performance.now()` and compute `beatDurationMs = performance.now() - lastBeatTime` on
each event. On the first beat, use a fallback (e.g., 500ms) until two beats have arrived.

### Pattern 4: Pixi.js Skeleton Rendering (Graphics API v8)

The existing `PixiCanvas.tsx` uses Pixi v8's `Graphics` API. The `drawBoxer` function
demonstrates the exact patterns needed for the skeleton ghost:

```typescript
// Source: overlay/src/components/PixiCanvas.tsx
// Existing pattern for bones (capsule):
layers.main.moveTo(ax, ay).lineTo(bx, by).stroke({ width: lineW, color: SILHOUETTE_COLOR })
// Existing pattern for joints (circle):
layers.main.circle(x, y, radius).fill({ color: SILHOUETTE_COLOR })

// Dance skeleton ghost — adapted pattern:
// Color: 0x524a42 (--text-dim in hex approx)
// Alpha: set on the Graphics object, not per-draw call

const SKELETON_COLOR = 0x524a42  // --text-dim
const SKELETON_ALPHA = 0.4

function drawTargetPoseSkeleton(
  gfx: Graphics,
  targetPose: Array<[number, number, number, number]>,
  width: number,
  height: number,
) {
  gfx.clear()
  // targetPose uses same hip-centred Y-up normalised coords as player poses
  // Project to screen using same PLAYER_SCALE_Y, PLAYER_CENTER_Y constants
  // but centered at canvas midpoint (not fighter offset)
  const centerX = width / 2
  const centerY = height * PLAYER_CENTER_Y
  const scale = height * PLAYER_SCALE_Y
  const KEYPOINT_RADIUS = scale * 0.02  // smaller than player joints

  // Draw bones
  for (const [a, b] of CONNECTIONS) {
    const kpA = targetPose[a]
    const kpB = targetPose[b]
    if (!kpA || !kpB || kpA[3] < 0.5 || kpB[3] < 0.5) continue
    const ax = centerX + kpA[0] * scale * -1  // flip = -1 (matches player mirror)
    const ay = centerY + kpA[1] * scale
    const bx = centerX + kpB[0] * scale * -1
    const by = centerY + kpB[1] * scale
    gfx.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2, color: SKELETON_COLOR })
  }

  // Draw keypoints
  for (const [x, y, , visibility] of targetPose) {
    if (visibility < 0.5) continue
    const sx = centerX + x * scale * -1
    const sy = centerY + y * scale
    gfx.circle(sx, sy, KEYPOINT_RADIUS).fill({ color: SKELETON_COLOR })
  }
}
```

**Flip direction:** The `flip = -1` mirror from `projectKeypoint` must apply to the ghost
skeleton too. Without the flip, the skeleton will mirror the expected pose. [VERIFIED:
PixiCanvas.tsx line 109 `const flip = -1`]

### Pattern 5: Skeleton Fade (Ticker-Driven, No gsap)

Since gsap is not installed, the fade should be implemented via the Pixi ticker that
already runs in `PixiCanvas.tsx`. The approach:

```typescript
// Inside the Pixi ticker handler (already has access to skeletonGfx):
// State stored in refs (no setState — same pattern as existing hot-path code):

const skeletonFadeRef = useRef<{
  phase: 'idle' | 'fade-out' | 'fade-in'
  startMs: number
  pendingPose: Array<[number, number, number, number]> | null
}>({ phase: 'idle', startMs: 0, pendingPose: null })

// In ticker handler:
const fadeState = skeletonFadeRef.current
const now = performance.now()
if (fadeState.phase === 'fade-out') {
  const t = Math.min(1, (now - fadeState.startMs) / 150)
  skeletonGfx.alpha = SKELETON_ALPHA * (1 - easeOutQuart(t))
  if (t >= 1) {
    // Redraw with new pose
    drawTargetPoseSkeleton(skeletonGfx, fadeState.pendingPose!, w, h)
    fadeState.phase = 'fade-in'
    fadeState.startMs = now
  }
} else if (fadeState.phase === 'fade-in') {
  const t = Math.min(1, (now - fadeState.startMs) / 150)
  skeletonGfx.alpha = SKELETON_ALPHA * t  // ease-in = linear for simplicity
  if (t >= 1) {
    skeletonGfx.alpha = SKELETON_ALPHA
    fadeState.phase = 'idle'
  }
}
```

The `dance_beat` event triggers by setting `fadeState.phase = 'fade-out'`, `fadeState.startMs
= performance.now()`, `fadeState.pendingPose = newTargetPose`.

**Passing `danceBeat` to PixiCanvas:** The cleanest approach is a ref, not a prop that
causes re-renders. Pass `danceBeatRef: React.MutableRefObject<DanceBeat | null>` from
`App.tsx` (similar to how `poseStreamRef` is already passed). The ticker reads from the ref,
compares against the last-drawn beat number to detect new events.

### Pattern 6: Mobile Calibration Skip

`useGameSocket` currently handles `calibration_start` to set `phase = 'calibration'`.
For dance rooms, the server never sends `calibration_start` — it proceeds directly to
`match_start`. The mobile UI currently renders `<CalibrationOverlay>` when
`phase === 'calibration'`. Since dance never enters `'calibration'`, the calibration
skip (DIMPL-05) is partially automatic.

However, DIMPL-05 specifies more precisely: if `game_type === 'dance'` and the phase is
`'calibration'` (e.g. due to reconnect), skip rendering. The safe implementation:

1. Store `gameType` from `MsgJoined` in `useGameSocket` state.
2. In `GameScreen.tsx`, gate `CalibrationOverlay` rendering on
   `phase === 'calibration' && gameType !== 'dance'`.

This requires adding `gameType: string | null` to `UseGameSocketResult`.

### Anti-Patterns to Avoid

- **Animating Pixi `Graphics` via CSS transitions:** Pixi objects are canvas-drawn. `style`
  changes have no effect. Alpha must be set on `Graphics.alpha` directly.
- **Calling `setState` inside the Pixi ticker:** The ticker runs at 60+ fps. `setState`
  inside it causes mass re-renders and frame drops. Use refs for all Pixi-side state (as the
  existing `poseStreamRef` pattern demonstrates).
- **Reading `dance_beat` via prop drilling through PixiCanvas re-renders:** Pass beat data
  via a ref (same as `poseStreamRef`) to avoid React render cycles on every beat.
- **Redrawing the skeleton in a React `useEffect`:** The skeleton must be drawn in the Pixi
  ticker or directly from the beat event handler via a ref mutation. A `useEffect` on
  `danceBeat` state would work but introduces a render-cycle gap.
- **New color tokens for dance:** The UI-SPEC explicitly states no new color tokens are
  introduced in Phase 9. All colors use existing `--text-dim`, `--text-secondary`,
  `--accent-bright`, `--accent-p2-bright` tokens from `:root`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bone connection indices | Custom list of MediaPipe pairs | `CONNECTIONS` from `overlay/src/lib/skeleton.ts` | Already defined with all 35 pairs; changing it risks breaking PoseOverlay in mobile |
| Keypoint coordinate transform | Custom projection formula | Existing `PLAYER_SCALE_Y`, `PLAYER_CENTER_Y`, `flip = -1` constants from `PixiCanvas.tsx` | Ghost skeleton must use identical projection so it appears human-scale relative to live silhouettes |
| Beat duration timing | Server-provided field | Compute from wall-clock delta between `dance_beat` events | Server does not send beat duration; must derive it locally |
| Score format (1 decimal) | `score.toFixed(2)` | `score.toFixed(1)` | UI-SPEC specifies one decimal; using two breaks the visual spec |

**Key insight:** The ghost skeleton shares the same coordinate system as the live player
silhouettes. Diverging from the existing projection constants will make the ghost appear
at wrong scale or position relative to the players.

---

## Existing Code Deep Dive: What Must Change

### `overlay/src/hooks/useSpectatorSocket.ts`

**Currently:** No handling of `joined`, `dance_beat`, `dance_score`, `dance_snapshot`
message types. The `ServerMessage` union in `protocol.ts` does include `MsgDanceBeat`
and `MsgDanceScore` [VERIFIED: shared/protocol.ts line 207-220], but the hook's message
handler has no cases for them — they fall through to the `console.warn` path.

**Changes needed:**
- Add state: `gameType`, `danceScores`, `danceBeat`
- Add message handlers: `joined`, `dance_beat`, `dance_score`, `dance_snapshot`
- Return these from the hook

### `overlay/src/App.tsx`

**Currently:** Renders `<HudLayer>` unconditionally. No access to `gameType`.

**Changes needed:**
- Destructure `gameType`, `danceScores`, `danceBeat` from `useSpectatorSocket`
- Replace `<HudLayer>` with conditional branch
- Pass `danceBeatRef` (a ref wrapping `danceBeat`) to `<PixiCanvas>` for skeleton access

### `overlay/src/components/HudLayer.tsx`

**No changes.** Boxing-only component. `DanceHud` is a new sibling component.

### `overlay/src/components/PixiCanvas.tsx`

**Currently:** Creates `skeletonContainer`, adds two `PlayerLayers` to it. No dance state.

**Changes needed:**
- Accept `danceBeatRef: React.MutableRefObject<DanceBeat | null>` prop
- Create a `skeletonGfx: Graphics` object and add to `skeletonContainer`
- In the ticker handler, check `danceBeatRef.current` for new beats (by beat number)
- Implement fade-out → redraw → fade-in via refs and `skeletonGfx.alpha`
- Clean up `skeletonGfx` in the cleanup function

### `overlay/src/components/RoundOverlay.tsx`

**Currently:** `hasEnd` branch renders `ROUND N — P{winner} WINS`. `hasMatch` branch renders
`.ko-text`, `.match-end-title`, `.match-stats`, `.rematch-btn`.

**Changes needed:**
- Accept `gameType: 'boxing' | 'dance' | null` prop
- Accept `danceScores: [number, number]` prop (for match end + round end copy)
- In `hasEnd` branch: if `gameType === 'dance'`, render `ROUND N — P{winner} LEADS` (or
  `ROUND N — TIED` if winner is null)
- In `hasMatch` branch: if `gameType === 'dance'`, render dance match end layout (no `.ko-text`,
  no `.match-end-title`, no `.match-stats`); if `gameType === 'boxing'`, render existing content

### `mobile/src/hooks/useGameSocket.ts`

**Currently:** `joined` handler sets `assignedSlot` and `opponentConnected` only.

**Changes needed:**
- Add `gameType: string | null` to state and return type
- In `joined` handler: `setGameType(msg.game_type ?? null)`

### `mobile/src/components/GameScreen.tsx`

**Currently:** Renders `<CalibrationOverlay>` when `phase === 'calibration' && isReady && modelStatus === 'ready'`.

**Changes needed:**
- Accept `gameType: string | null` prop
- Gate calibration rendering: `phase === 'calibration' && gameType !== 'dance' && isReady && modelStatus === 'ready'`
- The `'calibration'` phase itself is never entered for dance (server sends `match_start`
  directly), so the gate is defensive but correct.

---

## Common Pitfalls

### Pitfall 1: `MsgDanceBeat.beat` as bigint

**What goes wrong:** The ts-rs-generated binding in `.claude/worktrees/shared/MsgDanceBeat.ts`
types `beat` and `total_beats` as `bigint`. If the planner/executor references the worktree
file instead of `shared/protocol.ts`, they may introduce `BigInt` handling where `number`
is sufficient.

**Why it happens:** ts-rs maps Rust `u64` to TypeScript `bigint` by default. The `shared/protocol.ts`
file has a hand-edited `number` type for these fields.

**How to avoid:** Always import from `@shared/protocol`, not from worktree bindings.
`shared/protocol.ts` is the canonical TypeScript protocol — it has `beat: number` and
`total_beats: number`. [VERIFIED: shared/protocol.ts line 172-184]

**Warning signs:** TypeScript errors about `bigint` not assignable to `number` in
beat counter display logic.

### Pitfall 2: `dance_snapshot` message type

**What goes wrong:** When a spectator joins mid-dance, the server sends a `dance_snapshot`
message (type string `"dance_snapshot"`) before the live stream. This is not in
`shared/protocol.ts` — it is described in Phase 7 context (07-CONTEXT.md D-02) as
`type: "dance_snapshot"`. If the hook doesn't handle this message type, the initial
score state will remain at `[0, 0]` even if joining mid-match.

**Why it happens:** `dance_snapshot` was intentionally distinct from `dance_score` to
distinguish initial state from live updates (per 07-CONTEXT.md specifics).

**How to avoid:** Handle `parsed.type === 'dance_snapshot'` in `useSpectatorSocket` as a
`danceScores` initializer. No type definition needed — parse as `{ scores: [number, number] }`.

**Warning signs:** Spectator joining mid-dance sees `0.0 vs 0.0` even though a round is
in progress, then suddenly jumps when the next `dance_score` arrives.

### Pitfall 3: `PixiCanvas` Ticker Closure Over Stale `danceBeat`

**What goes wrong:** If `danceBeat` from React state is captured in the Pixi ticker closure,
it will go stale after the first beat. Subsequent beats won't trigger redraws.

**Why it happens:** The Pixi ticker is registered once in `useEffect([], [])`. Any React
state captured at that point becomes stale.

**How to avoid:** Pass beat data via a `MutableRefObject` (same pattern as `poseStreamRef`).
The ticker always reads `danceBeatRef.current` which is the latest value.

**Warning signs:** Skeleton only updates on the first beat and then freezes.

### Pitfall 4: Beat Bar Reflow Required for CSS Snap

**What goes wrong:** Setting `transition: width 0ms` then `width: 100%` then
`transition: width ${n}ms linear` then `width: 0%` all in the same JavaScript event loop
tick causes the browser to batch them — the snap-to-100% is skipped and only the drain
animation runs, starting from wherever the bar currently was.

**Why it happens:** Browser CSS rendering batches style changes within a single JS task.

**How to avoid:** Force a style reflow between the snap and the drain by reading a layout
property (`void el.offsetWidth`). [ASSUMED based on known browser CSS batching behavior —
standard technique]

**Warning signs:** The beat bar always starts draining from a partially-filled position
instead of from 100%.

### Pitfall 5: `RoundOverlay` needs `gameType` but currently has no prop for it

**What goes wrong:** `RoundOverlay` in `App.tsx` is rendered without a `gameType` prop
today. The executor must thread `gameType` all the way from `useSpectatorSocket` through
`App.tsx` to `RoundOverlay`. Missing this makes the match-end screen show boxing content
(K.O. text) for dance rooms.

**Why it happens:** `gameType` is a new state field; no existing prop exists.

**How to avoid:** In 09-01, when adding `gameType` to `useSpectatorSocket`, also update the
plan note that `App.tsx` must thread it to `RoundOverlay` in 09-04.

### Pitfall 6: Ghost Skeleton Coordinate Flip

**What goes wrong:** The skeleton appears horizontally mirrored relative to the target pose.

**Why it happens:** The existing `projectKeypoint` uses `flip = -1` to mirror player
silhouettes. The ghost skeleton must use the same flip. Without it, pose matching looks
impossible (left/right are swapped).

**How to avoid:** Use `centerX + x * scale * -1` for ghost skeleton X coordinates.
[VERIFIED: PixiCanvas.tsx line 109-111]

---

## Code Examples

### Existing `useSpectatorSocket` message handler structure

```typescript
// Source: overlay/src/hooks/useSpectatorSocket.ts lines 147-258
// The message handler is a switch-style chain of `if (parsed.type === ...)` blocks.
// New dance handlers must be inserted before the final `console.warn`:

if (parsed.type === 'joined') {
  // new — DIMPL-01
  return
}
if (parsed.type === 'dance_beat') {
  // new — DIMPL-01, DIMPL-02, DIMPL-03
  return
}
if (parsed.type === 'dance_score') {
  // new — DIMPL-01, DIMPL-02
  return
}
if (parsed.type === 'dance_snapshot') {
  // new — spectator mid-join state
  return
}
// existing handlers continue...
```

### Existing Pixi ticker structure in `PixiCanvas.tsx`

```typescript
// Source: overlay/src/components/PixiCanvas.tsx lines 453-536
// The ticker handler runs every frame. New skeleton logic goes at the end,
// after the per-player pose loop and emitter.update():

const handler = (ticker: { deltaTime: number }) => {
  // ... existing player pose rendering ...
  emitter.update(ticker.deltaTime)

  // NEW: Dance skeleton fade/redraw
  // (only execute if skeletonGfx exists and danceBeatRef is set)
}
```

### `CONNECTIONS` array from `skeleton.ts`

```typescript
// Source: overlay/src/lib/skeleton.ts lines 1-37
// 35 bone pairs, e.g.:
// [11, 12], [11, 23], [12, 24], [23, 24],  — torso
// [11, 13], [13, 15],                        — left arm
// [12, 14], [14, 16],                        — right arm
// [23, 25], [25, 27],                        — left leg
// [24, 26], [26, 28],                        — right leg
// Use directly: import { CONNECTIONS } from '../lib/skeleton'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No game-type routing in overlay | Phase 9 adds `gameType` field from `MsgJoined` | Phase 9 (now) | App.tsx render branch is new pattern |
| Pose-only Pixi canvas | Pixi canvas with static ghost skeleton layer | Phase 9 (now) | Ghost uses same `Graphics` API as player layers |

**Deprecated / changed in phase 7 (already complete):**
- `MsgJoined` previously had no `game_type` field — now it does [VERIFIED: shared/protocol.ts line 57-63]
- `MsgDanceBeat` and `MsgDanceScore` are now typed in `shared/protocol.ts` [VERIFIED: lines 172-185]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Beat duration must be computed from wall-clock delta between `dance_beat` events — server does not send beat duration | Standard Stack; Pattern 3 | If server does send beat duration in `MsgDanceBeat`, use that instead; the wire type in `shared/protocol.ts` does not show a `duration` field [VERIFIED: lines 172-178] |
| A2 | `dance_snapshot` message uses `type: "dance_snapshot"` and shape `{ scores: [number, number] }` | Pattern 2 pitfall handling | If the engine sends a different type string or shape, the snapshot handler will not fire. Verify against actual engine output when running. [CITED: 07-CONTEXT.md specifics section] |
| A3 | CSS `void el.offsetWidth` reliably forces reflow for beat bar snap-drain transition | Pitfall 4 | Standard browser behavior but technically implementation-defined; `requestAnimationFrame` double-frame trick is an alternative if this fails |
| A4 | The `flip = -1` mirror should apply to the ghost skeleton | Code Examples (skeleton) | Depends on how the dance plugin generates target poses — if they are already in screen-space or have a different orientation convention. This is the most likely visual bug to encounter. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | overlay package install | ✓ | — | — |
| pixi.js | Skeleton rendering | ✓ | ^8.18.1 | — |
| gsap | Skeleton alpha animation (UI-SPEC mention) | ✗ (not installed) | — | Pixi ticker-driven fade (no new dependency) |
| shared/protocol.ts `MsgDanceBeat` / `MsgDanceScore` | Overlay dance state | ✓ | Present | — |
| shared/protocol.ts `MsgJoined.game_type` | game_type routing | ✓ | Present | — |

**Missing dependencies with fallback:**
- gsap: UI-SPEC incorrectly assumed it was already installed. Fallback is a manual
  `performance.now()` + Pixi ticker alpha interpolation. This is the recommended approach
  since it avoids adding a production dependency.

---

## Open Questions

1. **Is `dance_snapshot` actually emitted by the current engine build?**
   - What we know: Phase 7 context (07-CONTEXT.md) describes it as intended behavior.
   The engine code adds `plugin.spectator_snapshot()` call in `room.rs` [VERIFIED: room.rs line 175].
   - What's unclear: Whether the DancePlugin's `spectator_snapshot` implementation returns `Some(...)` only when `round_started && !round_ended` (per 07-CONTEXT.md specifics), or always.
   - Recommendation: Handle `dance_snapshot` defensively. If it never fires, the hook falls back to zero scores — acceptable initial state.

2. **Does the `rematch` flow need dance-specific reset of `danceScores` and `danceBeat`?**
   - What we know: `rematch_start` message handling in `useSpectatorSocket` already resets boxing state (wins, damage, etc.). [VERIFIED: useSpectatorSocket.ts lines 239-251]
   - What's unclear: Whether dance scores should reset to `[0, 0]` on rematch.
   - Recommendation: Yes — add `setDanceScores([0, 0])` and `setDanceBeat(null)` to the `rematch_start` handler.

3. **Should `<DanceHud>` be a sibling inside `<div class="hud-layer">` or a completely separate element?**
   - What we know: UI-SPEC says "Sibling to `HudLayer`. Renders inside the same `.hud-layer` / `.hud-band` shell." [VERIFIED: 09-UI-SPEC.md line 155]
   - Recommendation: `DanceHud` renders the `.hud-layer` wrapper itself, just like `HudLayer`. Both are in the same CSS layer stack. They are conditionally rendered — never both visible simultaneously.

---

## Sources

### Primary (HIGH confidence)

- `overlay/src/hooks/useSpectatorSocket.ts` — full file read; current state fields, message handlers, return type
- `overlay/src/App.tsx` — full file read; current render structure, HudLayer usage
- `overlay/src/components/HudLayer.tsx` — full file read; two-row band structure, CSS class names
- `overlay/src/components/PixiCanvas.tsx` — full file read; Pixi v8 Graphics API, ticker pattern, projection constants, CONNECTIONS usage, container structure
- `overlay/src/components/RoundOverlay.tsx` — full file read; match-end overlay structure, existing CSS classes
- `overlay/src/lib/skeleton.ts` — full file read; CONNECTIONS array (35 pairs)
- `overlay/src/index.css` — read; all CSS custom properties, `.hud-band`, `.hud-names`, `.match-end-overlay`, `.round-flash`, color tokens
- `overlay/package.json` — full file read; confirmed gsap is NOT installed
- `shared/protocol.ts` — full file read; MsgJoined.game_type, MsgDanceBeat, MsgDanceScore shapes confirmed
- `mobile/src/hooks/useGameSocket.ts` — full file read; GamePhase type, joined handler, phase transitions
- `mobile/src/components/GameScreen.tsx` — full file read; CalibrationOverlay gate, phase checks
- `mobile/src/App.tsx` — full file read; gameType URL param handling
- `.planning/phases/09-dance-frontend/09-UI-SPEC.md` — full file read; visual and interaction contract
- `.planning/phases/08-dance-ux-design/08-CONTEXT.md` — full file read; locked design decisions D-01 through D-12
- `.planning/phases/07-dance-engine-protocol/07-CONTEXT.md` — full file read; protocol decisions D-01 through D-05
- `engine/engine-core/src/room.rs` (lines referenced via grep) — confirmed `spectator_snapshot` call exists
- `.claude/worktrees/shared/MsgDanceBeat.ts`, `MsgDanceScore.ts`, `MsgJoined.ts` — read; confirmed `bigint` typing in ts-rs output vs `number` in shared/protocol.ts

### Secondary (MEDIUM confidence)

- `engine/engine-core/src/protocol.rs` (grep output) — dance message type defaults confirmed in Rust source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by package.json inspection
- Architecture: HIGH — all files read directly; pattern is clear
- Pitfalls: HIGH (bigint issue, missing gsap, reflow technique) / MEDIUM (skeleton flip, snapshot shape)
- Assumptions: A1–A4 tagged; only A2 (snapshot shape) is substantive risk

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (stable project; no external dependency drift)
