# Phase 8: Dance UX Design - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 writes the DESIGN.md dance section and updates PRODUCT.md to cover two game modes. Output is design specification only — no code. Phase 9 implements against this output.

**In scope:**
- DESIGN.md: complete Dance Game section covering score display, beat indicator, target pose skeleton spec, round end, match end
- PRODUCT.md: updated to address both game modes; dance tone defined as "performance" register distinct from boxing "combat" register

**Out of scope:**
- Any Pixi.js or React implementation (Phase 9)
- Mobile calibration skip UI (Phase 9)
- Commentary wiring for dance

</domain>

<decisions>
## Implementation Decisions

### Score Display
- **D-01:** Scores shown as **numeric only** — large Inter 900 number, no bar. One decimal precision (e.g. `11.7`). P1 score left-aligned, P2 score right-aligned, `vs` separator in the centre.
- **D-02:** Score occupies the **bottom row of the HUD band** (where HP bars live in boxing). Top row keeps: P1 label | beat indicator | P2 label. No HP bars, no win dots for dance.
- **D-03:** Register is **earned/building** — score grows from zero, nothing punishes a missed beat visually. Absolute numbers are readable so the gap between players is self-evident; no explicit lead indicator needed.

### Beat Indicator
- **D-04:** **Draining bar** in the centre column of the HUD top row. Resets to full on each `dance_beat` event, drains linearly to zero by the next expected beat boundary. Beat progress shown above the bar: `N / total_beats` in Inter 700 12px `--type-label` style.
- **D-05:** Bar fill color: `--text-secondary`. Track color: `--bg-surface`. Neutral — does not compete with the skeleton silhouette.

### Target Pose Skeleton
- **D-06:** Ghost skeleton rendered at **canvas centre**, at human scale matching the player silhouettes. Vertical position aligned with the live player silhouettes.
- **D-07:** Style: `--text-dim` keypoints and bone lines at **40% opacity**. Reads as a ghost without overpowering the live players.
- **D-08:** Transition: **150ms fade-out** of old pose, **150ms fade-in** of new pose triggered by each `dance_beat` event. Uses the existing UI overlay timing (150ms ease-out-quart / 120ms ease-in from DESIGN.md animation spec).

### Round End Screen
- **D-09:** **Performance result copy** — scoreboard register, no combat language. Format: `ROUND N — P1 LEADS` / `ROUND N — TIED`. Scores for both players shown below in `--text-secondary`. Matches the DDES-02 "performance" register requirement.
- **D-10:** No "KO", no "TIME" — those are boxing-only copy. Dance round end never uses combat vocabulary.

### Match End Screen
- **D-11:** **Two large score numbers side by side**, winner's side highlighted with their accent color (`--accent` for P1, `--accent-p2` for P2). `WINNER` label above the winning score in Inter 900. No HP bar, no KO text (DDES-01).
- **D-12:** Fastest-to-read-from-across-the-room layout: large numbers dominate, winner accent color is the primary signal, copy is minimal.

### Claude's Discretion
- Exact pixel sizing of score numbers (planner inherits from existing `--type-score` scale or defines a new token)
- Whether the draining bar is a separate element from the beat counter label, or the label sits above an inline bar
- Exact width of the centre column beat indicator relative to the HUD band total width

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design system (token source of truth)
- `DESIGN.md` — All OKLCH tokens, typography scale, animation timing, component patterns. The dance section being written in this phase will live here. Read the full file before writing — especially §Color Tokens, §Typography, §Animation, and §HUD (boxing HUD spec to mirror/adapt for dance).

### Product context
- `PRODUCT.md` — Tone, register, anti-references. DDES-02 requires updating this file to address both game modes with dance as "performance" register.

### Requirements
- `.planning/REQUIREMENTS.md` — DDES-01, DDES-02, DDES-03 are the Phase 8 requirements. Read all three before writing any spec copy.

### Protocol (what the overlay receives)
- `engine/engine-core/src/protocol.rs` — `MsgDanceBeat` (beat, total_beats, target_pose), `MsgDanceScore` (beat, scores), `MsgJoined` (game_type). The design spec must be grounded in what data is actually available on the wire.
- `shared/protocol.ts` — TypeScript interfaces for the same messages; canonical for Phase 9 implementors.

### Existing HUD implementation (pattern to adapt)
- `overlay/src/components/HudLayer.tsx` — Boxing HUD structure (two-row band: names/wins | HP bars). Dance HUD adapts this: names/beat-indicator | scores.

### Phase 7 context (protocol decisions that constrain design)
- `.planning/phases/07-dance-engine-protocol/07-CONTEXT.md` — D-04 defines MsgDanceBeat.target_pose shape (`Vec<[f64; 4]>` — x, y, z, visibility per keypoint); D-02 defines spectator_snapshot shape. Design must work with these exact wire payloads.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `overlay/src/components/HudLayer.tsx` — Two-row HUD band structure. Dance HUD is a sibling component (`DanceHud`) that shares the same outer `.hud-layer` / `.hud-band` shell but replaces HP bars with score numbers and adds the beat draining bar in the centre column.
- `overlay/src/components/RoundOverlay.tsx` — Existing round-end overlay. Dance round end reuses this component with different copy (no KO text).
- `DESIGN.md §Animation` — 150ms ease-out-quart / 120ms ease-in timing already defined. Beat-swap skeleton fade uses these exact values — no new timing tokens needed.

### Established Patterns
- OKLCH token system: all colors must use existing tokens (`--accent`, `--accent-p2`, `--text-dim`, `--text-secondary`, `--bg-surface`). No new color tokens expected — DDES-03 already specifies `--text-dim`/`--text-secondary` for the skeleton.
- Inter 900 uppercase for all HUD labels; Achafont for dramatic display moments. Score numbers use Inter 900 (same as timer in boxing HUD).
- Dance game context in lobby already uses `--accent-p2` (steel blue) for selection state — this establishes P2's color as the "dance accent" in the lobby, but on the overlay both players keep their own `--accent` / `--accent-p2` assignments (P1 = crimson, P2 = steel).

### Integration Points
- Phase 9 will create `DanceHud` component alongside `HudLayer`. The design spec must be concrete enough for `DanceHud` to be written without further design decisions.
- Phase 9 will render the ghost skeleton in Pixi.js (`PixiCanvas.tsx`). The spec must state: canvas position (centre), scale (human-scale), opacity (40%), transition timing (150ms fade), and bone/keypoint rendering style.

</code_context>

<specifics>
## Specific Ideas

- Beat draining bar resets on `dance_beat` event — this ties design spec directly to a wire event, which Phase 9 implements in `useSpectatorSocket` state.
- Score format `11.7` (one decimal) chosen for tie-breaking legibility — when players are within 1 point of each other, the decimal matters.
- Ghost skeleton at 40% opacity: specific enough for Phase 9 to implement without a second design pass.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 8-Dance UX Design*
*Context gathered: 2026-05-10*
