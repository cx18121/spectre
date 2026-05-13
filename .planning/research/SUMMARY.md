# Project Research Summary

**Project:** FPS Boxing — v2.0 First-Person Webcam Boxing Mode
**Domain:** Browser-based first-person boxing game using webcam pose detection, Three.js rendering, and server-authoritative hit detection
**Researched:** 2026-05-12
**Confidence:** HIGH

## Executive Summary

FPS Boxing adds a third client type to the existing PoseEngine architecture: a laptop browser app that simultaneously acts as both controller and renderer. The existing Rust engine, wire protocol, and mobile/overlay clients are unchanged — the new `fps-boxing-plugin` crate implements the same `GamePlugin` trait that BoxingPlugin and DancePlugin already use, and the new `fps/` Vite app connects via the existing `/ws/player/{code}` WebSocket endpoint. This additive-only architecture means zero risk to existing games and a clear, incremental build path.

The recommended approach is server-first, client-second. Build and register `FPSBoxingPlugin` before writing any TypeScript — the server plugin is the dependency everything else waits on. On the client, MediaPipe Pose must run in a Web Worker (not the main thread) to avoid starving the Three.js render loop; this is already proven in the mobile codebase. Three.js arm rendering uses procedural `CylinderGeometry` segments driven directly from wrist/elbow/shoulder landmarks — no IK solver, no external art assets, no GLTF files. Opponent arms are driven by per-player `MsgFpsState` messages emitted by the plugin at 60 Hz, with a client-side jitter buffer providing smooth interpolation under WiFi variance.

The two highest risks are MediaPipe integration correctness and coordinate space mapping. MediaPipe WASM must be warmed up at page load, run off-thread, and have its raw landmark output filtered with a OneEuroFilter before feeding velocity calculations — skipping any of these steps produces either a frozen startup, dropped frames, or continuous false-positive punch events. MediaPipe's normalized image-space coordinates (Y-down, origin top-left) must be explicitly converted to Three.js world space (Y-up, origin center) with X flipped for front-facing webcam mirroring. Both issues are well-understood and entirely preventable with the patterns documented in PITFALLS.md.

---

## Key Findings

### Recommended Stack

The new `fps/` app is a sibling Vite app matching the structure of `mobile/` and `overlay/`. All tooling versions are pinned to match existing clients: Vite 8, React 19, TypeScript 6, Vitest 2. The only net-new runtime dependencies are `three@^0.184.0` (with `@types/three@^0.184.1`) and a version bump of `@mediapipe/tasks-vision` from `^0.10.34` to `^0.10.35`. React Three Fiber, WebGPU, and HolisticLandmarker are explicitly excluded — raw Three.js matches the existing overlay's raw Pixi.js precedent and avoids reconciler overhead in a 60 fps game loop.

MediaPipe strategy: run `PoseLandmarker` and `HandLandmarker` in a single Web Worker (same module Worker pattern as `mobile/src/workers/pose.worker.ts`), processing frames sequentially to avoid competing for the same `ImageBitmap` transfer. HolisticLandmarker is explicitly ruled out — Google's own docs say "coming soon" with no JS guide. Three.js rendering uses `WebGLRenderer` (not WebGPU), `MeshToonMaterial` with a 2-pixel gradient DataTexture for the cel-shaded Arms aesthetic, and procedural `SkinnedMesh` + `Bone` chains driven by MediaPipe world landmarks.

**Core technologies:**
- `three@^0.184.0`: 3D first-person arm rendering — raw Three.js over R3F to match overlay precedent and avoid reconciler cost
- `@mediapipe/tasks-vision@^0.10.35`: PoseLandmarker + HandLandmarker in a single Web Worker — proven pattern from mobile
- `react@^19.2.5` + `vite@^8.0.10`: UI shell and build — exact versions matching mobile and overlay
- `fps-boxing-plugin` (Rust): new `GamePlugin` crate registered as `"fps_boxing"` — zero engine changes required
- `MsgFpsState` + `MsgFpsHit`: two additive wire messages emitted via `SendToPlayer` — existing clients unaffected

**Critical version constraints:**
- `@types/three` major version must match `three` exactly (`^0.184.1`)
- MediaPipe CDN URL must pin to the npm package version (`cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`) — version mismatch causes silent WASM init failure

