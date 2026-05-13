# Feature Research

**Domain:** First-person webcam-driven boxing game with Arms-style rendering
**Researched:** 2026-05-12
**Confidence:** HIGH (existing codebase read directly; external research confirms patterns)

---

## Context: What Already Exists

The v1.0 boxing plugin is server-authoritative with well-tested hit detection. The existing
`BoxingPlugin` already handles:
- Velocity-relative punch threshold (calibrated ref_vel, 12-tick cooldown, guard-raise veto)
- Nine body region classification (head face/chin/throat, torso upper/lower, block hand/forearm, leg)
- Guard blocking (defender wrist positions veto incoming hits)
- Bot mode (solo play)
- Round lifecycle (HP, KO, time-limit decision, best-of-N wins)
- Commentary hints for the v2 commentary engine

The v2.0 first-person boxing game adds a **new client surface** (laptop webcam + Three.js 3D
view) and a **new server plugin** (`FPSBoxingPlugin`). The plugin contract is the same
`GamePlugin` trait — no engine changes. The wire protocol is byte-for-byte unchanged.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Webcam wrist tracking (MediaPipe Pose) | Without this there is no input | MEDIUM | Use `PoseLandmarker` (Tasks API, `@mediapipe/tasks-vision`), same model already used in mobile (`usePose.ts`). Run in a Web Worker to avoid blocking Three.js render loop. |
| Punch-to-arm animation mapping | Punching IRL must move your arm on screen | MEDIUM | Map left/right wrist world-landmark (x, y, z) directly to the camera-relative 3D arm position each frame. No IK needed for v1 — translate the wrist landmark offset into a local arm bone transform. |
| Player arms visible in first-person | Core "Arms-style" identity — you must see your own arms | MEDIUM | Two stylized forearm/fist meshes rendered in a separate Three.js camera layer (no depth testing against the scene so they never clip into floors). Cartoonish, low-poly, solid-fill. |
| Opponent character visible ahead | Without an opponent to punch at the game has no target | HIGH | Opponent rendered from server-streamed pose state. At minimum: two opponent arms extending from the far side of the scene. Ideally a simple torso+head silhouette for target zone context. |
| Hit confirmation visual | Player must know their punch landed | LOW | Screen-edge flash (existing `HitFlash` pattern from mobile), brief arm "snap-back" animation, opponent arm recoil. 50ms hard-cut in, 220ms exponential-out decay (per DESIGN.md motion spec). |
| Incoming hit feedback | Player must know they got hit | LOW | Screen shake (DESIGN.md: `translate` only, 380ms, 5 keyframes exponential decay) + HP bar drain (100ms linear). Already proven in overlay. |
| HP bars in HUD | Players expect to track health | LOW | Two bars in screen corners — P1 bottom-left, P2 bottom-right. Follows existing DESIGN.md HP bar spec (P1 crimson fills left-to-right, P2 steel fills right-to-left). |
| Round/match announcements | FIGHT!, KO, Round X announcements are genre-required | LOW | Achafont full-screen overlays. Same animation spec as existing overlay (scale 0.9→1 over 160ms). |
| Win dots | Users expect round score tracking | LOW | Best-of-N dots under each player label. Per DESIGN.md spec already defined. |
| Round timer | Knowing how long is left is expected | LOW | Timer in HUD center. Inter 900. Per DESIGN.md `--type-hud-timer`. |
| Lobby integration | New game type must be discoverable | LOW | Add FPS Boxing card to the existing lobby game picker (already has extensible game type routing via `game_type` in `MsgJoined`). |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Arms aesthetic — cartoonish extendable style | Visual identity; makes the game feel like a Nintendo-inspired experience rather than a webcam gimmick | MEDIUM | Arms are the centrepiece. Use tube geometry or lathe geometry for a stretchy, rubbery look. Bright accent colors (P1 crimson, P2 steel per DESIGN.md). No realistic skin textures — flat shading, bold outlines. |
| Guard blocking via wrist raise | Physically raising your hands guards — creates genuine tactical depth | LOW (server already does this) | `BoxingPlugin` already detects guard via defender wrist Y position. `FPSBoxingPlugin` can inherit the same logic. Render: animate player arm crossover when guard is detected. |
| Arms "stretch" on punch extension | Makes punches feel visceral and Arms-like | MEDIUM | When a punch is detected (wrist velocity crosses threshold), animate the arm mesh extending forward along the punch direction with a spring overshoot. Retract after 200ms. |
| No phone required | Unique selling point — single-device; lower friction to play | LOW | Already a project requirement. Laptop webcam only. Communicate this clearly in the lobby UI card. |
| Punch direction (left vs right hand) | Knowing which arm threw the punch matters for game strategy | LOW | MediaPipe Pose gives left wrist (15) and right wrist (16) separately. Server already computes `peak_speed` on each independently. Surface left/right hand in the `Hit` event to drive which arm recoils on screen. |
| Calibration-free start (optional) | Faster time-to-first-punch | MEDIUM | FPSBoxingPlugin could use a fixed threshold or derive ref_vel from first-seconds of play, so no explicit calibration step is needed for casual play. Risk: phantom hits if uncalibrated. Recommend keeping calibration but making it shorter (3 jabs, not 5). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| MediaPipe Hands (21 finger landmarks) instead of Pose | Hands model gives more precise finger/wrist data | Running Pose + Hands simultaneously is too expensive for a gameplay loop that also drives Three.js at 60fps on a laptop CPU. Pose is already integrated in mobile and gives wrist velocity sufficient for punch detection. | Use `PoseLandmarker` (33 landmarks) only. Wrist landmarks 15/16 are sufficient for punch velocity, guard raise, and arm direction. |
| Full 3D physics arena | Visually impressive | Implementing physics (gravity, collision) for arms adds scope complexity that doesn't improve the core fun loop. The Arms game aesthetic is arena-less — focus is on the arms. | Static or slowly rotating environment behind the opponent. Cheap parallax or fog. |
| Voice/audio commentary in MVP | Fun feature | Commentary engine is deferred to v2 in project scope (COMM-01..04). CommentaryHint events already emitted by the plugin — consumption is wired later. | Emit CommentaryHint events from FPSBoxingPlugin (free, matches existing pattern). Actual TTS/audio is v2. |
| Peer-to-peer (WebRTC) pose sync | Lower server load for opponent arm rendering | The existing engine is server-authoritative by design. Bypassing it breaks the authoritative hit detection guarantee and the RTT fairness input delay buffer. Adding WebRTC alongside WebSocket creates two connection surfaces. | Continue routing all state through the server. The server already broadcasts `MsgGameState` with poses at 60Hz, which is sufficient to render opponent arms. |
| Mobile player as P2 in FPS mode | Allows asymmetric matchmaking (phone vs laptop) | The FPS view assumes both players are on laptops with webcams. Mixing a phone pose-stream client with a laptop FPS client creates incompatible input models (phone has full body, laptop has no calibration flow for the other player). | FPS Boxing is a laptop-only mode. Existing boxing (phone-based) remains available in the lobby alongside it. |
| Lip sync / face tracking | Immersive | Running FaceDetection on top of Pose on the same CPU/GPU budget will degrade pose FPS below usable thresholds. | Opponent is a stylized character — no face needed. |

