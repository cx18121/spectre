# Phase 3: Second Game + SDK - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 9
**Analogs found:** 8 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `engine/dance-plugin/Cargo.toml` | config | — | `engine/boxing-plugin/Cargo.toml` | exact |
| `engine/dance-plugin/src/lib.rs` | service/plugin | event-driven | `engine/boxing-plugin/src/lib.rs` | exact |
| `engine/dance-plugin/src/poses.rs` | utility | — | `engine/boxing-plugin/src/bot.rs` (BOT_KPS) | role-match |
| `engine/Cargo.toml` | config | — | `engine/Cargo.toml` (self, members edit) | self-edit |
| `engine/engine-core/Cargo.toml` | config | — | `engine/engine-core/Cargo.toml` (self, dep edit) | self-edit |
| `engine/engine-core/src/main.rs` | controller | request-response | `engine/engine-core/src/main.rs` (self, registry + routes) | self-edit |
| `engine/plugin-trait/src/lib.rs` | model/interface | — | `engine/plugin-trait/src/lib.rs` (self, doc refresh) | self-edit |
| `docs/GAME-SDK.md` | docs | — | (no analog — new documentation file) | none |
| `README.md` | docs | — | `README.md` (self, teaser addition) | self-edit |

---

## Pattern Assignments

### `engine/dance-plugin/Cargo.toml` (config)

**Analog:** `engine/boxing-plugin/Cargo.toml`

**Full pattern** (lines 1–14 of analog):
```toml
[package]
name = "boxing-plugin"
version = "0.1.0"
edition = "2021"

[lib]
name = "boxing_plugin"
path = "src/lib.rs"

[dependencies]
plugin-trait = { path = "../plugin-trait" }
serde_json = "1.0.149"
rand = "0.8.6"
tracing = "0.1.44"
```

**Dance-plugin adaptation:** Omit `rand` (no bot) and `tracing` (no join/leave logging needed). Result:
```toml
[package]
name = "dance-plugin"
version = "0.1.0"
edition = "2021"

[lib]
name = "dance_plugin"
path = "src/lib.rs"

[dependencies]
plugin-trait = { path = "../plugin-trait" }
serde_json = "1.0.149"
```

---

### `engine/dance-plugin/src/lib.rs` (service/plugin, event-driven)

**Analog:** `engine/boxing-plugin/src/lib.rs`

**Imports pattern** (analog lines 1–16):
```rust
//! Boxing game plugin — implements the GamePlugin trait for the boxing game.
//! This crate is the only place that contains boxing domain knowledge.
//! engine-core depends on this only at the BoxingPlugin::new construction site in main.rs.

use std::any::Any;
use plugin_trait::{GamePlugin, GameEvent, TickContext, BodyRegion};
use serde_json::json;

mod hit_detection;
mod damage;
mod bot;
```

**Dance-plugin adaptation:**
```rust
use std::any::Any;
use plugin_trait::{GamePlugin, GameEvent, TickContext, PoseFrame, PoseKeypoint};
use serde_json::json;

mod poses;
```

**Config + State struct pattern** (analog lines 26–56):
```rust
pub struct BoxingConfig {
    pub hp: u32,
    pub round_secs: f64,
    pub max_wins: u32,
    pub bot_difficulty: Difficulty,
}

pub struct BoxingState {
    pub hp: [u32; 2],
    pub ref_vel: [f64; 2],
    pub last_hit_tick: [i64; 2],
    pub combo: [(f64, u32); 2],
    pub low_hp_announced: [bool; 2],
    pub first_blood_pending: bool,
    pub bot_next_hit_at: f64,
}
```

**Dance-plugin adaptation** — all fields owned, no references (required for `Box<dyn Any + Send>`):
```rust
pub struct DanceConfig {
    pub max_wins: u32,
}

pub struct DanceState {
    pub scores: [f64; 2],
    pub target_index: usize,
    pub round_start_tick: u64,
    pub round_started: bool,   // Pitfall 1: lock tick on first on_tick, not in init_state
    pub beats_scored: u64,
    pub round_ended: bool,     // Pitfall 3: guard against RoundOver every tick after beat 16
}
```

**Plugin struct + constructor pattern** (analog lines 62–70):
```rust
pub struct BoxingPlugin {
    config: BoxingConfig,
}

impl BoxingPlugin {
    pub fn new(config: BoxingConfig) -> Self {
        Self { config }
    }
}
```