### Expected Features

The MVP is a playable two-player FPS boxing round between two laptop players, no phone required. Feature research builds directly on the existing BoxingPlugin — hit detection, guard blocking, round lifecycle, and HP logic are already proven and can be ported wholesale.

**Must have (table stakes):**
- Webcam wrist tracking via MediaPipe Pose in a Web Worker — the primary input mechanism
- Player arms visible in first-person (two stylized forearm + fist meshes, camera-local, `depthTest: false`)
- Punch-to-arm animation mapping — wrist landmark directly drives arm bone position each frame
- Opponent arms rendered from server-broadcast `MsgFpsState.opponent_keypoints`
- Hit confirmation: arm snap-back + screen edge flash (50 ms hard-cut, 220 ms decay per DESIGN.md)
- Incoming hit feedback: screen shake (380 ms translate-only, 5 keyframes) + HP bar drain (100 ms linear)
- HUD: HP bars, round timer, win dots, round/match announcements (all per existing DESIGN.md specs)
- Lobby integration: "FPS BOXING" tile in game picker, distinct `game_type: "fps_boxing"` routing

**Should have (competitive):**
- Arms stretch animation on punch extension — spring overshoot, 150 ms extend / 200 ms retract
- Guard blocking visualisation — arm crossover when wrist-raise guard is detected
- Opponent torso/head silhouette for target zone legibility

**Defer (v2+):**
- AI commentary (CommentaryHint events already emitted; consumption wired in v2)
- AI bot for solo FPS boxing
- Asymmetric matchmaking (phone P1 vs laptop P2) — requires significant protocol rethinking
- Spectator overlay for FPS boxing

### Architecture Approach

The v2.0 architecture is strictly additive: one new Rust crate, one new TypeScript app, two new wire messages, and minimal edits to `engine-core/src/main.rs` and `engine/engine-core/src/protocol.rs`. The FPS client connects as a player (not spectator) on the existing `/ws/player/{code}` endpoint, sending the existing `MsgPoseFrame` / `MsgCalibrationDone` messages and receiving two new plugin-emitted messages (`fps_state`, `fps_hit`) via `GameEvent::SendToPlayer`. All existing rooms, plugins, and clients are byte-for-byte unaffected.

**Major components:**
1. `fps-boxing-plugin` (Rust crate) — implements `GamePlugin` trait; hit detection, HP, round lifecycle; emits `MsgFpsState` per player per tick and `MsgFpsHit` to defender
2. `fps/` TypeScript app — webcam access, MediaPipe Web Worker, Three.js scene (`renderer.ts`, `arms.ts`), WS client (`ws.ts`), HUD (`hud.ts`), hit flash (`hit-flash.ts`), calibration UI (`calibration-ui.ts`)
3. `engine-core/src/main.rs` — minimal addition: register `"fps_boxing"` in plugins HashMap, add lobby tile, add room page fps_boxing branch
4. `shared/protocol.ts` + `engine/engine-core/src/protocol.rs` — additive: `MsgFpsState`, `MsgFpsHit` interfaces/structs; auto-regenerated by `cargo test`

Data flow: local MediaPipe keypoints feed both the WS send path (server hit detection) and the Three.js local arm animation simultaneously. Opponent arms are driven by `opponent_keypoints` in `MsgFpsState`, buffered with a 3-4 frame jitter buffer and interpolated in the RAF loop with `THREE.MathUtils.damp()`.

### Critical Pitfalls

1. **MediaPipe on the main thread starves Three.js** — `detectForVideo()` in `VIDEO` mode blocks for 15-40 ms. Must use `LIVE_STREAM` mode with a result callback, or run in a Web Worker. Set `delegate: "GPU"` and verify it is not silently falling back to CPU via per-frame inference timing.

2. **Raw landmark jitter produces false-positive punches** — Apply a OneEuroFilter (`min_cutoff=1.0`, `beta=0.007`) to wrist/elbow landmarks before velocity calculation. Gate on `visibility < 0.5`. Require velocity spike sustained for 2 consecutive frames.

