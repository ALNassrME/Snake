/**
 * The wyrm itself — the visual centrepiece of the game.
 *
 * Styled after a porcelain vessel-spirit: a flat white mask of a face with
 * two long ears and dark hollow eyes, riding a dark cloaked body. Layered
 * per segment: an additive under-glow heart-line, the painted body disc, a
 * belly highlight and specular glints. At high combo the wyrm enters
 * "fever": the glow ignites and light rays wheel behind the head — the
 * score multiplier made visible on the creature itself.
 */
import { Container, Sprite } from 'pixi.js';
import { clamp01, lerp, wobble } from '../core/mathUtils';
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
  private ears: Sprite[] = [];
  private eyeL: Sprite;
  private eyeR: Sprite;

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
  /** Glints are pure dressing — shed them first on weak devices. */
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

    // Two long mask-ears trailing from the back of the head.
    for (let i = 0; i < 2; i++) {
      const ear = new Sprite(tex.ear);
      ear.anchor.set(0.5, 1);
      this.ears.push(ear);
    }

    // Hollow oval eyes set into the white mask.
    this.eyeL = new Sprite(tex.segment);
    this.eyeR = new Sprite(tex.segment);
    this.eyeL.anchor.set(0.5);
    this.eyeR.anchor.set(0.5);

    this.headLayer.addChild(
      this.feverRays,
      this.headGlow,
      ...this.ears,
      this.headSprite,
      this.eyeL,
      this.eyeR,
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
    // Ears match the mask, a touch brighter so they read against the sky.
    for (const ear of this.ears) ear.tint = lighten(c.head, 0.15);
    this.eyeL.tint = c.eye;
    this.eyeR.tint = c.eye;
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

    // Ears: two long white blades trailing behind the head, splayed apart
    // and swaying gently — the mask-spirit silhouette.
    for (let i = 0; i < this.ears.length; i++) {
      const ear = this.ears[i]!;
      const side = i === 0 ? -1 : 1;
      const perpA = heading + Math.PI / 2;
      const backX = hx - Math.cos(heading) * snake.headRadius * 0.3;
      const backY = hy - Math.sin(heading) * snake.headRadius * 0.3;
      ear.position.set(
        backX + Math.cos(perpA) * side * snake.headRadius * 0.42,
        backY + Math.sin(perpA) * side * snake.headRadius * 0.42,
      );
      const sway = wobble(this.time * 1.6, i * 3.1) * 0.06;
      // Anchor at the base pointing "up" the sprite; heading - PI/2 turns
      // that up-vector to trail behind the direction of travel.
      ear.rotation = heading - Math.PI / 2 + side * (0.24 + this.fever * 0.1) + sway;
      const es = headScale * (1.05 + this.fever * 0.15);
      ear.scale.set(es * 0.62, es * (1 + Math.sin(this.time * 2.1 + i * 2.6) * 0.03));
      ear.alpha = dying ? 0.4 : 1;
    }

    // Eyes: dark hollow ovals set into the mask, blinking rarely.
    const perp = heading + Math.PI / 2;
    const eyeDist = snake.headRadius * 0.42;
    const fwd = snake.headRadius * 0.18;
    const eyeR = snake.headRadius * 0.3;
    const blink = Math.abs(Math.sin(this.time * 0.5)) > 0.985 ? 0.15 : 1;
    for (const [eye, side] of [
      [this.eyeL, -1],
      [this.eyeR, 1],
    ] as const) {
      const ex = hx + Math.cos(heading) * fwd + Math.cos(perp) * eyeDist * side;
      const ey = hy + Math.sin(heading) * fwd + Math.sin(perp) * eyeDist * side;
      eye.position.set(ex, ey);
      // Taller than wide, like hollows carved into porcelain; the long axis
      // runs with the direction of travel.
      eye.scale.set(
        (eyeR * 1.5) / this.tex.segment.width,
        ((eyeR * 2.2) / this.tex.segment.width) * blink,
      );
      eye.rotation = heading + Math.PI / 2;
      if (dying) eye.scale.y *= 0.2;
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
