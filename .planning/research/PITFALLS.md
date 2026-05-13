# Pitfalls Research

**Domain:** Webcam boxing — MediaPipe browser detection + Three.js first-person arm rendering + WebSocket opponent sync + Rust GamePlugin extension (v2.0 milestone)
**Researched:** 2026-05-12
**Confidence:** HIGH (verified against MediaPipe official docs, plugin-trait source, protocol.ts, engine room manager)

---

## Critical Pitfalls

### Pitfall 1: MediaPipe WASM cold-start blocks the game start flow

**What goes wrong:**
The first call to `FilesetResolver.forVisionTasks()` downloads two WASM binaries plus the TFLite model — total ~5–10 MB cold. On a fast connection this takes 1–2 seconds; on a slow connection 5–10 seconds. The graph warm-up on the very first inference call allocates GPU/CPU memory and costs an additional 200–400 ms. If initialization is not started before the player reaches the "Start" screen, the UI appears to freeze.

**Why it happens:**
Developers treat MediaPipe initialization like a synchronous import and call `PoseLandmarker.createFromOptions()` inside a button handler or after a route transition instead of at page load.

**How to avoid:**
- Start `FilesetResolver.forVisionTasks()` immediately on page load — not on button click.
- After the task is created, fire one warm-up inference (blank `ImageBitmap` or first video frame) to force GPU memory allocation before the user needs it.
- Cache the WASM binary in IndexedDB or via `Cache-Control: max-age=604800` on the CDN origin. MediaPipe CDN files are version-pinned so cache-busting is safe.
- Show a loading indicator during warm-up; gate the "Start" button on `landmarker.isReady` confirmation.

**Warning signs:**
- First "Ready" click freezes UI for 2+ seconds.
- Chrome Performance profiler shows a long WASM compilation stall on first page load.
- Inference latency on the very first frame is 400+ ms, subsequent frames are 15–30 ms.

**Phase to address:** Phase that introduces the browser webcam detection module.

---

### Pitfall 2: Raw MediaPipe landmarks are too noisy for punch detection — false positives and missed punches

**What goes wrong:**
Raw landmark output from `PoseLandmarker` jitters by 1–3 normalized units per frame even when the player holds still, due to sensor ISO noise and model uncertainty. A naive velocity threshold (wrist moves faster than X units/frame) fires false positives continuously at rest. Raising the threshold to suppress noise then misses fast punches.

**Why it happens:**
MediaPipe's internal `SMOOTH_LANDMARKS` option applies a lightweight filter, but the Tasks Vision API exposes it inconsistently. Many developers assume output is pre-smoothed.

**How to avoid:**
- Apply a **OneEuroFilter** (adaptive low-pass) to wrist and elbow landmarks before computing velocity. Starting parameters: `min_cutoff=1.0 Hz`, `beta=0.007`. Lower `min_cutoff` reduces jitter at rest; higher `beta` reduces lag during fast movement.
- Compute punch velocity as the **magnitude of the displacement vector** between consecutive frames, normalized by `deltaTime` in seconds — not raw per-axis speed.
- Gate on the **visibility score**: skip landmark updates when `visibility < 0.5` (consistent with the `PoseKeypoint` convention already encoded in `plugin-trait/src/lib.rs`). Hold the last good position rather than feeding invisible landmarks into the filter.
- Require the velocity spike to be sustained for at least 2 consecutive frames before triggering a hit event (debounce gate).

**Warning signs:**
- Punch counter increments with no physical motion.
- Arms in the Three.js scene jitter visibly when the player holds still.
- Hit events fire in rapid clusters at the start of every round.

**Phase to address:** Phase that implements the browser punch detection pipeline and wrist velocity calculation.

---

### Pitfall 3: MediaPipe coordinate space does not map cleanly to Three.js world space

**What goes wrong:**
MediaPipe normalizes landmarks to [0.0, 1.0] in image space with Y increasing downward and origin at top-left. Three.js world space uses Y-up with origin at scene center. The z-component from the FULL model is a weak-perspective depth estimate — useful for relative depth (extended arm vs. cocked arm) but not as a metric 3D coordinate. Developers who map raw landmark `x, y` directly to `mesh.position.x, y` produce arms that mirror left-right on a front-facing webcam and are anchored at the wrong origin.

Note: the existing Rust engine already applies `normalize_to_y_up` (hip-centered Y-up) before delivering frames to server-side plugins. The browser client receives raw MediaPipe output and must do its own mapping.

