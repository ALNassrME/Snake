/**
 * Views for foods, hazards and the Warden — synced each frame against the
 * session's entity lists by id.
 */
import { Container, Sprite } from 'pixi.js';
import { clamp01, lerp, TAU, wobble } from '../core/mathUtils';
import { BOSS_PATIENCE, BOSS_RADIUS, type BossEncounter } from '../game/boss';
import type { Food, Hazard, MapPalette } from '../game/types';
import type { ColorblindMode } from '../core/settings';
import { lighten, mixColor } from './paint';
import type { TextureLibrary } from './textures';

/** Accessible food/hazard accent palettes per colorblind mode. */
const FOOD_COLORS: Record<ColorblindMode, Record<Food['kind'], number>> = {
  off: { ember: 0x7ad8c4, bloom: 0xe87ab0, chrono: 0x8ab4f5, sigil: 0xf5c869 },
  deuteranopia: { ember: 0x6ab4f5, bloom: 0xf5d569, chrono: 0xffffff, sigil: 0xf5a869 },
  protanopia: { ember: 0x6ab4f5, bloom: 0xf5e18a, chrono: 0xffffff, sigil: 0xe8c05a },
  tritanopia: { ember: 0x7ae0a0, bloom: 0xf58a8a, chrono: 0xffffff, sigil: 0xf5c869 },
};

interface FoodView {
  root: Container;
  glow: Sprite;
  rays: Sprite;
  orb: Sprite;
  core: Sprite;
  petals: Sprite[];
  sparks: Sprite[];
  born: number;
}

interface HazardView {
  root: Container;
  ring: Sprite;
  body: Sprite;
  glow: Sprite;
  extra: Sprite[];
}

export class EntityViews {
  readonly foodLayer = new Container();
  readonly hazardLayer = new Container();
  readonly bossLayer = new Container();

  private foodViews = new Map<number, FoodView>();
  private hazardViews = new Map<number, HazardView>();
  private tex: TextureLibrary;
  private palette: MapPalette;
  private time = 0;
  colorblind: ColorblindMode = 'off';

  // Boss visuals
  private bossRoot: Container | null = null;
  private bossBody!: Sprite;
  private bossHalo!: Sprite;
  private bossEyes!: Sprite;
  private bossShadow!: Sprite;

  constructor(tex: TextureLibrary, palette: MapPalette) {
    this.tex = tex;
    this.palette = palette;
  }

  private foodColor(kind: Food['kind']): number {
    return FOOD_COLORS[this.colorblind][kind];
  }

  update(
    dt: number,
    foods: readonly Food[],
    sigil: Food | null,
    hazards: readonly Hazard[],
    boss: BossEncounter | null,
  ): void {
    this.time += dt;
    this.syncFoods(foods, sigil);
    this.syncHazards(hazards);
    this.syncBoss(boss);
  }

  // ------------------------------------------------------------------ food
  private syncFoods(foods: readonly Food[], sigil: Food | null): void {
    const seen = new Set<number>();
    const all: Food[] = sigil ? [...foods, sigil] : [...foods];
    for (const food of all) {
      seen.add(food.id);
      let view = this.foodViews.get(food.id);
      if (!view) {
        view = this.createFoodView(food);
        this.foodViews.set(food.id, view);
      }
      const color = this.foodColor(food.kind);
      const age = this.time - view.born;
      const appear = clamp01(age / 0.4);
      const bob = Math.sin(this.time * 2.4 + food.id * 1.7) * 3;
      view.root.position.set(food.pos.x, food.pos.y + bob);
      // A double-beat pulse reads as a heartbeat rather than a metronome.
      const beat = Math.sin(this.time * 3.4 + food.id);
      const pulse = 1 + beat * 0.09 + Math.max(0, Math.sin(this.time * 6.8 + food.id)) * 0.04;
      const baseScale = (food.radius * 2) / this.tex.orb.width;
      view.root.scale.set(appear * (0.9 + 0.1 * appear));
      view.orb.scale.set(baseScale * pulse * 1.15);
      view.orb.tint = lighten(color, 0.35);
      view.core.scale.set(baseScale * pulse * 0.6);
      view.core.alpha = 0.75 + 0.25 * beat;
      view.glow.tint = color;
      view.glow.scale.set(baseScale * 3.4 * pulse);
      view.glow.alpha = food.kind === 'sigil' ? 0.65 : 0.45;
      view.rays.tint = color;
      view.rays.rotation = this.time * (food.kind === 'sigil' ? 0.9 : 0.45) + food.id;
      view.rays.scale.set(baseScale * (food.kind === 'sigil' ? 2.6 : 1.9) * pulse);
      view.rays.alpha = (food.kind === 'sigil' ? 0.55 : 0.3) * appear;
      for (let i = 0; i < view.petals.length; i++) {
        const petal = view.petals[i]!;
        const a = this.time * 0.8 + (i / view.petals.length) * TAU;
        petal.position.set(Math.cos(a) * food.radius * 1.5, Math.sin(a) * food.radius * 1.5);
        petal.rotation = a + Math.PI / 2;
        petal.tint = color;
      }
      for (let i = 0; i < view.sparks.length; i++) {
        // Two counter-orbiting motes on tilted ellipses give the food depth.
        const spark = view.sparks[i]!;
        const dir = i % 2 === 0 ? 1 : -1;
        const a = this.time * 1.8 * dir + (i / view.sparks.length) * TAU + food.id;
        spark.position.set(
          Math.cos(a) * food.radius * 1.9,
          Math.sin(a) * food.radius * 1.1,
        );
        spark.tint = lighten(color, 0.4);
        spark.alpha = (0.5 + 0.4 * Math.sin(a * 2)) * appear;
        spark.scale.set(0.22 + 0.08 * Math.sin(a * 3));
      }
    }
    for (const [id, view] of this.foodViews) {
      if (!seen.has(id)) {
        view.root.destroy({ children: true });
        this.foodViews.delete(id);
      }
    }
  }

