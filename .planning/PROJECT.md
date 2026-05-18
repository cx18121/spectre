# PoseEngine

## What This Is

A real-time multiplayer game engine written in Rust (Axum + Tokio) for pose-based games. v1.0 ships two phone-based games (boxing and dance) with a spectator overlay. v2.0 adds a laptop-native, single-device FPS boxing mode where the webcam tracks punches and renders a first-person Three.js view — no phone required. The plugin interface is clean enough that an LLM can generate a new game in one shot from the GAME-SDK.md guide.

## Core Value

The engine must make it trivially easy to add a new pose-based game by implementing a well-defined plugin interface — without touching the engine core or understanding its internals.

*Validated at v1.0: DancePlugin with zero engine changes. Validated at v2.0: FPSBoxingPlugin with zero engine-core changes — entirely new game mode in a new crate.*

## Current State: v2.0 Shipped

v2.0 First-Person Boxing shipped 2026-05-17. Planning next milestone.

## Requirements

### Validated

- ✓ Real-time WebSocket pose streaming from mobile browsers — existing
- ✓ Server-authoritative hit detection and game state — existing
- ✓ Spectator overlay with Pixi.js silhouette rendering — existing
- ✓ Room management with 6-char codes — existing
- ✓ RTT-fairness input delay buffer — existing
- ✓ Calibration handshake (reference velocity) — existing
- ✓ Docker + Railway deployment — existing
- ✓ Rust game engine core: Axum + Tokio WebSocket server — v1.0 Phase 1
- ✓ Game plugin trait (`GamePlugin`, `TickContext`, `GameEvent`) — v1.0 Phase 2
- ✓ Boxing game plugin with hit detection, damage, bot mode — v1.0 Phase 2
- ✓ Calibration-persist bug fixed (`reference_velocity` lives on PlayerSlot for Room lifetime) — v1.0 Phase 2
- ✓ Spectator reconnect snapshot (HP, wins, round, elapsed time sent on join) — v1.0 Phase 1
- ✓ DancePlugin: second game validates the trait generalizes — v1.0 Phase 3
- ✓ SDK documentation (GAME-SDK.md 800 lines, full Rustdoc, 270 tests) — v1.0 Phase 3
- ✓ Lobby UX: SPECTRE landing page, game picker, Create Room, Join by code — v1.0 Phase 4
- ✓ Room page with P1/P2/Overlay QR cards (inline SVG, prefilled URLs) — v1.0 Phase 4
- ✓ Mobile fast-join: QR-prefilled params → one-tap connection screen — v1.0 Phase 5
- ✓ Overlay fidelity: Achafont restored, all DESIGN.md spec gaps closed — v1.0 Phase 6
- ✓ Dance engine wiring: `game_type` in `MsgJoined`, calibration skip, `MsgDanceBeat`/`MsgDanceScore` — v1.0 Phase 7
- ✓ Dance UX design: DESIGN.md dance section, PRODUCT.md two-mode update — v1.0 Phase 8
- ✓ Dance frontend: game-type HUD routing, DanceHud, beat countdown, ghost skeleton, dance match end, mobile calibration skip — v1.0 Phase 9
- ✓ FPSBoxingPlugin: authoritative fps_boxing rooms, MsgFpsState/MsgFpsHit, HP tracking, guard blocking, bot mode — v2.0 Phase 10
- ✓ Lobby updated: FPS BOXING tile, /fps laptop join page (no QR codes, no overlay card) — v2.0 Phase 11
- ✓ fps/ Vite app scaffold: WebSocket hook, WaitingScreen, warmup flow — v2.0 Phase 12
- ✓ MediaPipe pose detection in Web Worker, OneEuroFilter on 99 landmarks, arm-length calibration — v2.0 Phase 13
- ✓ Three.js dual-scene renderer: toon arms, spring physics, opponent lerp, guard detection — v2.0 Phase 14
- ✓ Hit feedback: camera shake, snap-back, screen flash, Web Audio — v2.0 Phase 14
- ✓ GameHud: HP bars, round timer, WIN/LOSE overlay, REMATCH, guard-aware damage display — v2.0 Phase 14

### Active

*(Fresh requirements defined at next milestone start via `/gsd-new-milestone`)*

### Out of Scope

