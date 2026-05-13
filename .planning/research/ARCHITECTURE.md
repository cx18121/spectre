# Architecture Research

**Domain:** First-person boxing game integration into existing PoseEngine plugin architecture
**Researched:** 2026-05-12
**Confidence:** HIGH — based on direct inspection of all relevant source files (protocol.rs, plugin-trait/src/lib.rs, engine-core/src/main.rs, room.rs, game_loop.rs, broadcast.rs, shared/protocol.ts, GAME-SDK.md)

## Integration Overview

v2.0 adds one Rust plugin crate (`fps-boxing-plugin`) and one new TypeScript client application (`fps/`). No engine-core changes are required. The existing wire protocol is extended with two new message types. The mobile client (Controller) is NOT replaced — it continues to serve the existing boxing and dance games. The FPS client is a third client type for a third game mode.

## System Overview

### v1.0 Client Topology (unchanged)

```
Phone (mobile/)          Server (engine-core)       Screen (overlay/)
  Controller ──WS──────► /ws/player/{code} ─────► /ws/spectator/{code}
  MediaPipe poses         Room actor                 Pixi.js renderer
  player_slot=1 or 2      60Hz game loop             spectator only
```

### v2.0 Added Topology

```
Laptop Browser (fps/)    Server (engine-core)
  FPS Client  ──WS──────► /ws/player/{code}
  MediaPipe poses         FPSBoxingPlugin
  player_slot=1 or 2      (new plugin, no engine change)
  Three.js renderer       broadcasts fps_state to both players
  Renders own + opponent
```

The FPS client connects to the same `/ws/player/{code}` WebSocket endpoint that the mobile Controller uses. It sends `pose_frame` and `calibration_done` messages using the existing wire format. It receives the existing set of lifecycle messages plus two new plugin-emitted messages (`fps_state` and `fps_hit`).

### Full v2.0 System

