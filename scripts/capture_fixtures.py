#!/usr/bin/env python3
"""Capture golden-file JSON fixtures from the live Python server.

Usage (Python server must be running on localhost:8000):
    python scripts/capture_fixtures.py

Writes fixture files to engine/engine-core/tests/fixtures/*.json
"""
import asyncio
import json
import time
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "engine" / "engine-core" / "tests" / "fixtures"

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    raise


async def capture():
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    base = "ws://localhost:8000"

    # ---- ping/pong ----
    async with websockets.connect(f"{base}/ws/player/TESTFIX") as ws:
        # Server sends MsgJoined on connect
        joined_raw = await ws.recv()
        (FIXTURES_DIR / "msg_joined.json").write_text(joined_raw)
        print(f"captured msg_joined: {joined_raw[:80]}")

        # Send ping, expect pong
        await ws.send(json.dumps({"type": "ping", "t": time.time()}))
        pong_raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        (FIXTURES_DIR / "msg_pong.json").write_text(pong_raw)
        print(f"captured msg_pong: {pong_raw[:80]}")

        # Write a synthetic ping fixture (inbound only, server doesn't emit pings to us here easily)
        ping_example = json.dumps({"type": "ping", "t": 1746172800.0})
        (FIXTURES_DIR / "msg_ping.json").write_text(ping_example)

        # Send a pose_frame
        pose_frame = {
            "type": "pose_frame",
            "timestamp": time.time(),
            "keypoints": [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99}] * 33
        }
        (FIXTURES_DIR / "msg_pose_frame.json").write_text(json.dumps(pose_frame))
        print("wrote msg_pose_frame (synthetic)")

    # ---- lobby_update via spectator ----
    async with websockets.connect(f"{base}/ws/spectator/TESTFIX") as ws:
        lobby_raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
        (FIXTURES_DIR / "msg_lobby_update.json").write_text(lobby_raw)
        print(f"captured msg_lobby_update: {lobby_raw[:80]}")

    # ---- synthetic remaining fixtures (no live server flow needed) ----
    synthetics = {
        "msg_calibration_done": {"type": "calibration_done", "reference_velocity": 4.5},
        "msg_calibration_start": {"type": "calibration_start"},
        "msg_match_start": {"type": "match_start"},
        "msg_match_end": {"type": "match_end", "winner": 1},
        "msg_you_were_hit": {"type": "you_were_hit", "region": "head_face", "damage": 60.0},
        "msg_player_disconnected": {"type": "player_disconnected", "player": 2},
        "msg_round_start": {"type": "round_start", "round_number": 1},
        "msg_round_end": {"type": "round_end", "winner": 1, "final_hp": [800, 0]},
        "msg_round_end_draw": {"type": "round_end", "winner": None, "final_hp": [400, 400]},
        "msg_rematch_start": {"type": "rematch_start"},
        "msg_game_state": {
            "type": "game_state", "tick": 42,
            "hp": [800, 800], "wins": [0, 0], "poses": [[], []],
            "recent_hits": [], "high_latency": False,
            "remaining_time": 88.3, "max_wins": 2
        },
        "msg_pose_update": {
            "type": "pose_update", "player": 1,
            "keypoints": [{"x": 0.1, "y": 0.2, "z": 0.0, "visibility": 0.95}]
        },
    }
    for name, data in synthetics.items():
        path = FIXTURES_DIR / f"{name}.json"
        if not path.exists():  # don't overwrite live captures
            path.write_text(json.dumps(data))
            print(f"wrote synthetic {name}")

    print(f"\nFixtures written to {FIXTURES_DIR}")
    print("Run `cargo test --test protocol_roundtrip` to verify roundtrips.")


if __name__ == "__main__":
    asyncio.run(capture())
