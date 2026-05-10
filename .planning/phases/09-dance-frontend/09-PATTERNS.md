# Phase 9: Dance Frontend - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `overlay/src/hooks/useSpectatorSocket.ts` | hook | event-driven (WebSocket state) | itself (modification) | self |
| `overlay/src/App.tsx` | component (root) | request-response (render branch) | itself (modification) | self |
| `overlay/src/components/DanceHud.tsx` | component | event-driven (ref + state display) | `overlay/src/components/HudLayer.tsx` | exact role-match |
| `overlay/src/components/PixiCanvas.tsx` | component (canvas) | event-driven (ticker-driven rendering) | itself (modification) | self |
| `overlay/src/components/RoundOverlay.tsx` | component | event-driven (state display, timers) | itself (modification) | self |
| `mobile/src/hooks/useGameSocket.ts` + `mobile/src/components/GameScreen.tsx` | hook + component | event-driven (WebSocket + phase gate) | themselves (modification) | self |

---

## Pattern Assignments

### `overlay/src/hooks/useSpectatorSocket.ts` (hook, event-driven — MODIFIED)

**Analog:** The file itself. All patterns are in-file extensions.

**Existing state declaration pattern** (lines 47–59):
```typescript
interface SpectatorSocketState {
  gameState: MsgGameState | null
  roundState: RoundState | null
  matchWinner: PlayerSlot | null
  matchStats: MatchStats | null
  wins: [number, number]
  maxWins: number
  lobbyState: LobbyState
  connected: boolean
  disconnectedPlayer: PlayerSlot | null
  poseStreamRef: React.MutableRefObject<PoseStream>
  socket: WebSocket | null
}
```
New fields to add to `SpectatorSocketState`:
```typescript
gameType: 'boxing' | 'dance' | null
danceScores: [number, number]
danceBeat: { beat: number; totalBeats: number; targetPose: Array<[number, number, number, number]> } | null
```

**Existing useState pattern** (lines 108–124):
```typescript
const [gameState, setGameState] = useState<MsgGameState | null>(null)
const [wins, setWins] = useState<[number, number]>([0, 0])
```
New state declarations to add (same pattern):
```typescript
const [gameType, setGameType] = useState<'boxing' | 'dance' | null>(null)
const [danceScores, setDanceScores] = useState<[number, number]>([0, 0])
const [danceBeat, setDanceBeat] = useState<{ beat: number; totalBeats: number; targetPose: Array<[number, number, number, number]> } | null>(null)
```

**Existing message handler pattern** (lines 160–258) — `if (parsed.type === ...)` chain:
```typescript
if (parsed.type === 'pose_update') { /* hot path — mutate ref */ return }
if (parsed.type === 'lobby_update') { setLobbyState(...); return }
if (parsed.type === 'game_state') { setGameState(parsed); ...; return }
if (parsed.type === 'round_start') { ...; return }
if (parsed.type === 'round_end') { ...; return }
if (parsed.type === 'match_end') { ...; return }
if (parsed.type === 'rematch_start') { ...; return }
if (parsed.type === 'player_disconnected') { ...; return }
console.warn('useSpectatorSocket: unknown message type', parsed)
```
Insert four new handlers **before** the `console.warn` (after `player_disconnected`):
```typescript
if (parsed.type === 'joined') {
  const gt = (parsed as { game_type?: string }).game_type
  if (gt === 'boxing' || gt === 'dance') setGameType(gt)
  return
}
if (parsed.type === 'dance_beat') {
  const msg = parsed as MsgDanceBeat
  setDanceBeat({ beat: msg.beat, totalBeats: msg.total_beats, targetPose: msg.target_pose })
  return
}
if (parsed.type === 'dance_score') {
  const msg = parsed as MsgDanceScore
  setDanceScores([msg.scores[0], msg.scores[1]])
  return
}
if (parsed.type === 'dance_snapshot') {
  const snap = parsed as { scores: [number, number] }
  setDanceScores([snap.scores[0], snap.scores[1]])
  return
}
```

