from __future__ import annotations
import random
import string
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket
    from protocol import MsgPoseFrame


@dataclass
class PlayerSlot:
    ws: "WebSocket | None" = None
    latest_pose: "MsgPoseFrame | None" = None
    reference_velocity: float | None = None
    connected: bool = False
    rtt_ms: float = 0.0


@dataclass
class RoomState:
    code: str
    players: dict[int, PlayerSlot] = field(default_factory=lambda: {1: PlayerSlot(), 2: PlayerSlot()})
    created_at: float = field(default_factory=time.time)
    spectators: set = field(default_factory=set)


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, RoomState] = {}

    def create_room(self) -> str:
        while True:
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if code not in self._rooms:
                break
        self._rooms[code] = RoomState(code=code)
        return code

    def get_room(self, code: str) -> RoomState | None:
        return self._rooms.get(code)

    def remove_room(self, code: str) -> None:
        self._rooms.pop(code, None)

    def list_rooms(self) -> list[str]:
        return list(self._rooms.keys())
