"""Damage formula edge cases."""
from __future__ import annotations
import os
os.environ.setdefault("TUNNEL", "false")

from damage import compute_damage, BASE_DAMAGE


def test_zero_velocity_returns_min():
    for region, (lo, _) in BASE_DAMAGE.items():
        d = compute_damage(region, 0.0, 3.0)
        assert d == lo, f"{region}: expected floor {lo}, got {d}"


def test_very_high_velocity_caps_at_max():
    for region, (_, hi) in BASE_DAMAGE.items():
        d = compute_damage(region, 1000.0, 3.0)
        assert d == hi, f"{region}: expected cap {hi}, got {d}"


def test_each_region_in_range_at_reference():
    for region, (lo, hi) in BASE_DAMAGE.items():
        d = compute_damage(region, 3.0, 3.0)
        assert lo <= d <= hi, f"{region}: {d} not in [{lo}, {hi}]"


def test_none_reference_uses_default():
    d_none = compute_damage("head_face", 3.0, None)
    d_explicit = compute_damage("head_face", 3.0, 3.0)
    assert d_none == d_explicit


def test_block_region_low_damage():
    d = compute_damage("block_hand", 3.0, 3.0)
    assert d <= 4


def test_head_throat_high_damage():
    d = compute_damage("head_throat", 3.0, 3.0)
    assert d >= 20


def test_above_reference_scales_up():
    d_ref = compute_damage("torso_upper", 3.0, 3.0)
    d_fast = compute_damage("torso_upper", 6.0, 3.0)
    assert d_fast >= d_ref


def test_below_reference_scales_down():
    d_ref = compute_damage("torso_upper", 3.0, 3.0)
    d_slow = compute_damage("torso_upper", 1.0, 3.0)
    assert d_slow <= d_ref
