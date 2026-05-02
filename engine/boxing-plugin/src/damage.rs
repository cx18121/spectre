use plugin_trait::BodyRegion;

/// (base_min, base_max) damage per body region.
/// Source: server/damage.py lines 3-13.
fn base_damage(region: &BodyRegion) -> (u32, u32) {
    match region {
        BodyRegion::BlockHand    => (2,  4),
        BodyRegion::BlockForearm => (2,  4),
        BodyRegion::LegThigh     => (3,  5),
        BodyRegion::LegShin      => (3,  5),
        BodyRegion::TorsoLower   => (6,  9),
        BodyRegion::TorsoUpper   => (9,  13),
        BodyRegion::HeadFace     => (15, 20),
        BodyRegion::HeadChin     => (20, 25),
        BodyRegion::HeadThroat   => (20, 25),
    }
}

/// Compute integer damage from region, attacker limb velocity, and reference velocity.
/// Formula: t = min(1.0, vel / (2.0 * max(ref, 0.1)))
///          raw = base_min + (base_max - base_min) * t
///          result = round(raw).clamp(base_min, base_max)
/// Source: server/damage.py lines 16-22.
pub fn compute_damage(region: BodyRegion, limb_velocity: f64, reference_velocity: Option<f64>) -> u32 {
    let ref_v = reference_velocity.unwrap_or(3.0);
    let (base_min, base_max) = base_damage(&region);
    let t = (limb_velocity / (2.0 * f64::max(ref_v, 0.1))).min(1.0);
    let raw = base_min as f64 + (base_max - base_min) as f64 * t;
    (raw.round() as u32).clamp(base_min, base_max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use plugin_trait::BodyRegion;

    #[test]
    fn compute_damage_at_ref_vel_is_midpoint_head_face() {
        // t = 3.0 / (2.0 * 3.0) = 0.5; raw = 15 + 5*0.5 = 17.5; round = 18
        assert_eq!(compute_damage(BodyRegion::HeadFace, 3.0, Some(3.0)), 18);
    }

    #[test]
    fn compute_damage_zero_velocity_returns_base_min() {
        assert_eq!(compute_damage(BodyRegion::HeadChin, 0.0, Some(3.0)), 20);
    }

    #[test]
    fn compute_damage_double_ref_vel_returns_base_max() {
        // t = 6.0 / (2.0 * 3.0) = 1.0; result = base_max = 4
        assert_eq!(compute_damage(BodyRegion::BlockHand, 6.0, Some(3.0)), 4);
    }

    #[test]
    fn compute_damage_no_ref_vel_uses_fallback_3() {
        // ref=3.0, vel=1.5 → t=0.25; raw=6+3*0.25=6.75→7, clamp to [6,9]
        assert_eq!(compute_damage(BodyRegion::TorsoLower, 1.5, None), 7);
    }

    #[test]
    fn compute_damage_extreme_vel_clamped_to_base_max() {
        assert_eq!(compute_damage(BodyRegion::HeadThroat, 99.0, Some(3.0)), 25);
    }
}