**`rematch_start` reset pattern** (lines 239–251) — add dance resets alongside existing ones:
```typescript
if (parsed.type === 'rematch_start') {
  setMatchWinner(null)
  setMatchStats(null)
  setGameState(null)
  setWins([0, 0])
  setRoundState({ number: 1, phase: 'waiting' })
  poseStreamRef.current = makePoseStream()
  damageAccRef.current = [0, 0]
  hitsAccRef.current = [0, 0]
  roundsPlayedRef.current = 0
  lastStatTickRef.current = -1
  // ADD: dance resets
  setDanceScores([0, 0])
  setDanceBeat(null)
  return
}
```

**Import additions** (lines 1–10):
```typescript
// Add to existing imports from '@shared/protocol':
import type { MsgDanceBeat, MsgDanceScore } from '@shared/protocol'
```
Note: `MsgJoined` is in `InboundServerMsg` but the spectator hook's `IncomingMessage` type (line 93) is `ServerMessage | MsgPlayerDisconnected | MsgPoseUpdate`. `MsgJoined` is NOT in `ServerMessage`. Handle it via raw type-string check `parsed.type === 'joined'` without type casting through `IncomingMessage` — the `isIncomingMessage` guard (line 95) only checks for `{ type: string }`, so `joined` messages pass through.

**Return statement** (lines 286–298) — add new fields:
```typescript
return {
  connected,
  disconnectedPlayer,
  gameState,
  matchWinner,
  matchStats,
  wins,
  maxWins,
  lobbyState,
  roundState,
  poseStreamRef,
  socket,
  // ADD:
  gameType,
  danceScores,
  danceBeat,
}
```

---

### `overlay/src/App.tsx` (component/root, request-response — MODIFIED)

**Analog:** The file itself.

**Existing destructure pattern** (lines 21–32):
```typescript
const {
  connected,
  disconnectedPlayer,
  gameState,
  matchWinner,
  matchStats,
  wins,
  maxWins,
  lobbyState,
  roundState,
  poseStreamRef,
  socket,
} = useSpectatorSocket(serverUrl, roomCode)
```
Add `gameType`, `danceScores`, `danceBeat` to the destructure.

**Existing ref-passing pattern** — `poseStreamRef` (line 69):
```typescript
<PixiCanvas
  gameState={gameState}
  poseStreamRef={poseStreamRef}
  onHeavyHit={handleHeavyHit}
/>
```
Add a `danceBeatRef` created from `danceBeat` (using `useRef` + `useEffect` to keep it current), and pass it to `PixiCanvas`. Pattern for creating a stable ref from state:
```typescript
const danceBeatRef = useRef(danceBeat)
useEffect(() => { danceBeatRef.current = danceBeat }, [danceBeat])
```

**Existing unconditional HUD render** (lines 75–85):
```tsx
<HudLayer
  connected={connected}
  ...
/>
```
Replace with conditional branch:
```tsx
{gameType === 'boxing' && (
  <HudLayer
    connected={connected}
    disconnectedPlayer={disconnectedPlayer}
    highLatency={gameState?.high_latency ?? false}
    hp={hp}
    wins={wins}
    maxWins={maxWins}
    remainingTime={remainingTime}
    round={roundNumber}
    roomCode={roomCode}
  />
)}
{gameType === 'dance' && (
  <DanceHud
    connected={connected}
    danceScores={danceScores}
    danceBeat={danceBeat}
  />
)}
```

**Existing RoundOverlay render** (lines 87–93):
```tsx
<RoundOverlay
  matchWinner={matchWinner}
  matchStats={matchStats}
  roundState={roundState}
  serverUrl={serverUrl}
  roomCode={roomCode}
/>
```
Thread `gameType` and `danceScores` through:
```tsx
<RoundOverlay
  matchWinner={matchWinner}
  matchStats={matchStats}
  roundState={roundState}
  serverUrl={serverUrl}
  roomCode={roomCode}
  gameType={gameType}
  danceScores={danceScores}
/>
```

**Import addition:**
```typescript
import { DanceHud } from './components/DanceHud'
```

---

### `overlay/src/components/DanceHud.tsx` (component, event-driven — NEW)

**Analog:** `overlay/src/components/HudLayer.tsx`

**Imports pattern** (HudLayer.tsx lines 1–2):
```typescript
import type { CSSProperties } from 'react'
import type { HpPair, PlayerSlot } from '@shared/protocol'
```
DanceHud equivalent:
```typescript
import { useEffect, useRef } from 'react'
```
No protocol types needed — props carry already-typed state.