**`init_state` pattern** (analog lines 77–87):
```rust
fn init_state(&self) -> Box<dyn Any + Send> {
    Box::new(BoxingState {
        hp: [self.config.hp; 2],
        ref_vel: [0.0; 2],
        last_hit_tick: [-999; 2],
        combo: [(0.0, 0); 2],
        low_hp_announced: [false; 2],
        first_blood_pending: true,
        bot_next_hit_at: 0.0,
    })
}
```

**Downcast pattern used throughout `on_tick`, `on_round_reset`, `on_calibration_complete`** (analog line 90–91):
```rust
let s = state.downcast_mut::<BoxingState>()
    .expect("boxing plugin: state type mismatch — expected BoxingState");
```

**`on_tick` structure** (analog lines 89–176): `downcast → guard (round_ended) → beat clock arithmetic → score → emit Broadcast events → check RoundOver`. Contrast with boxing's structure: `downcast → bot check → hit detection loop → round-over check`. Same skeleton, different body.

**`GameEvent::Broadcast` emission pattern** (analog lines 159–166 — using SendToPlayer; Broadcast has same `payload: json!({...})` syntax):
```rust
events.push(GameEvent::SendToPlayer {
    slot: (defender_idx + 1) as u8,
    payload: json!({
        "type": "you_were_hit",
        "region": h.region.to_wire(),
        "damage": dmg,
    }),
});
```

**Dance adaptation for Broadcast:**
```rust
events.push(GameEvent::Broadcast {
    payload: json!({
        "type": "dance_beat",
        "beat": s.beats_scored,
        "total_beats": TOTAL_BEATS,
        "target_pose": target.keypoints.iter()
            .map(|kp| [kp.x, kp.y, kp.z, kp.visibility])
            .collect::<Vec<_>>(),
    }),
});
```

**`on_round_reset` pattern** (analog lines 185–197):
```rust
fn on_round_reset(&self, state: &mut dyn Any) {
    let s = state.downcast_mut::<BoxingState>()
        .expect("boxing plugin: state type mismatch");
    // FIX-01: clear ONLY round-scoped state. DO NOT touch ref_vel.
    s.hp = [self.config.hp; 2];
    s.last_hit_tick = [-999; 2];
    s.combo = [(0.0, 0); 2];
    s.low_hp_announced = [false; 2];
    s.first_blood_pending = true;
    // bot_next_hit_at is intentionally NOT reset
}
```

**`max_wins` pattern** (analog lines 199–201):
```rust
fn max_wins(&self) -> u32 {
    self.config.max_wins
}
```

**Unit test structure** (analog lines 288–445): test module uses `use super::*; use plugin_trait::{TickContext, TickInfo, RoomView, SlotView}`. Helper `empty_tick_ctx()` returns two `VecDeque<PoseFrame>`. Dance tests should cover: beat fires at tick 60, RoundOver after beat 16, `round_ended` guard prevents double-RoundOver, `on_round_reset` clears scores/beats, `scores` not cleared in `on_calibration_complete`.

---

### `engine/dance-plugin/src/poses.rs` (utility)

**Analog:** `engine/boxing-plugin/src/bot.rs` lines 44–79 — `BOT_KPS` array pattern

**Array declaration pattern** (analog lines 44–79):
```rust
pub const BOT_KPS: [PoseKeypoint; 33] = [
    PoseKeypoint { x: 0.50, y: 0.10, z: 0.0, visibility: 1.0 }, // 0  nose
    PoseKeypoint { x: 0.52, y: 0.08, z: 0.0, visibility: 1.0 }, // 1  left_eye_inner
    // ... 33 entries
];
```

**Critical coordinate system difference:** `BOT_KPS` uses raw MediaPipe Y-down coords (y: 0.10 = near top of frame). `poses.rs` MUST use hip-centred Y-up coords (engine normalizes player frames before plugin delivery). In Y-up: nose y ≈ +0.80, shoulders y ≈ +0.35, hips y ≈ 0.00, ankles y ≈ -0.90.

**Poses.rs pattern to copy:**
```rust
use plugin_trait::PoseKeypoint;

// Helper: construct a PoseKeypoint with z=0, visibility=1.0
const fn kp(x: f64, y: f64) -> PoseKeypoint {
    PoseKeypoint { x, y, z: 0.0, visibility: 1.0 }
}

pub struct TargetPose {
    pub name: &'static str,
    pub keypoints: [PoseKeypoint; 33],
}

pub const ARMS_UP: TargetPose = TargetPose {
    name: "ARMS_UP",
    keypoints: [
        kp(0.50,  0.80),  // 0  nose
        // ... all 33 landmarks in Y-up coords
    ],
};

pub const POSE_LIBRARY: [&'static TargetPose; 6] = [
    &ARMS_UP, &ARMS_OUT, &SQUAT, &LEFT_LEAN, &RIGHT_LEAN, &STAR_JUMP,
];
```

