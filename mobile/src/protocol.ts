// Mirror of shared/protocol.ts. Keep in sync if the canonical file changes.
// We duplicate rather than symlink so Vite can resolve the import without
// extra config and to avoid OS-specific symlink quirks on Windows.

export interface PoseKeypoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// ============================================================================
// Mobile -> Server
// ============================================================================

export interface MsgJoin {
  type: "join";
  room_code: string;
  player_slot: 1 | 2;
}

export interface MsgPoseFrame {
  type: "pose_frame";
  timestamp: number;
  keypoints: PoseKeypoint[];
}

export interface MsgCalibrationDone {
  type: "calibration_done";
  reference_velocity: number;
}

export interface MsgPing {
  type: "ping";
  t: number;
}

export interface MsgPong {
  type: "pong";
  t: number;
}

export type OutboundMobileMsg =
  | MsgJoin
  | MsgPoseFrame
  | MsgCalibrationDone
  | MsgPing
  | MsgPong;

// ============================================================================
// Server -> Mobile
// ============================================================================

export interface MsgJoined {
  type: "joined";
  room_code: string;
  player_slot: 1 | 2;
  opponent_connected: boolean;
}

export interface MsgPongFromServer {
  type: "pong";
  t: number;
}

export interface MsgPingFromServer {
  type: "ping";
  t: number;
}

export interface MsgCalibrationStart {
  type: "calibration_start";
}

export interface MsgMatchStart {
  type: "match_start";
}

export interface MsgYouWereHit {
  type: "you_were_hit";
  region: string;
  damage: number;
}

export interface MsgPlayerDisconnected {
  type: "player_disconnected";
  player: 1 | 2;
}

export interface MsgRoundStart {
  type: "round_start";
  round_number: number;
}

export interface MsgRoundEnd {
  type: "round_end";
  winner: 1 | 2 | null;
  final_hp: [number, number];
}

export interface MsgMatchEnd {
  type: "match_end";
  winner: 1 | 2;
}

export interface HitEvent {
  player: 1 | 2;
  region: string;
  damage: number;
  position: { x: number; y: number; z: number };
}

export interface MsgGameState {
  type: "game_state";
  tick: number;
  hp: [number, number];
  poses: [PoseKeypoint[], PoseKeypoint[]];
  recent_hits: HitEvent[];
  high_latency: boolean;
  remaining_time: number;
}

export interface MsgPoseUpdate {
  type: "pose_update";
  player: 1 | 2;
  keypoints: PoseKeypoint[];
}

export type InboundServerMsg =
  | MsgJoined
  | MsgPongFromServer
  | MsgPingFromServer
  | MsgCalibrationStart
  | MsgMatchStart
  | MsgYouWereHit
  | MsgPlayerDisconnected
  | MsgRoundStart
  | MsgRoundEnd
  | MsgMatchEnd
  | MsgGameState
  | MsgPoseUpdate;
