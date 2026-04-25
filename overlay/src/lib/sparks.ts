import { Container, Graphics } from 'pixi.js'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  radius: number
  color: number
}

export class SparkEmitter {
  private readonly graphics = new Graphics()
  private particles: Particle[] = []

  constructor(container: Container) {
    container.addChild(this.graphics)
  }

  emit(x: number, y: number, damage: number) {
    const count = 8 + Math.floor(damage / 3)

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 4

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        radius: 3 + Math.random() * 4,
        color: Math.random() > 0.35 ? 0xffcc00 : 0xff5a1f,
      })
    }
  }

  update(frameScale: number) {
    const nextParticles: Particle[] = []
    this.graphics.clear()

    for (const particle of this.particles) {
      particle.x += particle.vx * frameScale
      particle.y += particle.vy * frameScale
      particle.vy += 0.15 * frameScale
      particle.alpha -= 0.03 * frameScale

      if (particle.alpha <= 0) {
        continue
      }

      nextParticles.push(particle)
      this.graphics
        .circle(particle.x, particle.y, particle.radius)
        .fill({ color: particle.color, alpha: particle.alpha })
    }

    this.particles = nextParticles
  }

  destroy() {
    this.graphics.destroy()
    this.particles = []
  }
}
