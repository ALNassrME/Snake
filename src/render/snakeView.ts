/**
 * The wyrm itself: layered body segments with painted shading, a glowing
 * heart-line, expressive eyes, breathing, eat-pulse and a speed ghost trail.
 */
import { Container, Sprite } from 'pixi.js';
import { clamp01, lerp } from '../core/mathUtils';
import type { SkinDef } from '../game/cosmetics';
import type { Snake } from '../game/snake';
import { darken, lighten, mixColor } from './paint';
import type { TextureLibrary } from './textures';

interface Ghost {
  sprite: Sprite;
  life: number;
}

export class SnakeView {
  readonly container = new Container();

  private bodyLayer = new Container();
  private glowLayer = new Container();
  private headLayer = new Container();
  private ghostLayer = new Container();

  private segmentSprites: Sprite[] = [];
  private bellySprites: Sprite[] = [];
  private glowSprites: Sprite[] = [];
  private headGlow: Sprite;
  private headSprite: Sprite;
  private eyeL: Sprite;
  private eyeR: Sprite;
  private pupilL: Sprite;
  private pupilR: Sprite;
  private crest: Sprite;

  private ghosts: Ghost[] = [];
  private ghostTimer = 0;
  private eatPulse = 0;
  private time = 0;
  private tex: TextureLibrary;
  private skin: SkinDef;
  /** Glow sprites per N segments; raised on low quality. */
  glowStride = 3;
  ghostsEnabled = true;

  constructor(tex: TextureLibrary, skin: SkinDef) {
    this.tex = tex;
    this.skin = skin;
    this.container.addChild(this.ghostLayer, this.glowLayer, this.bodyLayer, this.headLayer);

    this.headGlow = new Sprite(tex.glow);
    this.headGlow.anchor.set(0.5);
    this.headGlow.blendMode = 'add';

    this.headSprite = new Sprite(tex.orb);
    this.headSprite.anchor.set(0.5);

    this.crest = new Sprite(tex.petal);
    this.crest.anchor.set(0.5, 1);

    this.eyeL = new Sprite(tex.segment);
    this.eyeR = new Sprite(tex.segment);
    this.pupilL = new Sprite(tex.segment);
    this.pupilR = new Sprite(tex.segment);
    for (const e of [this.eyeL, this.eyeR, this.pupilL, this.pupilR]) e.anchor.set(0.5);

    this.headLayer.addChild(this.headGlow, this.crest, this.headSprite, this.eyeL, this.eyeR, this.pupilL, this.pupilR);
    this.applySkin(skin);
  }

  applySkin(skin: SkinDef): void {
    this.skin = skin;
    this.headGlow.tint = skin.colors.glow;
    this.headSprite.tint = skin.colors.head;
    this.crest.tint = mixColor(skin.colors.bodyA, skin.colors.glow, 0.5);
    this.eyeL.tint = lighten(skin.colors.head, 0.5);
    this.eyeR.tint = lighten(skin.colors.head, 0.5);
    this.pupilL.tint = skin.colors.eye;
    this.pupilR.tint = skin.colors.eye;
    // Force segment retint on next sync.
    this.segmentSprites.forEach((s, i) => {
      s.tint = this.segmentTint(i, Math.max(1, this.segmentSprites.length));
    });
    this.bellySprites.forEach((s) => (s.tint = skin.colors.belly));
    this.glowSprites.forEach((s) => (s.tint = skin.colors.glow));
  }

  private segmentTint(i: number, count: number): number {
    const t = count <= 1 ? 0 : i / (count - 1);
    return mixColor(this.skin.colors.bodyA, this.skin.colors.bodyB, Math.pow(t, 0.85));
  }

  pulse(): void {
    this.eatPulse = 1;
  }

