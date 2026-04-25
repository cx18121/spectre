from __future__ import annotations
import time


def print_startup_info(public_url: str, room_code: str) -> None:
    # Cache-buster so phones don't reuse a stale index.html after a rebuild.
    cb = int(time.time())
    p1_url = f"{public_url}/mobile?server={public_url}&room={room_code}&slot=1&v={cb}"
    p2_url = f"{public_url}/mobile?server={public_url}&room={room_code}&slot=2&v={cb}"
    overlay_url = f"{public_url}/overlay?server={public_url}&room={room_code}&v={cb}"

    print()
    print("=== SHADOW FIGHT SERVER READY ===")
    print(f"Room code: {room_code}")
    print()
    print(f"Overlay link:  {overlay_url}")
    print()
    print(f"Player 1 link: {p1_url}")
    print()
    print(f"Player 2 link: {p2_url}")
    print()
