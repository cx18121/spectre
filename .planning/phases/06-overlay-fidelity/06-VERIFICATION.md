---
phase: 06-overlay-fidelity
verified: 2026-05-09T00:00:00Z
status: human_needed
score: 4/4 must-haves verified (SC4 requires human visual confirmation)
overrides_applied: 0
human_verification:
  - test: "Open the overlay in a browser during a live match and compare against DESIGN.md visually"
    expected: "No visible gap between running overlay and DESIGN.md spec — Achafont drama elements render distinctly, commentary bar matches spec, HP tracks have gold borders, all motion timings feel correct"
    why_human: "ROADMAP SC4 ('no visible DESIGN.md gap can be identified by comparing the running overlay to the spec') is a perceptual check on the rendered output. CSS values match spec in code; visual fidelity of font rendering, backdrop blur feel, snap-fill behavior of win dots, and animation easing curves cannot be confirmed without a browser."
---

# Phase 6: Overlay Fidelity Verification Report

**Phase Goal:** Every DESIGN.md spec is implemented exactly; Achafont is present; the overlay looks like the design intended during live matches
**Verified:** 2026-05-09
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Countdown (3, 2, 1), FIGHT!, KO, and match end title render in Achafont, visually distinct from Inter body text | VERIFIED | `overlay/public/fonts/Achafont.ttf` is a 58KB TrueType binary. `@font-face { font-family: 'Achafont'; src: url('/fonts/Achafont.ttf') ... font-display: swap; }` is line 1 of index.css. Five call sites (.round-flash, .ko-text, .match-end-title, .waiting-title, .waiting-vs) all use `font-family: 'Achafont', Inter, sans-serif`. |
| 2 | Commentary bar shows with correct backdrop blur, accent border, tag style, and blinking cursor exactly as DESIGN.md describes | VERIFIED | `.commentary-subtitle-bar` uses `backdrop-filter: blur(6px)` (line 773), `background: var(--bg-commentary)`, `border: 1px solid var(--accent-commentary-border)`. `.commentary-subtitle-tag` uses `border: 1px solid var(--accent-commentary-tag-border)`. `.commentary-cursor` has `animation: commentary-blink 0.7s steps(2, jump-none) infinite`. All match DESIGN.md spec. |
| 3 | HP bar tracks have gold borders; all HUD structural elements use the Level 1 elevation spec | VERIFIED | `.hp-track` has `border: 1px solid var(--gold-border)` + `box-shadow: inset 0 1px 0 rgba(255,255,255,0.04)` (lines 258–259). `.match-stats` has the same (lines 374–375). `--gold-border` resolves to `oklch(from var(--gold) l c h / 0.20)` which matches DESIGN.md Level 1 spec exactly. |
| 4 | No visible DESIGN.md gap can be identified by comparing the running overlay to the spec | ? UNCERTAIN | All 18 CSS deviations corrected in code (verified below). Visual fidelity of the rendered output — font rendering quality, backdrop blur appearance, animation easing feel, snap behavior of win dots — requires human eyes on the browser. SUMMARY states Playwright verification passed; independent human confirmation is the remaining gate per ROADMAP SC4 wording. |

**Score:** 3/4 truths fully verified programmatically; SC4 pending human visual confirmation

---

### Plan Must-Haves (06-01-PLAN.md + 06-02-PLAN.md)

#### 06-01: Achafont Restoration

| Truth | Status | Evidence |
|-------|--------|----------|
| Countdown/FIGHT!/KO/match-end render in Achafont, visually distinct from Inter | VERIFIED | Font binary present, @font-face at line 1, 5 call sites intact |
| Font loads without FOIT — Inter fallback during load, then swaps | VERIFIED | `font-display: swap` present in @font-face |
| No @font-face missing-file errors in browser console | UNCERTAIN | Requires browser run; file path `/fonts/Achafont.ttf` matches Vite public/ convention |

#### 06-02: Design Spec Corrections