**Props interface pattern** (HudLayer.tsx lines 4–14):
```typescript
interface HudLayerProps {
  connected: boolean
  disconnectedPlayer: PlayerSlot | null
  highLatency: boolean
  hp: HpPair
  wins: [number, number]
  maxWins: number
  remainingTime: number
  round: number
  roomCode: string
}
```
DanceHud equivalent:
```typescript
interface DanceHudProps {
  connected: boolean
  danceScores: [number, number]
  danceBeat: { beat: number; totalBeats: number; targetPose: Array<[number, number, number, number]> } | null
}
```

**`.hud-layer` / `.hud-band` shell pattern** (HudLayer.tsx lines 52–95):
```tsx
return (
  <div className="hud-layer">
    <div className="hud-band">
      <div className="hud-names">          {/* Row 1: names + win dots */}
        <div className="hud-p1-name">...</div>
        <div className="hud-center-name">...</div>
        <div className="hud-p2-name">...</div>
      </div>
      <div className="hud-bars">          {/* Row 2: HP bars */}
        ...
      </div>
    </div>
  </div>
)
```
DanceHud reuses `.hud-layer` and `.hud-band` directly. Replace Row 1 center with beat indicator, replace Row 2 bars with score row:
```tsx
export function DanceHud({ connected, danceScores, danceBeat }: DanceHudProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const lastBeatTimeRef = useRef<number>(0)
  const beatDurationMsRef = useRef<number>(500)

  useEffect(() => {
    if (!danceBeat || !barRef.current) return
    const barEl = barRef.current
    const now = performance.now()
    if (lastBeatTimeRef.current > 0) {
      beatDurationMsRef.current = now - lastBeatTimeRef.current
    }
    lastBeatTimeRef.current = now
    const beatDurationMs = beatDurationMsRef.current

    // Step 1: hard snap to 100%
    barEl.style.transition = 'width 0ms'
    barEl.style.width = '100%'
    // Step 2: force reflow so snap commits before drain
    void barEl.offsetWidth
    // Step 3: drain transition
    barEl.style.transition = `width ${beatDurationMs}ms linear`
    barEl.style.width = '0%'
  }, [danceBeat])

  const beatLabel = danceBeat
    ? `${danceBeat.beat} / ${danceBeat.totalBeats}`
    : '— / —'

  return (
    <div className="hud-layer">
      <div className="hud-band">
        {/* Row 1: P1 | Beat Indicator | P2 */}
        <div className="hud-names">
          <div className="hud-p1-name">
            <span className="hud-label">P1</span>
          </div>
          <div className="hud-center-name dance-beat-indicator">
            <div className="dance-beat-label">{beatLabel}</div>
            <div className="dance-beat-track">
              <div className="dance-beat-fill" ref={barRef} />
            </div>
          </div>
          <div className="hud-p2-name">
            <span className="hud-label">P2</span>
          </div>
        </div>

        {/* Row 2: Scores */}
        <div className="hud-bars dance-score-row">
          <span className="dance-score dance-score-p1">
            {danceScores[0].toFixed(1)}
          </span>
          <span className="dance-score-sep">vs</span>
          <span className="dance-score dance-score-p2">
            {danceScores[1].toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  )
}
```

**CSS classes to add** to `overlay/src/index.css` (pattern: follow `.hud-band`, `.hud-names` conventions — no new color tokens, all colors use existing custom properties):
```css
.dance-beat-indicator {
  width: 40%;   /* center column occupies 40% of hud-band */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.dance-beat-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.dance-beat-track {
  width: 100%;
  height: 4px;
  background: var(--bg-surface);
}
.dance-beat-fill {
  height: 100%;
  background: var(--text-secondary);
  width: 0%;
}
.dance-score-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}
.dance-score {
  font-size: 36px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.dance-score-sep {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

---

### `overlay/src/components/PixiCanvas.tsx` (component/canvas, event-driven — MODIFIED)

**Analog:** The file itself.

**Existing props interface** (lines 9–13):
```typescript
interface PixiCanvasProps {
  gameState: MsgGameState | null
  poseStreamRef: MutableRefObject<PoseStream>
  onHeavyHit?: () => void
}
```
Add `danceBeatRef`:
```typescript
interface PixiCanvasProps {
  gameState: MsgGameState | null
  poseStreamRef: MutableRefObject<PoseStream>
  danceBeatRef: MutableRefObject<{ beat: number; totalBeats: number; targetPose: Array<[number, number, number, number]> } | null>
  onHeavyHit?: () => void
}
```

**Existing container setup pattern** (lines 438–446):
```typescript
const skeletonContainer = new Container()
const sparkContainer = new Container()
app.stage.addChild(skeletonContainer)
app.stage.addChild(sparkContainer)

