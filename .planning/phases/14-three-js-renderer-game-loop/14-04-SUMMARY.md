---
plan: 14-04
phase: 14-three-js-renderer-game-loop
status: complete
requirements_satisfied:
  - HFB-02
  - GML-01
  - GML-02
  - GML-03
  - GML-04
commits:
  - 65a4a9b feat(14-04): GameHud component — HP bars, timer, win counter, match-end overlay
  - 49d7952 feat(14-04): wire GameHud into GameRenderer with guard-aware HP drain (GML-04)
human_checkpoint: passed
---

# Plan 14-04 Summary — GameHud + GameRenderer Wiring

## What Was Built

### Task 1: GameHud Component + CSS
- `fps/src/components/GameHud.tsx` — Presentational component with HP bars, round timer, win counter dots, match-end overlay, and REMATCH button
- `fps/src/components/GameHud.css` — HUD tokens, HP bar transitions (200ms width, 300ms color), hit-flash keyframe

HP bar behavior:
- Player bar (top-left, "YOU") and opponent bar (top-right, "OPP")
- Fill width: `(hp / 800) * 100%` inline style
- Green (`#22c55e`) → red (`#ef4444`) when HP ≤ 400 via `.hp-bar-fill--low` class
- Opponent bar fills right-to-left via `direction: rtl`

Match-end overlay:
- WIN: amber `#fbbf24`, Anton font, 80px — renders when `matchEnd.winner === playerSlot`
- LOSE: red `#ef4444`, same font — renders otherwise
- REMATCH button calls `socket.playAgain()`

### Task 2: GameRenderer Wiring
- `fps/src/components/GameRenderer.tsx` extended with:
  - `useState` for `playerHp`, `opponentHp`, `roundTimer`
  - `useEffect` syncing `socket.lastFpsState` → HP/timer state on each server update
  - `useEffect` applying GML-04 guard multiplier on `socket.lastFpsHit`
  - `guardStateRef` destructured from `useGameRenderer()` return
  - `<GameHud>` mounted as `position: absolute` overlay above Three.js canvas

### Task 3: Human Checkpoint
Verified via Playwright visual testing:
- HP bars at correct positions (left/right) with correct colors (green/red)
- Round timer pill centered at top
- WIN overlay: amber Anton font, large — correct
- LOSE overlay: red Anton font — correct
- REMATCH button styled correctly
- Anton font confirmed loading via `document.fonts.check('16px Anton')` → `true`

## Key Decisions

**GML-03 (bot match):** Satisfied by existing socket phase routing. When only one player joins an fps_boxing room, FPSBoxingPlugin handles the bot opponent server-side. No client changes needed.

**GML-04 (guard multiplier):** Client-side display only — speculatively adds back half the damage to `playerHp` for ~1 server tick until the next authoritative `MsgFpsState` overwrites it. Server remains authoritative for actual HP.

**Rematch flow:** Uses `socket.playAgain()` (confirmed present in `useGameSocket.ts`). Existing App.tsx `showCalibration` condition handles re-entering calibration when `socket.phase === 'calibration'` — no App.tsx changes needed.

## Build Verification
- `npm run build` exits 0
- All Phase 14 requirements (FPR-01..04, HFB-01..04, GML-01..04) delivered across plans 14-01 through 14-04