**How to avoid:**
- Flip X for a front-facing webcam: `worldX = -(normalizedX - 0.5) * scale`.
- Flip Y unconditionally: `worldY = -(normalizedY - 0.5) * scale + shoulderHeight`.
- Treat `z` as a relative depth hint only. For punch extension, derive depth from the wrist-to-shoulder 2D distance rather than the raw `z` value.
- Lock the shoulder anchor to a fixed scene position; drive only the wrist (and elbow via two-bone IK) from landmarks. Do not let shoulder drift from landmark noise destabilize the whole arm.

**Warning signs:**
- Player raises left arm, right arm in scene rises.
- Arms float or sink when the player stands still.
- Extended punch has no visible depth change.

**Phase to address:** Phase that implements the Three.js arm mesh and pose-to-world coordinate mapping.

---

### Pitfall 4: Three.js render loop and MediaPipe pose update loop run at different frequencies, causing visible stepping

**What goes wrong:**
MediaPipe on a typical laptop webcam produces landmarks at 30 fps (webcam hardware limit). Three.js `requestAnimationFrame` runs at 60 or 120 Hz (monitor refresh). If arm positions are updated only on each new landmark frame and rendered at 60 Hz, arms visibly teleport in discrete 33 ms steps — one jump every two render frames.

**Why it happens:**
Developers update `mesh.position` directly inside the MediaPipe result callback and call `renderer.render()` in the RAF loop. The landmark buffer is stale half the time with no interpolation.

**How to avoid:**
- Maintain a **target state buffer**: when new landmarks arrive, store them as the interpolation target, not the final position.
- In the RAF loop, lerp current arm position toward the target: use `THREE.MathUtils.damp(current, target, lambda, delta)` rather than a fixed factor — this is frame-rate independent and avoids over-smoothing on high-refresh monitors.
- A lambda of ~12 (damp) produces smooth follow with ~2–3 frames of lag at 60 Hz — acceptable for boxing.
- Apply the OneEuroFilter at the MediaPipe stage (per Pitfall 2); then lerp in the render loop. Do not apply both on the same data path.

**Warning signs:**
- Arms step visibly in 33 ms discrete jumps even on a smooth render.
- Chrome profiler shows render loop and MediaPipe callbacks contending for the same frame.

**Phase to address:** Phase that wires MediaPipe output into the Three.js render loop.

---

### Pitfall 5: MediaPipe inference runs on the main thread and starves the Three.js render loop

**What goes wrong:**
A single `PoseLandmarker.detectForVideo()` call in `runningMode: "VIDEO"` (synchronous) takes 15–40 ms on a mid-range laptop CPU. At 30 Hz, this is 450–1200 ms/s of main-thread blocking work. The Three.js RAF loop — also on the main thread — drops to 15–20 fps, input events lag, and the game feels broken.

**Why it happens:**
`runningMode: "VIDEO"` is documented as the straightforward path and is synchronous. Developers call it inside the RAF callback without realizing it is blocking.

**How to avoid:**
- Use `runningMode: "LIVE_STREAM"` with a `resultCallback`. MediaPipe manages its own scheduling and fires the callback on result ready. The RAF loop is not blocked.
- Alternatively: run MediaPipe in a **Web Worker** using `OffscreenCanvas`. Transfer video frames with `transferControlToOffscreen()` and `postMessage` results back to the main thread. This completely isolates inference from rendering.
- Set `delegate: "GPU"` in the task options. GPU inference runs at 8–15 ms vs. 40–80 ms CPU. Verify this works — the GPU delegate silently falls back to CPU if WebGL2 is unavailable, with no error thrown.
- Use `model_complexity: 1` (FULL), not `model_complexity: 2` (HEAVY). HEAVY offers marginally better accuracy but requires GPU; it degrades severely on integrated laptop GPUs.

**Warning signs:**
- Three.js frame time spikes to 30+ ms every other frame in the Chrome Performance panel.
- `detectForVideo` call visible as a long synchronous block on the main thread.
- Setting `delegate: "GPU"` shows no benefit — check `chrome://gpu` for WebGL2 status.

**Phase to address:** Phase that implements the browser webcam detection module.

---

### Pitfall 6: Opponent pose payload is too large or too frequent, congesting the WebSocket

**What goes wrong:**
Streaming all 33 pose landmarks (33 × 4 floats × 8 bytes JSON = ~2 KB per frame as JSON) at 30 Hz costs ~60 KB/s per direction. On Railway's shared infrastructure and on congested WiFi, the WebSocket send buffer fills, causing the server to queue or drop frames. The existing mobile protocol sends 33 keypoints as a JSON array of objects — human-readable but 3–4x the size of a compact binary encoding.

