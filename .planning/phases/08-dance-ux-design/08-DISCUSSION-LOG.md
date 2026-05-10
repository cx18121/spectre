# Phase 8: Dance UX Design - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 08-dance-ux-design
**Areas discussed:** Score display layout, Beat indicator design, Target pose positioning, Round/match end screens

---

## Score Display Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Repurpose HP bar track (fills up) | Same horizontal bar in HUD band — fills left-to-right as score grows | |
| Numeric-only — large number, no bar | Big Inter 900 number where the bar was. P1 left, P2 right. | ✓ |
| Percentage bar with beat-by-beat flash | Bar fills as % of max possible score; brief accent flash per beat | |

**User's choice:** Numeric-only — large number, no bar

**Follow-up — Score format:**
| Option | Description | Selected |
|--------|-------------|----------|
| Integer only | Round to nearest whole number | |
| One decimal — e.g. 11.7 | Granular, useful when close | Claude |
| Percentage of max — e.g. 73% | Normalises against beats played so far | |

**User's choice:** You decide → Claude chose one decimal (11.7) for tie-breaking legibility

**Follow-up — Score position:**
| Option | Description | Selected |
|--------|-------------|----------|
| Replace HP bar row | Large number where the bar was; top row = P1 label | beat | P2 label | Claude |
| Inline with name row | Single-row HUD; score next to label | |

**User's choice:** You decide → Claude chose replace HP bar row to keep skeleton prominent

**Follow-up — Emotional register:**
| Option | Description | Selected |
|--------|-------------|----------|
| Earned — score grows, bar fills | Building momentum; nothing punishes a missed beat | Claude |
| Competitive — gap always visible | Lead indicator as primary signal | |

**User's choice:** You decide → Claude chose earned/building; gap self-evident from absolute numbers

---

## Beat Indicator Design

| Option | Description | Selected |
|--------|-------------|----------|
| Draining bar — fills full on beat, drains to zero | Horizontal bar that resets and drains every beat window | ✓ |
| Pulsing ring / dot — pulses on each beat | Small circular element flashing on beat boundary | |
| Numeric countdown + beat counter | Stacked numbers: beat progress + decimal countdown | |

**User's choice:** Draining bar
**Notes:** Color decided by Claude — `--text-secondary` fill, `--bg-surface` track. Neutral, doesn't compete with skeleton.

---

## Target Pose Positioning

| Option | Description | Selected |
|--------|-------------|----------|
| Centre — between the two player silhouettes | Ghost skeleton at canvas centre, human scale | ✓ |
| Behind both players — full-canvas ghost | Overlaid behind silhouettes at low opacity | |
| Corner inset — small reference skeleton | Bottom-centre or top-right, smaller scale | |

**User's choice:** Centre
**Notes:** Opacity (40%), fade timing (150ms), and bone style (`--text-dim`) decided by Claude based on DDES-03 and existing animation spec.

---

## Round/Match End Screens

**Round end tone:**
| Option | Description | Selected |
|--------|-------------|----------|
| Performance result — "ROUND N — P1 LEADS" | Neutral scoreboard language | Claude |
| Expressive — "FLAWLESS" / "CLOSE ROUND" | Copy varies by score gap | |

**User's choice:** You decide → Claude chose performance result; consistent with DDES-02 "disciplined performance" register

**Match end layout:**
| Option | Description | Selected |
|--------|-------------|----------|
| Two large score numbers, winner highlighted | P1 score | P2 score; winner gets accent color + WINNER label | Claude |
| Score bars + winner announcement below | Relative bars then "P1 WINS" | |

**User's choice:** You decide → Claude chose two large numbers; fastest to read across the room

---

## Claude's Discretion

- Score format: one decimal (11.7)
- Score position: bottom row replacing HP bars
- Score register: earned/building
- Beat bar colors: `--text-secondary` fill, `--bg-surface` track
- Ghost skeleton opacity: 40%
- Ghost skeleton fade timing: 150ms (reuses existing DESIGN.md animation timing)
- Round end copy register: performance result
- Match end layout: two large numbers, winner accent highlight

## Deferred Ideas

None — discussion stayed within phase scope.
