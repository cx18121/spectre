# Phase 4: Lobby UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 4-lobby-ux
**Areas discussed:** Game picker style, Room page card layout, Landing page composition

---

## Game picker style

| Option | Description | Selected |
|--------|-------------|----------|
| Big clickable tiles | Full-width cards for Boxing and Dance side by side, clicking selects | ✓ |
| Pill toggle | Segmented [BOXING \| DANCE] control, selected segment highlighted | |
| Radio row | Styled radio inputs in horizontal group | |

**User's choice:** Big clickable tiles

---

### Game tile content

| Option | Description | Selected |
|--------|-------------|----------|
| Name + one-line descriptor | BOXING + "hit to knock out", DANCE + "match the beat" | |
| Name only | Just BOXING and DANCE in large type | ✓ |

**User's choice:** Name only — clean and fast

---

### Selected tile visual treatment

**User's choice (free text):** "the design.md is only for the boxing game right now. so dont follow it. or rewrite it first to include everything design for lobby, boxing, dance, before we do anything else"

**Notes:** User identified that DESIGN.md is scoped to overlay/HUD only and doesn't cover lobby components. This led to a critical ordering decision: DESIGN.md must be extended with a Lobby section before any implementation begins. Visual styling of the selected tile state is deferred to the DESIGN.md extension.

---

## Phase ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Extend DESIGN.md first, then implement | Add Lobby section to DESIGN.md; all implementation follows that spec | ✓ |
| Design-as-you-build | Use existing tokens, backfill DESIGN.md after | |

**User's choice:** Extend DESIGN.md first — clean separation of design from code

**Notes:** This adds a plan to Phase 4 (now 3 plans instead of 2): 04-01 writes the DESIGN.md Lobby section, 04-02 implements the room page, 04-03 implements the landing page.

---

## Room page card layout

| Option | Description | Selected |
|--------|-------------|----------|
| 3-column horizontal grid | All three cards side by side, responsive stack on mobile | ✓ |
| 2+1 layout | P1+P2 side by side, Overlay full-width below | |
| Single stacked column | All three stacked vertically | |

**User's choice:** 3-column horizontal grid with responsive stacking

---

### Card color treatment (P1/P2 accents)

**User's choice (free text):** "wait for the design.md redesign for lobby"

**Notes:** Consistent with the DESIGN.md-first decision. P1/P2 color treatment is deferred to the DESIGN.md Lobby extension.

---

## Landing page composition

| Option | Description | Selected |
|--------|-------------|----------|
| Dramatic presence | SPECTRE in Achafont as a large hero, tagline below, then game picker | |
| Tight utility | SPECTRE as compact header, gets to game picker immediately | ✓ |

**User's choice:** Tight utility — the page is used repeatedly by the host

---

### Join section placement

| Option | Description | Selected |
|--------|-------------|----------|
| Below Create Room, visually separated | Horizontal rule between create and join sections | ✓ |
| Same section as Create Room | Side by side or stacked with no break | |
| Opposite sides | Two-column layout | |

**User's choice:** Below Create Room with visual separator

---

### Join destination behavior

**Initial framing:** Join navigates to `/rooms/{code}` for host recovery.

**User's response (free text):** "i dont think we ever need a second operator no? ...you should be able to join a game from your phone like how kahoot does it."

**Notes:** User clarified Join is a player-facing Kahoot-style flow: player on phone types code → lands in mobile connection screen with room pre-filled. This changed the Join destination from `/rooms/{code}` (host tool) to `/mobile?room={CODE}` (player tool).

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate to /mobile?room=CODE | Player lands in mobile app, room pre-filled, server auto-injected | ✓ |
| Navigate to /rooms/{code} for everyone | Same page for host and player | |

**User's choice:** Navigate to `/mobile?room={CODE}` — Kahoot-style player join flow

---

## Claude's Discretion

- QR code rendering format (SVG vs base64 PNG — SVG recommended)
- Exact DESIGN.md Lobby section content beyond structural decisions
- `PUBLIC_URL` fallback implementation in Axum (Host header extraction)
- Auto-injection of `?server=` into Join redirect
- Room page 404 behavior

## Deferred Ideas

- Room-not-found error handling in Join (Phase 5 MOBILE-03 scope)
- Slot pre-selection on the landing page join flow
- Landing page as display/cast target
