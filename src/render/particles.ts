/** Pooled sprite particle system with configurable presets. */
import { Container, Sprite, Texture } from 'pixi.js';
import { profiler } from '../core/profiler';
import { Rng } from '../core/rng';

export interface ParticleSpec {
  texture: Texture;
  tint: number;
  additive?: boolean;
  life: [number, number];
  speed: [number, number];
  /** Emission arc: base angle and spread (radians). Default: full circle. */
  angle?: [number, number];
  gravity?: number;
  drag?: number;
  scale: [number, number];
  scaleEnd?: number; // multiplier of start scale at end of life
  alpha?: [number, number];
  alphaEnd?: number;
  spin?: [number, number];
  /** Initial radial offset from the emit point. */
  offset?: [number, number];
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleStart: number;
  scaleEnd: number;
  alphaStart: number;
  alphaEnd: number;
  spin: number;
  gravity: number;
  drag: number;
}

export class ParticleSystem {
  readonly container = new Container();
  private pool: Sprite[] = [];
  private active: Particle[] = [];
  private rng = new Rng(0xdeadf0);
  /** Global density multiplier from quality settings. */
  density = 1;
  private readonly maxParticles: number;

  constructor(maxParticles = 900) {
    this.maxParticles = maxParticles;
  }

  private obtain(texture: Texture): Sprite {
    let sprite = this.pool.pop();
    if (!sprite) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
    } else {
      sprite.texture = texture;
    }
    sprite.visible = true;
    this.container.addChild(sprite);
    return sprite;
  }

  burst(x: number, y: number, spec: ParticleSpec, count: number): void {
    const n = Math.round(count * this.density);
    for (let i = 0; i < n; i++) {
      if (this.active.length >= this.maxParticles) return;
      const sprite = this.obtain(spec.texture);
      sprite.tint = spec.tint;
      sprite.blendMode = spec.additive === false ? 'normal' : 'add';
      const baseAngle = spec.angle ? spec.angle[0] : 0;
      const spread = spec.angle ? spec.angle[1] : Math.PI * 2;
      const a = baseAngle + this.rng.range(-spread / 2, spread / 2);
      const sp = this.rng.range(spec.speed[0], spec.speed[1]);
      const off = spec.offset ? this.rng.range(spec.offset[0], spec.offset[1]) : 0;
      sprite.position.set(x + Math.cos(a) * off, y + Math.sin(a) * off);
      const life = this.rng.range(spec.life[0], spec.life[1]);
      const scaleStart = this.rng.range(spec.scale[0], spec.scale[1]);
      const alphaStart = spec.alpha ? this.rng.range(spec.alpha[0], spec.alpha[1]) : 1;
      sprite.scale.set(scaleStart);
      sprite.alpha = alphaStart;
      sprite.rotation = this.rng.range(0, Math.PI * 2);
      this.active.push({
        sprite,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        maxLife: life,
        scaleStart,
        scaleEnd: scaleStart * (spec.scaleEnd ?? 0.2),
        alphaStart,
        alphaEnd: alphaStart * (spec.alphaEnd ?? 0),
        spin: spec.spin ? this.rng.range(spec.spin[0], spec.spin[1]) : 0,
        gravity: spec.gravity ?? 0,
        drag: spec.drag ?? 0,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.container.removeChild(p.sprite);
        this.pool.push(p.sprite);
        const last = this.active.pop()!;
        if (i < this.active.length) this.active[i] = last;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      const scale = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
      p.sprite.scale.set(scale);
      p.sprite.alpha = p.alphaStart + (p.alphaEnd - p.alphaStart) * t;
    }
    profiler.particles = this.active.length;
  }

  clear(): void {
    for (const p of this.active) {
      p.sprite.visible = false;
      this.container.removeChild(p.sprite);
      this.pool.push(p.sprite);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}
