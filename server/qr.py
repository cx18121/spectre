from __future__ import annotations
import qrcode


def print_startup_info(public_url: str, room_code: str) -> None:
    mobile_url = f"{public_url}/mobile?server={public_url}&room={room_code}&slot=2"
    overlay_url = f"{public_url}/overlay?server={public_url}&room={room_code}"

    print()
    print("=== SHADOW FIGHT SERVER READY ===")
    print(f"Public URL: {public_url}")
    print(f"Room code:  {room_code}")
    print()
    print("Share this URL with your teammate (opens on their phone):")
    print(f"  {mobile_url}")
    print()
    print("Open the overlay at:")
    print(f"  {overlay_url}")
    print()
    print("Scan to join on mobile:")

    qr = qrcode.QRCode()
    qr.add_data(mobile_url)
    qr.make(fit=True)
    qr.print_ascii(invert=True)
