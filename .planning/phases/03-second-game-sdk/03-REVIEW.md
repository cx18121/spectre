---
phase: 03-second-game-sdk
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - engine/dance-plugin/src/lib.rs
  - engine/dance-plugin/src/poses.rs
  - engine/dance-plugin/Cargo.toml
  - engine/engine-core/src/main.rs
  - engine/engine-core/Cargo.toml
  - engine/plugin-trait/src/lib.rs
  - engine/Cargo.toml
  - docs/GAME-SDK.md
  - README.md
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-02
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 03 delivers the dance plugin crate, engine wiring (plugin registry, HTTP routes, lobby), and SDK documentation. The architecture is sound: the plugin-trait abstraction holds, the beat clock and round-ended guard work correctly, and the unit-test suite covers the main behavioral contracts.

Three meaningful defects were found:

1. **BLOCKER — empty room code:** `create_room` is called with `String::new()` from `main.rs`. The room manager treats empty string `""` as a valid `Vacant` key on the first call, creating a room with an empty code that no player can ever reach via WebSocket (the URL path `/ws/player/` is just the bare route prefix).
2. **WARNING — solo mode winner is hardcoded:** The solo winner is always `Some(1)` regardless of the player's score, which is semantically wrong and inconsistent with the two-player path.
3. **WARNING — beat announcement races scoring:** Target poses are announced and scored simultaneously at each beat boundary. Players receive no advance notice of what pose to prepare for. This makes the game functionally unplayable for human players.

The documentation issues are minor: one sentence in GAME-SDK.md is self-contradictory about lobby auto-registration, and the introductory method-count description is grammatically incoherent.

---

## Critical Issues

### CR-01: Empty string room code created on every POST /rooms

**File:** `engine/engine-core/src/main.rs:421`
**Issue:** `create_room` is called with `String::new()` (empty string `""`):

```rust
let code = app.rooms.create_room(String::new(), Arc::clone(plugin));
```

`RoomManager::create_room` starts with `candidate = room_code.clone()` — so `candidate` is `""`. On the very first call the DashMap entry `""` is `Vacant`, so a room is inserted under the empty-string key and that key is returned to the caller as `room_code`. The response JSON becomes `{ "room_code": "" }`.

Players cannot join: the WebSocket route is `/ws/player/{room_code}` — Axum's path extractor produces an empty string which matches no room in the DashMap's normal 6-char keyspace. Worse, the `""` entry permanently occupies a slot and is never expired (the expiry task only fires after `match_over` is true AND the last player has been gone for 10 minutes — a match that can never start never reaches `match_over`).

On the second call, the `""` slot is `Occupied`, so the loop falls through to the random fallback and generates a valid 6-char code. All calls after the first work correctly.

**Fix:** Do not pass an empty string. Since the lobby always wants a freshly generated code, pass a non-empty initial candidate, or add an explicit empty-guard in `create_room`:

```rust
// Option A — simplest: pass a signal value that will never collide with a 6-char code
// No, even simpler: just pre-generate the candidate in the caller:
use rand::{distributions::Alphanumeric, Rng};
let initial = rand::thread_rng()
    .sample_iter(&Alphanumeric)
    .take(6)
    .map(|c| char::from(c).to_ascii_uppercase())
    .collect::<String>();
let code = app.rooms.create_room(initial, Arc::clone(plugin));
```

Or guard in `create_room` itself:

```rust
pub fn create_room(&self, room_code: String, plugin: Arc<dyn GamePlugin + Send + Sync>) -> String {
    // If caller passes empty string, skip directly to random generation
    let mut candidate = if room_code.is_empty() {
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(6)
            .map(|c| char::from(c).to_ascii_uppercase())
            .collect()
    } else {
        room_code
    };
    // ... rest unchanged
}
```

---

## Warnings

### WR-01: Solo mode winner is hardcoded to player 1 regardless of score

**File:** `engine/dance-plugin/src/lib.rs:138`
**Issue:** In solo mode the winner is always `Some(1u8)`:

```rust
let winner = if ctx.room.solo_mode {
    Some(1u8) // solo: player 1 always "wins" (scores alone)
} else if s.scores[0] > s.scores[1] { ...
```

This is semantically wrong. Solo mode means one player is playing alone — there is no opponent — but the player still accumulates a score across 16 beats. The winner signal in `RoundOver` is used by `game_loop.rs:274` to increment win counters (`state.wins[(w - 1) as usize] += 1`). Hardcoding player 1 as winner means player 1 always wins the round, even if they scored 0.0 on every beat (all landmarks invisible, never assumed any pose). A player who fails every pose still "wins" the round and advances the win counter.

The plan specification in `03-CONTEXT.md` (D-04) says: "Solo mode: single player scores alone with no bot opponent. `RoundOver` fires after 16 beats with a single-player score." This implies the score should still be evaluated — a zero score should not be a win.

A reasonable minimum threshold (e.g., score > 0.0, or always award the round with the actual score attached) would prevent the degenerate case. Or, if the design truly intends solo-as-always-win, the comment should say so explicitly and a test should assert it. The current comment "solo: player 1 always 'wins' (scores alone)" does not justify the correctness of always awarding a win regardless of score.

**Fix (minimal — award win only if any pose was matched):**
```rust
let winner = if ctx.room.solo_mode {
    // Solo: player 1 wins only if they scored anything (at least one beat landed)
    if s.scores[0] > 0.0 { Some(1u8) } else { None }
} else if s.scores[0] > s.scores[1] {
    Some(1)
} else if s.scores[1] > s.scores[0] {
    Some(2)
} else {
    None
};
```

---

### WR-02: Target pose announced and scored simultaneously — no player preparation window

