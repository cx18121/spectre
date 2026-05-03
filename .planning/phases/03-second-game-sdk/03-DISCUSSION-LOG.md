# Phase 3: Second Game + SDK - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 3-Second Game + SDK
**Areas discussed:** Second game design, Plugin selection, SDK doc structure

---

## Second Game Design

### Q1: Game type

| Option | Description | Selected |
|--------|-------------|----------|
| Pose-match | Server shows target pose; player holds it for N seconds; score for accuracy and hold time. Simplest possible second game. | |
| Dance scoring | Player mirrors a sequence of poses in time with a beat. More complex: needs timing logic, pose sequence state. | ✓ |
| Reflex / Simon Says | Server commands a pose; player hits it within a time window. Round-based but completely different domain. | |

**User's choice:** Dance scoring (user asked "what do you think? maybe dance?" — discussion recommended dance as a good fit)

---

### Q2: Client delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Server broadcasts target poses | Broadcast target pose JSON each tick (or at beats) via GameEvent::Broadcast. No protocol changes. | ✓ |
| Target pose embedded in game_state | Extend game_state message with target_pose field. Graceful degradation on old clients. | |
| Server-only scoring | 100% server-side; game invisible on mobile client. Proves trait works but not playable. | |

**User's choice:** Server broadcasts target poses (Recommended)

---

### Q3: Dance rules (round structure)

| Option | Description | Selected |
|--------|-------------|----------|
| Sequence of target poses | Library of 5–10 poses; hold each for 3s; cumulative score; RoundOver after sequence. | |
| Free-dance / hold duration | One target pose per round; player holds as long as possible. Simpler state machine. | |
| Rhythm / beat-gated | Target switches every N ticks; player must hit pose on the beat. Adds timing logic and beat-counter state. | ✓ |

**User's choice:** Rhythm / beat-gated

---

### Q4: Beat interval and round length

| Option | Description | Selected |
|--------|-------------|----------|
| Beat every 2s, 8 beats per round | 120-tick interval; simpler scoring window. | |
| Beat every 1s, 16 beats per round | 60-tick beat interval; tighter scoring window; more data points. | ✓ |
| You decide | Leave beat interval and round length to Claude's discretion. | |

**User's choice:** Beat every 1s, 16 beats per round

---

### Q5: Solo mode

| Option | Description | Selected |
|--------|-------------|----------|
| Solo scoring only | One player dances alone; no bot; RoundOver after 16 beats with single score. | ✓ |
| Bot competitor scores | A bot tracks a perfect score each beat; solo player competes against simulated perfect dancer. | |
| Next area | Move to Plugin selection; leave solo to Claude's discretion. | |

**User's choice:** Solo scoring only (Recommended)

---

## Plugin Selection

### Q1: Selection mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| CLI argument | --game boxing / --game dance in main.rs. Anticipated by Phase 2 D-05. | |
| Environment variable | GAME=boxing / GAME=dance. Works in Docker/Railway. | |
| Cargo feature flag | Compile-time selection. Phase 2 D-05 explicitly ruled this out. | |
| Homepage option | User said: "option in the game homepage" — per-room selection from a web UI. | ✓ |

**User's choice:** "option in the game homepage" — per-room HTTP endpoint

---

### Q2: Client that sends game choice

| Option | Description | Selected |
|--------|-------------|----------|
| New room creation endpoint | POST /rooms?game=dance; static HTML lobby at /; mobile joins via room code unchanged. | ✓ |
| Modify mobile client home screen | Game picker in mobile/src/App.tsx; requires TypeScript changes. | |
| CLI arg fallback | Server-startup selection; homepage UI is a future phase feature. | |

**User's choice:** New room creation endpoint (Recommended)

---

### Q3: Lobby UI

| Option | Description | Selected |
|--------|-------------|----------|
| Simple static HTML at / | Minimal index.html; game picker buttons + room code display; no build step. | ✓ |
| Extend mobile client home screen | Add game selection step in mobile/src; TypeScript build change. | |
| You decide | Leave lobby UI details to Claude's discretion. | |

**User's choice:** Simple static HTML at / (Recommended)

---

## SDK Doc Structure

### Q1: Guide location

| Option | Description | Selected |
|--------|-------------|----------|
| README | Everything in root README.md; single source of truth. | |
| Separate docs/GAME-SDK.md | README links to dedicated guide; README stays short. | ✓ |
| Rustdoc only | Documentation in /// comments; cargo doc generates guide. | |

**User's choice:** Separate docs/GAME-SDK.md

---

### Q2: Guide depth

| Option | Description | Selected |
|--------|-------------|----------|
| Trait reference + boxing walkthrough | Every trait method documented + boxing walked through method-by-method. ~500–800 lines. | ✓ |
| Quick-start only | Minimal steps under 100 lines; relies on Rustdoc for details. | |
| Full game tutorial | Build a game from scratch; 1000+ lines. More tutorial than reference. | |

**User's choice:** Trait reference + boxing walkthrough (Recommended)

---

## Claude's Discretion

- Scoring algorithm for pose similarity (cosine similarity, joint angle distance, or per-keypoint Euclidean distance)
- Target pose library: number of poses (5–10 suggested), specific keypoint values, pose names
- When within a beat window to sample pose for scoring (best frame, average, or last frame)
- URL shape for room creation response
- Error handling for unknown game type query params
- CSS styling of static lobby HTML
- Exact sections and ordering within docs/GAME-SDK.md

## Deferred Ideas

- Audio cue integration for dance (beat sounds) — requires new wire message type and client changes; v2 scope
- Score history / match replay — natural extension of event stream pattern; not Phase 3 scope
- AI game generation (AI-01) — deferred until SDK is proven
- Commentary for dance (COMM-01..04) — v2 scope
- Per-user high scores / persistent leaderboard — no external store; out of scope