---

## Feature Dependencies

```
[Webcam wrist tracking (MediaPipe Pose)]
    └──required by──> [Punch-to-arm animation mapping]
                          └──required by──> [Player arms visible in first-person]
                          └──required by──> [Guard blocking via wrist raise]
                          └──required by──> [Arms stretch on punch extension]

[FPSBoxingPlugin (Rust, GamePlugin trait)]
    └──required by──> [Opponent character visible ahead]
    └──required by──> [Hit confirmation visual]
    └──required by──> [Incoming hit feedback]
    └──required by──> [HP bars in HUD]
    └──required by──> [Round/match announcements]

[Server MsgGameState (already exists)]
    └──feeds──> [Opponent character visible ahead]

[Lobby integration]
    └──depends on──> [FPSBoxingPlugin game_type string registration in engine]
```

### Dependency Notes

- **Webcam wrist tracking requires a Web Worker:** The existing `usePose.ts` already runs MediaPipe in a worker via `pose.worker.ts`. The FPS client should reuse this worker architecture. MediaPipe on the main thread would block Three.js render calls and is confirmed problematic (seen in mobile pose hook).
- **FPSBoxingPlugin is independent of `BoxingPlugin`:** The `GamePlugin` trait allows a new plugin per game type. `FPSBoxingPlugin` is a new Rust crate registered with the `game_type` string `"fps_boxing"`. It can copy hit detection logic wholesale from `boxing-plugin/hit_detection.rs` or depend on it as a shared library.
- **Three.js first-person arms are independent of the server:** They are driven purely by the local webcam pose stream. The server's role is hit detection and opponent state broadcasting — not driving the player's own arms.
- **Opponent arm rendering depends on server pose broadcast:** `MsgGameState` already carries `poses: [PoseKeypoint[], PoseKeypoint[]]` at 60Hz. Opponent wrist positions extracted from this feed drive the opponent arm mesh positions. No new protocol messages are needed for MVP.
- **Lobby integration requires `FPSBoxingPlugin` to be registered first:** The lobby game picker reads `game_type` from `MsgJoined`. The engine must know about `fps_boxing` before the lobby can surface it.