playerLayersRef.current = [
  createPlayerLayers(skeletonContainer),
  createPlayerLayers(skeletonContainer),
]
```
After creating `playerLayersRef`, add the ghost skeleton Graphics:
```typescript
const skeletonGfx = new Graphics()
skeletonGfx.alpha = 0
skeletonContainer.addChild(skeletonGfx)
```

**Existing CONNECTIONS-based line/circle pattern from skeleton.ts and PixiCanvas drawArmTrailFromPts** (lines 334–356):
```typescript
g.moveTo(sl.x, sl.y).lineTo(le.x, le.y).stroke({ width: lineW, color: SILHOUETTE_COLOR })
g.circle(lw.x, lw.y, lineW * 2).fill({ color: SILHOUETTE_COLOR })
```
New `drawTargetPoseSkeleton` function (add after existing drawing helpers, before `createPoseBuffer`):
```typescript
const SKELETON_COLOR = 0x524a42   // --text-dim hex approx
const SKELETON_ALPHA = 0.4

function drawTargetPoseSkeleton(
  gfx: Graphics,
  targetPose: Array<[number, number, number, number]>,
  width: number,
  height: number,
) {
  gfx.clear()
  const centerX = width / 2
  const centerY = height * PLAYER_CENTER_Y
  const scale = height * PLAYER_SCALE_Y
  const KEYPOINT_RADIUS = scale * 0.02

  for (const [a, b] of CONNECTIONS) {
    const kpA = targetPose[a]
    const kpB = targetPose[b]
    if (!kpA || !kpB || kpA[3] < 0.5 || kpB[3] < 0.5) continue
    const ax = centerX + kpA[0] * scale * -1   // flip = -1, same as projectKeypoint
    const ay = centerY + kpA[1] * scale
    const bx = centerX + kpB[0] * scale * -1
    const by = centerY + kpB[1] * scale
    gfx.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2, color: SKELETON_COLOR })
  }

  for (const [x, y, , visibility] of targetPose) {
    if (visibility < 0.5) continue
    const sx = centerX + x * scale * -1
    const sy = centerY + y * scale
    gfx.circle(sx, sy, KEYPOINT_RADIUS).fill({ color: SKELETON_COLOR })
  }
}
```

**Existing `useRef` for fade state** — mirror `armTrailRef` pattern (line 410):
```typescript
const armTrailRef = useRef<ArmTrailSnapshot[]>([createArmTrail(), createArmTrail()])
```
Add alongside it:
```typescript
const skeletonFadeRef = useRef<{
  phase: 'idle' | 'fade-out' | 'fade-in'
  startMs: number
  pendingPose: Array<[number, number, number, number]> | null
  lastDrawnBeat: number
}>({ phase: 'idle', startMs: 0, pendingPose: null, lastDrawnBeat: -1 })
```

**Existing ticker handler end pattern** (lines 534–537):
```typescript
        emitter.update(ticker.deltaTime)
      }
      tickerHandlerRef.current = handler
      app.ticker.add(handler)
```
Add skeleton fade/redraw logic at end of handler, after `emitter.update(ticker.deltaTime)`:
```typescript
        emitter.update(ticker.deltaTime)

        // Dance skeleton ghost — fade-out → redraw → fade-in
        const beatData = danceBeatRef.current
        const fadeState = skeletonFadeRef.current
        if (beatData && beatData.beat !== fadeState.lastDrawnBeat && fadeState.phase === 'idle') {
          fadeState.phase = 'fade-out'
          fadeState.startMs = performance.now()
          fadeState.pendingPose = beatData.targetPose
          fadeState.lastDrawnBeat = beatData.beat
        }

        if (fadeState.phase === 'fade-out') {
          const t = Math.min(1, (now - fadeState.startMs) / 150)
          skeletonGfx.alpha = SKELETON_ALPHA * (1 - t * t * t * t)  // ease-out-quart
          if (t >= 1) {
            drawTargetPoseSkeleton(skeletonGfx, fadeState.pendingPose!, w, h)
            fadeState.phase = 'fade-in'
            fadeState.startMs = now
          }
        } else if (fadeState.phase === 'fade-in') {
          const t = Math.min(1, (now - fadeState.startMs) / 150)
          skeletonGfx.alpha = SKELETON_ALPHA * t
          if (t >= 1) {
            skeletonGfx.alpha = SKELETON_ALPHA
            fadeState.phase = 'idle'
          }
        }