---

### `engine/Cargo.toml` (config — members edit)

**Analog:** `engine/Cargo.toml` itself (lines 1–3):
```toml
[workspace]
members = ["engine-core", "plugin-trait", "boxing-plugin"]
resolver = "2"
```

**Change:** Add `"dance-plugin"` to members array:
```toml
members = ["engine-core", "plugin-trait", "boxing-plugin", "dance-plugin"]
```

---

### `engine/engine-core/Cargo.toml` (config — dep edit)

**Analog:** `engine/engine-core/Cargo.toml` lines 27–29:
```toml
plugin-trait = { path = "../plugin-trait" }
boxing-plugin = { path = "../boxing-plugin" }
```

**Change:** Add one line:
```toml
dance-plugin = { path = "../dance-plugin" }
```

---

### `engine/engine-core/src/main.rs` (controller, request-response — registry + routes)

**Analog:** `engine/engine-core/src/main.rs` itself

**Current imports pattern** (lines 1–12):
```rust
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};
use tower_http::services::ServeDir;
use std::sync::Arc;
use futures_util::{SinkExt, StreamExt};
use plugin_trait::GamePlugin;
use boxing_plugin::{BoxingPlugin, BoxingConfig};
use boxing_plugin::Difficulty;
```

**Phase 3 import additions:**
```rust
use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use dance_plugin::{DancePlugin, DanceConfig};
```

**Current AppState** (lines 21–24):
```rust
pub struct AppState {
    pub rooms: Arc<room_manager::RoomManager>,
    pub plugin: Arc<dyn GamePlugin + Send + Sync>,
}
```

**Phase 3 AppState replacement:**
```rust
pub struct AppState {
    pub rooms: Arc<room_manager::RoomManager>,
    pub plugins: HashMap<String, Arc<dyn GamePlugin + Send + Sync>>,
}
```

**Current main() plugin instantiation + AppState construction** (lines 27–39):
```rust
let boxing_config = BoxingConfig {
    hp: 800,
    round_secs: 90.0,
    max_wins: 3,
    bot_difficulty: Difficulty::Normal,
};
let plugin: Arc<dyn GamePlugin + Send + Sync> = Arc::new(BoxingPlugin::new(boxing_config));
let state = Arc::new(AppState {
    rooms: Arc::new(room_manager::RoomManager::new()),
    plugin: Arc::clone(&plugin),
});
```

**Phase 3 replacement — build HashMap before Arc wrap (Pitfall 2: cannot insert after Arc::new):**
```rust
let boxing_config = BoxingConfig { hp: 800, round_secs: 90.0, max_wins: 3, bot_difficulty: Difficulty::Normal };
let dance_config = DanceConfig { max_wins: 3 };
let mut plugins: HashMap<String, Arc<dyn GamePlugin + Send + Sync>> = HashMap::new();
plugins.insert("boxing".to_string(), Arc::new(BoxingPlugin::new(boxing_config)));
plugins.insert("dance".to_string(), Arc::new(DancePlugin::new(dance_config)));
let state = Arc::new(AppState {
    rooms: Arc::new(room_manager::RoomManager::new()),
    plugins,
});
```

**Current router** (lines 42–47):
```rust
let app = Router::new()
    .route("/ws/player/{room_code}", get(ws_player))
    .route("/ws/spectator/{room_code}", get(ws_spectator))
    .nest_service("/mobile", ServeDir::new("mobile/dist"))
    .nest_service("/overlay", ServeDir::new("overlay/dist"))
    .with_state(state);
```

**Phase 3 router additions:**
```rust
let app = Router::new()
    .route("/", get(lobby_html))
    .route("/rooms", post(create_room))
    .route("/ws/player/{room_code}", get(ws_player))
    .route("/ws/spectator/{room_code}", get(ws_spectator))
    .nest_service("/mobile", ServeDir::new("mobile/dist"))
    .nest_service("/overlay", ServeDir::new("overlay/dist"))
    .with_state(state);
```

**Current room-on-demand creation in handle_player** (lines 119–121) — references `app.plugin` which no longer exists:
```rust
let created_code = app.rooms.create_room(room_code.clone(), Arc::clone(&app.plugin));
```

