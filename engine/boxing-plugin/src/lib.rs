mod hit_detection;
mod damage;
mod bot;

pub use hit_detection::{detect_punch, detect_kick, HitResult};
pub use damage::compute_damage;
pub use bot::Difficulty;

/// 12-tick hit cooldown constant (200ms at 60Hz).
/// Defined here so lib.rs is the canonical constant location.
/// Used by Plan 03 Task 2 in the full BoxingPlugin on_tick logic.
pub const HIT_COOLDOWN_TICKS: i64 = 12;
