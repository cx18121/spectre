# Shadow Fight Real-Time -- Development Guide

A real-time 1v1 fighting game where two remote players fight using their phone cameras. Each phone runs pose estimation in-browser via MediaPipe, streams keypoints to a peer-hosted game server, and both players watch a Shadow Fight 2 style silhouette match in a shared browser overlay.

No accounts. No cloud hosting. No database. One player runs the server on their laptop, Cloudflare Tunnel makes it reachable from anywhere.

---

## Architecture

```
Phone A (mobile client)          Phone B (mobile client)
  camera -> MediaPipe poses          camera -> MediaPipe poses
        |                                  |
        +-----------> Game Server <--------+
                      (Python, FastAPI)
                      - 60Hz game loop
                      - hit detection
                      - damage + rounds
                      - Cloudflare Tunnel
                             |
                      Overlay Renderer
                      (PixiJS, laptop/TV)
                      - silhouette render
                      - HP bars, timer
                      - sparks + SFX
```

---

## For the Development Team (3 People)

This project is designed to be built concurrently by 3 people. Each person owns one component end to end.

| Person | Component | Plan file |
|--------|-----------|-----------|
| A | Game server (Python) | [docs/plans/server.md](docs/plans/server.md) |
| B | Mobile capture client (React + MediaPipe) | [docs/plans/mobile.md](docs/plans/mobile.md) |
| C | Overlay renderer (React + PixiJS) | [docs/plans/overlay.md](docs/plans/overlay.md) |

Read [docs/plans/project.md](docs/plans/project.md) first. It has the kickoff steps, shared protocol definition, checkpoint criteria, and integration sync points.

### How to start

**Step 1 -- All three together (~30 min)**

One person scaffolds the repo. Everyone watches. Follow the Kickoff section in `docs/plans/project.md` exactly.

At the end of kickoff, `shared/protocol.ts` is committed and all three Vite/Python projects build without errors.

**Step 2 -- Split and work in parallel**

Each person opens their plan file and works through the tasks in order. Every task has a verification step -- run it before moving to the next task.

B and C each have a mock server defined in their plan files so they are never blocked on A.

**Step 3 -- Checkpoints**

There are 5 checkpoints (0 through 4) defined in `docs/plans/project.md`. Each checkpoint has explicit pass/fail criteria. All three must pass before the team moves to the next sprint.

Checkpoints are not a gate that blocks work -- if A is behind, B and C keep going against their mocks. The checkpoint is a signal to switch from mocks to the real server.

### Using Claude Code

Each person gives their plan file to Claude Code as the task:

> "Work through the tasks in `docs/plans/server.md` in order. Complete each task fully and run the verification command before moving to the next task."

Claude Code will work through the tasks sequentially, run verifications, and stop if something does not pass. When it finishes a sprint, review the output and move on.

---

## Running Locally

Requires: Python 3.11+, Node 20+, cloudflared installed.

Install cloudflared:
- macOS: `brew install cloudflared`
- Linux: `apt install cloudflared`
- Windows: `winget install cloudflared`

```bash
# Clone and install
git clone https://github.com/cx18121/claude-hackathon26.git
cd claude-hackathon26

# Server
cd server && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Mobile
cd mobile && npm install

# Overlay
cd overlay && npm install
```

Start everything locally (no tunnel, same-wifi mode):

```bash
bash scripts/dev.sh
```

Or start each piece manually:

```bash
# Terminal 1 -- server (LAN mode, no tunnel)
cd server && TUNNEL=false python main.py

# Terminal 2 -- mobile dev server
cd mobile && npm run dev

# Terminal 3 -- overlay dev server
cd overlay && npm run dev
```

Mobile URL: `http://localhost:5173?server=http://localhost:8000`  
Overlay URL: `http://localhost:5174?server=http://localhost:8000&room=<code>`

The server prints the room code on startup.

---

## Running a Real Match (Internet, Two Locations)

1. Player 1 (host) runs the server with tunnel enabled:
   ```bash
   cd server && TUNNEL=true python main.py
   ```
   The terminal prints a `trycloudflare.com` URL and a QR code.

2. Host shares the URL with Player 2 (or they scan the QR code).

3. Both players open the mobile client URL on their phones and join the same room code with different slots (1 and 2).

4. Host opens the overlay in a laptop or TV browser.

5. Both players complete the calibration flow (3 practice jabs + neutral stance).

6. Match starts automatically once both players calibrate.

---

## Tech Stack

| Component | Language / Framework |
|-----------|----------------------|
| Server | Python 3.11, FastAPI, uvicorn, asyncio, numpy, pydantic v2 |
| Mobile | Vite, React 18, TypeScript, @mediapipe/tasks-vision |
| Overlay | Vite, React 18, TypeScript, pixi.js v8 |
| Tunnel | cloudflared (trycloudflare.com quick tunnel) |

---

## Known Limitations

- Rooms are in-memory and ephemeral. Server restart clears all rooms.
- One room is auto-created on startup. Additional rooms can be created via `POST /rooms`.
- The game uses delay-based netcode. Latency above ~150ms makes the match feel laggy (a warning is shown).
- MediaPipe Pose Landmarker requires a side-view camera angle. Front-facing angles produce unreliable depth.
- Mobile browsers must allow camera access. iOS Safari requires HTTPS, which the Cloudflare tunnel provides.
- Calibration is per-match. If a player disconnects and reconnects, they recalibrate.

---

## Challenges

**Netcode fairness**

The host player has lower latency to the server than the remote player. To compensate, the server measures round-trip time to both players via a 500ms ping loop and applies a fixed input delay equal to `max(rtt_a, rtt_b)` to both players' pose frames before feeding them to the simulation. This is delay-based netcode, the approach used by early Street Fighter netplay. It does not eliminate the latency difference but ensures both players experience the same delay. If RTT exceeds 150ms, both clients display a warning.

**3D pose to 2D game space**

MediaPipe worldLandmarks gives 3D coordinates in meters relative to the player's hip center. The overlay projects these onto a 2D screen plane by treating x as horizontal and y as vertical, scaling to fit a fixed half-screen region per player. The z coordinate is used for depth-based hit detection on the server but is discarded in the renderer.

**30fps input, 60Hz simulation**

Mobile clients stream pose frames at 30fps (the limit of real-time MediaPipe inference). The server game loop ticks at 60Hz and uses linear interpolation between the two most recent pose frames to fill the gaps. The overlay receives `game_state` at 60Hz and applies cubic interpolation between ticks to produce smooth 60fps rendering on the client.
