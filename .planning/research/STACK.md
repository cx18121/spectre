# Stack Research

**Domain:** First-person 3D boxing game with webcam pose/hand detection, browser client
**Researched:** 2026-05-12
**Confidence:** HIGH (all versions verified via npm registry; patterns verified against existing codebase)

---

## Context: What Exists vs. What Is New

This is a subsequent milestone. The following are already validated and must NOT change:

| Existing | Version | Status |
|----------|---------|--------|
| `@mediapipe/tasks-vision` | `^0.10.34` (mobile) | Validated — PoseLandmarker in module Worker |
| Rust Axum + Tokio WS server | latest in Cargo.lock | Validated — do not touch |
| Wire protocol (`shared/protocol.ts`) | — | Byte-for-byte frozen |
| Vite + React + TypeScript | Vite 8, React 18/19, TS 6 | Validated per overlay/mobile |
| Vitest | `^2.0.0` (overlay) / `^4.1.5` (mobile) | Validated |

Everything below is **new** — additions only for the `fps-boxing` frontend.

---

## New Client: `fps-boxing` Browser App

A new Vite app at `fps-boxing/` (sibling to `overlay/` and `mobile/`). Laptop-only. No phone required.

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `three` | `^0.184.0` | 3D first-person rendering of arms | Current stable (r175 = March 2025; npm latest is 0.184.0, verified). WebGLRenderer is the right target — WebGPU renderer is still experimental/addon and not needed for a simple arm mesh. Procedural SkinnedMesh + Bone API is stable and well-documented. |
| `@types/three` | `^0.184.1` | TypeScript types for Three.js | Kept in lock-step with three version; latest is 0.184.1 (verified npm). Major version must match three exactly. |
| `@mediapipe/tasks-vision` | `^0.10.35` | HandLandmarker + PoseLandmarker in webcam mode | Bump from 0.10.34 used in mobile — 0.10.35 is latest (verified npm). Same package, same Web Worker + module pattern already proven in `mobile/src/workers/pose.worker.ts`. |
| React | `^19.2.5` | UI shell, HUD, state | Matches mobile. Use 19, not 18. Provides hooks for webcam setup and WS connection state. |
| React DOM | `^19.2.5` | React renderer | Matches mobile. |
| Vite | `^8.0.10` | Build + dev server | Matches overlay and mobile exactly — no version experiments. |
| TypeScript | `~6.0.2` | Type safety | Matches overlay and mobile. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vitejs/plugin-react` | `^6.0.1` | Vite React transform | Same version as mobile/overlay — needed for JSX. |
| `vitest` | `^2.0.0` | Unit tests | Match overlay's version (not mobile's 4.x) to keep the new app aligned with the simpler test harness. |
| `@vitest/ui` | `^2.0.0` | Vitest UI | Same as overlay. |
| `jsdom` | `^25.0.0` | Test environment | Same as overlay. |
| `@testing-library/react` | `^16.0.0` | Component tests | Same as overlay. |
| `@testing-library/jest-dom` | `^6.0.0` | DOM matchers | Same as overlay. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite dev server | Hot reload during development | `vite.config.ts` needs a `resolve.alias` for `@shared` pointing to `../shared/protocol.ts`, same pattern as mobile/overlay. |
| `tsc -b --force` | Build step | Same invocation as all other clients: `"build": "tsc -b --force && vite build"`. |

---

## MediaPipe Integration: Webcam on Laptop

### Strategy: Two Landmarkers, One Worker

Run `PoseLandmarker` and `HandLandmarker` in the **same dedicated Web Worker**, initialized sequentially. A single worker processes one frame at a time and posts back combined results. This avoids two separate workers competing for the same ImageBitmap transfer.

**Why not HolisticLandmarker:** Google's HolisticLandmarker page explicitly states "An upgraded version of this MediaPipe Solution is coming soon" and has no confirmed JavaScript/web guide. Do not use for this milestone. Use separate PoseLandmarker + HandLandmarker from the same `@mediapipe/tasks-vision` package.

**Why not two separate workers:** `ImageBitmap` can only be transferred (zero-copy) to one recipient. Using `createImageBitmap` twice per frame adds ~2ms of copy overhead and doubles the WASM memory footprint. Sequential detection in one worker is simpler and sufficient for 30 fps.

**Worker message contract (new file `fps-boxing/src/workers/pose-hand.worker.ts`):**

```typescript
type InMessage =
  | { type: 'init'; wasmUrl: string; poseModelUrl: string; handModelUrl: string }
  | { type: 'detect'; bitmap: ImageBitmap; timestampMs: number };

type OutMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; poseKeypoints: PoseKeypoint[] | null; handLandmarks: HandLandmark[][] | null };
```

**HandLandmarker output:** 21 landmarks per detected hand, each with `{x, y, z}` (image-normalized) and world coordinates in meters (relative to hand geometric center). Use `numHands: 2` to detect both fists simultaneously.

**Webcam access:** `navigator.mediaDevices.getUserMedia({ video: true })` — same approach as `mobile/src/hooks/useCamera.ts`. Requires HTTPS or localhost.

---

## Three.js Rendering: First-Person Stylized Arms

### Approach: Procedural SkinnedMesh

The Arms-style aesthetic uses chunky, cartoonish arms with flat/toon shading. Build these procedurally — no external 3D assets, no art pipeline, no binary files in the repo.

**Geometry:** `CylinderGeometry` for each arm segment (upper arm, forearm), `SphereGeometry` for the fist. Skin each segment to a 3-bone chain (`shoulder → elbow → wrist`) using the `skinIndex` + `skinWeight` buffer attribute pattern shown in Three.js's own `bones-browser.html` example.

**Material:** `MeshToonMaterial` with a 2-pixel `DataTexture` as the gradient map. This gives the hard-light-step cel-shading look without any custom GLSL. `MeshToonMaterial` is a built-in Three.js material, stable since r120+.

**Skeleton:** `Bone` + `Skeleton` + `SkinnedMesh.bind()`. Drive bone rotations from MediaPipe world landmarks: shoulder, elbow, and wrist keypoints map directly to upper-arm and forearm Euler angles via `THREE.Vector3` direction vectors.

**Camera:** `PerspectiveCamera` (FOV ~75°) at a fixed position. Arms are a child `Group` attached to the camera's local space so they always appear in the lower-third of the viewport. No head-bob, no physics needed.

**Renderer:** `WebGLRenderer({ antialias: false })` for performance. Canvas sized to `window.innerWidth × window.innerHeight`. No post-processing needed for the MVP.

**Why raw Three.js, not React Three Fiber:** R3F abstracts Three.js behind React state and a reconciler, which adds complexity and re-render cost in a 60 fps rAF loop. The existing overlay already uses raw Pixi.js for the same reason — consistency.

---

## Rust Server: New Client Type Wiring

### Strategy: New WS Route, Reuse Existing Actor

Add a new WebSocket route `ws_fps_player` at `/ws/fps/{room_code}` in `engine-core/src/main.rs`. This is structurally identical to `handle_player` but carries hand landmarks in addition to pose keypoints.

**Do NOT modify `handle_player`, `MsgPoseFrame`, or `shared/protocol.ts`** — the mobile wire protocol is frozen and mobile clients are unaffected.

**New Rust additions (engine-core only):**

1. `MsgFpsPoseFrame` struct — extends the existing `MsgPoseFrame` shape with `hand_landmarks: Vec<Vec<PoseKeypoint>>`. Reuses `PoseKeypoint` for 3D coordinates; the `visibility` field is set to 1.0 for hand landmarks (unused).
2. A new `RoomCmd::FpsPoseFrame` variant (or extend `PoseFrame` with an `Option<Vec<Vec<PoseKeypoint>>>`) so the room actor can store hand data on `PlayerSlot`.
3. `hand_landmarks: Option<Vec<Vec<PoseKeypoint>>>` added to `PlayerSlot` — populated each frame, read by `FPSBoxingPlugin` via `TickContext`.
4. `POST /rooms?game=fps_boxing` is handled automatically — just register `FPSBoxingPlugin` in the `plugins` HashMap in `main()`.

**Integration with FPSBoxingPlugin:** The plugin receives `TickContext` with per-player pose frames. It reads `PlayerSlot::hand_landmarks` directly to detect punch velocity from wrist world coordinates — same punch-detection math as the existing BoxingPlugin, but driven from webcam wrist/elbow positions instead of phone world landmarks.

**Do not add `/ws/fps` to `shared/protocol.ts` yet** — keep the Rust-side types internal until the shape stabilizes at phase end.

---

## Installation

```bash
# fps-boxing/ (new Vite app, mirrors mobile/ structure)