  private createFoodView(food: Food): FoodView {
    const root = new Container();
    const glow = new Sprite(this.tex.glow);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    const rays = new Sprite(this.tex.rays);
    rays.anchor.set(0.5);
    rays.blendMode = 'add';
    const orb = new Sprite(this.tex.orb);
    orb.anchor.set(0.5);
    const core = new Sprite(this.tex.spark);
    core.anchor.set(0.5);
    core.blendMode = 'add';
    core.tint = 0xffffff;
    root.addChild(glow, rays, orb, core);
    const petals: Sprite[] = [];
    const petalCount = food.kind === 'bloom' ? 5 : food.kind === 'sigil' ? 3 : 0;
    for (let i = 0; i < petalCount; i++) {
      const petal = new Sprite(this.tex.petal);
      petal.anchor.set(0.5);
      petal.scale.set(0.5);
      petal.alpha = 0.85;
      root.addChild(petal);
      petals.push(petal);
    }
    const sparks: Sprite[] = [];
    const sparkCount = food.kind === 'ember' ? 2 : 3;
    for (let i = 0; i < sparkCount; i++) {
      const spark = new Sprite(this.tex.mote);
      spark.anchor.set(0.5);
      spark.blendMode = 'add';
      root.addChild(spark);
      sparks.push(spark);
    }
    this.foodLayer.addChild(root);
    return { root, glow, rays, orb, core, petals, sparks, born: this.time };
  }

  // --------------------------------------------------------------- hazards
  private syncHazards(hazards: readonly Hazard[]): void {
    const seen = new Set<number>();
    for (const h of hazards) {
      seen.add(h.id);
      let view = this.hazardViews.get(h.id);
      if (!view) {
        view = this.createHazardView(h);
        this.hazardViews.set(h.id, view);
      }
      this.updateHazardView(h, view);
    }
    for (const [id, view] of this.hazardViews) {
      if (!seen.has(id)) {
        view.root.destroy({ children: true });
        this.hazardViews.delete(id);
      }
    }
  }

  private createHazardView(h: Hazard): HazardView {
    const root = new Container();
    const ring = new Sprite(this.tex.ring);
    ring.anchor.set(0.5);
    ring.blendMode = 'add';
    const glow = new Sprite(this.tex.glow);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    let body: Sprite;
    const extra: Sprite[] = [];
    if (h.kind === 'thorns') {
      body = new Sprite(this.tex.thorns);
      body.tint = mixColor(0xffffff, this.palette.ground, 0.15);
    } else if (h.kind === 'wisp') {
      body = new Sprite(this.tex.orb);
      body.tint = 0xdfe8ff;
      for (let i = 0; i < 3; i++) {
        const tail = new Sprite(this.tex.glow);
        tail.anchor.set(0.5);
        tail.blendMode = 'add';
        tail.tint = 0x9ab0ff;
        root.addChild(tail);
        extra.push(tail);
      }
    } else {
      body = new Sprite(this.tex.glow);
      body.tint = 0x1a0a14;
    }
    body.anchor.set(0.5);
    root.addChild(glow, body, ring);
    this.hazardLayer.addChild(root);
    return { root, ring, body, glow, extra };
  }

