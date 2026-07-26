/**
 * World-space dressing: ground, arena edge, obstacles, animated plants,
 * bellflowers and ambient wildlife (fireflies, moths, veilbirds).
 */
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { clamp, clamp01, wobble, type Vec2 } from '../core/mathUtils';
import { Rng } from '../core/rng';
import type { Bellflower, WorldMap } from '../game/types';
import { lighten, mixColor } from './paint';
import type { TextureLibrary } from './textures';

interface PlantTuft {
  sprites: Sprite[];
  baseRotations: number[];
  pos: Vec2;
  phase: number;
  stiffness: number;
}

interface Firefly {
  sprite: Sprite;
  anchor: Vec2;
  phase: number;
  radius: number;
}

interface Moth {
  sprite: Sprite;
  pos: Vec2;
  home: Vec2;
  vel: Vec2;
  phase: number;
}

interface BellView {
  sprite: Sprite;
  glow: Sprite;
  bell: Bellflower;
  ringT: number;
  ring: Sprite;
}

export class WorldDecor {
  /** Rendered beneath the snake. */
  readonly under = new Container();
  /** Rendered above the snake (near-ground foliage overlap). */
  readonly over = new Container();

  private tufts: PlantTuft[] = [];
  private fireflies: Firefly[] = [];
  private moths: Moth[] = [];
  private bells: BellView[] = [];
  private bird: Sprite | null = null;
  private birdT = 0;
  private birdWait = 20;
  private time = 0;
  private map: WorldMap;
  private tex: TextureLibrary;

  constructor(map: WorldMap, tex: TextureLibrary, bellflowers: readonly Bellflower[], density: number) {
    this.map = map;
    this.tex = tex;
    this.build(bellflowers, density);
  }

  private build(bellflowers: readonly Bellflower[], density: number): void {
    const rng = new Rng(this.map.decorSeed);
    const p = this.map.palette;

    // --- ground ---
    const ground = new TilingSprite({
      texture: this.tex.ground,
      width: this.map.width,
      height: this.map.height,
    });
    ground.tint = p.ground;
    this.under.addChild(ground);

    // Big soft pools of accent light on the ground.
    for (let i = 0; i < 14; i++) {
      const pool = new Sprite(this.tex.glow);
      pool.anchor.set(0.5);
      pool.position.set(rng.range(0, this.map.width), rng.range(0, this.map.height));
      pool.scale.set(rng.range(2.4, 5.2));
      pool.tint = rng.chance(0.7) ? p.accent : p.accentWarm;
      pool.alpha = rng.range(0.025, 0.06);
      pool.blendMode = 'add';
      this.under.addChild(pool);
    }

    // --- arena edge ---
    const edge = new Graphics();
    const inset = 10;
    edge.roundRect(inset, inset, this.map.width - inset * 2, this.map.height - inset * 2, 60);
    edge.stroke({ width: 5, color: p.accent, alpha: 0.35 });
    edge.roundRect(inset + 9, inset + 9, this.map.width - (inset + 9) * 2, this.map.height - (inset + 9) * 2, 52);
    edge.stroke({ width: 1.5, color: lighten(p.accent, 0.4), alpha: 0.4 });
    this.under.addChild(edge);
    // Warding sigil-lights spaced along the boundary.
    const perim = 2 * (this.map.width + this.map.height);
    const sigils = Math.floor(perim / 420);
    for (let i = 0; i < sigils; i++) {
      const d = (i / sigils) * perim;
      const pos = this.perimeterPoint(d, 26);
      const s = new Sprite(this.tex.spark);
      s.anchor.set(0.5);
      s.position.set(pos.x, pos.y);
      s.scale.set(0.5);
      s.tint = p.accent;
      s.alpha = 0.5;
      s.blendMode = 'add';
      this.under.addChild(s);
    }

    // --- obstacles ---
    for (const o of this.map.obstacles) {
      const variants =
        o.kind === 'stone' ? this.tex.stones : o.kind === 'pillar' ? this.tex.pillars : this.tex.crystals;
      const texture = variants[Math.abs((o.x * 7 + o.y * 13) | 0) % variants.length]!;
      // Contact shadow.
      const shadow = new Sprite(this.tex.glow);
      shadow.anchor.set(0.5);
      shadow.tint = 0x000000;
      shadow.alpha = 0.4;
      shadow.position.set(o.x + 6, o.y + 10);
      shadow.scale.set((o.r * 2.4) / 160);
      this.under.addChild(shadow);

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, o.kind === 'pillar' ? 0.62 : 0.5);
      sprite.position.set(o.x, o.y);
      const targetW = o.r * 2.35;
      sprite.scale.set(targetW / texture.width);
      // Sink the greyscale stone art into the map's palette so it reads as
      // part of the painted ground rather than a pasted-on prop.
      sprite.tint = mixColor(0xffffff, mixColor(p.ground, p.layers[1], 0.5), 0.62);
      this.under.addChild(sprite);

      // Luminous moss / mineral veins clinging to it.
      const mossCount = o.kind === 'crystal' ? 3 : 2;
      for (let m = 0; m < mossCount; m++) {
        const a = rng.range(0, Math.PI * 2);
        const moss = new Sprite(this.tex.spark);
        moss.anchor.set(0.5);
        moss.position.set(o.x + Math.cos(a) * o.r * 0.55, o.y + Math.sin(a) * o.r * 0.55);
        moss.scale.set(rng.range(0.4, 0.9) * (o.r / 60));
        moss.tint = o.kind === 'crystal' ? p.accentWarm : p.accent;
        moss.alpha = 0.5;
        moss.blendMode = 'add';
        this.under.addChild(moss);
      }
    }

