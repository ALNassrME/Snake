/**
 * The wyrm itself — the visual centrepiece of the game.
 *
 * Layered per segment: an additive under-glow heart-line, the painted body
 * disc, a belly highlight, translucent dorsal fins that sway with travel,
 * and specular glints. The head carries a three-horned crest, luminous eyes
 * and a flicking tongue. At high combo the wyrm enters "fever": the glow
 * ignites, light rays wheel behind the head and the crest burns brighter —
 * the score multiplier made visible on the creature itself.
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
  private bellyLayer = new Container();
  private glintLayer = new Container();
  private glowLayer = new Container();
  private headLayer = new Container();
  private ghostLayer = new Container();

  private segmentSprites: Sprite[] = [];
  private bellySprites: Sprite[] = [];
  private glintSprites: Sprite[] = [];
  private glowSprites: Sprite[] = [];
  private headGlow: Sprite;
  private feverRays: Sprite;
  private headSprite: Sprite;
  private crest: Sprite[] = [];
  private tongue: Sprite;
  private eyeL: Sprite;
  private eyeR: Sprite;
  private eyeGlowL: Sprite;
  private eyeGlowR: Sprite;
  private pupilL: Sprite;
  private pupilR: Sprite;

  private ghosts: Ghost[] = [];
  private ghostTimer = 0;
  private eatPulse = 0;
  /** 0..1, eased — drives the fever visual state. */
  private fever = 0;
  private time = 0;
  private tex: TextureLibrary;
  private skin: SkinDef;
  /** Glow sprites per N segments; raised on low quality. */
  glowStride = 3;
  ghostsEnabled = true;
  /** Fins and glints are pure dressing — shed them first on weak devices. */
  dressingEnabled = true;

  constructor(tex: TextureLibrary, skin: SkinDef) {
    this.tex = tex;
    this.skin = skin;
    this.container.addChild(
      this.ghostLayer,
      this.glowLayer,
      this.bodyLayer,
      this.bellyLayer,
      this.glintLayer,
      this.headLayer,
    );

    this.headGlow = new Sprite(tex.glow);
    this.headGlow.anchor.set(0.5);
    this.headGlow.blendMode = 'add';

    this.feverRays = new Sprite(tex.rays);
    this.feverRays.anchor.set(0.5);
    this.feverRays.blendMode = 'add';
    this.feverRays.alpha = 0;

    this.headSprite = new Sprite(tex.orb);
    this.headSprite.anchor.set(0.5);

    // Crest: centre horn plus one swept back on each side.
    for (let i = 0; i < 3; i++) {
      const horn = new Sprite(tex.fin);
      horn.anchor.set(0.5, 1);
      this.crest.push(horn);
    }

    this.tongue = new Sprite(tex.streak);
    this.tongue.anchor.set(0, 0.5);
    this.tongue.alpha = 0;

    this.eyeL = new Sprite(tex.segment);
    this.eyeR = new Sprite(tex.segment);
    this.eyeGlowL = new Sprite(tex.spark);
    this.eyeGlowR = new Sprite(tex.spark);
    this.pupilL = new Sprite(tex.segment);
    this.pupilR = new Sprite(tex.segment);
    for (const e of [this.eyeL, this.eyeR, this.eyeGlowL, this.eyeGlowR, this.pupilL, this.pupilR]) {
      e.anchor.set(0.5);
    }
    this.eyeGlowL.blendMode = 'add';
    this.eyeGlowR.blendMode = 'add';

    this.headLayer.addChild(
      this.feverRays,
      this.headGlow,
      ...this.crest,
      this.tongue,
      this.headSprite,
      this.eyeGlowL,
      this.eyeGlowR,
      this.eyeL,
      this.eyeR,
      this.pupilL,
      this.pupilR,
    );
    this.applySkin(skin);
  }

  applySkin(skin: SkinDef): void {
    this.skin = skin;
    this.rebuildBaseTints(this.segmentSprites.length);
    const c = skin.colors;
    this.headGlow.tint = c.glow;
    this.feverRays.tint = lighten(c.glow, 0.3);
    this.headSprite.tint = c.head;
    for (const horn of this.crest) horn.tint = mixColor(c.bodyA, c.glow, 0.6);
    this.tongue.tint = mixColor(c.glow, 0xff8080, 0.45);
    this.eyeL.tint = lighten(c.head, 0.5);
    this.eyeR.tint = lighten(c.head, 0.5);
    this.eyeGlowL.tint = c.glow;
    this.eyeGlowR.tint = c.glow;
    this.pupilL.tint = c.eye;
    this.pupilR.tint = c.eye;
    this.segmentSprites.forEach((s, i) => {
      s.tint = this.segmentTint(i);
    });
    this.bellySprites.forEach((s) => (s.tint = c.belly));
    this.glintSprites.forEach((s) => (s.tint = lighten(c.head, 0.4)));
    this.glowSprites.forEach((s) => (s.tint = c.glow));
  }

  /** Static head-to-tail gradient, rebuilt only on growth or skin change. */
  private baseTints: number[] = [];

  private rebuildBaseTints(count: number): void {
    this.baseTints.length = count;
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0 : i / (count - 1);
      this.baseTints[i] = mixColor(this.skin.colors.bodyA, this.skin.colors.bodyB, Math.pow(t, 0.85));
    }
  }

  private segmentTint(i: number): number {
    const base = this.baseTints[i] ?? this.skin.colors.bodyA;
    // A slow iridescent shimmer travelling down the body sells living scales.
    const shimmer = 0.5 + 0.5 * Math.sin(this.time * 2.2 - i * 0.45);
    return mixColor(base, this.skin.colors.glow, 0.12 * shimmer + this.fever * 0.16);
  }

  pulse(): void {
    this.eatPulse = 1;
  }

  /** Combo-driven excitement; 1 fully ignites the fever visuals. */
  setFever(target: number, dt: number): void {
    const t = clamp01(target);
    this.fever = lerp(this.fever, t, Math.min(1, dt * 3));
    // The lerp never truly reaches zero; snap once imperceptible so
    // fever-driven effects (ghost trail) actually stop. Only when decaying —
    // an unconditional snap would swallow the first ramp-up step.
    if (t === 0 && this.fever < 0.02) this.fever = 0;
  }

  update(snake: Snake, dt: number, dying: boolean): void {
    this.time += dt;
    this.eatPulse = Math.max(0, this.eatPulse - dt * 3);
    const segs = snake.segments;
    const count = segs.length;
    const c = this.skin.colors;

    this.syncPools(count);

    const breath = 1 + Math.sin(this.time * 2.2) * 0.03;
    const pulseScale = 1 + this.eatPulse * 0.22;

    // --- body ---
    for (let i = 0; i < count; i++) {
      const seg = segs[i]!;
      const sprite = this.segmentSprites[i]!;
      const radius = snake.segmentRadius(i);
      const swell = 1 + this.eatPulse * 0.3 * Math.exp(-Math.abs(i - this.eatPulse * -8) * 0.2);
      const s = ((radius * 2) / this.tex.segment.width) * breath * swell * 1.12;
      sprite.position.set(seg.x, seg.y);
      sprite.scale.set(s);
      sprite.alpha = dying ? 0.55 : 1;
      sprite.tint = this.segmentTint(i);

      const belly = this.bellySprites[i]!;
      belly.position.set(seg.x, seg.y - radius * 0.22);
      belly.scale.set(s * 0.5);
      belly.alpha = (dying ? 0.3 : 0.55) * (1 - (i / count) * 0.5);

      const glint = this.glintSprites[i]!;
      if (this.dressingEnabled && i % 3 === 1) {
        // A wet specular dot that flares as the shimmer wave passes.
        const flare = Math.max(0, Math.sin(this.time * 2.2 - i * 0.45));
        glint.visible = true;
        glint.position.set(seg.x - radius * 0.3, seg.y - radius * 0.42);
        glint.scale.set(s * 0.16 * (0.7 + flare * 0.6));
        glint.alpha = (dying ? 0.1 : 0.5) * flare;
      } else {
        glint.visible = false;
      }
    }

    // --- heart-line glow ---
    let glowIndex = 0;
    for (let i = 0; i < count; i += this.glowStride) {
      const seg = segs[i]!;
      const g = this.glowSprites[glowIndex];
      if (!g) break;
      const flicker = 0.75 + 0.25 * Math.sin(this.time * 3.1 + i * 0.7);
      g.visible = true;
      g.position.set(seg.x, seg.y);
      g.scale.set(
        ((snake.segmentRadius(i) * 2.6) / this.tex.glow.width) * 2 * (1 + this.fever * 0.5),
      );
      g.alpha =
        (dying ? 0.1 : 0.16 + this.fever * 0.2) * flicker * (1 - (i / count) * 0.6) +
        this.eatPulse * 0.12;
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
    this.headSprite.tint = mixColor(c.head, c.glow, this.fever * 0.25);

    this.headGlow.position.set(hx, hy);
    this.headGlow.scale.set(headScale * (2.6 + this.fever * 1.4) + this.eatPulse * 0.6);
    this.headGlow.alpha = dying
      ? 0.15
      : 0.4 + this.fever * 0.3 + this.eatPulse * 0.35 + Math.sin(this.time * 2.2) * 0.05;

    this.feverRays.position.set(hx, hy);
    this.feverRays.rotation = this.time * 0.9;
    this.feverRays.scale.set(headScale * 2.6 * (0.8 + this.fever * 0.5));
    this.feverRays.alpha = dying ? 0 : this.fever * 0.5;

    // Crest horns: centre horn upright, side horns swept outward and back.
    const crestBase = 0.55;
    for (let i = 0; i < this.crest.length; i++) {
      const horn = this.crest[i]!;
      const side = i - 1; // -1, 0, 1
      const backX = hx - Math.cos(heading) * snake.headRadius * crestBase;
      const backY = hy - Math.sin(heading) * snake.headRadius * crestBase;
      const perp = heading + Math.PI / 2;
      horn.position.set(
        backX + Math.cos(perp) * side * snake.headRadius * 0.45,
        backY + Math.sin(perp) * side * snake.headRadius * 0.45,
      );
      horn.rotation = heading + Math.PI / 2 + side * (0.55 + this.fever * 0.15);
      const hs = headScale * (side === 0 ? 0.62 : 0.45) * (1 + this.fever * 0.25);
      horn.scale.set(hs * 0.7, hs * (1 + Math.sin(this.time * 2.6 + i) * 0.06));
      horn.alpha = dying ? 0.3 : 0.85;
    }

    // Tongue flick: a quick dart every few seconds.
    const flickPhase = (this.time % 2.8) / 2.8;
    const flick = flickPhase < 0.12 ? Math.sin((flickPhase / 0.12) * Math.PI) : 0;
    this.tongue.position.set(
      hx + Math.cos(heading) * snake.headRadius * 0.9,
      hy + Math.sin(heading) * snake.headRadius * 0.9,
    );
    this.tongue.rotation = heading;
    this.tongue.scale.set(headScale * 0.5 * flick, headScale * 0.22);
    this.tongue.alpha = dying ? 0 : flick * 0.9;

    // Eyes: luminous, leading the turn, blinking rarely.
    const perp = heading + Math.PI / 2;
    const eyeDist = snake.headRadius * 0.52;
    const fwd = snake.headRadius * 0.34;
    const eyeR = snake.headRadius * 0.4;
    const blink = Math.abs(Math.sin(this.time * 0.5)) > 0.985 ? 0.15 : 1;
    for (const [eye, glow, pupil, side] of [
      [this.eyeL, this.eyeGlowL, this.pupilL, -1],
      [this.eyeR, this.eyeGlowR, this.pupilR, 1],
    ] as const) {
      const ex = hx + Math.cos(heading) * fwd + Math.cos(perp) * eyeDist * side;
      const ey = hy + Math.sin(heading) * fwd + Math.sin(perp) * eyeDist * side;
      eye.position.set(ex, ey);
      eye.scale.set(
        (eyeR * 2) / this.tex.segment.width,
        ((eyeR * 2) / this.tex.segment.width) * blink,
      );
      eye.rotation = heading + Math.PI / 2;
      glow.position.set(ex, ey);
      glow.scale.set((eyeR * 4.4) / this.tex.spark.width);
      glow.alpha = (dying ? 0.1 : 0.5 + this.fever * 0.4) * blink;
      const lookAhead = snake.headRadius * 0.14;
      pupil.position.set(ex + Math.cos(heading) * lookAhead, ey + Math.sin(heading) * lookAhead);
      pupil.scale.set(
        (eyeR * 0.95) / this.tex.segment.width,
        ((eyeR * 0.95) / this.tex.segment.width) * blink,
      );
      if (dying) {
        eye.scale.y *= 0.2;
        pupil.scale.y *= 0.2;
      }
    }

    // --- ghost trail (motion blur at speed, always breathing in fever) ---
    this.ghostTimer -= dt;
    const speedT = Math.max(clamp01((snake.speed - 210) / 140), this.fever * 0.6);
    if (this.ghostsEnabled && !dying && speedT > 0.05 && this.ghostTimer <= 0) {
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
      this.bellyLayer.addChild(belly);
      this.bellySprites.push(belly);

      const glint = new Sprite(this.tex.spark);
      glint.anchor.set(0.5);
      glint.blendMode = 'add';
      glint.tint = lighten(this.skin.colors.head, 0.4);
      glint.visible = false;
      this.glintLayer.addChild(glint);
      this.glintSprites.push(glint);

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
      this.bellyLayer.removeChild(belly);
      belly.destroy();
      const glint = this.glintSprites.pop()!;
      this.glintLayer.removeChild(glint);
      glint.destroy();
    }
    this.rebuildBaseTints(count);
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
