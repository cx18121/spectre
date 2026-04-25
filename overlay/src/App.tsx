import { HudLayer } from './components/HudLayer'
import { ParallaxBackground } from './components/ParallaxBackground'
import { PixiCanvas } from './components/PixiCanvas'
import { RoundOverlay } from './components/RoundOverlay'
import { useSpectatorSocket } from './hooks/useSpectatorSocket'
import { unlockSfx } from './lib/sfx'
import type { HpPair } from './protocol'

const params = new URLSearchParams(window.location.search)
const serverUrl = params.get('server') ?? 'ws://localhost:8002'
const roomCode = params.get('room') ?? 'MOCK01'

function App() {
  const { connected, disconnectedPlayer, gameState, matchWinner, roundState } =
    useSpectatorSocket(serverUrl, roomCode)
  const hp: HpPair = gameState?.hp ?? [100, 100]
  const remainingTime = gameState?.remaining_time ?? 90
  const roundNumber = roundState?.number ?? 1

  return (
    <main className="overlay-shell">
      <ParallaxBackground tick={gameState?.tick ?? 0} />
      <PixiCanvas gameState={gameState} />
      <HudLayer
        connected={connected}
        disconnectedPlayer={disconnectedPlayer}
        highLatency={gameState?.high_latency ?? false}
        hp={hp}
        remainingTime={remainingTime}
        round={roundNumber}
        roomCode={roomCode}
      />
      <RoundOverlay
        matchWinner={matchWinner}
        roundState={roundState}
      />
      <button className="audio-unlock" type="button" onClick={unlockSfx}>
        Click to start audio
      </button>
    </main>
  )
}

export default App
