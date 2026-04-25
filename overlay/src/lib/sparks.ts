import { BlurFilter, Container, Graphics } from 'pixi.js'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  radius: number
  color: number
}

interface Shockwave {
  x: number
  y: number
  radius: number
  maxRadius: number
  growth: number
  alpha: number
  width: number
  color: number
}

interface Flash {
  x: number
  y: number
  radius: number
  alpha: number
  decay: number
  color: number
}

const HEAVY_THRESHOLD = 10

export class SparkEmitter {
  private readonly halo = new Graphics()
  private readonly graphics = new Graphics()
  private particles: Particle[] = []
  private shockwaves: Shockwave[] = []
  private flashes: Flash[] = []

  constructor(container: Container) {
    this.halo.filters = [new BlurFilter({ strength: 18, quality: 4 })]
    this.halo.alpha = 0.95
    container.addChild(this.halo)
    container.addChild(this.graphics)
  }

  emit(x: number, y: number, damage: number) {
    const heavy = damage >= HEAVY_THRESHOLD
    const count = (heavy ? 22 : 12) + Math.floor(damage / 2)

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = (heavy ? 4 : 2.5) + Math.random() * (heavy ? 8 : 4.5)
      const colorRoll = Math.random()
      const color =
        colorRoll > 0.7 ? 0xfff4c2 : colorRoll > 0.35 ? 0xffc24a : 0xff5a1f

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (heavy ? 1.6 : 0.6),
        life: 1,
        decay: heavy ? 0.018 : 0.026,
        radius: (heavy ? 5 : 3) + Math.random() * (heavy ? 7 : 4),
        color,
      })
    }

    this.shockwaves.push({
      x,
      y,
      radius: heavy ? 24 : 14,
      maxRadius: heavy ? 280 : 160,
      growth: heavy ? 0.22 : 0.18,
      alpha: 1,
      width: heavy ? 8 : 5,
      color: heavy ? 0xff7a2a : 0xffd84d,
    })

    this.flashes.push({
      x,
      y,
      radius: heavy ? 90 : 50,
      alpha: heavy ? 0.85 : 0.55,
      decay: heavy ? 0.06 : 0.09,
      color: heavy ? 0xff8a3a : 0xffe07a,
    })
  }

  update(frameScale: number) {
    this.graphics.clear()
    this.halo.clear()

    const nextParticles: Particle[] = []
    for (const particle of this.particles) {
      particle.x += particle.vx * frameScale
      particle.y += particle.vy * frameScale
      particle.vy += 0.18 * frameScale
      particle.vx *= Math.pow(0.985, frameScale)
      particle.life -= particle.decay * frameScale
      if (particle.life <= 0) {
        continue
      }
      nextParticles.push(particle)
      const a = Math.max(0, Math.min(1, particle.life))
      const coreR = particle.radius * (0.55 + 0.45 * a)
      this.graphics
        .circle(particle.x, particle.y, coreR)
        .fill({ color: particle.color, alpha: a })
      this.halo
        .circle(particle.x, particle.y, particle.radius * (1.6 + 0.7 * a))
        .fill({ color: particle.color, alpha: a * 0.55 })
    }
    this.particles = nextParticles

    const nextShockwaves: Shockwave[] = []
    for (const wave of this.shockwaves) {
      wave.radius += (wave.maxRadius - wave.radius) * wave.growth * frameScale
      wave.alpha -= 0.045 * frameScale
      if (wave.alpha <= 0) {
        continue
      }
      nextShockwaves.push(wave)
      this.graphics
        .circle(wave.x, wave.y, wave.radius)
        .stroke({ color: wave.color, alpha: wave.alpha * 0.9, width: wave.width })
      this.halo
        .circle(wave.x, wave.y, wave.radius)
        .stroke({ color: wave.color, alpha: wave.alpha * 0.55, width: wave.width * 1.6 })
    }
    this.shockwaves = nextShockwaves

    const nextFlashes: Flash[] = []
    for (const flash of this.flashes) {
      flash.radius += flash.radius * 0.08 * frameScale
      flash.alpha -= flash.decay * frameScale
      if (flash.alpha <= 0) {
        continue
      }
      nextFlashes.push(flash)
      this.halo
        .circle(flash.x, flash.y, flash.radius)
        .fill({ color: flash.color, alpha: flash.alpha })
    }
    this.flashes = nextFlashes
  }

  destroy() {
    this.graphics.destroy()
    this.halo.destroy()
    this.particles = []
    this.shockwaves = []
    this.flashes = []
  }
}
