# Phase 12: FPS Client Scaffold - Research

**Researched:** 2026-05-13
**Domain:** Vite + React + TypeScript SPA, WebSocket client, MediaPipe warmup, getUserMedia
**Confidence:** HIGH

---

## Summary

Phase 12 creates the `fps/` Vite+React app from scratch, mirroring the `mobile/` codebase structure exactly. All of the required patterns — WebSocket hookup, MediaPipe worker spawn, `getUserMedia` permission request — are already implemented and battle-tested in `mobile/`. The work is predominantly copy-adapt, not invent.

The key scaffolding decisions are: (1) the Rust server already emits `/fps?server=&room=&slot=` URLs for fps_boxing rooms (verified in `main.rs` line 193-194), but the `build_app` router does NOT yet serve the `fps/dist` directory — that route must be added; (2) MediaPipe warmup for Phase 12 must only initialise the worker on load (post `ready` message), not run detection yet — detection is Phase 13; (3) the "waiting screen" condition is `opponentConnected === false` after `joined`, which is directly available from `MsgJoined.opponent_connected` and from the `calibration_start` message that fires when both players are present.

**Primary recommendation:** Bootstrap `fps/` as a minimal copy of `mobile/` with three changes: (a) add `/fps` static route to `build_app`; (b) replace the connection screen with a fast-join-only flow (all params are always pre-filled from QR/link); (c) add a `WarmupScreen` that fires the worker `init` message and blocks on `ready` before showing the waiting screen.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL scheme / route serving | Backend (Axum) | — | Server must expose `/fps` as ServeDir route |
| WebSocket connection lifecycle | Frontend (fps/ React) | — | Browser initiates; same protocol as mobile/ |
| getUserMedia permission + stream | Browser (client-side) | — | Camera API is browser-only |
| MediaPipe WASM warmup | Web Worker (off-thread) | Frontend coordinates | Same pattern as mobile/src/workers/pose.worker.ts |
| Waiting screen state | Frontend React state | Server protocol (MsgJoined) | `opponent_connected` field in MsgJoined drives display |
| Phase gate (both joined) | Server protocol | Frontend React state | `calibration_start` message is the authoritative signal |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LBY-03 | Browser webcam permission is requested with a clear prompt before the player enters the game view | `useCamera` hook in mobile/ is the verified pattern; `getUserMedia` constraints and error messages are already production-tested |
| LBY-04 | A waiting screen is shown until both players have joined the room | `MsgJoined.opponent_connected` + `calibration_start` drive the lobby phase; `useGameSocket` already tracks `opponentConnected` |
| WCI-03 | MediaPipe WASM and GPU delegate are pre-warmed on page load before the game can be started | Worker `init` message and `ready` response are the warmup handshake; only the warmup step (not detection loop) is needed in Phase 12 |
</phase_requirements>

---

## P1: Blockers

### P1-A: Server has no `/fps` ServeDir route

**Finding:** `build_app` in `engine/engine-core/src/main.rs` (lines 33-43) serves:
- `/mobile` → `ServeDir::new("mobile/dist")`
- `/overlay` → `ServeDir::new("overlay/dist")`

There is **no** `.nest_service("/fps", ServeDir::new("fps/dist"))` line. The room page already generates `/fps?server=&room=&slot=` URLs (line 193-194), but without the route those URLs 404. [VERIFIED: engine/engine-core/src/main.rs grep]

**Action required:** Phase 12 must add `.nest_service("/fps", ServeDir::new("fps/dist"))` to `build_app` AND add a `fps-builder` stage to the `Dockerfile`.

### P1-B: fps/ directory does not exist

**Finding:** `ls /spectre/fps` → "fps/ does not exist yet". The entire Vite app must be scaffolded. [VERIFIED: Bash ls]

### P1-C: Vite `base` path must be `/fps/` for production build

**Finding:** `mobile/vite.config.ts` sets `base: command === 'build' ? '/mobile/' : '/'`. `fps/` must follow the same pattern with `/fps/` as the production base, otherwise asset paths will 404 when served under `/fps/`. [VERIFIED: mobile/vite.config.ts]