---

## MVP Definition

### Launch With (v1)

The minimum to validate the concept — a playable FPS boxing round between two laptop players.

- [ ] `FPSBoxingPlugin` Rust crate — implements `GamePlugin`, game_type `"fps_boxing"`, round/HP/wins logic, re-uses hit detection from boxing-plugin (HIGH value, HIGH cost — must be first)
- [ ] MediaPipe Pose in a Web Worker on the laptop client (MEDIUM cost — port of existing mobile `pose.worker.ts`, runs on laptop webcam)
- [ ] Wrist velocity input routing: client sends `pose_frame` to server per existing protocol; FPSBoxingPlugin detects hit server-side (LOW cost — protocol unchanged)
- [ ] Three.js scene: player arms (two stylized forearm + fist meshes rendered in camera-local layer, driven by left/right wrist landmark positions from MediaPipe output) (MEDIUM cost)
- [ ] Opponent arms (two meshes driven by `MsgGameState.poses` opponent wrist positions, rendered as the "far" player) (MEDIUM cost)
- [ ] Hit confirmation: arm snap-back animation + screen flash on `you_were_hit` (LOW cost)
- [ ] HUD: HP bars, round timer, win dots, FIGHT!/KO/round overlays (LOW cost — follows existing DESIGN.md specs exactly)
- [ ] Lobby: add FPS Boxing card to game picker (LOW cost)

### Add After Validation (v1.x)

- [ ] Arms stretch animation on punch extension — adds visual punch to the "game feel" loop; add once MVP is playable and the timing of the extension feels right
- [ ] Cartoonish arm color picker (P1/P2 choose arm color) — personalisation; add when retention matters
- [ ] Shorter calibration (3 jabs) or velocity auto-tuning — add if playtest shows calibration drop-off
- [ ] Opponent torso/head silhouette — makes target zones legible; add if playtests show confusion about what to aim at

### Future Consideration (v2+)

- [ ] AI commentary consumption (CommentaryHint events already emitted; wired in v2 per project scope)
- [ ] AI bot for solo FPS boxing (FPSBoxingPlugin solo_mode, same pattern as BoxingPlugin bot)
- [ ] Spectator overlay for FPS boxing — low priority since the game is laptop-native and the existing overlay serves phone-based boxing
- [ ] Asymmetric matchmaking (phone P1 vs laptop P2) — requires significant protocol rethinking; defer

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| FPSBoxingPlugin (Rust) | HIGH | MEDIUM | P1 |
| MediaPipe Pose Web Worker (laptop) | HIGH | LOW (port of existing) | P1 |
| Player arms (Three.js, wrist-driven) | HIGH | MEDIUM | P1 |
| Hit confirmation feedback | HIGH | LOW | P1 |
| HUD (HP, timer, wins, announcements) | HIGH | LOW | P1 |
| Opponent arms (server pose stream) | HIGH | MEDIUM | P1 |
| Lobby integration | MEDIUM | LOW | P1 |
| Arms stretch animation | MEDIUM | MEDIUM | P2 |
| Guard blocking visualisation | MEDIUM | LOW | P2 |
| Opponent torso/head silhouette | MEDIUM | MEDIUM | P2 |
| Arm color personalization | LOW | LOW | P3 |
| Calibration shortening | LOW | LOW | P3 |
| FPS boxing spectator overlay | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Key Technical Decisions Embedded in Feature Design

### Webcam-to-Punch Mapping

The existing `hit_detection.rs` already implements the correct pipeline:
1. Collect a rolling window of `PoseFrame` values (VecDeque, 3+ frames required)
2. Compute peak wrist speed over consecutive frame pairs: `speed = |delta_pos| / delta_t`
3. Compare against calibration-scaled threshold: `threshold = ref_vel * (2.5 / 3.0)`
4. Guard-raise veto: if both wrists move primarily upward (Y velocity dominates), suppress hit
5. Classify which body region the wrist is at relative to defender's body scale

The FPS client sends `pose_frame` messages via the existing WebSocket protocol. The server does all velocity math. The client does not need to do its own punch detection — that is the server's job per the authoritative design.

The client does, however, need to compute wrist position locally to drive the arm mesh in real-time. This is pure rendering — the wrist landmark x/y from `PoseLandmarker` maps to camera-space arm position without any server round-trip.

### Arms-Style First-Person View

The Arms aesthetic requires four pieces:

1. **Player arms**: Two forearm+fist meshes positioned at the bottom of the viewport, rendered in a fixed camera layer (orthographic or same perspective camera but never affected by scene rotation). Left arm tracks left wrist landmark (index 15); right arm tracks right wrist landmark (index 16).

