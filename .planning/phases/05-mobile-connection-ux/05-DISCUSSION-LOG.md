# Phase 5: Mobile Connection UX — Discussion Log

**Date:** 2026-05-09
**Facilitator:** Claude Code (gsd-discuss-phase)

---

## Areas Discussed

### 1. Fast-join screen content

**Q: What should the fast-join screen show besides the Connect button?**
- Options: Room code + player number only / Room code + player number + game type / Player number only (big)
- **Selected:** Room code + player number + game type

**Q: To show game type, the Rust room page needs to add ?game= to QR URLs. Acceptable?**
- Options: Yes, add ?game= to QR URLs / No, skip game type for now
- **Selected:** Yes, add ?game= to QR URLs

**Q: What should the Connect button say?**
- Options: Connect / Join as Player 1/2
- **Selected (freeform):** "Join game"

---

### 2. Partial prefill handling

**Q: When ?server= and ?room= are present but ?slot= is absent (landing page join), what should the screen show?**
- Options: Full form with server+room prefilled / Fast-join without slot
- **Selected:** Full form with server+room prefilled (Recommended)

**Q: Should the server URL field be hidden or pre-filled and editable?**
- Options: Hidden / Pre-filled and editable
- **Selected:** Hidden (Recommended)

---

### 3. "Enter manually" behavior

**Q: When a player taps "Enter manually", what should happen?**
- Options: In-place expand / Replace the view
- **Selected:** In-place expand (Recommended)

**Q: After expanding, can the player collapse back to fast-join?**
- Options: No — one-way / Yes — show collapse/back link
- **Selected:** No — one-way (Recommended)

**Q: Where should "Enter manually" appear?**
- User indicated button placement details don't matter — left to Claude's discretion.

---

### 4. Error message UX

**Q: Improve copy only, or add retry buttons per error type?**
- Options: Better copy only / Retry buttons per error
- **Selected:** Retry buttons per error (server-unreachable gets a Retry button; room-not-found and slot-taken get improved copy only)

---

## Claude's Discretion Items

- Exact placement of "Enter manually" link
- Animation/transition when expanding to full form
- Visual styling of fast-join screen (DESIGN.md tokens apply)
- Room code and player number display formatting

## Deferred Ideas

- Slot pre-selection on landing page join flow
- "Back to fast-join" collapse after "Enter manually"
