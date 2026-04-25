# Shadow Fight Overlay

Person C overlay renderer for the hackathon project. It connects as a spectator, renders two PixiJS silhouettes, and keeps the match HUD in React DOM.

## Local Mock

```bash
npm install
node mock-server.cjs
npm run dev -- --port 5174
```

Open:

```text
http://localhost:5174?server=ws://localhost:8002&room=MOCK01
```

The mock accepts spectator connections at `/ws/spectator/{room}` and streams `game_state` messages at about 60 Hz.

## Checks

```bash
npm run lint
npm run build
```

## Query Params

- `server`: WebSocket or HTTP base URL. HTTP URLs are converted to `ws://` or `wss://`.
- `room`: spectator room code. Defaults to `MOCK01`.

## Audio Credits

Bundled sound effects in `public/sfx` are selected from [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), licensed Creative Commons CC0. The original license file is included at `public/sfx/LICENSE-kenney-impact-sounds.txt`.