2. **Opponent arms**: Two meshes positioned in the far distance of the 3D scene, driven by server-broadcast opponent wrist positions from `MsgGameState.poses`. The opponent's wrist world-landmark coordinates map to 3D scene position. Lerp toward target each frame over ~33ms to smooth tick jitter.

3. **Stretch mechanic**: When a punch is detected (local wrist velocity spike, not waiting for server confirmation), animate the arm mesh extending forward along the forward Z axis with a spring overshoot. Duration ~150ms extend, ~200ms retract. Retract immediately if server does not confirm a hit within the cooldown window.

4. **Depth separation**: Player arms must never clip into scene geometry. Render them last with `depthTest: false` on the arm meshes, or render in a second `THREE.Scene` pass after the main scene. This is the standard technique for first-person weapon rendering in Three.js.

### Real-Time Opponent Sync

The existing `MsgGameState` is broadcast at 60Hz by the engine. It already carries `poses: [PoseKeypoint[], PoseKeypoint[]]`. The FPS client reads opponent wrist positions (`poses[opponentIdx][15]` and `poses[opponentIdx][16]`) and uses them to position the opponent arm meshes each frame.

Interpolation between server ticks is recommended (lerp current mesh position toward target over ~33ms). This smooths jitter from WebSocket delivery without adding perceptible lag. No new server messages are needed for MVP.

### Hit Feedback Loop

The authoritative loop:
1. Local MediaPipe detects wrist motion → sends `pose_frame` → server (via existing `MsgPoseFrame` protocol)
2. Server `FPSBoxingPlugin.on_tick()` runs hit detection → emits `GameEvent::Hit` + `GameEvent::SendToPlayer` (`you_were_hit`)
3. Defender receives `you_were_hit` → triggers: screen shake (380ms translate-only), HP bar drain (100ms linear), incoming hit flash (50ms hard-cut, 220ms decay) — all per DESIGN.md motion spec
4. `MsgGameState` broadcast on next tick carries updated HP → all clients update HP bars

For the attacker: the `MsgGameState.recent_hits` field (already in protocol as `HitEvent[]`) carries position and damage. The attacker's client uses this to trigger the arm snap-back animation.

---

## Competitor Feature Analysis

| Feature | Wii Sports Boxing | Nintendo Arms | Our Approach |
|---------|------------------|---------------|--------------|
| Input mapping | Wii Remote accelerometer — punch | Joy-Con motion — arm extension direction | Webcam wrist velocity (MediaPipe Pose) — server hit detection |
| Perspective | Third-person avatar | 3/4 overhead, fixed character | First-person — your arms on screen |
| Opponent | Mii avatar, full body | Full character, extendable arms | Opponent arms driven from server pose stream |
| Hit feedback | Controller rumble + avatar flinch | Arm bounce, screen shake | Screen shake + HP drain + arm snap-back |
| Guard | No guard | Guard with timing window | Existing wrist-raise guard (already in hit_detection.rs) |
| Art style | Mii/cartoon | Vibrant cartoon, bold outlines | Cartoon, bold accent colors per DESIGN.md |

---

## Sources

- Existing codebase (read directly, HIGH confidence): `engine/boxing-plugin/src/hit_detection.rs`, `engine/boxing-plugin/src/lib.rs`, `engine/plugin-trait/src/lib.rs`, `mobile/src/hooks/usePose.ts`, `shared/protocol.ts`, `DESIGN.md`, `.planning/PROJECT.md`
- [MediaPipe Hand Landmarker — coordinate system, Z depth](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) — HIGH confidence
- [MediaPipe Tasks Vision NPM package](https://www.npmjs.com/package/@mediapipe/tasks-vision) — browser performance, Web Worker compatibility — MEDIUM confidence
- [MediaPipe Pose Landmarker for Web](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/web_js) — MEDIUM confidence
- PoseLandmarker browser performance: 15-30fps typical on laptop CPU with 720p input; GPU delegation improves to 8ms per frame — MEDIUM confidence (community sources validated against known mobile usage in this project)
- [THREE.IK — inverse kinematics for three.js](https://github.com/jsantell/THREE.IK) and [CCDIKSolver Three.js docs](https://threejs.org/docs/#examples/en/animations/CCDIKSolver) — IK approaches available but judged unnecessary for MVP given direct landmark-to-mesh-position mapping is sufficient — HIGH confidence
- Nintendo Arms (Wikipedia, game reviews): over-the-shoulder + extendable arms + motion controls — MEDIUM confidence

---

*Feature research for: v2.0 First-Person Boxing (FPS Boxing mode)*
*Researched: 2026-05-12*
