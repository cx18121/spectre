use std::collections::VecDeque;
use plugin_trait::{PoseFrame, BodyRegion};

pub struct HitResult {
    pub region: BodyRegion,
    pub velocity: f64,
    pub position: (f64, f64),
}

pub fn detect_punch(
    _attacker_frames: &VecDeque<PoseFrame>,
    _defender_frames: &VecDeque<PoseFrame>,
    _ref_velocity: Option<f64>,
) -> Option<HitResult> {
    todo!("implement in Task 2")
}

pub fn detect_kick(
    _attacker_frames: &VecDeque<PoseFrame>,
    _defender_frames: &VecDeque<PoseFrame>,
    _ref_velocity: Option<f64>,
) -> Option<HitResult> {
    todo!("implement in Task 2")
}