- Browser-based game IDE — UX for AI generation is deferred; focus is the trait interface quality
- Horizontal scaling / room sharding — single-process Tokio is sufficient for current use
- User accounts, authentication tokens — 6-char room code access model retained
- AI commentary — COMM-01..04 deferred; v3 candidate
- AI game generation — deferred until SDK is proven (it now is); v3 candidate
- Punch classifier ML model — v3 backlog. All existing boxing datasets (BoxingVI etc.) are third-person camera footage; FPS-perspective landmark geometry is fundamentally different and no pre-labeled dataset exists. Velocity-based punch detection (Phase 13 `velocity.ts`) is sufficient for v2. When punch-type damage multipliers (jab/cross/hook) are a priority, collect FPS webcam recordings using `ml/scripts/record_webcam.py` (already built) and train on that. The full ml/ pipeline scaffold and `usePunchClassifier` hook are in-repo and ready — only training data is missing.

## Context

**Current state (v2.0):** FPS boxing shipped. ~29,500 Rust LOC + ~14,000 TypeScript LOC across fps/, mobile/, overlay/. Three games playable: mobile boxing, dance, and FPS boxing. Engine serves all room types concurrently via the plugin trait — no engine-core changes in v2.0.

**Test coverage:** 201 Rust tests + fps/ Vitest suite (useCalibration, normalizeWindow, usePunchClassifier) + 19 overlay tests + 50 mobile tests.

**Known technical debt:**
- Worktree CWD management was manual — intra-wave file-overlap detection now prevents parallel conflicting edits but merge coordination could be automated
- Phase 13.1 usePunchClassifier hook is wired but uses a placeholder ONNX (all-zero weights) — dead code until training data is collected

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for full server rewrite (not PyO3 shim) | Python GIL prevents parallelism; Pydantic/NumPy overhead in hot path; clean break is simpler than hybrid | ✓ Good — clean architecture, no hybrid complexity |
| Axum + Tokio (not Actix) | Better ecosystem ergonomics, `tower` middleware composability, user preference | ✓ Good |
| Game plugin as Rust trait (not scripting/WASM) | Keeps the hot path native; compile-time safety; runtime flexibility not needed | ✓ Good — DancePlugin and FPSBoxingPlugin both required zero engine-core changes |
| Boxing is first plugin, not built into engine | Forces the engine/game boundary to be real before a second game tests it | ✓ Good — boundary held across three games |
| Wire protocol unchanged | TypeScript clients are not part of this rewrite | ✓ Good — zero client changes across all 14 phases |
| Commentary ported last | Async HTTP is straightforward in Rust, separate concern from game engine correctness | ✓ Good — deferred cleanly |
| Phase 8 design-first before Phase 9 code | Dance frontend needed full DESIGN.md spec before any Pixi.js work | ✓ Good — no Phase 9 rework |
| `game_type` in `MsgJoined` (not separate message) | Single place for game-mode routing in all clients | ✓ Good |
| Inline SVG QR codes (not base64 PNG) | No extra HTTP round-trip; scales perfectly | ✓ Good |
| PUBLIC_URL env var preferred over Host header | Mitigates host header injection in prod (T-04-02-02) | ✓ Good |
| fps/ as separate Vite app (not integrated into overlay/) | Laptop-native game has different input model and no spectator overlay dependency | ✓ Good — clean separation |
| Raw Three.js (not React Three Fiber) | Matches overlay/ precedent; finer control over render loop and dual-scene architecture | ✓ Good — dual-scene + OutlineEffect straightforward |
| Velocity-based punch detection over ML classifier | FPS-perspective training data doesn't exist; velocity threshold sufficient for v2 gameplay | ✓ Good — deferred classifier cleanly to v3 |
| Dual-scene depth separation (clearDepth between passes) | Player arms must always render in front of opponent geometry | ✓ Good — FPR-04 satisfied cleanly |

## Constraints

- **Language**: Rust — Axum + Tokio for async WebSocket server; no Python in the server path
- **Protocol**: Wire format must be byte-for-byte compatible with existing `shared/protocol.ts` — no client changes
- **Deployment**: Docker multi-stage build + Railway; same `railway.toml` shape
- **Game loop**: 60Hz authoritative tick must be maintained; RTT fairness input delay preserved
- **Plugin interface**: Game trait must be well-defined enough that a developer (or LLM) can implement a new game without knowing engine internals

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-12 — milestone v2.0 started*
