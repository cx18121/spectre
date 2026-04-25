#!/usr/bin/env bash
# Shadow Fight launcher over Tailscale.
#
# Use this when you and your opponents are on a network where direct LAN
# is blocked (eduroam, hotel WiFi, mobile data, etc.). Tailscale gives
# every participant a stable 100.x.x.x IP that works across any network
# via direct P2P (when possible) or Tailscale's DERP relay. Latency is
# ~LAN when direct, slightly higher when relayed -- still far better
# than the Cloudflare tunnel hop.
#
# Setup once on EACH machine (host + opponents):
#   1. Install Tailscale:
#        macOS:    brew install --cask tailscale
#        Linux:    https://tailscale.com/download/linux
#        Windows:  https://tailscale.com/download/windows
#   2. Sign in to the same tailnet (admin console can send invite links).
#   3. Verify with:  tailscale ip -4
#
# Usage on the HOST:
#   bash scripts/tailscale.sh                       # uses default host IP
#   HOST_IP=100.90.212.51 bash scripts/tailscale.sh # explicit override

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Default to the host's known Tailscale IP. `tailscale ip -4` is the
# authoritative source if it disagrees -- we'll overwrite this below.
HOST_IP="${HOST_IP:-100.90.212.51}"
PORT="${PORT:-8000}"

# ---------- preflight ------------------------------------------------------

if ! command -v tailscale >/dev/null 2>&1; then
  echo "ERROR: tailscale CLI not found."
  echo "Install:"
  echo "  macOS:    brew install --cask tailscale"
  echo "  Linux:    https://tailscale.com/download/linux"
  echo "  Windows:  https://tailscale.com/download/windows"
  echo "Then sign in:"
  echo "  tailscale up"
  exit 1
fi

# `tailscale ip -4` is the source of truth for what URL opponents need.
# If it disagrees with the user-supplied default, prefer the live IP.
TS_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
if [ -z "$TS_IP" ]; then
  echo "ERROR: Tailscale is installed but not running or not signed in."
  echo "Click the menubar icon and sign in, or run:  tailscale up"
  exit 1
fi
if [ "$TS_IP" != "$HOST_IP" ]; then
  echo "NOTE: tailscale ip -4 reports $TS_IP (HOST_IP default was $HOST_IP)."
  echo "      Using $TS_IP for the URLs printed below."
  HOST_IP="$TS_IP"
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

# Free port if a previous run left something behind.
# `|| true` is REQUIRED: lsof returns exit 1 when no process matches, and
# under `set -e` the empty subshell would abort this script silently.
# shellcheck disable=SC2207
pids=( $(lsof -ti :"$PORT" 2>/dev/null || true) )
if [ "${#pids[@]}" -gt 0 ]; then
  echo "Port $PORT held by pid(s) ${pids[*]} -- killing"
  kill "${pids[@]}" 2>/dev/null || true
  sleep 0.5
  # shellcheck disable=SC2207
  still=( $(lsof -ti :"$PORT" 2>/dev/null || true) )
  if [ "${#still[@]}" -gt 0 ]; then
    kill -9 "${still[@]}" 2>/dev/null || true
    sleep 0.5
  fi
fi

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

# ---------- start server (no Cloudflare tunnel) ----------------------------

SERVER_LOG=/tmp/shadowfight-server.log
: > "$SERVER_LOG"

SERVE_ACTIVE=0

