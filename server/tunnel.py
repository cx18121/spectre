from __future__ import annotations
import os
import queue
import re
import socket
import subprocess
import threading
import time


_URL_PATTERN = re.compile(r"https://[a-z0-9\-]+\.trycloudflare\.com")
_URL_TIMEOUT_SECONDS = 30


class TunnelManager:
    """Wraps a `cloudflared tunnel --url` subprocess.

    Two failure modes the previous implementation hit:
      1. The 30s deadline was checked inside `for line in stdout`, which only
         advances when a new line arrives. If cloudflared stalled silently,
         the loop blocked forever instead of timing out.
      2. After the URL was captured, nothing read cloudflared's stdout pipe.
         macOS pipe buffers fill at ~64KB, so cloudflared eventually blocked
         on its own stdout write and stopped servicing the tunnel — the user
         saw the URL print fine, then connections to it would hang.

    Fix: a background thread drains stdout for the entire lifetime of the
    process. Before the URL is found it forwards lines through a queue with
    a real deadline; after that it discards lines so the pipe stays drained.
    """

    def __init__(self) -> None:
        self.process: subprocess.Popen | None = None
        self.public_url: str | None = None
        self._reader: threading.Thread | None = None
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._discard_after_url = False

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
                bufsize=1,
            )
        except FileNotFoundError:
            print("cloudflared not found. Install it:")
            print("  macOS:   brew install cloudflared")
            print("  Linux:   apt install cloudflared")
            print("  Windows: winget install cloudflared")
            raise SystemExit(1)

        self._reader = threading.Thread(
            target=self._drain_stdout, name="cloudflared-stdout", daemon=True
        )
        self._reader.start()

        deadline = time.monotonic() + _URL_TIMEOUT_SECONDS
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self._abort(
                    f"cloudflared did not emit a public URL within "
                    f"{_URL_TIMEOUT_SECONDS}s"
                )
            try:
                line = self._lines.get(timeout=min(remaining, 1.0))
            except queue.Empty:
                if self.process.poll() is not None:
                    self._abort(
                        f"cloudflared exited before emitting a URL "
                        f"(code {self.process.returncode})"
                    )
                continue
            if line is None:
                self._abort("cloudflared closed stdout before emitting a URL")
            match = _URL_PATTERN.search(line)
            if match:
                self.public_url = match.group(0)
                self._discard_after_url = True
                return self.public_url

    def _drain_stdout(self) -> None:
        proc = self.process
        if proc is None or proc.stdout is None:
            return
        try:
            for line in proc.stdout:
                if not self._discard_after_url:
                    self._lines.put(line)
        except Exception:
            pass
        finally:
            self._lines.put(None)

    def _abort(self, msg: str) -> None:
        self.stop()
        raise RuntimeError(msg)

    def get_lan_url(self, port: int) -> str:
        ip = socket.gethostbyname(socket.gethostname())
        return f"http://{ip}:{port}"

    def stop(self) -> None:
        proc = self.process
        if proc is None:
            return
        try:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
        except Exception:
            pass
        self.process = None
        self._reader = None