3. **Coordinate space mismatch mirrors arms** — MediaPipe normalizes Y-down, origin top-left. Flip X (`worldX = -(x - 0.5) * scale`) and Y (`worldY = -(y - 0.5) * scale + shoulderHeight`) explicitly. Treat raw `z` as relative depth hint only, not metric position.

4. **No jitter buffer causes rubber-banding opponent arms** — Maintain a ring buffer of 3-4 opponent pose snapshots with server timestamps. Render at `now - 60ms`, lerping between snapshots. Hold last-known position on buffer starvation.

5. **`on_round_reset` clears calibration — breaks FIX-01 invariant** — Store calibration fields in a `session` sub-struct, round state in a `round` sub-struct. `on_round_reset` calls `state.round = RoundState::default()` only. Add a round-trip calibration test.

6. **`FPSBoxingPlugin` registered under `"boxing"` corrupts existing rooms** — Always use `"fps_boxing"` as the `game_type()` return value. Add `assert_ne!(fps.game_type(), "boxing")` as a Rust test.

---

## Implications for Roadmap

Research strongly indicates a 6-phase build order, server-first, matching the architecture's recommended build sequence. Each phase is independently verifiable before the next begins.

### Phase 1: FPSBoxingPlugin Rust Crate
**Rationale:** Every downstream component (lobby, FPS client, opponent rendering, HUD) depends on the server plugin being registered and correct. Building server-first allows integration testing before any client code exists. Protocol additions are auto-regenerated by `cargo test`, keeping TypeScript types in sync.
**Delivers:** New Rust crate `fps-boxing-plugin` implementing `GamePlugin`; `MsgFpsState` + `MsgFpsHit` added to protocol; `"fps_boxing"` registered in `main.rs` plugins HashMap; `shared/protocol.ts` regenerated.
**Addresses:** FPSBoxingPlugin (P1), wrist velocity hit detection, round/HP/wins lifecycle.
**Avoids:** Pitfall 8 (wrong `game_type` string), Pitfall 9 (`on_round_reset` clears calibration).
**Research flag:** Standard patterns — `GamePlugin` trait is well-documented in `GAME-SDK.md`; boxing hit detection is copy-portable from `boxing-plugin/hit_detection.rs`.

### Phase 2: Lobby + Room Page Updates
**Rationale:** Unblocks smoke-testing the plugin end-to-end before the FPS client exists. The lobby HTML change is small and self-contained; validating it early confirms `game_type` routing is correct.
**Delivers:** "FPS BOXING" tile in lobby game picker; `room_page_html` detects `game_type == "fps_boxing"` and shows P1/P2 laptop links instead of phone QR / overlay QR cards.
**Addresses:** Lobby integration (P1).
**Avoids:** Pitfall 8 (routing collision discovered early).
**Research flag:** Standard patterns — existing lobby HTML is template-driven and the pattern is established.

### Phase 3: FPS Client Scaffold + WebSocket Connection
**Rationale:** Establishes the new `fps/` Vite app structure and proves end-to-end server <-> client connectivity before adding MediaPipe or Three.js complexity. Stub UI confirms `MsgJoined.game_type == "fps_boxing"` routing works.
**Delivers:** `fps/` Vite app (mirrors `mobile/` structure); WS client (`ws.ts`); `MsgJoin` send, `MsgJoined` receive + routing; stub "connected" screen; no MediaPipe, no Three.js.
**Addresses:** Client scaffold, WS protocol integration.
**Avoids:** Pitfall 10 (overlay dispatcher audit before any new messages sent).
**Research flag:** Standard patterns — WS client mirrors `mobile/src/ws.ts` exactly.

### Phase 4: MediaPipe Webcam + Calibration
**Rationale:** MediaPipe is the highest-risk integration surface (WASM cold-start, coordinate space, main-thread starvation). Isolating it in its own phase allows focused performance validation before Three.js is layered on top.
**Delivers:** Webcam access (`getUserMedia`); `PoseLandmarker` in a Web Worker (`fps/src/workers/pose-hand.worker.ts`); OneEuroFilter on wrist/elbow landmarks; calibration UI (video preview, 3-punch prompt, `MsgCalibrationDone`); pose streaming to server (`MsgPoseFrame`); server completes calibration handshake and sends `MsgMatchStart`.
**Addresses:** Webcam wrist tracking (P1), calibration.
**Avoids:** Pitfall 1 (WASM cold-start), Pitfall 2 (raw landmark jitter), Pitfall 5 (main-thread starvation).
**Research flag:** Needs research — MediaPipe WASM loading via Vite requires `?url` suffix or CDN import to avoid bundler URL rewriting. Verify `delegate: "GPU"` behavior on integrated GPU laptops before committing to performance targets.

