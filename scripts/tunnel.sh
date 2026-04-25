#!/usr/bin/env bash
# Shadow Fight launcher with a public Cloudflare tunnel.
#
# Use this instead of dev.sh when you and your opponent are on different
# networks (different WiFi, eduroam isolation, mobile data, remote, etc.).
# The server is exposed via cloudflared; the printed URL works from anywhere
# on the public internet.
#
# Builds the mobile and overlay bundles before starting so they are served
# under the same tunnel host. Vite dev servers are NOT started -- the only
# thing the friend's device can hit is what cloudflared exposes (port 8000).
#
# Requirements:
#   - cloudflared installed:  brew install cloudflared
#   - server/.venv set up:    cd server && python3 -m venv .venv && source
#                              .venv/bin/activate && pip install -r requirements.txt
#
# Usage:
#   bash scripts/tunnel.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---------- preflight ------------------------------------------------------

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERROR: cloudflared not found."
  echo "Install:"
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   sudo apt install cloudflared"
  echo "  Windows: winget install cloudflared"
  exit 1
fi

if [ ! -d "$ROOT/server/.venv" ]; then
  echo "ERROR: server/.venv not found."
  echo "Run once:  cd server && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
if [ ! -d "$ROOT/mobile/node_modules" ]; then
  echo "Installing mobile deps..."
  (cd "$ROOT/mobile" && npm install)
fi
if [ ! -d "$ROOT/overlay/node_modules" ]; then
  echo "Installing overlay deps..."
  (cd "$ROOT/overlay" && npm install)
fi

# Free port 8000 if a previous run left something behind.
# `|| true` is REQUIRED: lsof returns exit 1 when no process matches, and
# under `set -e` the empty subshell would abort this script silently.
# shellcheck disable=SC2207
pids=( $(lsof -ti :8000 2>/dev/null || true) )
if [ "${#pids[@]}" -gt 0 ]; then
  echo "Port 8000 held by pid(s) ${pids[*]} -- killing"
  kill "${pids[@]}" 2>/dev/null || true
  sleep 0.5
  # shellcheck disable=SC2207
  still=( $(lsof -ti :8000 2>/dev/null || true) )
  if [ "${#still[@]}" -gt 0 ]; then
    kill -9 "${still[@]}" 2>/dev/null || true
    sleep 0.5
  fi
fi

# Cloudflare quick-tunnel slots are per-IP rate-limited. A previous failed
# run can leave a `cloudflared` lingering and the next launch silently gets
# a degraded tunnel. Sweep before we start.
pkill -f "cloudflared tunnel --url" 2>/dev/null || true

# ---------- build bundles --------------------------------------------------

echo "Building mobile bundle..."
(cd "$ROOT/mobile" && npm run build > /tmp/shadowfight-mobile-build.log 2>&1) || {
  echo "Mobile build FAILED. See /tmp/shadowfight-mobile-build.log"
  tail -20 /tmp/shadowfight-mobile-build.log
  exit 1
}

echo "Building overlay bundle..."
(cd "$ROOT/overlay" && npm run build > /tmp/shadowfight-overlay-build.log 2>&1) || {
  echo "Overlay build FAILED. See /tmp/shadowfight-overlay-build.log"
  tail -20 /tmp/shadowfight-overlay-build.log
  exit 1
}

# ---------- start server with tunnel ---------------------------------------

SERVER_LOG=/tmp/shadowfight-server.log
: > "$SERVER_LOG"

cleanup() {
  echo ""
  echo "Stopping server and tunnel..."
  kill "${server_pid:-}" 2>/dev/null || true
  kill "${tail_pid:-}" 2>/dev/null || true
  # tunnel.py terminates cloudflared on shutdown, but if the python process
  # was killed hard the cloudflared child can survive -- sweep it.
  pkill -f "cloudflared tunnel --url" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cat <<'BANNER'

============================================================
Starting server with Cloudflare tunnel.
The first launch may take ~10-30s while cloudflared
negotiates a public URL. Watch for the banner below.
============================================================

BANNER

cd "$ROOT/server"
source .venv/bin/activate
# TUNNEL is true by default in main.py, so we just don't override it.
# -u disables python output buffering so the readiness banner reaches the
# log file immediately rather than getting stuck in stdio buffers.
python -u main.py >"$SERVER_LOG" 2>&1 &
server_pid=$!

# Stream the server log to the user's terminal in real time.
tail -F "$SERVER_LOG" &
tail_pid=$!

# ---------- wait for readiness, not just sleep -----------------------------

# The previous version slept a flat 12s and then printed the help banner,
# even if cloudflared was still negotiating. Users would copy a URL that
# wasn't live yet and see "links don't load". Wait for the actual banner.
ready_deadline=$((SECONDS + 60))
while ! grep -q "SHADOW FIGHT SERVER READY" "$SERVER_LOG" 2>/dev/null; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo ""
    echo "ERROR: server exited before becoming ready. See $SERVER_LOG"
    exit 1
  fi
  if [ "$SECONDS" -ge "$ready_deadline" ]; then
    echo ""
    echo "ERROR: server did not become ready within 60s."
    echo "  Cloudflare quick-tunnels are sometimes rate-limited. Wait a"
    echo "  minute and try again, or run scripts/dev.sh for LAN play."
    echo "  Log: $SERVER_LOG"
    exit 1
  fi
  sleep 0.3
done

cat <<EOF

============================================================
HOW TO PLAY (copy URLs from the server's startup banner above)
============================================================

The 'Public URL' line above is your shareable host. It looks
like:  https://something-random.trycloudflare.com

Send your opponent the printed mobile URL (it includes the
correct ?server=... and ?room=... already).

  Player 1 (you):   <Public URL>/mobile?room=<CODE>&slot=1&v=<v>
  Player 2 (friend):<Public URL>/mobile?room=<CODE>&slot=2&v=<v>
  Overlay:          <Public URL>/overlay?room=<CODE>&v=<v>

The cache-buster (&v=...) is already baked into the URLs the
server prints -- copy those rather than typing by hand.

Notes:
  * Cloudflare's free tunnel URLs are ephemeral: they change
    every time you restart this script. Re-share after restart.
  * The tunnel auto-upgrades to HTTPS/WSS, which means the
    mobile client can request the camera on iOS Safari (which
    blocks getUserMedia on plain http origins).
  * Vite dev servers are NOT running in tunnel mode. If you
    want hot-reload while iterating on UI code, run dev.sh
    instead and test on the same WiFi.

Press Ctrl+C to stop the server and tear down the tunnel.
============================================================

EOF

wait