  private updateHazardView(h: Hazard, view: HazardView): void {
    view.root.position.set(h.pos.x, h.pos.y);
    const warn = 0xf56a4a;
    const t = h.stateT;

    if (h.state === 'telegraph') {
      const blink = 0.4 + 0.5 * Math.abs(Math.sin(t * 7));
      view.ring.visible = true;
      view.ring.tint = warn;
      view.ring.alpha = blink * 0.8;
      view.ring.scale.set(((h.radius * 2.6) / this.tex.ring.width) * (1.15 - 0.15 * clamp01(t)));
      view.body.alpha = h.kind === 'thorns' ? clamp01(t) * 0.5 : 0.25;
      view.glow.alpha = 0.15;
      view.glow.tint = warn;
      view.glow.scale.set((h.radius * 3) / this.tex.glow.width * 2);
    } else if (h.state === 'active') {
      view.ring.visible = h.kind === 'rift';
      const appear = clamp01(t / 0.35);
      if (h.kind === 'thorns') {
        view.body.alpha = 1;
        view.body.scale.set(((h.radius * 2.6) / this.tex.thorns.width) * (0.8 + appear * 0.2));
        view.body.rotation = wobble(this.time * 0.4, h.seed) * 0.06;
        view.glow.tint = 0x4a3a4a;
        view.glow.alpha = 0.4;
        view.glow.scale.set((h.radius * 2.6) / this.tex.glow.width * 2);
      } else if (h.kind === 'wisp') {
        const flicker = 0.8 + 0.2 * Math.sin(this.time * 9 + h.seed);
        view.body.scale.set(((h.radius * 2.2) / this.tex.orb.width) * flicker);
        view.body.alpha = 1;
        view.glow.tint = 0x8aa0ff;
        view.glow.alpha = 0.7 * flicker;
        view.glow.scale.set((h.radius * 7) / this.tex.glow.width * 2);
        const speed = Math.hypot(h.vel.x, h.vel.y) || 1;
        for (let i = 0; i < view.extra.length; i++) {
          const tail = view.extra[i]!;
          const back = (i + 1) * 10;
          tail.position.set((-h.vel.x / speed) * back, (-h.vel.y / speed) * back);
          tail.scale.set(((h.radius * (4 - i)) / this.tex.glow.width) * 1.6);
          tail.alpha = 0.3 - i * 0.08;
        }
      } else {
        // rift: churning dark core with an angry rim
        const churn = 1 + Math.sin(this.time * 5 + h.seed) * 0.08;
        view.body.blendMode = 'normal';
        view.body.alpha = 0.92;
        view.body.scale.set(((h.radius * 2.5) / this.tex.glow.width) * 2 * churn * appear);
        view.ring.tint = warn;
        view.ring.alpha = 0.85;
        view.ring.scale.set(((h.radius * 2.35) / this.tex.ring.width) * churn);
        view.glow.tint = warn;
        view.glow.alpha = 0.35;
        view.glow.scale.set((h.radius * 4) / this.tex.glow.width * 2);
      }
    } else {
      // fading
      const f = 1 - clamp01(t / 0.9);
      view.root.alpha = f;
    }
  }

  // ------------------------------------------------------------------ boss
  private syncBoss(boss: BossEncounter | null): void {
    if (!boss) {
      if (this.bossRoot) {
        this.bossRoot.destroy({ children: true });
        this.bossRoot = null;
      }
      return;
    }
    if (!this.bossRoot) {
      this.bossRoot = new Container();
      this.bossShadow = new Sprite(this.tex.glow);
      this.bossShadow.anchor.set(0.5);
      this.bossShadow.tint = 0x000000;
      this.bossHalo = new Sprite(this.tex.glow);
      this.bossHalo.anchor.set(0.5);
      this.bossHalo.blendMode = 'add';
      this.bossHalo.tint = this.palette.accentWarm;
      this.bossBody = new Sprite(this.tex.warden);
      this.bossBody.anchor.set(0.5);
      this.bossBody.tint = mixColor(0xffffff, this.palette.ground, 0.42);
      this.bossEyes = new Sprite(this.tex.spark);
      this.bossEyes.anchor.set(0.5);
      this.bossEyes.blendMode = 'add';
      this.bossEyes.tint = this.palette.accentWarm;
      this.bossRoot.addChild(this.bossShadow, this.bossHalo, this.bossBody, this.bossEyes);
      this.bossLayer.addChild(this.bossRoot);
    }

    const alt = boss.altitude;
    const hover = Math.sin(this.time * 1.1) * 8;
    const scale = (BOSS_RADIUS * 2.6) / this.tex.warden.width;
    this.bossRoot.position.set(boss.pos.x, boss.pos.y);
    this.bossBody.position.set(0, -alt * 260 + hover);
    this.bossBody.scale.set(scale * (1 + alt * 0.15));
    this.bossBody.alpha = 1 - alt * 0.55;
    this.bossBody.rotation = wobble(this.time * 0.3, 2) * 0.04;

    this.bossHalo.position.set(0, -alt * 260 + hover);
    this.bossHalo.scale.set(scale * 4.2 * (1 + Math.sin(this.time * 1.7) * 0.06));
    this.bossHalo.alpha = (1 - alt) * 0.4;

    this.bossEyes.position.set(0, -alt * 260 + hover - BOSS_RADIUS * 0.55);
    this.bossEyes.scale.set(scale * 2.4);
    const urgency = 1 - boss.timeLeft / BOSS_PATIENCE;
    this.bossEyes.alpha = (1 - alt) * (0.5 + 0.4 * Math.abs(Math.sin(this.time * (2 + urgency * 5))));

    this.bossShadow.position.set(0, BOSS_RADIUS * 0.7);
    this.bossShadow.scale.set(scale * 3 * (1 - alt * 0.6));
    this.bossShadow.alpha = 0.45 * (1 - alt);
  }

  setPalette(palette: MapPalette): void {
    this.palette = palette;
  }

  destroy(): void {
    this.foodLayer.destroy({ children: true });
    this.hazardLayer.destroy({ children: true });
    this.bossLayer.destroy({ children: true });
  }
}

export { lerp };