```

**Existing cleanup pattern** (lines 545–583):
```typescript
return () => {
  cancelled = true
  ...
  for (const layers of layersList) { destroyPlayerLayers(layers) }
  if (emitter) { emitter.destroy() }
  if (currentApp) { currentApp.destroy(true, { children: true, texture: true }) ... }
  appRef.current = null
  emitterRef.current = null
  playerLayersRef.current = []
  ...
}
```
Add `skeletonGfx.destroy()` before `currentApp.destroy(...)`. Also reset `skeletonFadeRef.current` in cleanup.

**Import addition** (line 1):
```typescript
// Add CONNECTIONS to existing skeleton-related imports
import { CONNECTIONS } from '../lib/skeleton'
```

---

### `overlay/src/components/RoundOverlay.tsx` (component, event-driven — MODIFIED)

**Analog:** The file itself.

**Existing props interface** (lines 7–13):
```typescript
interface RoundOverlayProps {
  roundState: RoundState | null;
  matchWinner: PlayerSlot | null;
  matchStats: MatchStats | null;
  serverUrl: string;
  roomCode: string;
}
```
Add `gameType` and `danceScores`:
```typescript
interface RoundOverlayProps {
  roundState: RoundState | null;
  matchWinner: PlayerSlot | null;
  matchStats: MatchStats | null;
  serverUrl: string;
  roomCode: string;
  gameType: 'boxing' | 'dance' | null;
  danceScores: [number, number];
}
```

**Existing `hasEnd` render branch** (lines 141–144):
```tsx
{hasEnd && (
  <div key={`round-end-${endRound}-${endWinner}`} className="round-flash">
    ROUND {endRound} — P{endWinner} WINS
  </div>
)}
```
Replace with game-type conditional:
```tsx
{hasEnd && (
  <div key={`round-end-${endRound}-${endWinner}`} className="round-flash">
    {gameType === 'dance'
      ? endWinner
        ? `ROUND ${endRound} — P${endWinner} LEADS`
        : `ROUND ${endRound} — TIED`
      : `ROUND ${endRound} — P${endWinner} WINS`}
    {gameType === 'dance' && (
      <div className="round-flash-subscores">
        P1: {danceScores[0].toFixed(1)}&nbsp;&nbsp;P2: {danceScores[1].toFixed(1)}
      </div>
    )}
  </div>
)}
```

**Existing `hasMatch` render branch** (lines 146–192):
```tsx
{hasMatch && (
  <div className="match-end-overlay">
    <div className="ko-text">K.O.</div>
    <div className="match-end-title">PLAYER {matchWinner} WINS</div>
    {matchStats && ( ... )}
    <button className="rematch-btn" ...>...</button>
  </div>
)}
```
Replace with game-type conditional:
```tsx
{hasMatch && (
  <div className="match-end-overlay">
    {gameType === 'dance' ? (
      // Dance match end — no K.O., no HP, no damage stats
      <>
        {matchWinner ? (
          <div className={`dance-match-winner-label dance-match-winner-label-p${matchWinner}`}>
            WINNER
          </div>
        ) : (
          <div className="dance-match-winner-label" style={{ color: 'var(--text-secondary)' }}>
            TIED
          </div>
        )}
        <div className="dance-match-score-row">
          <div className="dance-match-score-col">
            <span className={`dance-match-score dance-match-score-winner-p${matchWinner}`}>
              {matchWinner === 1 ? danceScores[0].toFixed(1) : danceScores[1].toFixed(1)}
            </span>
            <span className="dance-match-player-label">P{matchWinner}</span>
          </div>
          <span className="dance-match-vs">vs</span>
          <div className="dance-match-score-col">
            <span className="dance-match-score dance-match-score-loser">
              {matchWinner === 1 ? danceScores[1].toFixed(1) : danceScores[0].toFixed(1)}
            </span>
            <span className="dance-match-player-label">P{matchWinner === 1 ? 2 : 1}</span>
          </div>
        </div>
        <button className="rematch-btn" type="button" onClick={handleRematch} disabled={rematching}>
          {rematching ? 'REMATCHING…' : 'Play Again'}
        </button>
      </>
    ) : (
      // Boxing match end — existing content unchanged
      <>
        <div className="ko-text">K.O.</div>
        <div className="match-end-title">PLAYER {matchWinner} WINS</div>
        {matchStats && ( /* existing matchStats block unchanged */ )}
        <button className="rematch-btn" type="button" onClick={handleRematch} disabled={rematching}>
          {rematching ? 'REMATCHING…' : 'REMATCH'}
        </button>
      </>
    )}
  </div>
)}
```

**CSS classes to add** for dance match end (pattern: follow `.match-end-overlay`, `.ko-text`, `.match-end-title`):
```css
/* Dance match end */
.dance-match-winner-label {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  animation: fade-in-up 0.4s ease both;
}
.dance-match-winner-label-p1 { color: var(--accent-bright); }
.dance-match-winner-label-p2 { color: var(--accent-p2-bright); }