| Truth | Status | Evidence |
|-------|--------|----------|
| Commentary bar: --bg-mid 94% opacity background, blur(6px), 1px --accent 35% border, 50% opacity SHADOW tag border | VERIFIED | All three var() tokens present and wired to .commentary-subtitle-bar and .commentary-subtitle-tag |
| HP bar track: 1px --gold 20% opacity border AND Level 1 inset highlight | VERIFIED | `var(--gold-border)` + `inset 0 1px 0 rgba(255,255,255,0.04)` on .hp-track |
| Win dots: 8px circles, 6px gap, NO transition | VERIFIED | `width: 8px; height: 8px; gap: 6px;` confirmed. No `transition` property in .win-dot rule. |
| Low-HP pulse: opacity 1→0.65 (not 0.4) | VERIFIED | `@keyframes hp-pulse { 50% { opacity: 0.65; } }` — old 0.4 value absent |
| HP bar fill: 100ms linear (not 90ms) | VERIFIED | `transition: width 100ms linear` on .hp-fill |
| Round-flash: scale(0.9) start, ~2010ms, ease-out-quart | VERIFIED | `0% { transform: scale(0.9); }` in @keyframes round-flash; `animation: round-flash 2.01s cubic-bezier(0.25, 1, 0.5, 1) both` on .round-flash |
| KO slam: scale(0.95) midpoint (not 0.94) | VERIFIED | `50% { opacity: 1; transform: scale(0.95) translateY(0); }` in @keyframes ko-slam |
| All opacity-variant magic numbers replaced by var(--token) references | VERIFIED | Zero raw `oklch(.../ 0.18)` expressions remain in rule bodies. All 7 tokens defined in :root. Rule bodies use var() exclusively for the 8 formerly-inline expressions. |
| match-stats border, separator, and footer use --gold-border, --gold-sep, --gold-footer-rule tokens | VERIFIED | .match-stats → `var(--gold-border)`, .match-stats-sep → `var(--gold-sep)`, .match-stats-footer → `var(--gold-footer-rule)` |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `overlay/public/fonts/Achafont.ttf` | TrueType font binary, non-empty | VERIFIED | 58 KB, confirmed TrueType by `file` command |
| `overlay/public/fonts/Achafout.ttf` | TrueType font binary (companion), non-empty | VERIFIED | 116 KB, confirmed TrueType by `file` command |
| `overlay/src/index.css` (@font-face) | @font-face at line 1 with correct src/weight/display | VERIFIED | Lines 1–7, all required properties present |
| `overlay/src/index.css` (opacity tokens) | 7 new :root tokens (--gold-border through --accent-p2-bright) | VERIFIED | Lines 21–28, all 7 tokens defined |
| `overlay/src/index.css` (tokenized rule bodies) | var() references instead of inline oklch() opacity | VERIFIED | 8 rule-body replacements confirmed; no residual 0.18 expressions |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `overlay/src/index.css @font-face` | `overlay/public/fonts/Achafont.ttf` | `url('/fonts/Achafont.ttf') format('truetype')` | VERIFIED | Pattern `url('/fonts/Achafont.ttf')` found at line 3 |
| `.round-flash, .ko-text, .match-end-title, .waiting-title, .waiting-vs` | `@font-face { font-family: 'Achafont' }` | `font-family: 'Achafont', Inter, sans-serif` | VERIFIED | 5 call sites confirmed at lines 308, 344, 355, 508, 590 |
| `:root --gold-border` | `.hp-track border` and `.match-stats border` | `var(--gold-border)` | VERIFIED | 2 occurrences of `var(--gold-border)` in rule bodies (lines 258, 374) |
| `@keyframes round-flash 0% stop` | DESIGN.md spec: scale(0.9) | CSS keyframe at 0% stop | VERIFIED | `0% { opacity: 0; transform: scale(0.9); }` at line 808 |
| `@keyframes ko-slam 50% stop` | DESIGN.md spec: scale(0.95) | CSS keyframe at 50% stop | VERIFIED | `50% { opacity: 1; transform: scale(0.95) translateY(0); }` at line 815 |
| `:root --accent-p2-bright` | `.match-stat-value.p2` | `color: var(--accent-p2-bright)` | VERIFIED | Line 420 |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase modifies static CSS and binary font files only. There are no dynamic data sources to trace.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — CSS and font files are static assets; no runnable entry point to check without starting the Vite dev server.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OVERLAY-01 | 06-01-PLAN.md | Achafont restored via @font-face from overlay/public/fonts/Achafont.ttf | SATISFIED | Font binary present (58KB TrueType), @font-face at line 1, 5 call sites unchanged |
| OVERLAY-02 | 06-02-PLAN.md | Commentary bar matches DESIGN.md exactly: --bg-mid 94% opacity, blur(6px), 1px --accent 35% border, SHADOW tag style, blinking cursor | SATISFIED | All token references and animation confirmed in CSS |
| OVERLAY-03 | 06-02-PLAN.md | HP bar track has 1px --gold border per DESIGN.md; HUD structural elements use Level 1 elevation | SATISFIED | var(--gold-border) at 0.20 opacity + inset highlight on .hp-track and .match-stats |
| OVERLAY-04 | 06-02-PLAN.md | All remaining DESIGN.md gaps closed: win dots snap, HP direction, low-HP pulse, button states | SATISFIED (partially) | Win dots, HP timing, pulse floor, round-flash, KO slam all corrected. Visual verification of button hover/active states and HP P2 direction requires human check per DESIGN.md scope. |