### Phase 5: Three.js Renderer + Arm Animation
**Rationale:** Three.js rendering is additive on top of a working MediaPipe pipeline. Building arms after MediaPipe is validated means coordinate mapping errors are isolated to the Three.js layer and not confused with landmark jitter.
**Delivers:** Three.js scene setup (`renderer.ts`); local arm meshes (`arms.ts`) — two `CylinderGeometry` + `SkinnedMesh` arms in camera-local space, `depthTest: false`; local arms driven by MediaPipe keypoints at camera rate; opponent arm meshes driven by `MsgFpsState.opponent_keypoints`; jitter buffer + `damp()` interpolation for opponent arms; HUD layer (`hud.ts`) — HP bars, round timer, win dots; hit flash (`hit-flash.ts`) from `MsgFpsHit`.
**Addresses:** Player arms (P1), opponent arms (P1), hit confirmation (P1), incoming hit feedback (P1), HUD (P1).
**Avoids:** Pitfall 3 (coordinate space mismatch), Pitfall 4 (render loop / pose update decoupling), Pitfall 7 (opponent rubber-banding).
**Research flag:** Coordinate mapping needs explicit test (raise left hand -> left arm rises in scene). Jitter buffer implementation should be verified under simulated 50 ms WiFi jitter in Chrome DevTools.

### Phase 6: Polish + Integration
**Rationale:** End-to-end two-player validation, aesthetic refinement, and v1.x differentiator features (arm stretch, guard visualisation). Only after core gameplay is confirmed working.
**Delivers:** Arms stretch animation on punch extension (spring overshoot); guard blocking arm crossover; round/match result overlays (FIGHT!, KO, round announcements per DESIGN.md); arm color per DESIGN.md accent colors; lobby tile final styling; end-to-end two-player test.
**Addresses:** Arms stretch (P2), guard blocking visualisation (P2), lobby polish.
**Avoids:** UX pitfalls (arm meshes hidden before first valid landmark, opponent arms fade on disconnect, local punch confirmation before server response).
**Research flag:** Standard patterns — all animations follow existing DESIGN.md motion specs.

### Phase Ordering Rationale

- Server before client: `FPSBoxingPlugin` is the dependency anchor for all downstream work. Client integration testing requires a working server plugin.
- Protocol before rendering: `MsgFpsState` / `MsgFpsHit` must be defined and auto-generated into TypeScript before the client can consume them.
- MediaPipe before Three.js: coordinate space validation and performance verification are cleanest in isolation. Mixing them delays identifying which layer caused a bug.
- Scaffold before features: a minimal WS connection phase proves the plugin + lobby routing chain before any rendering complexity is introduced.
- Pitfall 5 (MediaPipe main-thread starvation) and Pitfall 3 (coordinate mirroring) are the two bugs most likely to be introduced accidentally and most expensive to diagnose retroactively — isolating them into dedicated phases with explicit verification criteria prevents both.

### Research Flags

Needs research during planning:
- **Phase 4 (MediaPipe + Calibration):** Vite bundler handling of MediaPipe WASM assets requires explicit `?url` import or CDN script tag — not a default Vite behavior. Verify GPU delegate fallback behavior on common laptop GPU configurations before committing to performance targets. OneEuroFilter parameters may need tuning per webcam resolution.

