//! Boxing game plugin — implements the GamePlugin trait for the boxing game.
//! RED phase: tests written first, implementation will follow in GREEN phase.

mod hit_detection;
mod damage;
mod bot;

pub use bot::Difficulty;

// ---------------------------------------------------------------------------
// Unit tests (RED phase — will fail until implementation is added)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use plugin_trait::{TickContext, TickInfo, RoomView, SlotView};
    use std::collections::VecDeque;

    fn test_config() -> BoxingConfig {
        BoxingConfig {
            hp: 800,
            round_secs: 90.0,
            max_wins: 3,
            bot_difficulty: Difficulty::Normal,
        }
    }

    fn empty_tick_ctx() -> (VecDeque<plugin_trait::PoseFrame>, VecDeque<plugin_trait::PoseFrame>) {
        (VecDeque::new(), VecDeque::new())
    }

    #[test]
    fn fix01_ref_vel_survives_round_reset() {
        // FIX-01 regression: calibration persists through rematch
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        plugin.on_calibration_complete(0, 4.5, &mut *state);
        plugin.on_round_reset(&mut *state);
        let s = state.downcast_ref::<BoxingState>().unwrap();
        assert_eq!(s.ref_vel[0], 4.5, "FIX-01: ref_vel[0] must survive on_round_reset");
    }

    #[test]
    fn fix01_ref_vel_slot1_also_survives_reset() {
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        plugin.on_calibration_complete(0, 4.5, &mut *state);
        plugin.on_calibration_complete(1, 3.2, &mut *state);
        plugin.on_round_reset(&mut *state);
        let s = state.downcast_ref::<BoxingState>().unwrap();
        assert_eq!(s.ref_vel[0], 4.5, "ref_vel[0] must survive reset");
        assert_eq!(s.ref_vel[1], 3.2, "ref_vel[1] must survive reset");
    }

    #[test]
    fn d08_ref_vel_clamped_below_minimum() {
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        plugin.on_calibration_complete(0, 0.1, &mut *state);
        let s = state.downcast_ref::<BoxingState>().unwrap();
        assert_eq!(s.ref_vel[0], 0.5, "D-08: ref_vel below 0.5 must clamp to 0.5");
    }

    #[test]
    fn d08_ref_vel_clamped_above_maximum() {
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        plugin.on_calibration_complete(0, 20.0, &mut *state);
        let s = state.downcast_ref::<BoxingState>().unwrap();
        assert_eq!(s.ref_vel[0], 15.0, "D-08: ref_vel above 15.0 must clamp to 15.0");
    }

    #[test]
    fn on_round_reset_clears_hp_to_config_value() {
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        // Manually reduce HP
        state.downcast_mut::<BoxingState>().unwrap().hp[0] = 500;
        plugin.on_round_reset(&mut *state);
        let s = state.downcast_ref::<BoxingState>().unwrap();
        assert_eq!(s.hp[0], 800);
        assert_eq!(s.hp[1], 800);
    }

    #[test]
    fn on_round_reset_clears_cooldowns() {
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        state.downcast_mut::<BoxingState>().unwrap().last_hit_tick[0] = 100;
        plugin.on_round_reset(&mut *state);
        let s = state.downcast_ref::<BoxingState>().unwrap();
        assert_eq!(s.last_hit_tick[0], -999);
    }

    #[test]
    fn check_round_over_ko_player1() {
        let hp = [0u32, 800u32];
        let ev = check_round_over(&hp, 45.0).unwrap();
        match ev {
            plugin_trait::GameEvent::RoundOver { winner: Some(2) } => {}
            other => panic!("expected RoundOver{{winner:Some(2)}}, got {:?}", other),
        }
    }

    #[test]
    fn check_round_over_ko_player2() {
        let hp = [800u32, 0u32];
        let ev = check_round_over(&hp, 45.0).unwrap();
        match ev {
            plugin_trait::GameEvent::RoundOver { winner: Some(1) } => {}
            other => panic!("expected RoundOver{{winner:Some(1)}}, got {:?}", other),
        }
    }

    #[test]
    fn check_round_over_draw_equal_hp() {
        // BOX-08: equal HP at time expiry = draw
        let hp = [400u32, 400u32];
        let ev = check_round_over(&hp, 0.0).unwrap();
        match ev {
            plugin_trait::GameEvent::RoundOver { winner: None } => {}
            other => panic!("expected draw RoundOver{{winner:None}}, got {:?}", other),
        }
    }

    #[test]
    fn check_round_over_decision_by_hp() {
        let hp = [600u32, 400u32];
        let ev = check_round_over(&hp, 0.0).unwrap();
        match ev {
            plugin_trait::GameEvent::RoundOver { winner: Some(1) } => {}
            other => panic!("expected RoundOver{{winner:Some(1)}} for higher HP, got {:?}", other),
        }
    }

    #[test]
    fn object_safety_box_dyn_game_plugin() {
        // PLUG-05: Box<dyn GamePlugin + Send + Sync> must compile
        let plugin = BoxingPlugin::new(test_config());
        let _boxed: Box<dyn plugin_trait::GamePlugin + Send + Sync> = Box::new(plugin);
        // If this test compiles, Box<dyn GamePlugin + Send + Sync> is valid
    }

    #[test]
    fn on_tick_time_expired_returns_round_over() {
        let plugin = BoxingPlugin::new(test_config());
        let mut state = plugin.init_state();
        plugin.on_calibration_complete(0, 3.0, &mut *state);
        plugin.on_calibration_complete(1, 3.0, &mut *state);
        // Set HP to non-zero so KO doesn't fire
        {
            let s = state.downcast_mut::<BoxingState>().unwrap();
            s.hp = [700, 400]; // player 1 has more HP
        }
        let (frames0, frames1) = empty_tick_ctx();
        let ctx = TickContext {
            frames: [&frames0, &frames1],
            tick_info: TickInfo { tick: 5400, elapsed_secs: 90.0, remaining_secs: 0.0 },
            room: RoomView {
                slots: [
                    SlotView { connected: true, reference_velocity: Some(3.0) },
                    SlotView { connected: true, reference_velocity: Some(3.0) },
                ],
            },
        };
        let events = plugin.on_tick(&ctx, &mut *state);
        let round_over = events.iter().any(|e| matches!(e, plugin_trait::GameEvent::RoundOver { winner: Some(1) }));
        assert!(round_over, "expected RoundOver{{winner:Some(1)}} for p1 winning by HP");
    }
}