    // --- plant tufts ---
    const tuftCount = Math.round(58 * density);
    for (let i = 0; i < tuftCount; i++) {
      const pos: Vec2 = {
        x: rng.range(60, this.map.width - 60),
        y: rng.range(60, this.map.height - 60),
      };
      const nearObstacle = this.map.obstacles.some(
        (o) => Math.hypot(pos.x - o.x, pos.y - o.y) < o.r + 30,
      );
      if (nearObstacle) continue;
      const blades = rng.int(3, 6);
      const tuft: PlantTuft = {
        sprites: [],
        baseRotations: [],
        pos,
        phase: rng.range(0, 40),
        stiffness: rng.range(0.6, 1.4),
      };
      const layer = rng.chance(0.22) ? this.over : this.under;
      for (let b = 0; b < blades; b++) {
        const sprite = new Sprite(rng.pick(this.tex.blades));
        sprite.anchor.set(0.5, 1);
        const jx = rng.range(-14, 14);
        sprite.position.set(pos.x + jx, pos.y + rng.range(-4, 4));
        sprite.scale.set(rng.range(0.35, 0.85) * (layer === this.over ? 1.2 : 1));
        const baseRot = rng.range(-0.28, 0.28);
        sprite.rotation = baseRot;
        sprite.tint = mixColor(p.plant, p.plantAlt, rng.next());
        sprite.alpha = layer === this.over ? 0.92 : 0.85;
        layer.addChild(sprite);
        tuft.sprites.push(sprite);
        tuft.baseRotations.push(baseRot);
      }
      this.tufts.push(tuft);
    }

    // --- bellflowers ---
    for (const bell of bellflowers) {
      const glow = new Sprite(this.tex.glow);
      glow.anchor.set(0.5);
      glow.position.set(bell.pos.x, bell.pos.y - 46);
      glow.tint = p.accentWarm;
      glow.alpha = 0.22;
      glow.scale.set(0.9);
      glow.blendMode = 'add';
      const sprite = new Sprite(this.tex.bellflower);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(bell.pos.x, bell.pos.y + 24);
      sprite.tint = mixColor(0xffffff, p.accentWarm, 0.35);
      const ring = new Sprite(this.tex.ring);
      ring.anchor.set(0.5);
      ring.position.set(bell.pos.x, bell.pos.y - 40);
      ring.tint = p.accentWarm;
      ring.alpha = 0;
      ring.blendMode = 'add';
      this.under.addChild(glow, sprite, ring);
      this.bells.push({ sprite, glow, bell, ringT: 1, ring });
    }