**Why it happens:**
The path of least resistance is to pipe the player's own `pose_frame` protocol directly to the opponent. The existing protocol was designed for mobile→server streaming, not server→browser real-time mirroring.

**How to avoid:**
- Send only the landmarks needed for arm rendering: both wrists (indices 15, 16), both elbows (13, 14), and both shoulders (11, 12) — 6 landmarks instead of 33. This is a ~5x payload reduction.
- Use `f32` precision (4 bytes) not `f64` — millimeter accuracy is irrelevant for game rendering.
- Throttle opponent pose updates to **20 Hz** (every 3rd server tick). Client-side interpolation (per Pitfall 7) hides the reduced rate. At 20 Hz × 6 landmarks × ~60 bytes JSON = ~1.2 KB/s — well within Railway limits.
- Add a `seq` field to each opponent pose message so the client can detect out-of-order delivery.

**Warning signs:**
- Railway logs show WebSocket send buffer warnings.
- Opponent arms freeze then jump — interpolation buffer is starved.
- Chrome Network panel shows individual frames exceeding 16 KB.

**Phase to address:** Phase that designs the FPS client-server message protocol and opponent pose streaming.

---

### Pitfall 7: Opponent state applied directly on receipt causes rubber-banding under network jitter

**What goes wrong:**
When the server streams opponent pose snapshots, the browser client renders each snapshot immediately on receipt. On a jittery WiFi connection (20–50 ms variance), snapshots arrive clustered then gapped — producing arms that surge forward then freeze. This looks broken even when average latency is low.

**Why it happens:**
Developers implement the simplest approach: `opponentArm.position.set(snapshot.x, y, z)` in the WebSocket `onmessage` handler. There is no buffer and no interpolation between snapshots.

**How to avoid:**
- Maintain a **jitter buffer**: a ring buffer of the last 3–4 opponent pose snapshots, each with a server-assigned timestamp or sequence number.
- In the RAF loop, render opponent arms at `now - bufferDelay` (60–80 ms behind real time), linearly interpolating between the two snapshots that straddle that render time.
- This trades 60–80 ms of visual lag for completely smooth opponent motion — acceptable in boxing where reaction times are 200+ ms.
- If the buffer is empty (extreme lag), hold the last known position rather than resetting the mesh.

**Warning signs:**
- Opponent arms smooth on LAN, visibly surging/freezing on WiFi.
- Opponent position teleports in discrete steps under simulated 50 ms jitter in Chrome DevTools.

**Phase to address:** Phase that implements Three.js opponent rendering and state management.

---

### Pitfall 8: FPSBoxingPlugin registered under `game_type: "boxing"` corrupts existing rooms

**What goes wrong:**
The `RoomManager` selects a plugin instance based on the `game_type` string supplied at room creation. If `FPSBoxingPlugin` returns `"boxing"` from `game_type()`, any room created for the existing mobile boxing game may instantiate the FPS plugin — delivering unexpected `SendToPlayer` payloads, ignoring calibration correctly, or crashing on a missing FPS state downcast.

**Why it happens:**
The plugin author reuses the familiar `"boxing"` identifier to avoid lobby changes, not realizing that exact string equality is the dispatch key.

**How to avoid:**
- Register `FPSBoxingPlugin` under a distinct identifier: `"fps_boxing"`.
- Add a Rust test: `assert_ne!(FPSBoxingPlugin::new().game_type(), "boxing")`.
- Run the existing boxing plugin test suite after adding the new plugin to the registry — zero regressions expected with no engine changes.
- Update the lobby's game picker to surface `"fps_boxing"` as a distinct option; `MsgJoined.game_type` already carries this string to clients.

**Warning signs:**
- Mobile boxing rooms receive unexpected JSON messages after FPSBoxingPlugin is registered.
- Existing boxing integration tests fail post-plugin-registration.

**Phase to address:** Phase that adds FPSBoxingPlugin to the server and wires it into `RoomManager`.

---

### Pitfall 9: `on_round_reset` clears calibration data — breaks the FIX-01 invariant

**What goes wrong:**
The `GamePlugin` trait contract (`plugin-trait/src/lib.rs`) explicitly requires that `on_round_reset` clears only round-scoped state and never touches calibration data (`reference_velocity`). An `FPSBoxingPlugin` that resets all mutable state in `on_round_reset` — a natural impulse when writing a "clean slate" reset — will break this invariant, causing round 2 to start uncalibrated.

