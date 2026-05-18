# Milestones: PoseEngine

## v2.0 First-Person Boxing (Shipped: 2026-05-17)

**Phases:** 6 | **Plans:** 21 | **Timeline:** 2026-05-13 → 2026-05-17 (5 days)
**Files changed:** 133 | **Lines added:** ~24,300 | **New code:** ~8,000 LOC (TypeScript + Rust)

### Delivered

A laptop-native, single-device FPS boxing game. The webcam tracks the player's punches via MediaPipe in a Web Worker; a Three.js first-person view renders toon-shaded arms with spring physics; the Rust server runs authoritative hit detection and syncs opponent state at 60Hz. No phone required.

### Key Accomplishments

1. **FPSBoxingPlugin** — New Rust crate implementing `GamePlugin` for fps_boxing rooms; authoritative hit detection, HP tracking, guard blocking, bot mode, MsgFpsState broadcast per tick
2. **fps/ Vite app** — New standalone React+TypeScript client: WebSocket hook, WaitingScreen, warmup flow; mirrors mobile/ structure
3. **MediaPipe + Calibration** — Pose detection in a Web Worker (same pattern as mobile/); OneEuroFilter smoothing on 99 landmark instances; arm-length calibration step with video preview
4. **Three.js dual-scene renderer** — Player arms in a depth-separated arms scene (MeshToonMaterial + OutlineEffect); opponent arms in world scene; `clearDepth()` between passes; 60fps animation loop
5. **Spring physics + guard detection** — Semi-implicit Euler spring on forearm extension (FPR-02); frame-rate-independent exponential lerp for opponent arms; guard hysteresis (3-frame enter / 5-frame exit)
6. **Hit feedback** — Camera shake (trauma-decay), opponent arm snap-back (lambda=80), 120ms screen flash, synthesized Web Audio (impact vs blocked) — all firing together on MsgFpsHit
7. **GameHud** — HP bars (green→red at 50%), round timer, win counter dots, WIN/LOSE overlay (Anton font), REMATCH button; guard-aware 0.5× client-side damage display (GML-04)

### Timeline

- Start: 2026-05-13
- Ship: 2026-05-17
- Duration: 5 days

### Known Gaps at Close

- Punch classifier (Phase 13.1) deferred to v3 — pipeline scaffold complete, no FPS-perspective training data. Velocity-based detection sufficient. See ROADMAP.md BL-01.

### Archive

- Roadmap: `.planning/milestones/v2.0-ROADMAP.md`
- Requirements: `.planning/milestones/v2.0-REQUIREMENTS.md`

---

## v1.0 — PoseEngine MVP

**Shipped:** 2026-05-10
**Phases:** 9 | **Plans:** 28 | **Tasks:** ~60

### Delivered

A complete pose-based multiplayer game engine with two shipped games (boxing and dance), full lobby UX, mobile fast-join flow, overlay fidelity, and AI-generation-ready SDK documentation. The engine was rewritten from Python to Rust (Axum + Tokio) — same wire protocol, no client changes.

### Key Accomplishments

1. **Rust engine rewrite** — Full Axum + Tokio server replacing Python/FastAPI; 60Hz authoritative game loop, actor-per-room model, RTT fairness input delay, spectator reconnect snapshots
2. **GamePlugin trait** — Object-safe Rust trait proved by two games; boxing plugin with hit detection, damage, guard blocking, and bot mode
3. **Two-game validation** — DancePlugin implemented with zero engine changes, proving the abstraction generalizes; cosine similarity pose scoring with beat clock
4. **SDK documentation** — 800-line GAME-SDK.md developer guide + full Rustdoc; sufficient for an LLM to generate a new game in one shot
5. **Lobby + mobile UX** — SPECTRE landing page, QR room cards, mobile fast-join (one-tap from QR scan), distinct connection error messages
6. **Dance frontend** — Game-type-aware overlay (DanceHud, beat countdown bar, target pose skeleton in Pixi.js with fade animation), dance match end screen, mobile calibration skip
7. **Test coverage** — 201 Rust tests + 19 overlay Vitest tests + 50 mobile tests; Vitest set up for overlay from scratch

### Timeline

- Start: 2026-04-25
- Ship: 2026-05-10
- Duration: 15 days

### Tech Stack Shipped

- **Engine:** Rust 1.86, Axum 0.8, Tokio, DashMap, serde_json, qrcode
- **Overlay:** React 18, Pixi.js 8, TypeScript, Vitest
- **Mobile:** React 18, TypeScript, Vitest
- **Deploy:** Docker multi-stage + Railway

### Known Gaps at Close

None — all 67 v1 requirements verified. Two compile errors fixed post-execution (PixiCanvas skeletonGfx scope, useSpectatorSocket type narrowing).

### Archive

- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