**Phase 3 replacement (Option A: default to boxing for backward compat, or return error):**
```rust
// Option A recommended by CONTEXT.md D-07: return error if room doesn't exist
// Rooms must be pre-created via POST /rooms
tracing::warn!("handle_player: room {} not found; client must create via POST /rooms first", room_code);
return;
```

**New handler patterns to add — POST /rooms:**
```rust
#[derive(Deserialize)]
struct CreateRoomParams {
    game: Option<String>,
}

#[derive(Serialize)]
struct CreateRoomResponse {
    room_code: String,
}

async fn create_room(
    Query(params): Query<CreateRoomParams>,
    State(app): State<Arc<AppState>>,
) -> impl IntoResponse {
    let game = params.game.as_deref().unwrap_or("boxing");
    match app.plugins.get(game) {
        Some(plugin) => {
            // Pass empty string to create_room — it will generate a random 6-char code
            let code = app.rooms.create_room(String::new(), Arc::clone(plugin));
            (
                axum::http::StatusCode::CREATED,
                Json(CreateRoomResponse { room_code: code }),
            ).into_response()
        }
        None => (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": format!("unknown game: {}", game) })),
        ).into_response(),
    }
}
```

**New handler patterns to add — GET / lobby HTML:**
```rust
const LOBBY_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PoseEngine Lobby</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; }
    button { padding: 12px 24px; margin: 8px; font-size: 1rem; cursor: pointer; }
    #room-code { font-size: 2rem; font-weight: bold; letter-spacing: 0.2em; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Choose a Game</h1>
  <button onclick="createRoom('boxing')">Boxing</button>
  <button onclick="createRoom('dance')">Dance</button>
  <div id="room-code"></div>
  <script>
    async function createRoom(game) {
      const res = await fetch('/rooms?game=' + game, { method: 'POST' });
      const data = await res.json();
      document.getElementById('room-code').textContent = data.room_code ?? data.error;
    }
  </script>
</body>
</html>"#;

async fn lobby_html() -> impl IntoResponse {
    axum::response::Html(LOBBY_HTML)
}
```

---

### `engine/plugin-trait/src/lib.rs` (model/interface — Rustdoc refresh)

**Analog:** `engine/plugin-trait/src/lib.rs` itself

**Current doc comment style** (lines 153–181) — terse, partial:
```rust
/// The complete interface for a PoseEngine game.
///
/// Object safety rules satisfied (PLUG-05): ...
pub trait GamePlugin: Send + Sync {
    /// Create initial per-room plugin state. Called once per room creation.
    /// The returned box must be `'static + Send` — store only owned data.
    fn init_state(&self) -> Box<dyn Any + Send>;

    /// Called every 60Hz tick during the live round phase (after warmup).
    /// Returns a vec of side-effects; engine dispatches them after this returns.
    /// This is a pure function: inputs in, events out. No network calls, no async.
    fn on_tick(&self, ctx: &TickContext, state: &mut dyn Any) -> Vec<GameEvent>;
    // ...
    fn on_calibration_complete(&self, _slot: u8, _ref_vel: f64, _state: &mut dyn Any) {}
    // ...
    fn on_round_reset(&self, _state: &mut dyn Any) {}
}
```

**Phase 3 Rustdoc template (SDK-01)** — apply this template to every method:
```rust
/// [One-line summary: what this method does]
///
/// **Called when:** [engine lifecycle event]
///
/// **Contract:**
/// - [Constraint 1: e.g., must not block, must not call network]
/// - [Constraint 2: returned events dispatched after this returns]
///
/// **Return:** [what the return value means and when each variant is appropriate]
///
/// **Do NOT:** [anti-patterns — e.g., don't store references in state, don't panic]
fn on_tick(&self, ctx: &TickContext, state: &mut dyn Any) -> Vec<GameEvent>;
```

**All 7 methods needing expanded docs:** `init_state`, `on_tick`, `max_wins`, `on_player_join`, `on_player_leave`, `on_calibration_complete`, `on_round_reset`.

**All 8 types needing expanded docs:** `PoseKeypoint`, `PoseFrame`, `BodyRegion`, `GameEvent`, `TickInfo`, `SlotView`, `RoomView`, `TickContext`.

**No structural changes** — doc comment additions only. All existing `///` lines are preserved and expanded.

---

### `docs/GAME-SDK.md` (docs — new file)