# Core runtime
npm install three @mediapipe/tasks-vision react react-dom

# Dev dependencies
npm install -D @types/three @types/react @types/react-dom \
  @vitejs/plugin-react typescript vite \
  vitest @vitest/ui jsdom \
  @testing-library/react @testing-library/jest-dom \
  eslint @eslint/js eslint-plugin-react-hooks eslint-plugin-react-refresh \
  globals typescript-eslint @types/node
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Raw `three` | React Three Fiber (`@react-three/fiber`) | When prototyping or scene graph is complex enough to benefit from declarative JSX. Not here — two arms in a 60 fps game loop. |
| `MeshToonMaterial` | Custom GLSL toon shader | When needing multi-step gradients, rim lighting, or outline passes. `MeshToonMaterial` covers the MVP aesthetic without a shader. |
| PoseLandmarker + HandLandmarker (separate, one worker) | HolisticLandmarker | When HolisticLandmarker has a confirmed, stable JS API. Currently it does not — skip it. |
| New WS route `/ws/fps/{room_code}` | Extend `/ws/player/{room_code}` with a `?client_type=fps` query param | Either works. A separate route is cleaner — no branching inside the frozen `handle_player` handler, zero mobile client impact. |
| Procedural `CylinderGeometry` arms | Load a GLTF model | When art assets are available and the aesthetic requires organic, non-primitive shapes. Procedural is faster to iterate, zero-dependency, and version-controllable. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `HolisticLandmarker` (`@mediapipe/tasks-vision`) | Google's own page says "coming soon"; no JavaScript guide exists; will block the milestone | `PoseLandmarker` + `HandLandmarker` separately |
| `WebGPURenderer` (Three.js) | Still in addons/experimental state; adds complexity; unnecessary for two skinned arm meshes | `WebGLRenderer` |
| React Three Fiber + Drei | Adds React reconciler overhead on a 60 fps rAF loop; not used elsewhere in the codebase | Raw `three` |
| Two separate Web Workers for pose and hand | `ImageBitmap` can only be transferred once — second worker needs an extra `createImageBitmap` call per frame | One combined worker, sequential detection |
| Three.js addon imports from `three/examples/jsm/` | Deprecated path removed in recent releases | Use `three/addons/` (e.g., `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`) |
| Modifying `shared/protocol.ts` or `handle_player` during development | Breaks mobile clients; protocol is frozen | New Rust structs + new WS route only |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `three@^0.184.0` | `@types/three@^0.184.1` | Types are generated per three.js release — major versions must match. `^` allows patch updates safely. |
| `@mediapipe/tasks-vision@^0.10.35` | WASM CDN at `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm` | Pin the CDN URL to match the npm package version exactly — mismatches cause silent WASM init failures (observed in community issues). |
| `vite@^8.0.10` | `@vitejs/plugin-react@^6.0.1` | Matches mobile and overlay — no version experiments needed. |
| `react@^19.2.5` | `@types/react@^19.x`, `@types/react-dom@^19.x` | React 19 type packages. Use `^19`, not `^18`. |

---

## Sources

- npm CLI (`npm show three version`, `npm show @mediapipe/tasks-vision version`, `npm show @types/three version`): confirmed `three@0.184.0`, `@mediapipe/tasks-vision@0.10.35`, `@types/three@0.184.1` — HIGH confidence
- Context7 `/mrdoob/three.js`: SkinnedMesh constructor, `createGeometry`/`createBones`/`createMesh` pattern, `MeshToonMaterial` confirmed — HIGH confidence
- Google AI Edge official docs (WebFetch `ai.google.dev`): HandLandmarker web/JS guide confirmed for VIDEO mode; 21 landmarks per hand; web worker usage documented — HIGH confidence
- Google AI Edge HolisticLandmarker page (WebFetch): "coming soon" status confirmed, no JS guide — HIGH confidence (negative finding)
- Existing codebase `mobile/src/workers/pose.worker.ts`: module Worker pattern with `@mediapipe/tasks-vision` `PoseLandmarker` confirmed working with `{ type: 'module' }` worker — HIGH confidence

---

*Stack research for: FPSBoxingPlugin — fps-boxing Vite app (webcam + Three.js first-person)*
*Researched: 2026-05-12*
