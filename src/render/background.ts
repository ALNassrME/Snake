/**
 * Sky, parallax silhouettes, volumetric fog, god-rays, weather and the
 * day/night cycle. Everything here lives in screen space and moves against
 * the camera to sell depth.
 */
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { clamp01, lerp, wobble, type Vec2 } from '../core/mathUtils';
import { Rng } from '../core/rng';
import type { WorldMap } from '../game/types';
import { cssOf, makeCanvas, mixColor } from './paint';
import type { TextureLibrary } from './textures';

export type WeatherKind = 'clear' | 'spores' | 'rain' | 'embers';

interface WeatherDrop {
  sprite: Sprite;
  vx: number;
  vy: number;
  phase: number;
}

const PARALLAX_FACTORS = [0.06, 0.14, 0.26];

function skyTexture(top: number, bottom: number): Texture {
  const [canvas, ctx] = makeCanvas(16, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, cssOf(top, 1));
  g.addColorStop(0.6, cssOf(mixColor(top, bottom, 0.6), 1));
  g.addColorStop(1, cssOf(bottom, 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  return Texture.from(canvas);
}

function beamTexture(): Texture {
  const [canvas, ctx] = makeCanvas(256, 512);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  const fade = ctx.createLinearGradient(0, 0, 0, 512);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.75, 'rgba(0,0,0,0.35)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 256, 512);
  return Texture.from(canvas);
}

export class BackgroundSystem {
  /** Sky, stars, god-rays and parallax ridges — rendered beneath the world. */
  readonly container = new Container();
  /** Fog and weather — rendered above the world for volumetric depth. */
  readonly overlay = new Container();

  private daySky!: Sprite;
  private nightSky!: Sprite;
  private stars = new Container();
  private beams: Sprite[] = [];
  private ridgeLayers: TilingSprite[] = [];
  private fogSprites: { sprite: Sprite; depth: number; phase: number }[] = [];
  private weatherLayer = new Container();
  private drops: WeatherDrop[] = [];

  private map: WorldMap;
  private tex: TextureLibrary;
  private rng = new Rng(0xbadface);
  private width = 1280;
  private height = 720;

  weather: WeatherKind = 'clear';
  private weatherNext: WeatherKind = 'clear';
  private weatherBlend = 1; // 1 = fully current
  private weatherTimer = 20;
  private time = 0;

  /** 0 = day, 1 = deep night. */
  nightFactor = 0;
  /** When set, the cycle is pinned to night (daily modifier). */
  forceNight = false;
  /** Day length in seconds for a full day+night cycle. */
  cycleLength = 240;
  fogDensity = 1;

  constructor(map: WorldMap, tex: TextureLibrary) {
    this.map = map;
    this.tex = tex;
    this.build();
  }

  private build(): void {
    const p = this.map.palette;
    this.daySky = new Sprite(skyTexture(p.skyTop, p.skyBottom));
    this.nightSky = new Sprite(skyTexture(p.nightTop, p.nightBottom));
    this.nightSky.alpha = 0;
    this.container.addChild(this.daySky, this.nightSky);

    // Stars, visible at night.
    for (let i = 0; i < 70; i++) {
      const star = new Sprite(this.tex.star);
      star.anchor.set(0.5);
      star.position.set(this.rng.range(0, 2000), this.rng.range(0, 700));
      star.scale.set(this.rng.range(0.2, 0.6));
      star.alpha = this.rng.range(0.3, 0.9);
      this.stars.addChild(star);
    }
    this.stars.alpha = 0;
    this.container.addChild(this.stars);

    // God-rays slanting from above.
    const beamTex = beamTexture();
    for (let i = 0; i < 3; i++) {
      const beam = new Sprite(beamTex);
      beam.anchor.set(0.5, 0);
      beam.rotation = 0.32 + i * 0.06;
      beam.tint = p.accent;
      beam.blendMode = 'add';
      beam.alpha = 0;
      this.beams.push(beam);
      this.container.addChild(beam);
    }

    // Parallax ridge silhouettes, far to near.
    for (let i = 0; i < 3; i++) {
      const ridge = new TilingSprite({
        texture: this.tex.ridges[i] ?? this.tex.ridges[0]!,
        width: 1280,
        height: 420,
      });
      ridge.tint = p.layers[i as 0 | 1 | 2];
      ridge.anchor.set(0, 0);
      this.ridgeLayers.push(ridge);
      this.container.addChild(ridge);
    }

    // Volumetric fog banks between the ridge layers and over the world.
    for (let i = 0; i < 8; i++) {
      const sprite = new Sprite(this.tex.fog);
      sprite.anchor.set(0.5);
      sprite.tint = p.fog;
      sprite.blendMode = 'screen';
      const depth = this.rng.range(0.2, 1);
      sprite.scale.set(this.rng.range(1.6, 3.2));
      this.fogSprites.push({ sprite, depth, phase: this.rng.range(0, 100) });
      this.overlay.addChild(sprite);
    }

    this.overlay.addChild(this.weatherLayer);
    this.weather = this.rng.pick(this.map.weatherBias);
    this.weatherNext = this.weather;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.daySky.width = width;
    this.daySky.height = height;
    this.nightSky.width = width;
    this.nightSky.height = height;
    this.stars.scale.set(Math.max(width / 2000, 0.7));
    for (let i = 0; i < this.ridgeLayers.length; i++) {
      const ridge = this.ridgeLayers[i]!;
      ridge.width = width;
      const scale = height / 900;
      ridge.tileScale.set(1.1 + i * 0.35, scale * (0.9 + i * 0.3));
      ridge.height = 420 * scale * (0.9 + i * 0.3);
      ridge.y = height - ridge.height * (0.92 - i * 0.13);
    }
    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i]!;
      beam.position.set(width * (0.2 + i * 0.3), -40);
      beam.width = width * 0.22;
      beam.height = height * 1.2;
    }
  }

  /** Rebuild tints when the map changes between sessions. */
  setMap(map: WorldMap): void {
    if (map.id === this.map.id) return;
    this.map = map;
    const p = map.palette;
    this.daySky.texture = skyTexture(p.skyTop, p.skyBottom);
    this.nightSky.texture = skyTexture(p.nightTop, p.nightBottom);
    for (let i = 0; i < this.ridgeLayers.length; i++) {
      this.ridgeLayers[i]!.tint = p.layers[i as 0 | 1 | 2];
    }
    for (const f of this.fogSprites) f.sprite.tint = p.fog;
    for (const b of this.beams) b.tint = p.accent;
    this.weather = this.rng.pick(map.weatherBias);
    this.weatherNext = this.weather;
    this.weatherBlend = 1;
  }

  update(dt: number, camera: Vec2, runTime: number, densityScale: number): void {
    this.time += dt;

    // --- day / night ---
    const cyc = (runTime % this.cycleLength) / this.cycleLength;
    // Start at dusk, sink into night, return to a pale dawn.
    const curve = 0.5 - 0.5 * Math.cos(cyc * Math.PI * 2);
    this.nightFactor = this.forceNight ? 1 : clamp01(0.15 + curve * 0.85);
    this.nightSky.alpha = this.nightFactor;
    this.stars.alpha = Math.max(0, this.nightFactor - 0.35) * 1.4;
    for (let i = 0; i < this.stars.children.length; i++) {
      const star = this.stars.children[i] as Sprite;
      star.alpha = 0.4 + 0.5 * Math.abs(Math.sin(this.time * 0.7 + i * 1.7));
    }
    const dayness = 1 - this.nightFactor;
    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i]!;
      beam.alpha = (0.05 + 0.05 * Math.sin(this.time * 0.23 + i * 2.4)) * dayness;
      beam.rotation = 0.3 + i * 0.06 + wobble(this.time * 0.05, i) * 0.02;
    }

    // --- parallax ---
    for (let i = 0; i < this.ridgeLayers.length; i++) {
      const ridge = this.ridgeLayers[i]!;
      const f = PARALLAX_FACTORS[i]!;
      ridge.tilePosition.x = -camera.x * f;
      ridge.y +=
        (this.height - ridge.height * (0.92 - i * 0.13) - camera.y * f * 0.08 - ridge.y) * 0.5;
    }

    // --- fog drift ---
    for (let i = 0; i < this.fogSprites.length; i++) {
      const f = this.fogSprites[i]!;
      const drift = this.time * (4 + f.depth * 7) + f.phase * 40;
      const parallax = 0.05 + f.depth * 0.18;
      const w = this.width + 700;
      const rawX = f.phase * 331 + drift - camera.x * parallax;
      f.sprite.x = ((rawX % w) + w) % w - 350;
      f.sprite.y =
        this.height * (0.35 + 0.55 * ((f.phase * 97) % 1)) +
        Math.sin(this.time * 0.12 + f.phase) * 26 -
        camera.y * parallax * 0.12;
      f.sprite.alpha =
        (0.16 + 0.1 * Math.sin(this.time * 0.1 + f.phase * 3)) *
        this.fogDensity *
        (0.85 + this.nightFactor * 0.35);
    }

    this.updateWeather(dt, densityScale);
  }

  private targetDropCount(kind: WeatherKind, densityScale: number): number {
    const base = kind === 'rain' ? 110 : kind === 'spores' ? 46 : kind === 'embers' ? 40 : 0;
    return Math.round(base * densityScale * (this.width / 1280));
  }

  private updateWeather(dt: number, densityScale: number): void {
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = this.rng.range(28, 55);
      this.weatherNext = this.rng.pick(this.map.weatherBias);
      if (this.weatherNext !== this.weather) this.weatherBlend = 0;
    }
    if (this.weatherBlend < 1) {
      this.weatherBlend = Math.min(1, this.weatherBlend + dt / 4);
      if (this.weatherBlend >= 0.5 && this.weather !== this.weatherNext) {
        this.weather = this.weatherNext;
        for (const d of this.drops) d.sprite.visible = false;
        this.drops.length = 0;
        this.weatherLayer.removeChildren();
      }
    }

    const fade = this.weatherBlend < 0.5 ? 1 - this.weatherBlend * 2 : (this.weatherBlend - 0.5) * 2;
    const want = Math.round(this.targetDropCount(this.weather, densityScale) * fade);

    while (this.drops.length < want) this.drops.push(this.spawnDrop());
    while (this.drops.length > want) {
      const d = this.drops.pop()!;
      this.weatherLayer.removeChild(d.sprite);
    }

    const k = this.weather;
    for (const d of this.drops) {
      d.sprite.x += d.vx * dt;
      d.sprite.y += d.vy * dt;
      if (k === 'spores' || k === 'embers') {
        d.sprite.x += Math.sin(this.time * 0.9 + d.phase) * 14 * dt;
        d.sprite.alpha = 0.35 + 0.3 * Math.sin(this.time * 1.4 + d.phase * 2);
      }
      if (d.sprite.y > this.height + 60) {
        d.sprite.y = -50;
        d.sprite.x = this.rng.range(-40, this.width + 40);
      }
      if (d.sprite.y < -60) {
        d.sprite.y = this.height + 50;
        d.sprite.x = this.rng.range(-40, this.width + 40);
      }
      if (d.sprite.x > this.width + 60) d.sprite.x = -50;
      if (d.sprite.x < -60) d.sprite.x = this.width + 50;
    }
  }

  private spawnDrop(): WeatherDrop {
    const p = this.map.palette;
    const kind = this.weather;
    let sprite: Sprite;
    let vx = 0;
    let vy = 0;
    if (kind === 'rain') {
      sprite = new Sprite(this.tex.rain);
      sprite.tint = mixColor(p.accent, 0xbdd8e8, 0.7);
      sprite.alpha = this.rng.range(0.25, 0.5);
      sprite.scale.set(this.rng.range(0.7, 1.15));
      sprite.rotation = 0.16;
      vx = -70;
      vy = this.rng.range(680, 940);
    } else if (kind === 'embers') {
      sprite = new Sprite(this.tex.mote);
      sprite.tint = mixColor(p.accentWarm, 0xff9a50, 0.5);
      sprite.blendMode = 'add';
      sprite.scale.set(this.rng.range(0.35, 0.8));
      vx = this.rng.range(-12, 12);
      vy = this.rng.range(-70, -30);
    } else {
      sprite = new Sprite(this.tex.mote);
      sprite.tint = mixColor(p.accent, 0xffffff, 0.3);
      sprite.blendMode = 'add';
      sprite.scale.set(this.rng.range(0.25, 0.7));
      vx = this.rng.range(-10, 16);
      vy = this.rng.range(12, 34);
    }
    sprite.anchor.set(0.5);
    sprite.position.set(this.rng.range(0, this.width), this.rng.range(0, this.height));
    const drop: WeatherDrop = { sprite, vx, vy, phase: this.rng.range(0, 50) };
    this.weatherLayer.addChild(sprite);
    return drop;
  }

  /** Ambient audio wants to know how hard the weather is playing. */
  get weatherIntensity(): number {
    const fade =
      this.weatherBlend < 0.5 ? 1 - this.weatherBlend * 2 : (this.weatherBlend - 0.5) * 2;
    return this.weather === 'clear' ? 0 : fade;
  }

  get ambientDarkness(): number {
    return lerp(0.1, 0.5, this.nightFactor);
  }
}
