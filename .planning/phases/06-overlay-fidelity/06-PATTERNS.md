# Phase 6: Overlay Fidelity - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 5 (4 modified, 1 created directory)
**Analogs found:** 4 / 5 (font directory has no analog — new artifact)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `overlay/src/index.css` | stylesheet / token registry | transform (CSS audit + tokenization) | itself (current file is the target) | self |
| `overlay/src/components/HudLayer.tsx` | component | request-response (props in, JSX out) | itself — no structural changes needed | self |
| `overlay/src/components/RoundOverlay.tsx` | component | event-driven (timers, SFX, state) | itself — no structural changes needed | self |
| `overlay/src/components/CommentarySubtitle.tsx` | component | request-response (props in, JSX out) | itself — no structural changes needed | self |
| `overlay/public/fonts/Achafont.ttf` | static asset | file-I/O (git recovery + place) | `overlay/public/sfx/` (static asset directory) | partial |

**Note:** All Phase 6 targets are modifications to existing files, not new files. Pattern extraction
focuses on (a) the current file state as the baseline and (b) what the spec requires as the delta.

---

## Pattern Assignments

### `overlay/src/index.css` (stylesheet, token registry)

**Analog:** itself — Phase 6 audits and corrects this file in place.

**Current `:root` token block** (lines 1-20):
```css
:root {
  --bg-deep:      oklch(7% 0.008 22);
  --bg-mid:       oklch(11% 0.009 22);
  --bg-surface:   oklch(17% 0.01 22);
  --accent:       oklch(44% 0.22 22);
  --accent-bright: oklch(60% 0.25 22);
  --accent-p2:    oklch(50% 0.18 250);
  --gold:         oklch(78% 0.11 85);
  --text-primary: oklch(95% 0.008 85);
  --text-secondary: oklch(65% 0.008 85);
  --text-dim:     oklch(38% 0.006 85);

  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--text-primary);
  background: var(--bg-deep);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**Token addition pattern — D-01 / D-02 / D-03:**
New opacity-variant tokens must be added to `:root` as explicit named properties using OKLCH relative
color syntax. Token names are semantic (what it's used for), not descriptive (what it encodes).
Follow the existing alignment/grouping style:
```css
:root {
  /* ... existing palette tokens ... */

  /* opacity-variant tokens (D-01) */
  --gold-border:            oklch(from var(--gold) l c h / 0.20);   /* Level 1 structural border */
  --gold-sep:               oklch(from var(--gold) l c h / 0.14);   /* match-stats vertical separator */
  --gold-footer-rule:       oklch(from var(--gold) l c h / 0.12);   /* match-stats footer border */
  --bg-commentary:          oklch(from var(--bg-mid) l c h / 0.94); /* commentary bar backdrop */
  --accent-commentary-border: oklch(from var(--accent) l c h / 0.35); /* commentary bar border */
  --accent-commentary-tag-border: oklch(from var(--accent) l c h / 0.50); /* SHADOW tag border */
  --accent-p2-bright:       oklch(62% 0.2 250);                     /* P2 hit flash — missing token */
}
```

**@font-face pattern (D-04) — add before `:root` or at top of `:root` block:**
```css
@font-face {
  font-family: 'Achafont';
  src: url('/fonts/Achafont.ttf') format('truetype');
  font-weight: 100 950;
  font-style: normal;
  font-display: swap;
}
```
The font is referenced as `'Achafont'` in 5 existing rules (`.round-flash`, `.ko-text`,
`.match-end-title`, `.waiting-title`, `.waiting-vs`). The `font-family` name in `@font-face`
must match exactly — no change to call sites needed.

**Deviations to fix — inline magic numbers to replace with tokens:**

| Location | Current value | Correct value | Token to use |
|---|---|---|---|
| `.hp-track` border (line 242) | `oklch(from var(--gold) l c h / 0.18)` | 0.20 opacity | `var(--gold-border)` |
| `.commentary-subtitle-bar` backdrop-filter (line 756) | `blur(8px)` | `blur(6px)` | literal corrected value |
| `.commentary-subtitle-bar` background (line 752) | `oklch(from var(--bg-mid) l c h / 0.94)` | same value, tokenized | `var(--bg-commentary)` |
| `.commentary-subtitle-bar` border (line 753) | `oklch(from var(--accent) l c h / 0.35)` | same value, tokenized | `var(--accent-commentary-border)` |
| `.commentary-subtitle-tag` border (line 766) | `oklch(from var(--accent) l c h / 0.5)` | same value, tokenized | `var(--accent-commentary-tag-border)` |
| `.match-stats` border (line 357) | `oklch(from var(--gold) l c h / 0.18)` | 0.20 opacity | `var(--gold-border)` |
| `.match-stats-sep` background (line 374) | `oklch(from var(--gold) l c h / 0.14)` | same value, tokenized | `var(--gold-sep)` |
| `.match-stats-footer` border-top (line 379) | `oklch(from var(--gold) l c h / 0.12)` | same value, tokenized | `var(--gold-footer-rule)` |

**Existing animation patterns to audit against DESIGN.md Motion spec (D-06, D-07):**

Current `@keyframes round-flash` (lines 789-793):
```css
@keyframes round-flash {
  0%        { opacity: 0; transform: scale(0.92); }
  12%, 80%  { opacity: 1; transform: scale(1); }
  100%      { opacity: 0; transform: scale(1.03); }
}
```
DESIGN.md spec: scale 0.9→1 over 160ms ease-out-quart, hold 1.5s, fade 350ms.
The animation on `.round-flash` uses `animation: round-flash 2s ease both` — timing and easing
need correction. Total duration should be ~2010ms (160ms in + 1500ms hold + 350ms out).
Scale start should be 0.9 (currently 0.92). Easing on the element property should be
`ease-out-quart` (equivalent: `cubic-bezier(0.25, 1, 0.5, 1)`).

Current `@keyframes ko-slam` (lines 795-800):
```css
@keyframes ko-slam {
  0%   { opacity: 0; transform: scale(2.2) translateY(-6px); }
  50%  { opacity: 1; transform: scale(0.94) translateY(0); }
  72%  { transform: scale(1.03); }
  100% { opacity: 1; transform: scale(1); }
}
```
DESIGN.md spec: scale 2.2→0.95→1 over 480ms `cubic-bezier(0.34,1.15,0.64,1)`.
Scale at midpoint should be 0.95 (currently 0.94). Duration on `.ko-text` is `0.5s` (currently
close but spec says 480ms). Easing `cubic-bezier(0.34, 1.15, 0.64, 1)` is already correct.

Current `@keyframes screen-shake` (lines 817-824) and usage (lines 826-828):
```css
@keyframes screen-shake {
  0%, 100% { transform: translate(0, 0); }
  15%       { transform: translate(-5px, 2px); }
  30%       { transform: translate(5px, -2px); }
  50%       { transform: translate(-3px, 2px); }
  70%       { transform: translate(3px, -1px); }
  85%       { transform: translate(-1px, 1px); }
}
.overlay-shell.shaking {
  animation: screen-shake 0.38s ease-out both;
}
```
DESIGN.md spec: 380ms, 5 keyframes, exponential decay, translate only. Current implementation
matches duration (0.38s = 380ms) and translate-only constraint. Keyframe count and decay
profile should be validated against spec. `ease-out` is acceptable approximation.

Current HP bar transition (line 248):
```css
.hp-fill {
  transition: width 90ms linear;
}
```
DESIGN.md spec: 100ms linear. Duration needs correction from 90ms to 100ms.

Current `.commentary-cursor` animation (line 782):
```css
.commentary-cursor {
  animation: commentary-blink 0.7s steps(2, jump-none) infinite;
}
```
DESIGN.md spec: `steps(2)` at 0.7s. The `jump-none` modifier on `steps()` controls which
endpoint is included — DESIGN.md says `step(2)` without qualifier. The corresponding
`@keyframes commentary-blink` (lines 812-815) uses explicit opacity values rather than
letting `steps()` snap between states. Verify the visual matches a 0.7s hard-blink block cursor.

---

### `overlay/src/components/HudLayer.tsx` (component, request-response)

**Analog:** itself — structure is correct. All changes in this phase are CSS-only (token corrections
in `index.css`). Component TSX does not need modification for Phase 6.

**Current win dot render pattern** (lines 25-33) — verify against DESIGN.md spec:
```tsx
function WinDots({ wins, maxWins, player }: { wins: number; maxWins: number; player: 1 | 2 }) {
  return (
    <div className="win-dots">
      {Array.from({ length: maxWins }).map((_, i) => (
        <div key={i} className={`win-dot${i < wins ? ` filled-p${player}` : ''}`} />
      ))}
    </div>
  )
}
```
DESIGN.md spec: 8px circle, gap 6px, no animation (snap to filled). Current CSS uses `7px`
circle and `5px` gap (lines 205-221) — both need correction in `index.css`.
Current `.win-dot` has `transition: background 180ms ease` — DESIGN.md says "no animation,
snap to filled". Remove the transition.

**Current HP fill class application** (lines 76-77):
```tsx
<div className={`hp-fill hp-fill-p1${p1Pct < 0.2 ? ' pulse' : ''}`} style={p1Style} />
```
DESIGN.md low-HP spec: pulse at <20% remaining (1→0.65→1, 700ms infinite).
Current `@keyframes hp-pulse` in CSS pulses to opacity 0.4 (not 0.65). Fix in `index.css`.
The 20% threshold in TSX is already correct.

---

### `overlay/src/components/RoundOverlay.tsx` (component, event-driven)

**Analog:** itself — structure is correct. All Phase 6 changes are CSS animation corrections.

**Round flash element pattern** (lines 131-133):
```tsx
{countdown && (
  <div key={countdown} className="round-flash">
    {countdown}
  </div>
)}
```
The `key` prop forces React to remount on each countdown step (3→2→1→FIGHT!), which
re-triggers the CSS animation on `.round-flash`. This is the correct pattern — do not change.
The animation timing fix (`round-flash` keyframes + duration) happens in `index.css` only.

**KO slam element** (line 147):
```tsx
<div className="ko-text">K.O.</div>
```
Animation applied via `.ko-text { animation: ko-slam 0.5s ... }`. Correction is to
`@keyframes ko-slam` scale midpoint (0.94 → 0.95) and duration if needed — CSS only.

---

### `overlay/src/components/CommentarySubtitle.tsx` (component, request-response)

**Analog:** itself — no structural changes needed. All Phase 6 changes are CSS corrections.

**Current render pattern** (lines 7-23):
```tsx
export function CommentarySubtitle({ commentary }: Props) {
  const visible = commentary.text.length > 0
  return (
    <div className={`commentary-subtitle${visible ? ' visible' : ''}`}>
      <div className="commentary-subtitle-bar">
        <span className="commentary-subtitle-tag">SHADOW</span>
        <span key={commentary.id} className={`commentary-subtitle-text${commentary.active ? ' active' : ''}`}>
          {commentary.text}
          {commentary.active && <span className="commentary-cursor">▍</span>}
        </span>
      </div>
    </div>
  )
}
```
CSS corrections needed (all in `index.css`):
- `.commentary-subtitle-bar` background: replace inline expression with `var(--bg-commentary)`
- `.commentary-subtitle-bar` border: replace inline expression with `var(--accent-commentary-border)`
- `.commentary-subtitle-bar` `backdrop-filter`: change `blur(8px)` to `blur(6px)`
- `.commentary-subtitle-tag` border: replace inline expression with `var(--accent-commentary-tag-border)`
- Verify cursor `steps(2, jump-none)` renders as hard two-state blink per spec

---

### `overlay/public/fonts/Achafont.ttf` (static asset, file-I/O)

**Analog:** `overlay/public/sfx/` directory (existing static asset directory pattern).

**Recovery command** (from CONTEXT.md canonical refs):
```bash
git show 4de2977:overlay/public/fonts/Achafont.ttf > overlay/public/fonts/Achafont.ttf
git show 4de2977:overlay/public/fonts/Achafout.ttf > overlay/public/fonts/Achafout.ttf
```
Both files exist in commit `4de2977` (confirmed: `overlay/public/fonts/Achafont.ttf` and
`overlay/public/fonts/Achafout.ttf`).

**Directory creation:** `overlay/public/fonts/` does not exist. Create it before writing files.

**`@font-face` integration:** After recovery, add declaration to `overlay/src/index.css` `:root`
preamble (before or immediately after the `:root {` open brace). Font-family name must be
`'Achafont'` — matches all 5 existing call sites exactly.

---

## Shared Patterns

### OKLCH relative color token pattern
**Source:** `overlay/src/index.css` lines 1-11 (existing `:root` palette)
**Apply to:** All new opacity-variant tokens in `:root`
```css
--token-name: oklch(from var(--base-token) l c h / <opacity>);
```
New tokens follow this exact syntax. Never use `rgba()` or `color-mix()` for opacity variants —
the codebase is OKLCH-only (D-01, D-02, D-03).

### CSS variable reference pattern
**Source:** `overlay/src/index.css` throughout (e.g., `var(--accent)`, `var(--gold)`)
**Apply to:** All rule bodies after tokenization
After adding tokens to `:root`, every inline `oklch(from var(...) l c h / X)` expression in rule
bodies is replaced with `var(--token-name)`. No raw opacity expressions left outside `:root`.

### Animation element rekey pattern
**Source:** `overlay/src/components/RoundOverlay.tsx` lines 131-133
**Apply to:** Any new animated display elements that need to replay on re-trigger
```tsx
<div key={uniqueKey} className="animated-class">
  {content}
</div>
```
Changing `key` forces React remount and CSS animation restart. This pattern is already used
for countdown steps and round-end flash. Do not break it when adjusting animation CSS.

### @font-face declaration pattern
**Source:** No existing example in overlay — pattern from DESIGN.md + web standard
**Apply to:** `overlay/src/index.css` font recovery task
```css
@font-face {
  font-family: 'FontName';
  src: url('/fonts/FontName.ttf') format('truetype');
  font-weight: 100 950;     /* variable weight range */
  font-style: normal;
  font-display: swap;       /* avoids FOIT; falls back to Inter during load */
}
```
The `font-display: swap` is critical — without it, text renders invisible until the font loads
(since the current fallback Inter already renders, swap is the correct choice).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `overlay/public/fonts/Achafont.ttf` | static asset | file-I/O | No font assets exist in codebase yet; recovery from git history is a novel operation with no precedent in current file tree |

---

## Deviation Summary (Planner Action List)

All deviations are between current `overlay/src/index.css` values and DESIGN.md spec:

| ID | Location in index.css | Current | Required | Action |
|---|---|---|---|---|
| CSS-01 | `.hp-track` border (line 242) | `/ 0.18` | `/ 0.20` | Add `--gold-border` token; replace expression |
| CSS-02 | `.commentary-subtitle-bar` backdrop-filter (line 756) | `blur(8px)` | `blur(6px)` | Correct literal value |
| CSS-03 | `.commentary-subtitle-bar` background (line 752) | inline expression | `var(--bg-commentary)` | Add token; replace expression |
| CSS-04 | `.commentary-subtitle-bar` border (line 753) | inline expression | `var(--accent-commentary-border)` | Add token; replace expression |
| CSS-05 | `.commentary-subtitle-tag` border (line 766) | inline expression | `var(--accent-commentary-tag-border)` | Add token; replace expression |
| CSS-06 | `.match-stats` border (line 357) | `/ 0.18` | `/ 0.20` | Use `var(--gold-border)` token |
| CSS-07 | `.match-stats-sep` background (line 374) | inline expression | `var(--gold-sep)` | Add token; replace expression |
| CSS-08 | `.match-stats-footer` border-top (line 379) | inline expression | `var(--gold-footer-rule)` | Add token; replace expression |
| CSS-09 | `.hp-fill` transition (line 248) | `90ms linear` | `100ms linear` | Correct duration |
| CSS-10 | `.win-dot` size (line 212) | `7px` | `8px` | Correct width and height |
| CSS-11 | `.win-dots` gap (line 208) | `5px` | `6px` | Correct gap |
| CSS-12 | `.win-dot` transition (line 215-216) | `transition: background 180ms ease, border-color 180ms ease` | remove (snap, no animation) | Delete transition property |
| CSS-13 | `@keyframes hp-pulse` opacity (line 260) | `opacity: 0.4` | `opacity: 0.65` | Correct low-HP pulse floor |
| CSS-14 | `@keyframes round-flash` scale start (line 790) | `scale(0.92)` | `scale(0.9)` | Correct scale |
| CSS-15 | `.round-flash` animation easing | `2s ease both` | ~2010ms, `cubic-bezier(0.25,1,0.5,1)` (ease-out-quart) | Correct duration and easing |
| CSS-16 | `@keyframes ko-slam` scale midpoint (line 797) | `scale(0.94)` | `scale(0.95)` | Correct scale |
| CSS-17 | `@font-face` | missing entirely | add declaration | New rule before/in `:root` |
| CSS-18 | `--accent-p2-bright` token | missing from `:root` | `oklch(62% 0.2 250)` | Add missing palette token (DESIGN.md line 19) |

---

## Metadata

**Analog search scope:** `overlay/src/` (all component and stylesheet files)
**Files scanned:** 16 source files + DESIGN.md + REQUIREMENTS.md
**Pattern extraction date:** 2026-05-09