cleanup() {
  echo ""
  echo "Stopping server..."
  kill "${server_pid:-}" 2>/dev/null || true
  kill "${tail_pid:-}" 2>/dev/null || true
  if [ "$SERVE_ACTIVE" = "1" ]; then
    echo "Tearing down tailscale serve..."
    tailscale serve reset 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cat <<BANNER

============================================================
Starting server on Tailscale IP ${HOST_IP}:${PORT}
TUNNEL=false (Cloudflare hop disabled)
============================================================

BANNER

cd "$ROOT/server"
source .venv/bin/activate
# TUNNEL=false skips the Cloudflare tunnel; clients reach us via Tailscale.
# -u disables python output buffering so the readiness banner reaches the
# log file immediately rather than getting stuck in stdio buffers.
TUNNEL=false PORT="$PORT" python -u main.py >"$SERVER_LOG" 2>&1 &
server_pid=$!

tail -F "$SERVER_LOG" &
tail_pid=$!

# Wait for the server to print its readiness banner.
ready_deadline=$((SECONDS + 30))
while ! grep -q "SHADOW FIGHT SERVER READY" "$SERVER_LOG" 2>/dev/null; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo ""
    echo "ERROR: server exited before becoming ready. See $SERVER_LOG"
    exit 1
  fi
  if [ "$SECONDS" -ge "$ready_deadline" ]; then
    echo ""
    echo "ERROR: server did not become ready within 30s."
    echo "  Log: $SERVER_LOG"
    exit 1
  fi
  sleep 0.3
done

# ---------- tailscale serve (HTTPS) ---------------------------------------

# Look up the host's MagicDNS name so we can print HTTPS URLs that match the
# auto-provisioned cert. Format is "<machine-name>.<tailnet>.ts.net.".
TS_DNS="$(tailscale status --json 2>/dev/null \
  | python3 -c "import sys,json
try:
    d = json.load(sys.stdin)
    print((d.get('Self') or {}).get('DNSName','').rstrip('.'))
except Exception:
    pass" 2>/dev/null || true)"

# Clear any prior `tailscale serve` config from a previous run. Otherwise
# `tailscale serve --bg` will refuse to start with a port-conflict error.
tailscale serve reset 2>/dev/null || true

USE_HTTPS=0
SERVE_ERR=""
if [ -n "$TS_DNS" ]; then
  echo ""
  echo "Setting up Tailscale HTTPS via 'tailscale serve'..."
  # tailscale serve runs the binding inside the Tailscale daemon (which is
  # already root), so this does NOT need sudo. If HTTPS isn't enabled in
  # the tailnet's DNS settings it fails with a clear error.
  if SERVE_ERR="$(tailscale serve --bg --https=443 "http://localhost:${PORT}" 2>&1)"; then
    USE_HTTPS=1
    SERVE_ACTIVE=1
    echo "  HTTPS active: https://${TS_DNS}"
  else
    echo "  WARNING: tailscale serve failed:"
    echo "$SERVE_ERR" | sed 's/^/    /'
    echo "  Falling back to plain http:// (camera will need a browser flag)."
  fi
else
  echo "WARNING: could not determine MagicDNS name. HTTPS skipped."
fi

# ---------- print URL guide -----------------------------------------------

# Pull the room code from the server log so we can print fully-resolved URLs.
# The server prints "Room code:  XXXXXX"; the regex tolerates 1+ spaces.
ROOM_CODE="$(grep -oE 'Room code:[[:space:]]+[A-Z0-9]+' "$SERVER_LOG" | head -1 | awk '{print $NF}')"
ROOM_QS="${ROOM_CODE:+&room=${ROOM_CODE}}"

if [ "$USE_HTTPS" = "1" ]; then
  CLIENT_BASE="https://${TS_DNS}"
  TRANSPORT_LABEL="HTTPS via tailscale serve (camera works without browser flags)"
else
  CLIENT_BASE="http://${HOST_IP}:${PORT}"
  TRANSPORT_LABEL="plain HTTP (opponents will need the browser flag below for camera access)"
fi

cat <<EOF

============================================================
HOW TO PLAY OVER TAILSCALE
Transport: ${TRANSPORT_LABEL}
============================================================

Room code: ${ROOM_CODE:-<see server log above>}

HOST (this laptop) -- overlay (game view):
  ${CLIENT_BASE}/overlay?server=${CLIENT_BASE}${ROOM_QS}
  (http://localhost:${PORT}/overlay?... also works for the host)

Send to OPPONENT LAPTOP 1 (Player 1):
  ${CLIENT_BASE}/mobile?server=${CLIENT_BASE}${ROOM_QS}&slot=1

Send to OPPONENT LAPTOP 2 (Player 2):
  ${CLIENT_BASE}/mobile?server=${CLIENT_BASE}${ROOM_QS}&slot=2

CRITICAL preflight on each opponent laptop:
  1. Tailscale must be installed AND signed in to your tailnet
     (or accept your shared-node link).
  2. Verify connectivity:
       ping ${HOST_IP}                       # tailscale IP
       curl -fsS ${CLIENT_BASE}/   >/dev/null && echo OK || echo FAIL
     If those fail, the page won't load -- check their menubar
     app says "Connected" (Tailscale auto-disconnects on sleep).

EOF

if [ "$USE_HTTPS" != "1" ]; then
  cat <<EOF
CAMERA-PERMISSION FALLBACK (since HTTPS isn't active):
  Browsers block getUserMedia on plain http:// origins for any host
  other than localhost. Pick ONE workaround per opponent laptop:

    Chrome:
      chrome://flags/#unsafely-treat-insecure-origin-as-secure
      Add ${CLIENT_BASE}, click Enabled, restart Chrome.

    Firefox:
      about:config -> media.devices.insecure.enabled = true
                      media.getusermedia.insecure.enabled = true

  To enable HTTPS instead (recommended): turn on MagicDNS + HTTPS
  Certificates at https://login.tailscale.com/admin/dns , then
  re-run this script. ('tailscale serve' will succeed and the URLs
  above flip to https://${TS_DNS:-<your-machine>.<tailnet>.ts.net}.)

EOF
fi

cat <<EOF
To inspect Tailscale path quality (direct vs DERP relay):
  tailscale status

Press Ctrl+C to stop the server.
============================================================

EOF

wait
