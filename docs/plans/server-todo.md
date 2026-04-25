# Server TODO: Calibration, Pose Math, Hit Detection

This file captures work that needs to be absorbed by `server.md` (Person A's plan) but was originally surfaced from the mobile-side calibration design. The mobile plan was deliberately kept simple -- mobile drives only the calibration UX and computes `reference_velocity`. **All meter-scale geometry (bone lengths, body basis, hitbox scaling, cross-player hit resolution) is the server's responsibility.**

The shared protocol in `project.md` / `shared/protocol.ts` is **locked**. None of the items below require schema changes, with one small optional exception called out at the end.

---

## 1. Per-frame derived geometry (in pose.py or game_loop.py)

Every `pose_frame` from a player carries 33 raw `worldLandmarks` in MediaPipe's convention:

- `+X` = subject's right
- `+Y` = down
- `+Z` = away from camera
- units: meters, relative to subject's hip midpoint

Each game-loop tick, derive the following from the latest `pose_frame` per player. None of these need to be persisted on the protocol -- they are computed live each tick.

```python
def hip_center(kp):
    # midpoint of left_hip (idx 23) and right_hip (idx 24)
    return midpoint(kp[23], kp[24])

def body_basis(kp):
    # orthonormal frame anchored on the player's torso
    right_raw = normalize(kp[12] - kp[11])           # right_shoulder - left_shoulder
    up_approx = normalize(midpoint(kp[11], kp[12]) - midpoint(kp[23], kp[24]))
    forward   = normalize(cross(right_raw, up_approx))
    up        = normalize(cross(forward, right_raw))
    return Basis(right=right_raw, up=up, forward=forward)

def to_body_local(point, hip, basis):
    # express any 3D point in this player's body-local frame
    rel = point - hip
    return Vec3(
        x=dot(rel, basis.right),
        y=dot(rel, basis.up),
        z=dot(rel, basis.forward),
    )
```

These are used by hit detection (Section 3) and skeleton derivation (Section 2).

---

## 2. Calibration window: derive skeleton metrics on the server

The server already buffers each player's pose frames per tick. Extend that to a calibration window that closes when `calibration_done` arrives. The mobile client sends three small stage markers during calibration so the server can slice its buffer cleanly:

```
mobile -> server:
  { type: 'calibration_stage', stage: 'tpose' }     (start)
  { type: 'calibration_stage', stage: 'punches' }   (after stable T-pose)
  { type: 'calibration_stage', stage: 'neutral' }   (after 3 punches)
  { type: 'calibration_done', reference_velocity: <number> }   (after 2s stillness)
```

> **Optional protocol addition.** `calibration_stage` is a new message type. Two implementation options, decide with Person B:
> - Add it to `shared/protocol.ts` (small, additive, zero risk).
> - Skip it entirely and slice the buffer server-side using stillness + velocity heuristics (T-pose = 30 stable frames, punches = next ~150 frames containing 3 velocity peaks, neutral = trailing stillness window). Slightly less reliable but no schema touch.
>
> Recommended: add the message. It's three lines of pydantic.

### Per-stage server math

```python
@dataclass
class SkeletonMetrics:
    shoulder_width: float
    hip_width: float
    torso_height: float
    upper_arm_length: float
    forearm_length: float
    thigh_length: float
    shin_length: float

# T-pose window: average bone lengths over the buffered frames where:
#   - shoulders, elbows, wrists, hips visibility > 0.5
#   - keypoint movement < 0.05 m frame-to-frame (still)
# If fewer than 10 valid frames, log a warning and fall back to median of any
# frames available -- do not refuse calibration.

def compute_skeleton_from_tpose(frames: list[PoseFrame]) -> SkeletonMetrics:
    valid = [f for f in frames if all_required_visible(f.keypoints, thr=0.5)]
    return SkeletonMetrics(
        shoulder_width    = mean(distance(f.keypoints[11], f.keypoints[12]) for f in valid),
        hip_width         = mean(distance(f.keypoints[23], f.keypoints[24]) for f in valid),
        torso_height      = mean(distance(midpoint(f.keypoints[11], f.keypoints[12]),
                                          midpoint(f.keypoints[23], f.keypoints[24])) for f in valid),
        upper_arm_length  = mean(avg_lr(f.keypoints, 11, 13, 12, 14) for f in valid),
        forearm_length    = mean(avg_lr(f.keypoints, 13, 15, 14, 16) for f in valid),
        thigh_length      = mean(avg_lr(f.keypoints, 23, 25, 24, 26) for f in valid),
        shin_length       = mean(avg_lr(f.keypoints, 25, 27, 26, 28) for f in valid),
    )

# Punch window: cross-validate arm bone lengths
# At each detected wrist-velocity peak (>1.5 m/s then back below 0.8 m/s),
# capture upper_arm and forearm distances for the punching arm.
# If |tpose_forearm - peak_forearm| / tpose_forearm > 0.20:
#     skeleton.upper_arm_length = mean of peak measurements
#     skeleton.forearm_length   = mean of peak measurements
# Reason: T-pose arm metrics are sometimes corrupted by camera angle; arm fully
# extended at peak punch is the cleanest possible bone-length sample.

# Neutral window: capture the player's match-time body basis
# Average computeBasis() across the 60-frame stillness window; store on PlayerSlot.
# Also overwrite skeleton.thigh_length and skeleton.shin_length with the
# neutral-stance averages -- legs in fight stance are what the match actually uses.

# Persist on PlayerSlot:
@dataclass
class PlayerSlot:
    # ...existing fields...
    reference_velocity: float | None
    skeleton: SkeletonMetrics | None
    basis_at_neutral: Basis | None
```

These derived fields never go on the protocol -- they live only in server memory, scoped per match.

---

## 3. Hit detection: stop using cross-player world coordinates

**Critical.** The current `hit_detection.py` design implies attacker's wrist is subtracted from defender's hip center as if they share a global frame. They don't. Two phones, two cameras, two independent origins. There is no shared world space.

Two viable replacements -- pick one for the hackathon:

### Option A (recommended for hackathon): body-local pattern matching

Each player is evaluated independently in their own body-local frame. The "fight" is logical, not physical.

```python
def attack_intent(player_pose, basis, hip, skeleton, ref_velocity) -> AttackIntent | None:
    # Returns (region_targeted, strength) or None.
    # Operates ONLY on this player's own body in their own local frame.
    wrist_local = to_body_local(kp[16], hip, basis)   # right wrist in own frame
    wrist_vel   = velocity_in_local_frame(...)
    # A "high punch" intent: wrist is above shoulder height in local Y AND extended
    # forward (local Z > 0.4 * (upper_arm + forearm)) AND velocity > threshold.
    # A "low kick" intent: ankle local Y is high (kick raised) AND velocity > threshold.
    # Map intent to region:
    #   high punch  -> targeting head_face / head_chin
    #   mid punch   -> targeting torso_upper / torso_lower
    #   low kick    -> targeting leg_thigh / leg_shin
    ...

def defense_state(player_pose, basis, hip, skeleton) -> set[Region]:
    # Returns regions currently defended by this player (hands up = head defended,
    # arms tight to torso = torso defended, etc).
    # Operates ONLY on own body.
    ...

def resolve(attacker, defender) -> Hit | None:
    intent = attack_intent(attacker)
    if intent is None:
        return None
    if intent.region in defense_state(defender):
        # Map to block_hand / block_forearm region for damage-table lookup
        return Hit(region=blocked_region(intent.region), velocity=intent.strength, ...)
    return Hit(region=intent.region, velocity=intent.strength, ...)
```

This sidesteps the coordinate-frame problem entirely and is robust across different camera setups. The damage table in `damage.py` already contains the regions (block_hand, block_forearm, head_face, etc.) needed for this model.

### Option B: assumed shared frame

Declare by fiat that both players are facing each other at a fixed virtual distance and orientation. For attacker P1 hitting defender P2:

```
attacker_wrist_in_defender_frame = mirror_z(to_body_local(p1_wrist, p1_hip, p1_basis))
```

Because if both players face each other, P1's local +Z (forward, toward opponent) is P2's local -Z. Use that mirrored wrist position to do capsule-collision testing against P2's body-local hitboxes.

This pretends to be physical but has the same answer as Option A 90% of the time. Only worth it if you specifically want capsule-collision visuals.

---

## 4. Smoothing -- sender-side only

Mobile applies EMA smoothing per-landmark (alpha=0.5) before sending. The server should treat incoming `pose_frame` data as ground truth and not re-smooth.

If MediaPipe drops below 30fps on a slow phone, the server still receives every frame mobile manages to send. All velocity math must use **real frame timestamp deltas**, not assume `1/30`. (`pose.py`'s `moving_average_velocity` currently divides by `2 * (1/30)` -- replace with `(t[2] - t[0])` from the buffered timestamps.)

---

## 5. Game-state broadcast remains unchanged

The overlay reads `game_state` and renders raw keypoints + HP + recent hits. Nothing in this TODO changes the overlay-bound shape. Spectators continue to receive `game_state` exactly as defined in `shared/protocol.ts`.

---

## Acceptance for the server side of calibration

A calibration round is "done correctly" when, after `calibration_done` arrives:

- `PlayerSlot.reference_velocity` is set from the message.
- `PlayerSlot.skeleton` is populated with all 7 bone-length fields, all in the range 0.1m..0.6m for an adult (loose sanity check).
- `PlayerSlot.basis_at_neutral` is populated and orthonormal (each axis length ~1.0, dot products between any two ~0).
- The match-start broadcast goes out only after BOTH players' slots are populated this way.

If any of the above fails for a player, log it and fall back to defaults (`skeleton = average adult metrics`, `basis = identity`, `reference_velocity = 3.0`). Don't block match start -- a degraded match is better than a stuck calibration screen at a hackathon.