Standard patterns (skip research-phase):
- **Phase 1 (FPSBoxingPlugin):** `GamePlugin` trait contract fully documented in `GAME-SDK.md`. Hit detection is a direct port of `boxing-plugin/hit_detection.rs`. Protocol struct + ts_rs export pattern is established and tested.
- **Phase 2 (Lobby):** Template-driven HTML, existing `game_type` routing already works for `"boxing"` and `"dance"`.
- **Phase 3 (Scaffold):** WS client mirrors `mobile/src/ws.ts` with no novel patterns.
- **Phase 5 (Three.js):** `CylinderGeometry`, `SkinnedMesh`, `MeshToonMaterial`, and `damp()` interpolation are well-documented Three.js patterns. Jitter buffer is standard entity interpolation.
- **Phase 6 (Polish):** All animation specs are defined in DESIGN.md.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm CLI; Three.js SkinnedMesh pattern verified via Context7; MediaPipe Tasks API confirmed via official Google docs; existing codebase patterns confirmed by direct source reading |
| Features | HIGH | Feature set derived directly from existing codebase (BoxingPlugin, DESIGN.md, protocol.ts); competitor analysis is informational only and does not drive implementation decisions |
| Architecture | HIGH | All component boundaries and data flows verified by direct source reading of plugin-trait, engine-core, protocol.rs, room.rs, game_loop.rs, GAME-SDK.md |
| Pitfalls | HIGH | MediaPipe pitfalls sourced from official Google docs and tracked issues; Three.js patterns sourced from official docs and discourse; Rust pitfalls sourced from Tokio docs and direct plugin-trait inspection |

**Overall confidence:** HIGH

### Gaps to Address

- **GPU delegate behavior on integrated GPUs:** Research confirms GPU delegation improves MediaPipe from 40-80 ms to 8-15 ms, but notes silent CPU fallback with no error. Exact behavior on Intel Iris Xe / Apple M-series integrated GPUs should be validated during Phase 4 implementation with per-frame timing assertions.
- **OneEuroFilter tuning parameters:** Starting values (`min_cutoff=1.0`, `beta=0.007`) are from MediaPipe community sources. Actual values may require tuning during Phase 4 based on webcam resolution (720p vs 1080p) and target punch detection sensitivity.
- **Payload size — landmark subsetting decision:** Pitfall 6 recommends subsetting opponent pose to 6 arm landmarks at 20 Hz. The current `MsgFpsState` design sends `opponent_keypoints: PoseKeypoint[]` (full 33 landmarks). Resolve this in Phase 1 protocol design — either subset in Rust or document the accepted bandwidth cost.
- **`PlayerSlot` indexing (0 vs 1):** Architecture notes `SendToPlayer { slot: 0 }` = Player 1 in engine convention but `protocol.ts` uses 1-indexed `PlayerSlot`. Confirm the mapping with a targeted Rust test in Phase 1 before wiring up Phase 5 opponent rendering.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase (direct source read): `engine/plugin-trait/src/lib.rs`, `engine/engine-core/src/main.rs`, `engine/engine-core/src/protocol.rs`, `engine/engine-core/src/room.rs`, `engine/engine-core/src/game_loop.rs`, `engine/engine-core/src/broadcast.rs`, `engine/boxing-plugin/src/hit_detection.rs`, `mobile/src/workers/pose.worker.ts`, `shared/protocol.ts`, `DESIGN.md`, `docs/GAME-SDK.md`
- npm CLI: confirmed `three@0.184.0`, `@mediapipe/tasks-vision@0.10.35`, `@types/three@0.184.1`
- Context7 `/mrdoob/three.js`: SkinnedMesh, `MeshToonMaterial`, `CylinderGeometry` patterns
- Google AI Edge official docs (`ai.google.dev`): HandLandmarker + PoseLandmarker web/JS guide, Web Worker usage, VIDEO vs LIVE_STREAM modes
- Google AI Edge HolisticLandmarker page: "coming soon" status confirmed

### Secondary (MEDIUM confidence)
- MediaPipe Tasks Vision best practices (Google Dev Blog): warm-up, GPU delegate, model complexity recommendations
- Three.js Discourse: `MathUtils.damp()` for frame-rate-independent interpolation
- Gabriel Gambetta entity interpolation: jitter buffer + render delay pattern
- PoseLandmarker browser performance: 15-30 fps typical on laptop CPU; GPU delegation improves to 8 ms per frame (community sources, validated against known mobile usage in this project)

### Tertiary (LOW confidence)
- Nintendo Arms (Wikipedia, game reviews): aesthetic and mechanic reference only — does not drive implementation decisions
- WebSocket binary vs JSON performance analysis: directionally confirms JSON payload subsetting recommendation; exact numbers project-specific

---
*Research completed: 2026-05-12*
*Ready for roadmap: yes*