---

## P2: Important

### P2-A: URL scheme is confirmed

The FPS client receives its connection parameters via URL query string:

```
/fps?server=<ws-url>&room=<code>&slot=<1|2>
```

This is hard-coded in `room_page_html` (line 193-194) and generates e.g.:
```
https://host/fps?server=wss://host&room=ABCD&slot=1
```

The FPS client parses these the same way `mobile/src/App.tsx` does (`URLSearchParams`). Because the room page always pre-fills all three params, the fps/ app does not need a manual connection form — fast-join mode is the only flow. [VERIFIED: engine/engine-core/src/main.rs lines 191-194]

### P2-B: WebSocket path and protocol are identical to mobile/

**Finding:** `useGameSocket.ts` constructs `${base}/ws/player/${roomCode}?slot=${playerSlot}` (line 237). The server's `handle_player` reads the `MsgJoin` JSON first message and then emits `MsgJoined` back. fps/ must follow the exact same join handshake — same wire format, same URL pattern. [VERIFIED: mobile/src/hooks/useGameSocket.ts lines 237, 483-506; shared/protocol.ts]

The fps/ client sends:
1. `MsgJoin { type: "join", room_code, player_slot }` as first message
2. `MsgPing` at 500ms intervals

And receives:
- `MsgJoined` → extract `opponent_connected`, `game_type` ("fps_boxing")
- `MsgLobbyUpdate` → NOT in the server's player outbound path; waiting state comes from `opponent_connected` in `MsgJoined` and the `calibration_start` signal
- `calibration_start` → both players present, proceed to Phase 13 calibration
- `player_disconnected` → drop back to waiting screen

### P2-C: "Both players joined" signal

**Finding:** The server sends `calibration_start` when both players are connected. `MsgJoined.opponent_connected: boolean` tells the connecting player whether the opponent was already present. The waiting screen logic is:

```typescript
// Show waiting screen when:
phase === 'lobby' && !opponentConnected
// Dismiss waiting screen when:
msg.type === 'calibration_start'  // → setPhase('calibration')
// or when MsgJoined arrives with opponent_connected: true
```

`useGameSocket.ts` already implements this logic (lines 152-180). fps/ can reuse the same hook with no changes. [VERIFIED: mobile/src/hooks/useGameSocket.ts; shared/protocol.ts]

### P2-D: MediaPipe warmup pattern (WCI-03)

**Finding:** `usePose.ts` in mobile combines worker spawn + detection loop. For Phase 12, fps/ only needs warmup (send `init`, wait for `ready`). Detection runs in Phase 13. The warmup sequence:

```typescript
// In useEffect on component mount:
const worker = new Worker(
  new URL('../workers/pose.worker.ts', import.meta.url),
  { type: 'module' },
);
worker.postMessage({ type: 'init', wasmUrl: WASM_URL, modelUrl: MODEL_URL });
worker.onmessage = (e) => {
  if (e.data.type === 'ready') setWarmupDone(true);
  if (e.data.type === 'error') setWarmupError(e.data.message);
};
```

The worker (`pose.worker.ts`) tries GPU first and falls back to CPU — identical to mobile/. Phase 12 copies `pose.worker.ts` verbatim and adds a `useWarmup` hook that only fires `init` and tracks `ready/error` state without the detection loop. [VERIFIED: mobile/src/workers/pose.worker.ts; mobile/src/hooks/usePose.ts]

WASM CDN URL and model URL used by mobile/ (verified from `usePose.ts` lines 16-19):
- `WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'`
- `MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'`

Note: `@mediapipe/tasks-vision` 0.10.35 is now latest on npm registry [VERIFIED: npm view], but mobile/ pins to 0.10.34. fps/ should pin to the same version as mobile/ to avoid divergence.

### P2-E: getUserMedia pattern (LBY-03)

**Finding:** `useCamera.ts` in mobile/ is the production-verified pattern:

```typescript
const s = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: 'user' },  // front camera
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 60 },
  },
  audio: false,
});
```