    // --- fireflies ---
    const flyCount = Math.round(26 * density);
    for (let i = 0; i < flyCount; i++) {
      const sprite = new Sprite(this.tex.mote);
      sprite.anchor.set(0.5);
      sprite.tint = rng.chance(0.75) ? p.accent : p.accentWarm;
      sprite.blendMode = 'add';
      sprite.scale.set(rng.range(0.25, 0.55));
      const anchor: Vec2 = {
        x: rng.range(80, this.map.width - 80),
        y: rng.range(80, this.map.height - 80),
      };
      this.under.addChild(sprite);
      this.fireflies.push({ sprite, anchor, phase: rng.range(0, 90), radius: rng.range(30, 130) });
    }

    // --- moths ---
    const mothCount = Math.round(8 * density);
    for (let i = 0; i < mothCount; i++) {
      const sprite = new Sprite(this.tex.petal);
      sprite.anchor.set(0.5);
      sprite.tint = lighten(p.accent, 0.55);
      sprite.alpha = 0.75;
      sprite.scale.set(rng.range(0.3, 0.5));
      const home: Vec2 = {
        x: rng.range(120, this.map.width - 120),
        y: rng.range(120, this.map.height - 120),
      };
      this.over.addChild(sprite);
      this.moths.push({
        sprite,
        pos: { ...home },
        home,
        vel: { x: 0, y: 0 },
        phase: rng.range(0, 60),
      });
    }
  }

  private perimeterPoint(d: number, inset: number): Vec2 {
    const w = this.map.width - inset * 2;
    const h = this.map.height - inset * 2;
    let rem = d % (2 * (w + h));
    if (rem < w) return { x: inset + rem, y: inset };
    rem -= w;
    if (rem < h) return { x: inset + w, y: inset + rem };
    rem -= h;
    if (rem < w) return { x: inset + w - rem, y: inset + h };
    rem -= w;
    return { x: inset, y: inset + h - rem };
  }

  chime(pos: Vec2): void {
    for (const b of this.bells) {
      if (Math.hypot(b.bell.pos.x - pos.x, b.bell.pos.y - pos.y) < 40) {
        b.ringT = 0;
      }
    }
  }

  update(dt: number, head: Vec2, nightFactor: number): void {
    this.time += dt;
    const wind = wobble(this.time * 0.35, 3) * 0.6 + wobble(this.time * 1.1, 8) * 0.25;

    // Plants sway in the wind and bow away from the passing wyrm.
    for (const tuft of this.tufts) {
      const dx = tuft.pos.x - head.x;
      const dy = tuft.pos.y - head.y;
      const d2 = dx * dx + dy * dy;
      let push = 0;
      if (d2 < 110 * 110) {
        const d = Math.sqrt(d2) || 1;
        push = (1 - d / 110) * 0.7 * Math.sign(dx || 1);
      }
      const sway = wind * 0.16 * tuft.stiffness + wobble(this.time * 1.4 + tuft.phase, 2) * 0.05;
      for (let i = 0; i < tuft.sprites.length; i++) {
        tuft.sprites[i]!.rotation = tuft.baseRotations[i]! + sway + push;
      }
    }

    // Bellflowers pulse gently; chime rings expand and fade.
    for (const b of this.bells) {
      b.glow.alpha = (0.18 + 0.08 * Math.sin(this.time * 1.3 + b.bell.id)) * (1 + nightFactor * 0.7);
      b.glow.scale.set(0.85 + 0.1 * Math.sin(this.time * 1.3 + b.bell.id));
      if (b.ringT < 1) {
        b.ringT = Math.min(1, b.ringT + dt / 1.1);
        b.ring.alpha = (1 - b.ringT) * 0.8;
        b.ring.scale.set(0.3 + b.ringT * 2.2);
        b.sprite.rotation = Math.sin(b.ringT * Math.PI * 5) * 0.12 * (1 - b.ringT);
      }
    }

    // Fireflies orbit their anchors, brighter at night.
    for (const f of this.fireflies) {
      const t = this.time * 0.5 + f.phase;
      f.sprite.x = f.anchor.x + Math.cos(t) * f.radius + wobble(t * 1.7, 1) * 18;
      f.sprite.y = f.anchor.y + Math.sin(t * 0.8) * f.radius * 0.6 + wobble(t * 1.3, 5) * 14;
      f.sprite.alpha = (0.25 + 0.55 * Math.abs(Math.sin(t * 1.9))) * (0.45 + nightFactor * 0.8);
    }

    // Moths flutter near home and scatter when the wyrm rushes past.
    for (const m of this.moths) {
      const toHomeX = m.home.x - m.pos.x;
      const toHomeY = m.home.y - m.pos.y;
      m.vel.x += toHomeX * 0.4 * dt + wobble(this.time * 2.4 + m.phase, 2) * 60 * dt;
      m.vel.y += toHomeY * 0.4 * dt + wobble(this.time * 2.1 + m.phase, 9) * 60 * dt;
      const dx = m.pos.x - head.x;
      const dy = m.pos.y - head.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 160 * 160) {
        const d = Math.sqrt(d2) || 1;
        const flee = (1 - d / 160) * 620;
        m.vel.x += (dx / d) * flee * dt;
        m.vel.y += (dy / d) * flee * dt;
      }
      m.vel.x *= 1 - Math.min(1, 1.6 * dt);
      m.vel.y *= 1 - Math.min(1, 1.6 * dt);
      m.pos.x += m.vel.x * dt;
      m.pos.y += m.vel.y * dt;
      m.sprite.position.set(m.pos.x, m.pos.y);
      m.sprite.rotation = Math.atan2(m.vel.y, m.vel.x) + Math.PI / 2;
      m.sprite.scale.y = (0.3 + 0.18 * Math.abs(Math.sin(this.time * 14 + m.phase))) * 1.2;
    }

    // A veilbird occasionally glides across the upper vale.
    this.updateBird(dt);
  }

  private updateBird(dt: number): void {
    if (!this.bird) {
      this.birdWait -= dt;
      if (this.birdWait <= 0) {
        this.bird = new Sprite(this.tex.petal);
        this.bird.anchor.set(0.5);
        this.bird.tint = 0x0a0f14;
        this.bird.alpha = 0.55;
        this.bird.scale.set(1.4, 0.5);
        this.birdT = 0;
        this.over.addChild(this.bird);
      }
      return;
    }
    this.birdT += dt / 14;
    const y = this.map.height * 0.18 + Math.sin(this.birdT * Math.PI * 3) * 80;
    this.bird.position.set(this.map.width * clamp01(this.birdT), y);
    this.bird.rotation = Math.PI / 2 + Math.sin(this.birdT * 40) * 0.2;
    this.bird.scale.y = 0.3 + 0.25 * Math.abs(Math.sin(this.birdT * 46));
    if (this.birdT >= 1) {
      this.over.removeChild(this.bird);
      this.bird.destroy();
      this.bird = null;
      this.birdWait = 18 + Math.random() * 30;
    }
  }

  /** Visibility culling: hide sprites far outside the camera view. */
  cull(camX: number, camY: number, halfW: number, halfH: number): void {
    const pad = 220;
    const minX = camX - halfW - pad;
    const maxX = camX + halfW + pad;
    const minY = camY - halfH - pad;
    const maxY = camY + halfH + pad;
    for (const tuft of this.tufts) {
      const visible =
        tuft.pos.x > minX && tuft.pos.x < maxX && tuft.pos.y > minY && tuft.pos.y < maxY;
      for (const s of tuft.sprites) s.visible = visible;
    }
    for (const f of this.fireflies) {
      f.sprite.visible =
        f.anchor.x > minX - 150 && f.anchor.x < maxX + 150 && f.anchor.y > minY - 150 && f.anchor.y < maxY + 150;
    }
  }

  destroy(): void {
    this.under.destroy({ children: true });
    this.over.destroy({ children: true });
  }
}

export function clampDensity(v: number): number {
  return clamp(v, 0.3, 1.2);
}
