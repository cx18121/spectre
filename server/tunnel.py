from __future__ import annotations
import os
import re
import socket
import subprocess
import time


class TunnelManager:
    def __init__(self) -> None:
        self.process: subprocess.Popen | None = None
        self.public_url: str | None = None

    def start(self, port: int) -> str:
        if os.getenv("TUNNEL", "true").lower() == "false":
            url = self.get_lan_url(port)
            self.public_url = url
            return url

        try:
            self.process = subprocess.Popen(
                ["cloudflared", "tunnel", "--url", f"http://localhost:{port}"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except FileNotFoundError:
            print("cloudflared not found. Install it:")
            print("  macOS:   brew install cloudflared")
            print("  Linux:   apt install cloudflared")
            print("  Windows: winget install cloudflared")
            raise SystemExit(1)

        deadline = time.time() + 30
        url_pattern = re.compile(r"https://[a-z0-9\-]+\.trycloudflare\.com")

        for line in self.process.stdout:  # type: ignore[union-attr]
            match = url_pattern.search(line)
            if match:
                self.public_url = match.group(0)
                return self.public_url
            if time.time() > deadline:
                break

        raise RuntimeError("cloudflared did not emit a URL within 30s")

    def get_lan_url(self, port: int) -> str:
        ip = socket.gethostbyname(socket.gethostname())
        return f"http://{ip}:{port}"

    def stop(self) -> None:
        if self.process is None:
            return
        self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
        self.process = None