Error handling maps `NotAllowedError` → "Camera permission denied. Allow camera access and reload." and `NotFoundError` → "No camera found on this device." [VERIFIED: mobile/src/hooks/useCamera.ts]

For LBY-03 ("clear prompt before the player enters the game view"), the permission request must happen on an explicit user gesture screen, not silently on page load. The UX flow is:

1. Page loads → show permission request screen with text: "SPECTRE needs your camera to track your movements. No video is transmitted."
2. User taps "Allow camera access" → call `getUserMedia` (this triggers the browser's native permission dialog)
3. Permission granted → proceed to warmup / waiting screen
4. Permission denied → show error state with reload instruction

This is a new screen for fps/ (mobile/ assumes the user has already seen the app and knows what it does — fps/ is a laptop game where the user lands via a room link). [ASSUMED: UX copy is not specified in REQUIREMENTS.md; exact wording is Claude's discretion]

### P2-F: CSS / styling approach

**Finding:** mobile/ and overlay/ use **raw CSS** — no Tailwind, no CSS Modules, no CSS-in-JS. Each app has a flat `app.css` + `index.css` pair with custom properties defined as `--bg-deep`, `--accent`, etc. (the SPECTRE design system). fps/ must follow the same approach. [VERIFIED: mobile/src/app.css, mobile/src/index.css]

Design tokens to carry over (from `app.css`):
```css
--bg-deep:        oklch(7% 0.008 22)
--bg-mid:         oklch(11% 0.009 22)
--bg-surface:     oklch(17% 0.01 22)
--accent:         oklch(44% 0.22 22)
--accent-bright:  oklch(60% 0.25 22)
--text-primary:   oklch(95% 0.008 85)
--text-secondary: oklch(65% 0.008 85)
--text-dim:       oklch(38% 0.006 85)
```

---

## P3: Nice-to-Know / Deferred

### P3-A: Three.js canvas is Phase 14

Phase 12 scaffold must NOT render a Three.js canvas. The `<canvas>` placeholder (or its absence) is deferred. Phase 12 ends with: permission screen → warmup screen → waiting screen. The Three.js renderer slot is an empty `<div id="game-canvas-root">` at most.

### P3-B: MediaPipe detection loop is Phase 13

`usePose.ts` detection loop, `useCalibration.ts`, and the `MsgCalibrationDone` send path are all Phase 13 work. Phase 12 warmup stops at `ready` from the worker.

### P3-C: Bot / solo mode is Phase 14

`isSolo` flag and `solo=1` URL param handling are not needed in Phase 12.

### P3-D: Dockerfile fps-builder stage is part of Phase 12

The Docker multi-stage build needs a `fps-builder` stage identical to `mobile-builder`, and a `COPY --from=fps-builder /fps/dist/ ./fps/dist/` line in the final image. This is a Phase 12 deliverable (otherwise the Railway deploy won't serve the fps/ app). [VERIFIED: Dockerfile inspection]

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.5 | UI framework | Same as mobile/ |
| react-dom | 19.2.5 | DOM rendering | Same as mobile/ |
| @mediapipe/tasks-vision | 0.10.34 | MediaPipe PoseLandmarker | Same pinned version as mobile/ — avoid drift |
| vite | 8.0.10 | Dev server + bundler | Same as mobile/overlay/ |
| typescript | ~6.0.2 | Type checking | Same as mobile/overlay/ |

[VERIFIED: mobile/package.json — all versions confirmed]

### Dev / Test
| Library | Version | Purpose |
|---------|---------|---------|
| @vitejs/plugin-react | 6.0.1 | Vite React transform |
| vitest | 4.1.5 | Unit tests (mirrors mobile/) |
| @testing-library/react | 16.3.2 | Component tests |
| jsdom | 29.0.2 | Test DOM environment |
| @types/react | 19.2.14 | Type definitions |
| typescript-eslint | 8.58.2 | Linting |
| @types/node | 24.12.2 | Node types for vite.config.ts |

[VERIFIED: mobile/package.json]

**Note:** `ws` and `@types/ws` are not needed in fps/ — mobile/ uses them for Vitest WebSocket mocks but fps/ has minimal tests in Phase 12.

**Installation:**
```bash
cd fps && npm create vite@latest . -- --template react-ts
# Then pin versions to match mobile/package.json
npm install react@19.2.5 react-dom@19.2.5 @mediapipe/tasks-vision@0.10.34
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (fps/ app)
  │
  ├── URL params: ?server=wss://...&room=ABCD&slot=1
  │
  ├── [Screen 1: PermissionScreen]
  │     └── user gesture → getUserMedia() → camera stream acquired
  │
  ├── [Screen 2: WarmupScreen]
  │     └── mount → spawn pose.worker.ts → send {type:'init'}
  │               ← {type:'ready'} → warmupDone=true
  │
  ├── [Screen 3: WaitingScreen]
  │     └── useGameSocket.connect(server, room, slot)
  │           → WebSocket ws/player/{room}?slot={n}
  │           → send MsgJoin
  │           ← MsgJoined{opponent_connected, game_type}
  │           ← MsgPing → send MsgPong
  │           ← calibration_start → advance to Phase 13 (not in Phase 12)
  │
  └── [Screen 4: placeholder for Phase 13+]
        └── (out of scope for Phase 12)

Axum Server
  ├── GET /fps/* → ServeDir("fps/dist")   ← MUST ADD in Phase 12
  └── WS /ws/player/{room}?slot={n}
```

### Recommended Project Structure
```
fps/
├── index.html                  # <div id="root"> + <script src="/src/main.tsx">
├── package.json                # mirrors mobile/package.json
├── tsconfig.json               # split refs (app + node), mirrors mobile/
├── tsconfig.app.json           # same compiler options as mobile/tsconfig.app.json
├── tsconfig.node.json          # same as mobile/tsconfig.node.json
├── vite.config.ts              # base: '/fps/' for build, @shared alias
├── eslint.config.js            # mirrors mobile/eslint.config.js
└── src/
    ├── main.tsx                # createRoot + <App />
    ├── index.css               # reset + html/body/root full-bleed dark
    ├── app.css                 # SPECTRE design tokens + screen-level classes
    ├── App.tsx                 # screen router (permission → warmup → waiting → game)
    ├── components/
    │   ├── PermissionScreen.tsx  # explains camera use, CTA to call getUserMedia
    │   ├── WarmupScreen.tsx      # "Loading pose engine..." spinner
    │   └── WaitingScreen.tsx     # "Waiting for opponent..." with room code
    ├── hooks/
    │   ├── useGameSocket.ts    # copy from mobile/ verbatim (no changes needed)
    │   ├── useCamera.ts        # copy from mobile/ verbatim
    │   └── useWarmup.ts        # new: spawn worker, send init, track ready/error
    └── workers/
        └── pose.worker.ts      # copy from mobile/ verbatim
```

### Pattern 1: Screen Router in App.tsx

**What:** A single `AppScreen` union type drives which component renders. No router library needed — only 3-4 screens at Phase 12 end.

**When to use:** When the app is a linear flow (permission → warmup → waiting → game).

```typescript
// Source: mobile/src/App.tsx (adapted)
type AppScreen = 'permission' | 'warmup' | 'waiting' | 'game';

function App() {
  const params = new URLSearchParams(window.location.search);
  const serverUrl = params.get('server') ?? '';
  const roomCode  = params.get('room')?.toUpperCase() ?? '';
  const playerSlot: 1 | 2 = params.get('slot') === '2' ? 2 : 1;

  const [screen, setScreen] = useState<AppScreen>('permission');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [warmupDone, setWarmupDone] = useState(false);
  const socket = useGameSocket();

  // Advance: permission granted → warmup
  // Advance: warmup done → waiting (and connect WebSocket)
  // Advance: calibration_start → game (Phase 13+)
}
```

### Pattern 2: useWarmup Hook

**What:** Minimal hook that spawns the pose worker, sends `init`, and tracks `ready`/`error` state without running the detection loop.

**When to use:** Phase 12 only — Phase 13 will replace this with the full `usePose` hook.

```typescript
// Source: derived from mobile/src/hooks/usePose.ts (worker init section)
export type WarmupStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useWarmup(): { status: WarmupStatus; error: string | null } {
  const [status, setStatus] = useState<WarmupStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus('loading');
    const worker = new Worker(
      new URL('../workers/pose.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'ready') setStatus('ready');
      if (e.data.type === 'error') { setStatus('error'); setError(e.data.message); }
    };
    worker.onerror = (e) => { setStatus('error'); setError(e.message); };
    worker.postMessage({
      type: 'init',
      wasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm',
      modelUrl: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    });
    return () => worker.terminate();
  }, []);

  return { status, error };
}
```

### Pattern 3: PermissionScreen (LBY-03)

**What:** Shown before any camera access. Contains explicit copy explaining camera use, a CTA button that calls `getUserMedia`. This satisfies LBY-03 ("clear prompt before the player enters the game view").

**Key constraint:** `getUserMedia` must be called inside a user gesture handler (button click), not in a `useEffect` on mount, or Safari iOS will reject it. On desktop Chrome/Firefox this is technically not required, but the user gesture pattern is universally correct and also gives the user a chance to read the permission explanation first.

```typescript
// Source: [ASSUMED] — pattern derived from mobile/src/hooks/useCamera.ts error handling
// and getUserMedia spec requirements
async function handleAllow() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
      audio: false,
    });
    onPermissionGranted(stream);
  } catch (err) {
    const e = err as DOMException;
    if (e.name === 'NotAllowedError') setError('Camera permission denied. Allow access in your browser settings and reload.');
    else if (e.name === 'NotFoundError') setError('No camera detected. Connect a webcam and reload.');
    else setError(`Could not open camera: ${e.message}`);
  }
}
```

### Anti-Patterns to Avoid

- **Calling getUserMedia on mount without user gesture:** Violates best-practice; some browsers show a permission prompt with no context. Always put the call behind a visible "Allow camera" button.
- **Starting the detection loop in Phase 12:** The `usePose` detection loop is Phase 13. Phase 12's `useWarmup` only sends `init` and waits for `ready` — no `detect` messages.
- **Copying mobile/'s `vite.config.ts` without changing the `base`:** mobile/ uses `/mobile/`; fps/ must use `/fps/`.
- **Forgetting the `@shared` path alias:** `shared/protocol.ts` is imported as `@shared/protocol` in mobile/. fps/ needs the same alias in both `vite.config.ts` and `tsconfig.app.json`.
- **Not adding `CORS_HEADERS` or worker config:** Vite dev server serves workers correctly by default. The `{ type: 'module' }` Worker constructor option is required for ES module workers with Vite.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket lifecycle with reconnect | Custom WS class | `useGameSocket` (copy from mobile/) | Already handles reconnect, ping, error codes 4000/4004 |
| Camera stream lifecycle | Custom MediaStream manager | `useCamera` (copy from mobile/) | Handles `loadedmetadata`, iOS `play()`, cleanup on unmount |
| MediaPipe worker protocol | Custom worker | `pose.worker.ts` (copy verbatim) | GPU→CPU fallback, monotonic timestamp guard, bitmap.close() cleanup |
| URL normalization | Hand-write | `normalizeWsUrl` / `normalizeHttpUrl` from `useGameSocket.ts` | Already handles ws/wss/http/https/bare-host cases |

---

## Common Pitfalls

### Pitfall 1: Missing `/fps` ServeDir route on the server
**What goes wrong:** The room page generates `/fps?...` links, but GET /fps/ returns 404 because no route is registered.
**Why it happens:** `build_app` only has `/mobile` and `/overlay` ServeDir routes.
**How to avoid:** Add `.nest_service("/fps", ServeDir::new("fps/dist"))` to `build_app` in `main.rs`.
**Warning signs:** Browser navigates to `/fps?...` and gets "Not Found" or the lobby HTML.

### Pitfall 2: Vite `base` mismatch
**What goes wrong:** Assets 404 in production; JS/CSS paths are `/assets/...` instead of `/fps/assets/...`.
**Why it happens:** Vite defaults `base` to `/`; in production all clients are served under a subpath.
**How to avoid:** `base: command === 'build' ? '/fps/' : '/'` in `vite.config.ts`.
**Warning signs:** App loads blank in production but works locally.

### Pitfall 3: Worker CORS errors in Vite dev
**What goes wrong:** Worker fails to load with "cross-origin" or "MIME type" errors.
**Why it happens:** Using `new Worker('./workers/pose.worker.ts')` instead of the `import.meta.url` pattern.
**How to avoid:** Always use `new Worker(new URL('../workers/pose.worker.ts', import.meta.url), { type: 'module' })`.
**Warning signs:** Console shows "Failed to construct 'Worker'" or worker never posts `ready`.

### Pitfall 4: getUserMedia called without user gesture
**What goes wrong:** Safari silently ignores the call or shows a confusing browser-level prompt with no context.
**Why it happens:** Calling `getUserMedia` in `useEffect` on mount triggers before the user has seen any explanation.
**How to avoid:** Call `getUserMedia` only inside a button click handler.
**Warning signs:** Safari shows "Safari can't open the page" or the browser prompt appears instantly on page load.

### Pitfall 5: `@shared` alias missing from tsconfig
**What goes wrong:** TypeScript errors: "Cannot find module '@shared/protocol'".
**Why it happens:** Vite resolves the alias at bundle time but `tsc` needs a `paths` entry independently.
**How to avoid:** Add to `tsconfig.app.json` compilerOptions: `"paths": { "@shared/*": ["../shared/*"] }` and `"baseUrl": "."`.
**Warning signs:** `npm run build` succeeds (Vite bundles it) but `tsc` type-check step fails.

### Pitfall 6: Dockerfile not updated for fps/
**What goes wrong:** Railway deploy doesn't serve the fps/ app; `/fps?...` links open a 404.
**Why it happens:** `Dockerfile` only copies `mobile/dist` and `overlay/dist`.
**How to avoid:** Add a `fps-builder` build stage and `COPY --from=fps-builder` line in the final image.
**Warning signs:** Works locally (`npm run dev` in fps/), fails in production.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 30Hz pose send rate | 60Hz send rate | Phase 9 | Higher fidelity punch detection |
| `requestAnimationFrame` only for capture | `requestVideoFrameCallback` preferred | mobile/ v1.0 | Reduces frame capture latency |
| Vite `base: '/'` for all builds | Subpath base per app | Phase 4 (lobby UX) | Required for ServeDir multi-app serving |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PermissionScreen UX copy ("SPECTRE needs your camera...") is Claude's discretion | P2-E / Pattern 3 | Low — wording can be revised; functional pattern is correct |
| A2 | Phase 12 warmup holds the worker alive across the waiting screen (worker not terminated until Phase 13 hands off) | P2-D / Pattern 2 | Medium — if worker is terminated at end of WarmupScreen and re-spawned in Phase 13, the "pre-warm" benefit is lost. The worker ref should be passed from useWarmup to the Phase 13 hook |

---

## Open Questions

1. **Should `useWarmup` keep the worker alive and hand off the Worker ref to Phase 13's detection hook?**
   - What we know: WCI-03 requires warmup "before the game can be started" — implies the worker should stay alive across the waiting screen
   - What's unclear: How Phase 13 receives the already-initialized worker from Phase 12's scaffold
   - Recommendation: Phase 12 should expose the worker ref (e.g., via a React context or prop-drill) so Phase 13 can attach `detect` messages to the same instance. For the Phase 12 scaffold, the planner should add a `workerRef` to App state that persists beyond WarmupScreen.

2. **Does the waiting screen re-show if the opponent disconnects mid-lobby?**
   - What we know: `useGameSocket` fires `player_disconnected` and sets `opponentConnected = false`; it also sets `phase` back to `'lobby'` if not yet in 'match'
   - What's unclear: Whether fps/ needs to reset `warmupDone` on opponent disconnect
   - Recommendation: Do NOT reset warmup — the warmup is a one-time on-load operation. Simply show the WaitingScreen again when `phase === 'lobby' && !opponentConnected`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | fps/ Vite build | Verified (used by mobile/ and overlay/) | 20 (per Dockerfile) | — |
| npm | fps/ package install | Verified | — | — |
| Axum ServeDir | /fps route | Requires code change | — | No fallback — blocking |

**Missing dependencies with no fallback:**
- `/fps` ServeDir route in Axum: must be added in Phase 12, no fallback

---

## Code Examples

Verified patterns from official sources:

### vite.config.ts for fps/
```typescript
// Source: mobile/vite.config.ts (adapted for /fps/ base)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ command }) => ({
  base: process.env.VERCEL ? '/' : command === 'build' ? '/fps/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    host: true,
    port: 5174,  // 5173 used by mobile/
  },
}))
```

### Axum route addition (main.rs)
```rust
// Source: engine/engine-core/src/main.rs build_app() (verified pattern)
fn build_app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(lobby_html))
        .route("/rooms", post(create_room))
        .route("/rooms/{code}", get(get_room_page))
        .route("/ws/player/{room_code}", get(ws_player))
        .route("/ws/spectator/{room_code}", get(ws_spectator))
        .nest_service("/mobile", ServeDir::new("mobile/dist"))
        .nest_service("/overlay", ServeDir::new("overlay/dist"))
        .nest_service("/fps", ServeDir::new("fps/dist"))   // ADD THIS
        .with_state(state)
}
```

### Dockerfile fps-builder stage
```dockerfile
# Source: Dockerfile (verified pattern from mobile-builder stage)
FROM node:20-slim AS fps-builder
WORKDIR /fps
COPY shared/ /shared/
COPY fps/ ./
RUN npm ci && npm run build

# In final image:
COPY --from=fps-builder /fps/dist/ ./fps/dist/
```

### WaitingScreen driven by socket state
```typescript
// Source: derived from mobile/src/hooks/useGameSocket.ts lines 152-180
// opponentConnected comes from MsgJoined.opponent_connected
// and is set to true when calibration_start arrives

function WaitingScreen({ roomCode, slot, opponentConnected }: Props) {
  return (
    <div className="waiting-screen">
      <h1 className="title">SPECTRE</h1>
      <p className="waiting-room-code">{roomCode}</p>
      <p className="waiting-slot">Player {slot}</p>
      {opponentConnected ? (
        <p className="waiting-status">Both players connected — starting...</p>
      ) : (
        <p className="waiting-status">Waiting for opponent...</p>
      )}
    </div>
  );
}
```

---

## Sources

### Primary (HIGH confidence)
- `engine/engine-core/src/main.rs` — confirmed URL scheme, confirmed missing /fps route
- `mobile/src/hooks/useGameSocket.ts` — WebSocket lifecycle, message handling, opponentConnected state
- `mobile/src/hooks/useCamera.ts` — getUserMedia pattern and error handling
- `mobile/src/hooks/usePose.ts` — MediaPipe warmup and detection loop
- `mobile/src/workers/pose.worker.ts` — Worker message protocol, GPU/CPU fallback
- `mobile/vite.config.ts`, `mobile/package.json`, `mobile/tsconfig.app.json` — Vite config patterns
- `shared/protocol.ts` — wire protocol types (MsgJoined, MsgLobbyUpdate, calibration_start)
- `Dockerfile` — build stages to replicate

### Secondary (MEDIUM confidence)
- npm registry: `@mediapipe/tasks-vision` 0.10.35 is latest; project pins 0.10.34 [VERIFIED: npm view]
- npm registry: `vite` 8.0.12 is latest; project uses 8.0.10 [VERIFIED: npm view]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against mobile/package.json in the repo
- Architecture: HIGH — server route logic verified in main.rs; protocol verified in shared/protocol.ts
- Pitfalls: HIGH — verified by reading actual code that would be copied

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (stable — no external moving parts beyond npm versions)