```
┌─────────────────────────────────────────────────────────────────┐
│                        Axum HTTP Layer                          │
│  POST /rooms?game=fps_boxing  GET /rooms/{code}                 │
│  /ws/player/{code}  /ws/spectator/{code}  ServeDir /fps         │
└───────────────┬──────────────────────────┬──────────────────────┘
                │                          │
     ┌──────────▼──────────┐    ┌──────────▼──────────┐
     │  FPS Client WS Task │    │  FPS Client WS Task │
     │  (slot 0, P1)       │    │  (slot 1, P2)       │
     │  sends: pose_frame  │    │  sends: pose_frame  │
     │         calib_done  │    │         calib_done  │
     │  recvs: fps_state   │    │  recvs: fps_state   │
     │         fps_hit     │    │         fps_hit     │
     │         you_were_hit│    │         you_were_hit│
     └──────────┬──────────┘    └──────────┬──────────┘
                │ mpsc RoomCmd              │
                └──────────────┬───────────┘
                               ▼
         ┌─────────────────────────────────────────────┐
         │  Room Actor (unchanged engine-core code)    │
         │  owns RoomState, drives 60Hz tick           │
         │  dispatches GameEvent::SendToPlayer /       │
         │    Broadcast from FPSBoxingPlugin           │
         └───────────────────────┬─────────────────────┘
                                 │ calls on_tick()
                                 ▼
         ┌─────────────────────────────────────────────┐
         │  FPSBoxingPlugin (new crate: fps-boxing-    │
         │  plugin)                                    │
         │  implements GamePlugin trait                │
         │  hit detection: same wrist-velocity algo    │
         │  emits fps_state (both arm poses) via       │
         │    GameEvent::SendToPlayer to each slot     │
         │  emits fps_hit via GameEvent::SendToPlayer  │
         │    to defender slot                         │
         └─────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Status | Files |
|-----------|---------------|--------|-------|
| `fps-boxing-plugin` Rust crate | Hit detection, HP, round lifecycle for FPS mode | New | `engine/fps-boxing-plugin/src/lib.rs` (+ submodules) |
| `fps/` TypeScript app | Webcam capture, MediaPipe detection, Three.js render, WS client | New | `fps/src/` |
| `engine-core` main.rs | Plugin registry — add `fps_boxing` entry | Minimal edit | `engine/engine-core/src/main.rs` |
| `shared/protocol.ts` | Wire type definitions — add `MsgFpsState`, `MsgFpsHit` | Additive edit | `shared/protocol.ts` |
| `engine/engine-core/src/protocol.rs` | Rust serde mirror of protocol — add matching structs | Additive edit | `engine/engine-core/src/protocol.rs` |
| Mobile Controller (`mobile/`) | Existing phone-based pose streaming for boxing/dance | Unchanged | `mobile/` |
| Overlay Arena (`overlay/`) | Existing spectator view | Unchanged | `overlay/` |

## New Plugin: FPSBoxingPlugin

### Reused vs New Protocol Messages

The FPS boxing plugin reuses all existing lifecycle messages without modification:

| Message | Direction | Reused As-Is |
|---------|-----------|-------------|
| `MsgJoin` | Client → Server | Yes — `game_type` in `MsgJoined` response will be `"fps_boxing"` |
| `MsgPoseFrame` | Client → Server | Yes — same 33 MediaPipe keypoints |
| `MsgCalibrationDone` | Client → Server | Yes — same `reference_velocity` field |
| `MsgJoined` | Server → Client | Yes — `game_type: "fps_boxing"` routes FPS client to FPS UI |
| `MsgCalibrationStart` | Server → Client | Yes — triggers FPS client calibration UI |
| `MsgMatchStart` | Server → Client | Yes |
| `MsgRoundStart` | Server → Client | Yes |
| `MsgRoundEnd` | Server → Client | Yes |
| `MsgMatchEnd` | Server → Client | Yes |
| `MsgYouWereHit` | Server → Client | Yes — drives haptic/flash effect in FPS UI |
| `MsgGameState` | Server → broadcast | Sent but FPS client likely ignores `poses` field |
| `MsgPing` / `MsgPong` | Both | Yes |

Two new messages are added. These are emitted by `FPSBoxingPlugin` via `GameEvent::SendToPlayer` or `GameEvent::Broadcast` — the engine-core room actor dispatches them without knowing their schema.

#### `MsgFpsState` (Server → each Player individually)

Delivers both players' current arm poses to each FPS client so it can render the opponent's arms. Sent every tick via `GameEvent::SendToPlayer` to each player.

```typescript
// shared/protocol.ts addition
export interface MsgFpsState {
  type: "fps_state";
  tick: number;
  // Opponent's keypoints from the server's perspective:
  // if you are P1, opponent_keypoints = P2's pose; if P2, = P1's pose.
  // Sending only opponent pose reduces bandwidth vs. sending both.
  opponent_keypoints: PoseKeypoint[];
  hp: [number, number];
  remaining_time: number;
}
```

Rationale for per-player delivery (not broadcast): each player needs their _opponent's_ arms, not a generic "P1 pose / P2 pose" pair. The plugin can build the correct per-player view inside `on_tick`. Using `GameEvent::SendToPlayer` per slot is the established pattern (DancePlugin uses `GameEvent::Broadcast` for score; boxing uses `GameEvent::SendToPlayer` for `you_were_hit`).

#### `MsgFpsHit` (Server → defender Player)

Sent to the hit player with spatial data for the FPS impact visual (screen flash direction, damage number position).

```typescript
export interface MsgFpsHit {
  type: "fps_hit";
  region: string;       // same BodyRegion strings as existing HitEvent
  damage: number;
  // Normalized 2D position of impact in screen-space [-1,1]
  // so Three.js renderer can place the hit flash without 3D math
  screen_x: number;
  screen_y: number;
}
```

### FPSBoxingPlugin State

```rust
pub struct FpsBoxingState {
    pub hp: [u32; 2],
    pub ref_vel: [f64; 2],       // from on_calibration_complete
    pub last_hit_tick: [i64; 2],
    pub round_ended: bool,
}
```

The plugin implements `GamePlugin::requires_calibration() -> bool { true }` — same calibration flow as boxing. It calls the existing wrist-velocity hit detection algorithm (identical to BoxingPlugin logic — extract to a shared utility or duplicate for now, refactor later).

### Registration in engine-core

```rust
// engine/engine-core/src/main.rs — minimal addition
use fps_boxing_plugin::{FpsBoxingPlugin, FpsBoxingConfig};