.dance-match-score-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24px;
  animation: fade-in-up 0.4s ease 0.1s both;
}
.dance-match-score-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.dance-match-score {
  font-size: clamp(48px, 8vw, 96px);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.dance-match-score-winner-p1 { color: var(--accent-bright); }
.dance-match-score-winner-p2 { color: var(--accent-p2-bright); }
.dance-match-score-loser { color: var(--text-secondary); }
.dance-match-player-label {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.dance-match-vs {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-secondary);
}

/* Round flash subscores */
.round-flash-subscores {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-top: 8px;
}
```

---

### `mobile/src/hooks/useGameSocket.ts` (hook, event-driven — MODIFIED)

**Analog:** The file itself.

**Existing `UseGameSocketResult` interface** (lines 25–51):
```typescript
export interface UseGameSocketResult {
  status: SocketStatus;
  opponentConnected: boolean;
  phase: GamePhase;
  assignedSlot: 1 | 2 | null;
  ...
}
```
Add `gameType`:
```typescript
export interface UseGameSocketResult {
  status: SocketStatus;
  opponentConnected: boolean;
  phase: GamePhase;
  assignedSlot: 1 | 2 | null;
  gameType: string | null;   // ADD
  ...
}
```

**Existing state declarations** (lines 96–107):
```typescript
const [status, setStatus] = useState<SocketStatus>('disconnected');
const [opponentConnected, setOpponentConnected] = useState(false);
const [assignedSlot, setAssignedSlot] = useState<1 | 2 | null>(null);
const [phase, setPhase] = useState<GamePhase>('lobby');
```
Add:
```typescript
const [gameType, setGameType] = useState<string | null>(null);
```

**Existing `joined` case** (lines 149–155):
```typescript
case 'joined':
  setStatus('connected');
  setOpponentConnected(msg.opponent_connected);
  setAssignedSlot(msg.player_slot);
  break;
```
Add `gameType`:
```typescript
case 'joined':
  setStatus('connected');
  setOpponentConnected(msg.opponent_connected);
  setAssignedSlot(msg.player_slot);
  setGameType(msg.game_type ?? null);   // ADD
  break;
```

**Return statement** (lines 364–382):
Add `gameType` to the return object.

---

### `mobile/src/components/GameScreen.tsx` (component, event-driven — MODIFIED)

**Analog:** The file itself.

**Existing props interface** (lines 14–29):
```typescript
interface GameScreenProps {
  status: SocketStatus;
  phase: GamePhase;
  ...
}
```
Add `gameType`:
```typescript
interface GameScreenProps {
  status: SocketStatus;
  phase: GamePhase;
  gameType: string | null;   // ADD
  ...
}
```

**Existing CalibrationOverlay gate** (lines 202–211):
```tsx
{phase === 'calibration' && isReady && modelStatus === 'ready' ? (
  <CalibrationOverlay
    stage={calibration.stage}
    ...
  />
) : null}
```
Add `gameType` guard (defensive — dance never enters `'calibration'` but guard is correct):
```tsx
{phase === 'calibration' && gameType !== 'dance' && isReady && modelStatus === 'ready' ? (
  <CalibrationOverlay
    stage={calibration.stage}
    ...
  />
) : null}
```
Also gate the READY overlay at line 188:
```tsx
{phase === 'calibration' && gameType !== 'dance' && !isReady ? (
  <div className="ready-overlay">...</div>
) : null}
```

---

## Shared Patterns

### Ref-mutation for hot-path data (no setState)
**Source:** `overlay/src/hooks/useSpectatorSocket.ts` lines 160–179 (`pose_update` handler); `overlay/src/components/PixiCanvas.tsx` lines 396–410 (`poseStreamRef`, `armTrailRef`)
**Apply to:** `PixiCanvas.tsx` skeleton fade state (`skeletonFadeRef`), `danceBeatRef` in `App.tsx`
```typescript
// Pattern: store high-frequency data in MutableRefObject, not useState
// Ticker reads ref.current, never triggers re-render
const skeletonFadeRef = useRef<FadeState>({ phase: 'idle', startMs: 0, pendingPose: null, lastDrawnBeat: -1 })
// In ticker: read skeletonFadeRef.current directly
```

### Pixi Graphics `.clear()` before redraw
**Source:** `overlay/src/components/PixiCanvas.tsx` lines 208–212 (`drawBoxer`)
**Apply to:** `drawTargetPoseSkeleton` in `PixiCanvas.tsx`
```typescript
function drawBoxer(layers, ...) {
  layers.main.clear()
  layers.glow.clear()
  layers.rim.clear()
  layers.shadow.clear()
  ...
}
// Mirror: gfx.clear() at top of drawTargetPoseSkeleton
```

### Pixi v8 Graphics stroke/fill API
**Source:** `overlay/src/components/PixiCanvas.tsx` lines 344–356 (`drawArmTrailFromPts`)
**Apply to:** `drawTargetPoseSkeleton`
```typescript
g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: lineW, color: SILHOUETTE_COLOR })
g.circle(x, y, r).fill({ color: SILHOUETTE_COLOR })
// Adapt: replace SILHOUETTE_COLOR with SKELETON_COLOR; use width: 2
```

### Pixi cleanup in useEffect return
**Source:** `overlay/src/components/PixiCanvas.tsx` lines 545–583
**Apply to:** Add `skeletonGfx.destroy()` to the same cleanup block
```typescript
return () => {
  cancelled = true
  // ... existing teardown ...
  skeletonGfx.destroy()  // ADD alongside destroyPlayerLayers
  // ...
}
```

### `flip = -1` projection rule
**Source:** `overlay/src/components/PixiCanvas.tsx` line 109
**Apply to:** `drawTargetPoseSkeleton` X coordinate calculation
```typescript
const flip = -1
out.x = centerX + keypoint.x * scale * flip
// In skeleton: ax = centerX + kpA[0] * scale * -1  (always -1, not a variable)
```

### CSS beat-bar reflow trick
**Source:** Pattern 3 in `09-RESEARCH.md` (standard browser technique)
**Apply to:** `DanceHud.tsx` beat indicator `useEffect`
```typescript
barEl.style.transition = 'width 0ms'
barEl.style.width = '100%'
void barEl.offsetWidth   // force layout reflow — prevents browser batching the snap+drain
barEl.style.transition = `width ${beatDurationMs}ms linear`
barEl.style.width = '0%'
```

### Import from `@shared/protocol`, never from worktree bindings
**Source:** `overlay/src/hooks/useSpectatorSocket.ts` lines 1–11; `09-RESEARCH.md` Pitfall 1
**Apply to:** All files that reference `MsgDanceBeat`, `MsgDanceScore`, `MsgJoined`
```typescript
import type { MsgDanceBeat, MsgDanceScore } from '@shared/protocol'
// NOT from .claude/worktrees/shared/MsgDanceBeat.ts (bigint typing)
```

---

## No Analog Found

All files in this phase have direct analogs or are self-modifications. No files require research-only patterns.

---

## Metadata

**Analog search scope:** `overlay/src/`, `mobile/src/`, `shared/`
**Files scanned:** 9 (useSpectatorSocket.ts, App.tsx, HudLayer.tsx, PixiCanvas.tsx, RoundOverlay.tsx, skeleton.ts, protocol.ts, useGameSocket.ts, GameScreen.tsx)
**Pattern extraction date:** 2026-05-10
