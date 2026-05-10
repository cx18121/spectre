# Spectre — Product Context

## Product Purpose

Spectre is a 1v1 real-time fighting game played with your body. Players hold their phones up, the camera tracks their punches and kicks via pose estimation, and silhouettes fight on a shared screen while a live AI commentator calls the action. Built for demos, parties, and anywhere two people want to physically compete.

## Users

- **Demo audience (primary)** — students, event attendees, bystanders watching the overlay on a laptop. They need to be wowed in the first 10 seconds. They decide whether to play next based on what they see.
- **Players (secondary)** — two people physically throwing punches at their phones. They are moving, sweating, not looking at the screen for more than a second at a time. UI must communicate their status instantly.
- **Host (tertiary)** — one person running the server and sharing room links before the fight starts. One-time setup moment. They need it to be fast and clear.

## Register

Product — the UI serves the game, not a brand or marketing goal.

## Tone

Intense but disciplined. Not chaotic, not flashy for its own sake. The aesthetic is a premium fighting game crossed with an ink painting — clean forms, maximum drama in the right moments. Every element earns its place. Restraint makes the explosive moments land harder.

## Anti-References

- Generic mobile game UI (shields, coin counters, XP bars, loot box aesthetics)
- Neon cyberpunk (RGB gradients, synthwave purples, glow on everything)
- Flat Material Design
- SaaS dashboard look
- Bubble letter or pixel game fonts
- Glassmorphism used decoratively

## Strategic Principles

1. The overlay is the product. It is what the room watches. Everything else serves it.
2. Players should never need to look at their phone for more than 1 second during a fight.
3. The spectator experience is what makes someone want to play next.
4. Physical drama in the room should be matched by visual drama on screen.
5. Clean wins. When in doubt, remove the element.

## Game Modes

Spectre runs two game modes that share the same aesthetic but operate in different emotional registers.

### Boxing

Register: combat. Players throw punches and kicks; HP depletes; rounds end in KO or decision. Copy uses fight vocabulary: KO, ROUND N -- P1 WINS, damage, hits. The dramatic peaks (KO text, countdown, hit flash) are designed to match the physicality of punching.

Tone guidance: intense, immediate, zero-latency feedback. Every hit should feel consequential. The HP bar is a clock and a threat.

### Dance

Register: performance. Players match pose targets scored beat by beat; scores accumulate from zero; rounds end when beats are exhausted. Copy uses scoreboard vocabulary: ROUND N -- P1 LEADS, TIED, final scores. No KO, no damage, no "WINS" in the fight sense.

Tone guidance: disciplined rhythm over chaotic aggression. The ghost skeleton is an invitation, not a challenge. The score gap between players should be readable at a glance -- numbers dominate, not colors or animations.

Shared aesthetic rules (both modes):
- Same OKLCH color system, same ink-black backgrounds, same Inter + Achafont type pairing.
- Achafont for dramatic display moments in both modes (round flash, match end headline).
- No neon, no RGB gradients, no glassmorphism -- the anti-references in this document apply equally.
- The overlay is the product in both modes. Physical action in the room drives what spectators see on screen.

Anti-references for dance specifically:
- Dance game show aesthetics (sparkles, bright pastels, star ratings)
- Music rhythm game chrome (note highways, multiplier counters, score combos with pop-up labels)
- Generic fitness app UI (progress rings, streak badges, calorie counters)
