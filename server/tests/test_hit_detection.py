"""Hit detection: synthetic poses that should and should not trigger hits."""
from __future__ import annotations
import os
os.environ.setdefault("TUNNEL", "false")

from collections import deque
from protocol import MsgPoseFrame, PoseKeypoint
from hit_detection import (
    detect_punch, detect_kick,
    WRIST_LEFT, ANKLE_LEFT, LEFT_HIP, RIGHT_HIP,
    PUNCH_THRESHOLD, KICK_THRESHOLD, Region,
)


def kp(x=0.0, y=0.0, z=0.0) -> PoseKeypoint:
    return PoseKeypoint(x=x, y=y, z=z, visibility=1.0)


def make_frame(overrides: dict | None = None) -> MsgPoseFrame:
    pts = [kp()] * 33
    pts = list(pts)
    pts[LEFT_HIP]  = kp(x=-0.1)
    pts[RIGHT_HIP] = kp(x= 0.1)
    if overrides:
        for idx, point in overrides.items():
            pts[idx] = point
    return MsgPoseFrame(type="pose_frame", timestamp=0.0, keypoints=pts)


def fast_punch_deque(end_x=0.0, end_y=0.65) -> deque:
    """Wrist travels 2m in 2 frames → ~30 m/s, well above PUNCH_THRESHOLD."""
    return deque([
        make_frame({WRIST_LEFT: kp(x=-2.0, y=end_y)}),
        make_frame({WRIST_LEFT: kp(x=-1.0, y=end_y)}),
        make_frame({WRIST_LEFT: kp(x=end_x, y=end_y)}),
    ])


def static_deque() -> deque:
    f = make_frame(None)
    return deque([f, f, f])


# --- punch -------------------------------------------------------------------

def test_punch_registers_in_head_zone():
    result = detect_punch(fast_punch_deque(end_x=0.0, end_y=0.65), static_deque())
    assert result is not None
    assert result.region == Region.HEAD_FACE
    assert result.velocity > PUNCH_THRESHOLD


def test_punch_registers_in_torso_zone():
    result = detect_punch(fast_punch_deque(end_x=0.0, end_y=0.30), static_deque())
    assert result is not None
    assert result.region == Region.TORSO_UPPER


def test_punch_miss_wrist_far_from_body():
    result = detect_punch(fast_punch_deque(end_x=5.0, end_y=5.0), static_deque())
    assert result is None


def test_no_punch_below_velocity_threshold():
    slow = deque([
        make_frame({WRIST_LEFT: kp(x=0.00, y=0.65)}),
        make_frame({WRIST_LEFT: kp(x=0.01, y=0.65)}),
        make_frame({WRIST_LEFT: kp(x=0.02, y=0.65)}),
    ])
    assert detect_punch(slow, static_deque()) is None


def test_punch_empty_deques_return_none():
    assert detect_punch(deque(), deque()) is None


def test_punch_velocity_above_threshold_on_hit():
    result = detect_punch(fast_punch_deque(end_x=0.0, end_y=0.65), static_deque())
    assert result is not None
    assert result.velocity >= PUNCH_THRESHOLD


# --- kick --------------------------------------------------------------------

def test_kick_registers_in_shin_zone():
    attacker = deque([
        make_frame({ANKLE_LEFT: kp(x=-2.12, y=-0.48)}),
        make_frame({ANKLE_LEFT: kp(x=-1.12, y=-0.48)}),
        make_frame({ANKLE_LEFT: kp(x=-0.12, y=-0.48)}),
    ])
    result = detect_kick(attacker, static_deque())
    assert result is not None
    assert result.velocity > KICK_THRESHOLD


def test_kick_miss_ankle_far_away():
    attacker = deque([
        make_frame({ANKLE_LEFT: kp(x=-10.0, y=-0.48)}),
        make_frame({ANKLE_LEFT: kp(x=-9.0,  y=-0.48)}),
        make_frame({ANKLE_LEFT: kp(x=-8.0,  y=-0.48)}),
    ])
    assert detect_kick(attacker, static_deque()) is None


def test_kick_empty_deques_return_none():
    assert detect_kick(deque(), deque()) is None


def test_no_kick_slow_ankle():
    slow = deque([
        make_frame({ANKLE_LEFT: kp(x=-0.12, y=-0.00)}),
        make_frame({ANKLE_LEFT: kp(x=-0.12, y=-0.01)}),
        make_frame({ANKLE_LEFT: kp(x=-0.12, y=-0.02)}),
    ])
    assert detect_kick(slow, static_deque()) is None