**No analog in codebase.** Structure locked by CONTEXT.md D-11:

1. **Trait interface reference** — every method with: what it does, when called, what to return, what NOT to do. Source: `engine/plugin-trait/src/lib.rs` (all 7 methods + 8 types).
2. **Boxing plugin walkthrough** — method-by-method narrative through `engine/boxing-plugin/src/lib.rs` with line-range cross-references. Source: lines 77–213 of boxing lib.rs.
3. **Quick-start boilerplate** — minimal copyable skeleton. Pattern: DancePlugin full skeleton from RESEARCH.md Code Examples section (lines 637–767).

Target length: 500–800 lines. No framework dependencies — plain Markdown.

---

### `README.md` (docs — teaser addition)

**Analog:** `README.md` itself (lines 1–30).

**Change:** Add a "How to add a game" section after the existing architecture prose, pointing to `docs/GAME-SDK.md`. Pattern: match the existing plain-prose, no-framework style of the README (lines 1–10). No emojis, no bullet-heavy formatting — match current voice.

---

## Shared Patterns

### State Downcast
**Source:** `engine/boxing-plugin/src/lib.rs` lines 90–91 (repeated at lines 179–180, 186–187, 204–205, 210–211)
**Apply to:** All `GamePlugin` method implementations in `dance-plugin/src/lib.rs`
```rust
let s = state.downcast_mut::<BoxingState>()
    .expect("boxing plugin: state type mismatch — expected BoxingState");
```

### `GameEvent::Broadcast` + `json!()` Macro
**Source:** `engine/boxing-plugin/src/lib.rs` lines 160–166 (SendToPlayer variant — same `payload: json!({...})` shape)
**Apply to:** All beat/score events in `dance-plugin/src/lib.rs` `on_tick`
```rust
events.push(GameEvent::SendToPlayer {
    slot: ...,
    payload: json!({ "type": "...", "key": value }),
});
```

### Axum Handler Signature
**Source:** `engine/engine-core/src/main.rs` lines 53–59 (`ws_player`)
**Apply to:** New `create_room` and `lobby_html` handlers in `main.rs`
```rust
async fn ws_player(
    Path(room_code): Path<String>,
    State(app): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
```

### `Arc<dyn GamePlugin + Send + Sync>` Cloning
**Source:** `engine/engine-core/src/main.rs` line 35 and `room_manager.rs` line 50
**Apply to:** Plugin registry construction in `main.rs` and registry lookup in `create_room` handler
```rust
let plugin: Arc<dyn GamePlugin + Send + Sync> = Arc::new(BoxingPlugin::new(boxing_config));
// ...
pub fn create_room(&self, room_code: String, plugin: Arc<dyn GamePlugin + Send + Sync>) -> String {
```

### `serde` Derive Pattern
**Source:** `engine/engine-core/src/main.rs` (protocol.rs pattern) — `serde = { version = "1.0.228", features = ["derive"] }` already in engine-core Cargo.toml line 17
**Apply to:** `CreateRoomParams` and `CreateRoomResponse` structs in `main.rs`
```rust
#[derive(Deserialize)]
struct CreateRoomParams { pub game: Option<String> }

#[derive(Serialize)]
struct CreateRoomResponse { pub room_code: String }
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/GAME-SDK.md` | docs | — | No developer guide or SDK documentation exists in codebase; RESEARCH.md D-11 structure is the template |

---

## Key Anti-Patterns (from RESEARCH.md)

These must NOT appear in new code:

1. **`round_start_tick = 0` used as beat clock origin** — use `round_started: bool` flag and capture real tick on first `on_tick` call (RESEARCH.md Pitfall 1)
2. **`beat_number >= TOTAL_BEATS` check without `round_ended` guard** — emits RoundOver every tick after beat 16 (RESEARCH.md Pitfall 3)
3. **Poses in raw MediaPipe Y-down coords** — cosine similarity silently fails; use hip-centred Y-up coords (RESEARCH.md Pitfall 5)
4. **`AppState.plugins` HashMap mutated after `Arc::new`** — build HashMap before wrapping (RESEARCH.md Pitfall 2)
5. **`app.plugin` references remaining in ws_player handler** — `app.plugin` field no longer exists; Option A removes on-demand creation path (RESEARCH.md Integration Point section)

---

## Metadata

**Analog search scope:** `engine/boxing-plugin/`, `engine/plugin-trait/`, `engine/engine-core/src/`
**Files scanned:** 8 source files read directly
**Pattern extraction date:** 2026-05-02