**Why it happens:**
FPS boxing introduces new per-round fields (combo counter, punch cooldown, last hit timestamp). A developer who clears "all mutable state" in `on_round_reset` accidentally clears the calibration cache alongside them.

**How to avoid:**
- Store round-scoped state and session-scoped state in separate sub-structs:
  ```
  struct FPSBoxingState {
      session: SessionState,  // calibration fields — never reset
      round: RoundState,      // cleared in on_round_reset
  }
  ```
- In `on_round_reset`, call `state.round = RoundState::default()` — never touch `state.session`.
- Add a test: calibrate → complete a round → assert `reference_velocity` is still `Some` after `on_round_reset` returns.

**Warning signs:**
- Round 2 shows `reference_velocity = None` for a player who calibrated.
- Punch force is wrong in round 2 (divided by zero or uses default velocity).

**Phase to address:** Phase that implements FPSBoxingPlugin server-side logic.

---

### Pitfall 10: New FPS message types break the existing spectator overlay parser

**What goes wrong:**
The FPSBoxingPlugin sends new message types (e.g., `"fps_state"` with opponent landmark data). The existing spectator overlay message dispatcher may throw or silently stop processing all subsequent messages if it encounters an unrecognized `type` field with no safe default handler.

**Why it happens:**
The existing overlay dispatch loop was written when only `"game_state"`, `"round_start"`, `"round_end"` etc. existed. A new message type that hits the `default:` case may throw if the code assumes exhaustive handling.

**How to avoid:**
- Audit the existing overlay message dispatcher before writing any new message types. Verify it has a safe default: `default: break` or `default: console.warn(...)`.
- FPS-specific messages should be sent exclusively via `GameEvent::SendToPlayer`, not `GameEvent::Broadcast`, so the spectator overlay channel never receives them.
- If a broadcast to spectators is unavoidable, add the new `type` to the overlay's dispatcher with a no-op handler first, then populate it.

**Warning signs:**
- Spectator overlay goes blank after the first FPS room message.
- Console shows unhandled message type errors.