  update(snake: Snake, dt: number, dying: boolean): void {
    this.time += dt;
    this.eatPulse = Math.max(0, this.eatPulse - dt * 3);
    const segs = snake.segments;
    const count = segs.length;

    this.syncPools(count);

    const breath = 1 + Math.sin(this.time * 2.2) * 0.03;
    const pulseScale = 1 + this.eatPulse * 0.22;

    // --- body ---
    for (let i = 0; i < count; i++) {
      const seg = segs[i]!;
      const sprite = this.segmentSprites[i]!;
      const radius = snake.segmentRadius(i);
      // A wave of swell travels down the body after eating.
      const swell = 1 + this.eatPulse * 0.3 * Math.exp(-Math.abs(i - this.eatPulse * -8) * 0.2);
      const s = ((radius * 2) / this.tex.segment.width) * breath * swell * 1.12;
      sprite.position.set(seg.x, seg.y);
      sprite.scale.set(s);
      sprite.alpha = dying ? 0.55 : 1;

      const belly = this.bellySprites[i]!;
      belly.position.set(seg.x, seg.y);
      belly.scale.set(s * 0.52);
      belly.alpha = (dying ? 0.3 : 0.6) * (1 - (i / count) * 0.5);
    }

    // --- heart-line glow: every Nth segment carries an inner light ---
    let glowIndex = 0;
    for (let i = 0; i < count; i += this.glowStride) {
      const seg = segs[i]!;
      const g = this.glowSprites[glowIndex];
      if (!g) break;
      const flicker = 0.75 + 0.25 * Math.sin(this.time * 3.1 + i * 0.7);
      g.visible = true;
      g.position.set(seg.x, seg.y);
      g.scale.set((snake.segmentRadius(i) * 2.6) / this.tex.glow.width * 2);
      g.alpha = (dying ? 0.1 : 0.16) * flicker * (1 - (i / count) * 0.6) + this.eatPulse * 0.12;
      glowIndex++;
    }
    for (; glowIndex < this.glowSprites.length; glowIndex++) {
      this.glowSprites[glowIndex]!.visible = false;
    }

    // --- head ---
    const hx = snake.pos.x;
    const hy = snake.pos.y;
    const heading = snake.heading;
    const headScale = ((snake.headRadius * 2) / this.tex.orb.width) * 1.28 * breath * pulseScale;
    this.headSprite.position.set(hx, hy);
    this.headSprite.scale.set(headScale);
    this.headSprite.rotation = heading + Math.PI / 2;

    this.headGlow.position.set(hx, hy);
    this.headGlow.scale.set(headScale * 2.6 + this.eatPulse * 0.6);
    this.headGlow.alpha = dying ? 0.15 : 0.4 + this.eatPulse * 0.35 + Math.sin(this.time * 2.2) * 0.05;

    this.crest.position.set(hx - Math.cos(heading) * snake.headRadius * 0.5, hy - Math.sin(heading) * snake.headRadius * 0.5);
    this.crest.rotation = heading + Math.PI / 2;
    this.crest.scale.set(headScale * 0.5, headScale * 0.85 * (1 + this.eatPulse * 0.3));
    this.crest.alpha = dying ? 0.4 : 0.9;

    // Eyes sit forward of centre, perpendicular to travel; pupils lead the turn.
    const perp = heading + Math.PI / 2;
    const eyeDist = snake.headRadius * 0.52;
    const fwd = snake.headRadius * 0.34;
    const eyeR = snake.headRadius * 0.4;
    const blink = Math.abs(Math.sin(this.time * 0.5)) > 0.985 ? 0.15 : 1;
    for (const [eye, pupil, side] of [
      [this.eyeL, this.pupilL, -1],
      [this.eyeR, this.pupilR, 1],
    ] as const) {
      const ex = hx + Math.cos(heading) * fwd + Math.cos(perp) * eyeDist * side;
      const ey = hy + Math.sin(heading) * fwd + Math.sin(perp) * eyeDist * side;
      eye.position.set(ex, ey);
      eye.scale.set((eyeR * 2) / this.tex.segment.width, ((eyeR * 2) / this.tex.segment.width) * blink);
      eye.rotation = heading + Math.PI / 2;
      const lookAhead = snake.headRadius * 0.14;
      pupil.position.set(ex + Math.cos(heading) * lookAhead, ey + Math.sin(heading) * lookAhead);
      pupil.scale.set((eyeR * 0.95) / this.tex.segment.width, ((eyeR * 0.95) / this.tex.segment.width) * blink);
      if (dying) {
        eye.scale.y *= 0.2;
        pupil.scale.y *= 0.2;
      }
    }

    // --- ghost trail (motion blur at speed) ---
    this.ghostTimer -= dt;
    const speedT = clamp01((snake.speed - 210) / 140);
    if (this.ghostsEnabled && !dying && speedT > 0 && this.ghostTimer <= 0) {
      this.ghostTimer = 0.045;
      const ghost = new Sprite(this.tex.segment);
      ghost.anchor.set(0.5);
      ghost.position.set(hx, hy);
      ghost.scale.set(headScale * 0.95);
      ghost.tint = this.skin.colors.glow;
      ghost.blendMode = 'add';
      ghost.alpha = 0.22 * speedT;
      this.ghostLayer.addChild(ghost);
      this.ghosts.push({ sprite: ghost, life: 0.3 });
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]!;
      g.life -= dt;
      g.sprite.alpha *= 1 - dt * 6;
      g.sprite.scale.set(g.sprite.scale.x * (1 - dt * 1.2));
      if (g.life <= 0) {
        this.ghostLayer.removeChild(g.sprite);
        g.sprite.destroy();
        this.ghosts.splice(i, 1);
      }
    }
  }

  private lastCount = -1;

  private syncPools(count: number): void {
    if (count === this.lastCount) return;
    this.lastCount = count;
    while (this.segmentSprites.length < count) {
      const i = this.segmentSprites.length;
      const sprite = new Sprite(this.tex.segment);
      sprite.anchor.set(0.5);
      this.bodyLayer.addChildAt(sprite, 0); // tail renders beneath the front
      this.segmentSprites.push(sprite);

      const belly = new Sprite(this.tex.segment);
      belly.anchor.set(0.5);
      belly.tint = this.skin.colors.belly;
      this.bodyLayer.addChild(belly);
      this.bellySprites.push(belly);

      if (i % this.glowStride === 0) {
        const g = new Sprite(this.tex.glow);
        g.anchor.set(0.5);
        g.tint = this.skin.colors.glow;
        g.blendMode = 'add';
        this.glowLayer.addChild(g);
        this.glowSprites.push(g);
      }
    }
    while (this.segmentSprites.length > count) {
      const sprite = this.segmentSprites.pop()!;
      this.bodyLayer.removeChild(sprite);
      sprite.destroy();
      const belly = this.bellySprites.pop()!;
      this.bodyLayer.removeChild(belly);
      belly.destroy();
    }
    // Belly sprites must render above all segments: re-sort cheaply by moving
    // them to the end once per resize.
    if (this.bellySprites.length > 0 && this.bodyLayer.children.length > 0) {
      for (const belly of this.bellySprites) {
        this.bodyLayer.removeChild(belly);
        this.bodyLayer.addChild(belly);
      }
    }
    // Retint after growth so the gradient stays smooth.
    for (let i = 0; i < this.segmentSprites.length; i++) {
      this.segmentSprites[i]!.tint = this.segmentTint(i, count);
    }
  }

  /** Fades used during the death beat. */
  setDeathFade(t: number): void {
    this.container.alpha = lerp(1, 0.35, clamp01(t));
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export { darken };