**File:** `engine/dance-plugin/src/lib.rs:97–132`
**Issue:** At each beat boundary the code:
1. Looks up `target` (line 97)
2. Scores the player's CURRENT frame against `target` (lines 99–107)
3. Broadcasts the target to clients in `dance_beat` (lines 113–122)

Steps 2 and 3 happen atomically in the same tick. The player is scored on a pose they have never been told to prepare for. The client only learns what pose was required AFTER it has already been scored. In a 60 Hz game at 1-second beat intervals there is zero time to react.

The plan (03-CONTEXT.md D-01) describes "players score based on keypoint similarity between their pose and the target within each beat window," implying there is a beat window during which the target is visible before scoring. The current implementation collapses the announcement and the score event into the same instant.

**Fix:** Broadcast the NEXT beat's target at each beat boundary, scoring against the PREVIOUSLY announced target:

```rust
// On beat N: score against last_announced_target; then broadcast target for beat N+1
if elapsed_ticks > 0 && elapsed_ticks % BEAT_INTERVAL == 0 && s.beats_scored < TOTAL_BEATS {
    // Score against the pose announced at the previous beat
    if let Some(ref prev_target) = s.current_target {
        // ... scoring against prev_target ...
    }
    s.beats_scored += 1;
    // Advance and announce the NEXT target
    let next_target = &poses::POSE_LIBRARY[s.target_index % poses::POSE_LIBRARY.len()];
    s.current_target = Some(s.target_index);
    s.target_index = (s.target_index + 1) % poses::POSE_LIBRARY.len();
    // Broadcast next_target so player has one full beat window to prepare
    events.push(GameEvent::Broadcast { payload: json!({ "type": "dance_beat", ... }) });
}
```

This requires adding `current_target: Option<usize>` to `DanceState` and updating `on_round_reset`.

---

### WR-03: GAME-SDK.md self-contradictory lobby auto-registration claim

**File:** `docs/GAME-SDK.md:797–799`
**Issue:** The closing paragraph of Section 4 says:

> "The game lobby at `/` (GET) **automatically shows your game as a button once you register it** — edit the `LOBBY_HTML` constant in `main.rs` to add the button."

These two clauses contradict each other. The lobby is a hardcoded `const &str` in `main.rs`. Nothing happens automatically — developers must manually edit `LOBBY_HTML`. A developer following the "automatically shows your game" guidance would skip the manual step and be confused when their game doesn't appear.

**Fix:** Remove the false "automatically" claim:

```
The game lobby at `/` (GET) does NOT automatically update — you must manually add a button
to the `LOBBY_HTML` constant in `engine/engine-core/src/main.rs`:

```html
<button id="btn-my-game" onclick="createRoom('my-game')">My Game</button>
```
```

---

## Info

### IN-01: GAME-SDK.md method-count description is incoherent

**File:** `docs/GAME-SDK.md:14–16`
**Issue:** The introductory sentence reads:

> "It has seven methods: five with required implementations and two that are required, plus two optional lifecycle callbacks that default to no-ops."

"Five with required implementations and two that are required" is self-contradictory and adds to seven only if "two optional" is the remaining part, making the clause structure malformed. The actual breakdown is: `init_state` and `on_tick` are the two methods with no default (truly required); `max_wins`, `on_player_join`, `on_player_leave`, `on_calibration_complete`, and `on_round_reset` all have defaults (optional overrides). The sentence should reflect this.

**Fix:**
```
It has seven methods: two with required implementations (`init_state`, `on_tick`) and five
optional lifecycle callbacks that default to no-ops (`max_wins`, `on_player_join`,
`on_player_leave`, `on_calibration_complete`, `on_round_reset`).
```

---

### IN-02: README.md describes Python server but "Adding a new game" references Rust engine

**File:** `README.md:124–133`
**Issue:** The README body describes the original Python server stack throughout ("Python game server," "Python 3.11+"). The new "Adding a new game" section (added in Phase 03) describes Rust GamePlugin structs. There is no note clarifying that the Rust engine is a rewrite/replacement of the Python server. A first-time reader of the README will be confused: the setup section installs Python and describes the Python server, while "Adding a new game" talks about Rust crates and Cargo workspaces.

**Fix:** Add a one-sentence clarification at the start of "Adding a new game" noting that the Rust engine is the in-development replacement:

```markdown
## Adding a new game

> **Note:** This section describes the Rust engine (`engine/`) which is replacing the
> Python server. The Rust engine is not yet running in production — see `server/` for
> the current deployed code.
```

---

### IN-03: `TargetPose.name` is always `#[allow(dead_code)]` — suggest using it in Broadcast payload

**File:** `engine/dance-plugin/src/poses.rs:27`
**Issue:** `TargetPose.name` is annotated `#[allow(dead_code)]` because it is never read at runtime. The beat broadcast payload (`dance_beat`) includes the raw keypoint array but omits the pose name. Clients and overlays have no human-readable label for the current target pose.

This is not a bug (the pose data is correct) but it means the `name` field serves no purpose at runtime and the `#[allow(dead_code)]` is a suppressed warning rather than a resolved one.

**Fix:** Use the name in the broadcast payload:

```rust
events.push(GameEvent::Broadcast {
    payload: json!({
        "type": "dance_beat",
        "beat": s.beats_scored,
        "total_beats": TOTAL_BEATS,
        "pose_name": target.name,         // add this
        "target_pose": target.keypoints.iter()
            .map(|kp| [kp.x, kp.y, kp.z, kp.visibility])
            .collect::<Vec<_>>(),
    }),
});
```

Then remove `#[allow(dead_code)]` from `TargetPose.name`.

---

_Reviewed: 2026-05-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
