import { useCallback, useRef, useState } from 'react'
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
  const {
    connected,
    disconnectedPlayer,
    gameState,
    matchWinner,
    roundState,
    poseStreamRef,
  } = useSpectatorSocket(serverUrl, roomCode)
  const hp: HpPair = gameState?.hp ?? [200, 200]
  const remainingTime = gameState?.remaining_time ?? 90
  const roundNumber = roundState?.number ?? 1

  const [shaking, setShaking] = useState(false)
  const shakeTimerRef = useRef<number | null>(null)
  const handleHeavyHit = useCallback(() => {
    setShaking(true)
    if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = window.setTimeout(() => {
      setShaking(false)
      shakeTimerRef.current = null
    }, 450)
  }, [])

  return (
    <main className={`overlay-shell${shaking ? ' shaking' : ''}`}>
      <ParallaxBackground tick={gameState?.tick ?? 0} />
      <PixiCanvas
        gameState={gameState}
        poseStreamRef={poseStreamRef}
        onHeavyHit={handleHeavyHit}
      />
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