**Phase to address:** Phase that designs the FPS client-server message protocol.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Stream all 33 landmarks to opponent | No subsetting logic required | 5x bandwidth; buffer congestion on poor connections | Never — subset to 6 arm landmarks from the start |
| `game_type: "boxing"` for FPSBoxingPlugin | No lobby change needed | Routes mobile boxing rooms to wrong plugin; silent corruption | Never |
| `runningMode: "VIDEO"` synchronous MediaPipe in RAF | Simpler integration | Render loop starved; 15 fps on mid-range laptops | Prototype only — must fix before any real testing |
| Fixed lerp factor instead of delta-time damp | Simpler code | Animation runs at wrong speed on 120 Hz monitors | Never in shipped code |
| Skip OneEuroFilter, use raw landmarks | Saves ~20 lines | Constant false-positive punches; jittery arms | Prototype only |
| Clear all state in `on_round_reset` | Simple reset logic | Breaks FIX-01: calibration lost between rounds | Never |
| `tokio::sync::Mutex` for pure plugin data | Appears safe | Async mutex for non-async data is wrong tool; adds overhead; `std::sync::Mutex` is correct per Tokio docs | Never — use `std::sync::Mutex` for plugin state structs that are not held across `.await` |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MediaPipe Tasks Vision WASM + Vite bundler | Bundler rewrites the WASM asset URL, breaking `FilesetResolver` | Use `?url` suffix in Vite imports, or load via CDN `<script>` tag with an absolute URL to `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/` |
| MediaPipe `vision_wasm_internal.wasm` path | Passing a relative path — fails when page is served from a subdirectory | Always use the absolute CDN URL or derive the path from `import.meta.url` |
| Three.js arm mesh + MediaPipe landmark Z | Feeding raw `z` from PoseLandmarker into `mesh.position.z` — weak-perspective value, not metric | Use `z` only as a relative depth hint; derive punch depth from 2D wrist-to-shoulder distance |
| `GameEvent::SendToPlayer` slot indexing | Plugin uses 0-indexed slot; `protocol.ts` uses 1-indexed `PlayerSlot = 1 \| 2` | `SendToPlayer { slot: 0 }` = Player 1 in engine convention — confirm mapping in the plugin; write a test |
| FPSBoxingPlugin calibration decision | Assumes the webcam client sends `CalibrationDone` the same way as mobile — may not | Decide early: does FPS mode skip calibration (`requires_calibration() -> false`) or perform a webcam-specific calibration? Document in plugin and lobby |
| Railway WebSocket idle timeout | Railway drops idle WebSockets after ~60 s if no data is sent | Wire the existing `MsgPing`/`MsgPong` heartbeat into the FPS client — the protocol already supports it |
| MediaPipe GPU delegate silent CPU fallback | `delegate: "GPU"` is set but inference runs at CPU speed with no error | Check `chrome://gpu` for WebGL2 status; log per-frame inference time; alert in dev if >20 ms |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| MediaPipe GPU delegate silently falls back to CPU | GPU selected, inference runs at 40–80 ms; RAF frame time spikes | Verify WebGL2 in `chrome://gpu`; log inference duration per frame | Integrated GPU laptops with outdated drivers |
| JSON landmark streaming at full 33-landmark depth | Payloads grow to 2–4 KB/frame; WebSocket queue backs up | Subset to 6 arm landmarks; keep total <200 bytes/frame | >20 Hz send rate on slow WiFi |
| Three.js dynamic lighting or post-processing on arm meshes | Frame time exceeds 16 ms on integrated GPU | Use `MeshToonMaterial` (unlit toon) or `MeshBasicMaterial`; no shadows on arm meshes | Any laptop with integrated Intel or older discrete GPU |
| RAF canvas dimensions set to CSS pixels on HiDPI display | Landmark coordinates are off by `devicePixelRatio`; arms misaligned | Always set canvas to `video.videoWidth × video.videoHeight`, not `canvas.offsetWidth × offsetHeight` | Retina MacBooks and 4K Windows laptops |
| Large ring buffer storing full 33-landmark snapshots for jitter buffering | Memory growth per opponent; 4 snapshots × 33 × 3 floats × 8 bytes = 3 KB (fine alone, easy to bloat) | Store only 6 arm landmarks in the jitter buffer | When snapshot rate increases above 30 Hz |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-sent `player_slot` on the FPS WebSocket without server-side validation | Player sends `player_slot: 2` to masquerade as opponent | The existing engine validates slot on `MsgJoin`; ensure the FPS WebSocket path uses the same validation, not a new unvalidated route |
| Relaying client FPS messages directly to the opponent | Crafted payload breaks the opponent's Three.js client | Server must reconstruct opponent state from authoritative data (received landmarks, server-computed velocity) — never relay client messages verbatim |
| Not stopping the webcam stream on page unload | Webcam indicator LED stays on after the game tab is left | Call `stream.getTracks().forEach(t => t.stop())` in a `beforeunload` handler |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Starting the game before camera permission is granted | Game loads, player clicks "Start", browser prompts for camera — jarring mid-flow interruption | Request `getUserMedia` permission immediately on page load with a clear prompt; gate "Start" on `stream.active === true` |
| No fallback when MediaPipe fails to load | Blank game view with no explanation | Show a human-readable error ("Pose detection failed — check your connection and refresh") with a retry button |
| Arm meshes visible before calibration | Jittery arms appear in random positions during warmup | Hide arm meshes (or hold them in rest position) until the first valid landmark set is received |
| Opponent arms snap to origin on disconnect | Jarring jump when opponent drops connection | Fade or hold last-known position for 1–2 seconds, then hide the opponent mesh |
| No local punch confirmation before server response | Player punches, nothing happens for 50–100 ms until server sends `MsgYouWereHit` | Play a local impact animation the instant velocity threshold is crossed; reconcile later when server confirms the hit |

---

## "Looks Done But Isn't" Checklist