plugins.insert("fps_boxing".to_string(), Arc::new(FpsBoxingPlugin::new(FpsBoxingConfig {
    hp: 800,
    round_secs: 90.0,
    max_wins: 3,
})));
```

The lobby HTML gains a third game tile: `selectGame('fps_boxing')`. The room page HTML already handles any `game_type` string generically.

## New Client: fps/ TypeScript App

### Client Type Classification

The FPS client is a **third client type**, not a replacement for the mobile Controller. The three client types are:

| Client | Device | Role | Connects As |
|--------|--------|------|-------------|
| `mobile/` Controller | Phone | Streams poses, no render | Player (slot 1 or 2) |
| `overlay/` Arena | Screen/TV | Renders match, no input | Spectator |
| `fps/` FPS Client | Laptop | Streams poses AND renders 3D view | Player (slot 1 or 2) |

For `fps_boxing` rooms, both fighters use the FPS client on their laptop. There is no phone required and no separate spectator overlay — the FPS client is both controller and screen simultaneously.

The room page for `fps_boxing` rooms should show two FPS client QR/link cards (P1, P2), not a phone QR card or overlay QR card. This requires a small change to `room_page_html` to detect `game_type == "fps_boxing"` and render different card labels/URLs.

### FPS Client Architecture

```
fps/src/
├── main.ts               # Entry point: reads URL params, wires up modules
├── ws.ts                 # WebSocket client: same protocol as mobile/
│                         # sends MsgJoin, MsgPoseFrame, MsgCalibrationDone
│                         # receives MsgJoined → routes by game_type
├── mediapipe.ts          # Webcam access + MediaPipe Pose initialization
│                         # Runs inference in Web Worker via MediaPipe Tasks API
│                         # Emits 33 keypoints per frame at camera rate (~30Hz)
├── renderer.ts           # Three.js scene setup + animation loop
│                         # owns scene, camera, renderer, arm meshes
├── arms.ts               # 3D arm model: stylized/cartoonish extendable arms
│                         # Two mesh groups: localArms (player's own) + remoteArms (opponent)
│                         # localArms driven by MediaPipe keypoints in real-time
│                         # remoteArms driven by opponent_keypoints from MsgFpsState
├── calibration-ui.ts     # Calibration screen: video preview + 3-punch prompt
│                         # Computes reference_velocity from wrist landmark velocities
│                         # Sends MsgCalibrationDone when done
├── hud.ts                # HP bars, round timer, round/match result overlays
│                         # Reads hp[] and remaining_time from MsgFpsState
├── hit-flash.ts          # Screen-space hit flash effect when MsgFpsHit received
└── lobby-ui.ts           # Pre-match lobby: shows waiting for opponent, calibration
```

### MediaPipe in FPS Client vs Mobile Controller

| Aspect | Mobile Controller (mobile/) | FPS Client (fps/) |
|--------|----------------------------|-------------------|
| Device | Phone camera, portrait | Laptop webcam, landscape |
| MediaPipe model | Pose Landmarker (33 keypoints) | Same — Pose Landmarker |
| Inference location | Main thread via WASM | Web Worker via MediaPipe Tasks WASM |
| Output | Sends raw keypoints over WS | Same: sends raw `pose_frame` over WS; ALSO uses keypoints locally to drive arm meshes |
| Calibration | Wrist velocity measurement in client | Same algorithm |
| Game type routing | Checks `MsgJoined.game_type`; shows boxing/dance UI | Same: routes to FPS Three.js view |

The critical difference is that the FPS client _consumes_ its own pose data locally in addition to streaming it to the server. The MediaPipe output feeds both the WS send path (for server-side hit detection) and the Three.js animation loop (for the player's own arms). The server returns the opponent's keypoints via `MsgFpsState`, which drives the opponent arm mesh.

**MediaPipe Tasks API vs legacy MediaPipe JS:** The FPS client should use `@mediapipe/tasks-vision` (the current Tasks API) rather than the legacy `@mediapipe/pose` package. The Tasks API runs in a Web Worker with SharedArrayBuffer, reducing main-thread jitter. The mobile client uses the legacy package — this divergence is acceptable since they are separate codebases.

### Opponent State Sync: Data Flow

```
FPS Client P1 (laptop)          Server                  FPS Client P2 (laptop)
    │                              │                              │
    ├─pose_frame──────────────────►│                              │
    │                              │◄─────────────────pose_frame──┤
    │                              │                              │
    │   [60Hz tick: on_tick()]     │                              │
    │                              │   builds MsgFpsState for P1: │
    │                              │   opponent_keypoints = P2's  │
    │◄──fps_state (P2's keypoints)─┤                              │
    │                              ├──fps_state (P1's keypoints)─►│
    │                              │                              │
    ├─[local MediaPipe kps]        │                [local kps]───┤
    │   drives P1's own arm mesh   │           drives P2's arm mesh
    │◄──[opponent_keypoints]       │     [opponent_keypoints]────►│
    │   drives opponent arm mesh   │        drives opponent mesh  │
```

The server runs at 60Hz. The local arm animation runs at camera rate (~30Hz) for the player's own arms, giving maximum local responsiveness. The opponent's arms are updated at 60Hz from `MsgFpsState`.

### Three.js Rendering Strategy

The Three.js scene contains:
- **localArms**: Two arm meshes in the lower screen corners, animated from local MediaPipe keypoints without server round-trip. This is the "first-person hands" aesthetic.
- **remoteArms**: Opponent arm meshes rendered in the center/upper field, animated from `opponent_keypoints` in each `MsgFpsState`.
- **HUD layer**: HP bars, timer — HTML overlay on top of Three.js canvas (not Three.js geometry).

Arms aesthetic (colorful, cartoonish, extendable): use Three.js `CylinderGeometry` segments scaled along the forearm/upper-arm bone vectors derived from wrist, elbow, shoulder keypoints. Apply a flat-shaded cartoon material with a bold player color (P1 warm red, P2 electric blue).

No physics engine needed. Arm deformation is purely geometric (bone vector to scale/rotate cylinder segments). This is achievable in ~200 lines of Three.js without a full IK solver.

## Wire Protocol Impact Assessment

### Additive-Only Changes

The existing wire protocol is **backward compatible**. Existing clients (mobile Controller, overlay Arena) continue to work with zero changes:

1. `MsgFpsState` and `MsgFpsHit` are sent via `GameEvent::SendToPlayer` — they go only to connected player slots in `fps_boxing` rooms. Mobile/overlay clients in `boxing` or `dance` rooms never receive these messages.

2. The existing `MsgGameState` broadcast continues to be sent from the room actor regardless of game type. FPS clients can use it for HP display or ignore it — their `MsgFpsState` message carries the same `hp` and `remaining_time` fields.

3. `protocol.rs` gains two new structs with `#[derive(Serialize, Deserialize, TS)]`. Running `cargo test` regenerates `shared/protocol.ts` with the two new exported interfaces appended to the file.

4. `InboundServerMsg` union type in `shared/protocol.ts` gains `MsgFpsState | MsgFpsHit`.

### No Breaking Changes

- `MsgJoined.game_type` already accepts arbitrary strings (defaulting to `"unknown"`) — `"fps_boxing"` requires no schema change.
- `MsgGameState.poses` field is already `[PoseKeypoint[], PoseKeypoint[]]` and continues to be sent — FPS clients can render a 2D silhouette or ignore it.
- All existing mobile/overlay clients remain byte-for-byte compatible.

## Recommended Build Order

Build server-first, then client. The FPS client cannot be integrated-tested without a working server plugin.

```
Phase A: FPSBoxingPlugin Rust crate
    - New crate: engine/fps-boxing-plugin/
    - Implements GamePlugin trait (same interface as BoxingPlugin)
    - Adds MsgFpsState + MsgFpsHit to protocol.rs
    - Registers "fps_boxing" in main.rs plugins HashMap
    - Updates shared/protocol.ts (cargo test regenerates)
    - No client code, verifiable with existing engine integration test pattern

Phase B: Lobby + Room Page updates
    - Adds "FPS BOXING" tile to lobby HTML
    - room_page_html detects game_type == "fps_boxing": shows P1/P2 laptop links
      (no overlay QR card for fps_boxing rooms)
    - Smoke-testable in browser before fps/ app exists

Phase C: FPS Client scaffold + WebSocket connection
    - fps/ Vite app: WS connection, MsgJoin, MsgJoined routing
    - Displays connection state, game_type confirmation, stub "connected" screen
    - No MediaPipe, no Three.js yet — tests the server plugin end-to-end

Phase D: MediaPipe webcam + calibration
    - Webcam access, MediaPipe Pose inference in Web Worker
    - Calibration UI: video preview, wrist velocity computation, MsgCalibrationDone
    - Pose streaming to server (MsgPoseFrame)
    - Verifiable: server completes calibration handshake, sends MsgMatchStart

Phase E: Three.js renderer + arm animation
    - Scene setup, local arm meshes driven by local MediaPipe keypoints
    - Opponent arm meshes driven by MsgFpsState.opponent_keypoints
    - HUD: HP bars, timer from MsgFpsState
    - Hit flash from MsgFpsHit

Phase F: Polish + lobby integration
    - Arm aesthetic refinement (cartoon shading, colors)
    - Round/match result overlays
    - Lobby tile final styling
    - End-to-end two-player test
```

## Component Boundaries: New vs Modified Files

### New Files

```
engine/fps-boxing-plugin/
├── Cargo.toml                      # new crate, depends on plugin-trait
└── src/
    ├── lib.rs                      # FpsBoxingPlugin, FpsBoxingConfig, FpsBoxingState
    └── hit_detection.rs            # wrist velocity detection (can share logic with boxing)

fps/
├── index.html
├── vite.config.ts
├── package.json
└── src/
    ├── main.ts
    ├── ws.ts
    ├── mediapipe.ts
    ├── renderer.ts
    ├── arms.ts
    ├── calibration-ui.ts
    ├── hud.ts
    ├── hit-flash.ts
    └── lobby-ui.ts
```

### Modified Files

```
engine/engine-core/src/main.rs
    - Add: use fps_boxing_plugin::{FpsBoxingPlugin, FpsBoxingConfig};
    - Add: plugins.insert("fps_boxing", Arc::new(FpsBoxingPlugin::new(...)));
    - Add: lobby HTML "FPS BOXING" tile
    - Add: room_page_html fps_boxing branch (no overlay card)

engine/engine-core/src/protocol.rs
    - Add: MsgFpsState struct
    - Add: MsgFpsHit struct
    - Add: InboundMobileMsg variants if needed (none anticipated)

engine/Cargo.toml (workspace)
    - Add: fps-boxing-plugin to workspace members

shared/protocol.ts
    - Add: MsgFpsState interface
    - Add: MsgFpsHit interface
    - Add: MsgFpsState | MsgFpsHit to InboundServerMsg union
    (auto-regenerated by cargo test from protocol.rs ts_rs exports)
```

### Unchanged Files

```
engine/engine-core/src/room.rs          — no changes needed
engine/engine-core/src/game_loop.rs     — no changes needed
engine/engine-core/src/broadcast.rs     — no changes needed
engine/engine-core/src/room_manager.rs  — no changes needed
engine/boxing-plugin/                   — no changes needed
engine/dance-plugin/                    — no changes needed
engine/plugin-trait/src/lib.rs          — no changes needed
mobile/                                 — no changes needed
overlay/                                — no changes needed
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sending both players' full keypoints in MsgFpsState

**What:** Broadcasting a `{p1_keypoints, p2_keypoints}` object to all players.

**Why wrong:** Each player already has their own keypoints locally from MediaPipe — no need to receive them back from the server. Sending both doubles the bandwidth with no benefit.

**Instead:** Build two `MsgFpsState` messages in `on_tick` — one per player — each containing only `opponent_keypoints`. Use `GameEvent::SendToPlayer` for each.

### Anti-Pattern 2: Running MediaPipe on the main thread in the FPS client

**What:** Using the legacy `@mediapipe/pose` package synchronously in the render loop.

**Why wrong:** MediaPipe WASM inference blocks the JS main thread for 10–30ms per frame, causing Three.js frame drops. Arm animation stutters at the exact moment pose data arrives.

**Instead:** Use `@mediapipe/tasks-vision` Pose Landmarker in a Web Worker with `delegateToGPU: true`. Post keypoints to the main thread via `postMessage`. The Three.js animation loop runs unimpeded; it renders with the most recently posted keypoints.

### Anti-Pattern 3: Replacing the mobile Controller for fps_boxing

**What:** Removing the mobile client path for fps_boxing rooms.

**Why wrong:** The engine-core room actor does not distinguish client types — it only sees slots. If a player connects via mobile to an fps_boxing room, the server's hit detection still works (poses are poses). Forcing a single client type is premature.

**Instead:** Let the `game_type` field in `MsgJoined` drive which UI the client shows. The server does not enforce client type. Both mobile and laptop clients can connect to fps_boxing rooms; the laptop FPS client simply renders in 3D.

### Anti-Pattern 4: Putting opponent rendering state in the server's MsgGameState broadcast

**What:** Using the existing `MsgGameState.poses` field to drive Three.js arm animation by having the FPS client subscribe as a spectator instead of a player.

**Why wrong:** The spectator channel does not receive `you_were_hit` or other player-specific messages. The FPS client needs both player-specific messages (haptics, hit flash) and opponent pose data. It must connect as a player.

**Instead:** Connect as player. The plugin emits `fps_state` per-player via `SendToPlayer`. The existing `MsgGameState` broadcast can be ignored by FPS clients or used as a fallback for HP display.

### Anti-Pattern 5: IK-based full-body 3D character for the opponent

**What:** Rendering a full-body rigged character for the opponent using a full IK solver (Three.js + IKSolver or a rig library).

**Why wrong:** FPS boxing is arms-only. Full-body IK from 33 MediaPipe landmarks in a browser is complex to implement correctly and expensive at runtime. MediaPipe's 3D depth (`z`) is low-confidence from a single camera.

**Instead:** Use the arms-only approach. Map {wrist, elbow, shoulder} landmarks to 2D/3D arm bone vectors. Scale/rotate `CylinderGeometry` segments. This is deterministic, lightweight, and stylistically appropriate for the cartoonish aesthetic.

## Scaling Considerations

| Scale | Architecture Adjustment |
|-------|------------------------|
| 2 FPS players + ~0 spectators | Current single-process Tokio is fine; `fps_boxing` rooms produce slightly more traffic (fps_state sent to each player, not just game_state broadcast) but well within budget |
| 50+ concurrent fps_boxing rooms | Monitor `fps_state` per-player send rate — at 60Hz per player per room, this is 2 × 60 = 120 sends/room/sec; fine for hundreds of rooms on a single Railway dyno |
| 1000+ rooms | Horizontal scaling would be needed; out of scope per PROJECT.md |

The `fps_state` per-player traffic is marginally higher than the existing boxing broadcast (two targeted sends vs. one broadcast) but negligible for the intended scale.

## Sources

- Direct source reading: `engine/plugin-trait/src/lib.rs` — GamePlugin trait, GameEvent enum
- Direct source reading: `engine/engine-core/src/main.rs` — plugin registry pattern, AppState, room_page_html
- Direct source reading: `engine/engine-core/src/protocol.rs` — all wire message structs, ts_rs export pattern
- Direct source reading: `engine/engine-core/src/room.rs` — RoomState, PlayerSlot, broadcast channels
- Direct source reading: `engine/engine-core/src/game_loop.rs` — normalize_to_y_up, tick structure
- Direct source reading: `engine/engine-core/src/broadcast.rs` — forward_broadcast_to_spectator, send_snapshot
- Direct source reading: `shared/protocol.ts` — canonical wire format, existing message union types
- Direct source reading: `docs/GAME-SDK.md` — GamePlugin contract, GameEvent variants, TickContext
- MediaPipe Tasks API: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js (Web Worker pattern, `delegateToGPU`)
- Three.js docs: https://threejs.org/docs/#api/en/geometries/CylinderGeometry

---
*Architecture research for: FPS Boxing integration into PoseEngine v2.0*
*Researched: 2026-05-12*
