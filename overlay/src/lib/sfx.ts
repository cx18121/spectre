export type SfxName =
  | 'hit_light'
  | 'hit_heavy'
  | 'round_bell'
  | 'round_end'
  | 'match_win'

const audioFiles: Record<SfxName, string> = {
  hit_light: '/sfx/hit_light.ogg',
  hit_heavy: '/sfx/hit_heavy.ogg',
  round_bell: '/sfx/round_bell.ogg',
  round_end: '/sfx/round_end.ogg',
  match_win: '/sfx/match_win.ogg',
}

const fallbackTones: Record<SfxName, { frequency: number; duration: number; gain: number }> = {
  hit_light: { frequency: 180, duration: 0.08, gain: 0.08 },
  hit_heavy: { frequency: 95, duration: 0.14, gain: 0.14 },
  round_bell: { frequency: 650, duration: 0.25, gain: 0.08 },
  round_end: { frequency: 300, duration: 0.35, gain: 0.1 },
  match_win: { frequency: 520, duration: 0.45, gain: 0.11 },
}

let audioUnlocked = false
let audioContext: AudioContext | null = null

function getAudioContext() {
  audioContext ??= new AudioContext()
  return audioContext
}

function playFallbackTone(name: SfxName, volume: number) {
  if (!audioContext || audioContext.state !== 'running') {
    return
  }

  const tone = fallbackTones[name]
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  const now = audioContext.currentTime

  oscillator.type = name.includes('hit') ? 'square' : 'triangle'
  oscillator.frequency.setValueAtTime(tone.frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, tone.frequency * 0.55),
    now + tone.duration,
  )
  gain.gain.setValueAtTime(tone.gain * volume, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + tone.duration)

  oscillator.connect(gain).connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + tone.duration)
}

class SfxPlayer {
  private readonly sounds = new Map<SfxName, HTMLAudioElement>()

  constructor() {
    this.preloadAll()
  }

  preload(name: SfxName, path: string) {
    const sound = new Audio(path)
    sound.preload = 'auto'
    sound.load()
    this.sounds.set(name, sound)
  }

  preloadAll() {
    for (const [name, path] of Object.entries(audioFiles) as [SfxName, string][]) {
      this.preload(name, path)
    }
  }

  play(name: SfxName, volume = 1) {
    if (!audioUnlocked) {
      return
    }

    const source = this.sounds.get(name)
    const sound = source?.cloneNode(true) as HTMLAudioElement | undefined

    if (!sound) {
      playFallbackTone(name, volume)
      return
    }

    sound.volume = Math.max(0, Math.min(1, volume))
    sound.play().catch(() => playFallbackTone(name, volume))
  }
}

export const sfx = new SfxPlayer()

export function unlockSfx() {
  audioUnlocked = true
  const context = getAudioContext()
  void context.resume()
  document.body.classList.add('audio-ready')
}