- [ ] **MediaPipe warm-up:** Warm-up frame was fired after WASM load — verify first real inference is not 400+ ms (check in Chrome Performance panel)
- [ ] **Coordinate mapping:** Left arm in webcam maps to left arm in scene — verify with a left-hand-only raise test
- [ ] **OneEuroFilter:** Applied before velocity calculation, not after — verify still arms produce near-zero velocity output
- [ ] **Jitter buffer:** Opponent arms remain smooth under 50 ms simulated jitter (use Chrome DevTools network throttling)
- [ ] **FPSBoxingPlugin game_type:** Returns `"fps_boxing"`, not `"boxing"` — `assert_ne!(fps_plugin.game_type(), "boxing")` in Rust tests
- [ ] **on_round_reset isolation:** `reference_velocity` survives a round reset — round-trip test: calibrate → complete round → check calibration still `Some`
- [ ] **Existing tests pass:** `cargo test --workspace` after adding FPSBoxingPlugin — zero regressions
- [ ] **Overlay dispatcher:** Existing spectator overlay handles unknown message types gracefully — test by sending `{"type":"fps_state"}` to overlay WebSocket
- [ ] **Camera permission gate:** "Start" button disabled until `getUserMedia` resolves — test with camera permission denied
- [ ] **MediaPipe off main thread:** Three.js RAF frame time stays below 16 ms during active pose detection — verify in Chrome DevTools Performance panel

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mirrored coordinate mapping discovered late | LOW | Flip X sign in one mapping function; no architecture change required |
| Wrong `game_type` string causes routing collision | LOW | Change the constant in `FPSBoxingPlugin::game_type()`, recompile, redeploy; no protocol change |
| MediaPipe blocking main thread (render stall) | MEDIUM | Switch to `LIVE_STREAM` mode with callback; restructures landmark update flow but not the Three.js scene |
| `on_round_reset` clears calibration | LOW | Move calibration fields to `session` sub-struct; add one test; no engine changes |
| JSON payload too large, WebSocket congestion | MEDIUM | Subset landmarks to 6 arm keypoints; update both Rust send and JS receive; requires coordinated deploy |
| No jitter buffer — opponent rubber-bands | MEDIUM | Add ring buffer + interpolation in RAF loop; self-contained JS change with no server impact |
| Overlay breaks on new message type | LOW | Add default no-op handler to overlay dispatcher; route FPS messages via `SendToPlayer` instead of `Broadcast` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-----------------|--------------|
| WASM cold-start blocking game start | Webcam detection module | Time from page load to first valid landmark; must be <200 ms after initial WASM download completes |
| Raw landmark jitter causing false punches | Punch detection pipeline | Hold still 5 seconds; assert zero punch events fired |
| Coordinate space mismatch (mirrored/flipped) | Three.js arm rendering | Manual QA: raise left hand → left arm rises in scene |
| Render loop / pose update decoupling | Three.js + MediaPipe integration | RAF frame time <16 ms with MediaPipe running in Chrome DevTools |
| MediaPipe CPU starvation of render loop | Webcam detection module | MediaPipe not visible as main-thread blocker in Chrome Performance panel |
| Opponent payload too large | Opponent sync protocol design | Network profiler: <2 KB/s per opponent stream at 20 Hz |
| Opponent rubber-banding under jitter | Opponent rendering | Test with Chrome DevTools 50 ms network jitter; arms must remain smooth |
| FPSBoxingPlugin routing collision | Server plugin registration | `cargo test --workspace` passes; `assert_ne!(fps.game_type(), boxing.game_type())` |
| Calibration state cleared in round reset | FPSBoxingPlugin implementation | Round-trip test: calibrate → round end → `reference_velocity` still `Some` |
| Overlay parser broken by new message type | Protocol design | Send `{"type":"fps_state"}` to overlay WebSocket; overlay must not crash or go silent |

---

## Sources

- MediaPipe Tasks Vision official best practices: https://developers.googleblog.com/2023/10/7-dos-and-donts-of-using-ml-on-web-with-mediapipe.html
- MediaPipe pose landmark web guide: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- MediaPipe SMOOTH_LANDMARKS / jitter issue: https://github.com/google/mediapipe/issues/3354
- MediaPipe FPS / latency issue tracker: https://github.com/google-ai-edge/mediapipe/issues/3533
- Three.js forum — jitter interpolation and damp: https://discourse.threejs.org/t/shaky-jumpy-camera-interpolation-along-curve/52278
- Gabriel Gambetta entity interpolation: https://www.gabrielgambetta.com/entity-interpolation.html
- WebSocket binary vs JSON performance: https://dev.to/nate10/performance-analysis-of-json-buffer-custom-binary-protocol-protobuf-and-messagepack-for-websockets-2apn
- Tokio shared state (`std::sync::Mutex` vs `tokio::sync::Mutex`): https://tokio.rs/tokio/tutorial/shared-state
- Project plugin-trait interface: `engine/plugin-trait/src/lib.rs`
- Project wire protocol: `shared/protocol.ts`
- Project room manager: `engine/engine-core/src/room_manager.rs`

---
*Pitfalls research for: webcam boxing — MediaPipe + Three.js + Rust GamePlugin extension (v2.0)*
*Researched: 2026-05-12*