**Orphaned requirements check:** REQUIREMENTS.md maps OVERLAY-01, OVERLAY-02, OVERLAY-03, OVERLAY-04 to Phase 6. All four are claimed by the two plans. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `overlay/src/index.css` | 648 | `backdrop-filter: blur(8px)` — different from commentary bar | Info | This is the `.settings-panel` component, NOT the commentary bar. The plan explicitly notes it must remain untouched. No impact on spec compliance. |
| `overlay/src/index.css` | Various (214, 257, 290, etc.) | Raw `oklch()` opacity expressions in rule bodies outside :root | Warning | The plan's tokenization policy covers only the 8 specific D-01/D-03 deviations identified in the audit. Many other rule bodies (latency banner, settings panel, etc.) still use inline oklch(). These were out of scope for this phase's audit — not regressions. However, the PLAN truth "All opacity-variant magic numbers in rule bodies are replaced by named var(--token) references" as written could be read broadly. The 8 targeted expressions were replaced; the broader stylesheet still has inline oklch() in non-audited rules. |

**Anti-pattern classification on the broad "no raw oklch in rule bodies" truth:** The plan's Task 1 specifically lists 11 targeted edits (CSS-01 through CSS-18, minus CSS-17 which was plan-01). The broader stylesheet has many other oklch() opacity expressions in components that were not part of the audit. The PLAN truth uses the phrase "All opacity-variant magic numbers in rule bodies" — but the PLAN's own task list only covers 11 targeted replacements, not all oklch() expressions site-wide. Interpreting the truth against the plan's actual task scope: VERIFIED for the 11 targeted locations.

---

### Human Verification Required

#### 1. Visual Overlay Fidelity Check (ROADMAP SC4)

**Test:** Start the dev server (`cd overlay && npm run dev`), open the overlay URL in a browser, connect a live match or simulate match state via DevTools, then compare each element against DESIGN.md:

- Round countdown: 3/2/1/FIGHT! should render in Achafont (display typeface), visually distinct from Inter labels
- KO text: Achafont, scales from large to settled with one overshoot
- Commentary bar: semi-transparent dark panel with subtle crimson border, blurred background, SHADOW tag with crimson border, blinking block cursor
- HP tracks: thin gold border visible (subtle, 20% opacity), slight top-edge highlight
- Win dots: snap to filled instantly when a round ends — no fade transition
- Round flash animation: pops from 90% scale, holds, fades — easing feels snappy not elastic
- No 404 in browser console for /fonts/Achafont.ttf

**Expected:** All elements match DESIGN.md spec with no residual visual gaps
**Why human:** Perceptual rendering quality, font display fidelity, animation feel, and backdrop blur appearance cannot be confirmed by CSS grep alone. ROADMAP SC4 is explicitly a visual "no visible gap" criterion.

---

### Gaps Summary

No programmatic blockers found. All four requirements (OVERLAY-01 through OVERLAY-04) are implemented in the codebase with correct values. The single outstanding item is ROADMAP SC4's visual confirmation criterion — this is routed to human verification per the phase plan's own checkpoint task (Task 3 of 06-02-PLAN.md). The SUMMARY records that checkpoint as "APPROVED (Playwright automated verification)," but independent visual confirmation by a human reviewer against the DESIGN.md spec is the proper gate for this criterion.

---

_Verified: 2026-05-09_
_Verifier: Claude (gsd-verifier)_
