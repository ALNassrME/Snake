/**
 * GameRenderer — owns the Pixi application and the whole visual stack:
 * background, world, entities, particles, lighting, bloom and the camera.
 * It can render either a live GameSession or an ambient menu vista.
 */
import {
  Application,
  ColorMatrixFilter,
  Container,
  Matrix,
  RenderTexture,
  Sprite,
  Texture,
  BlurFilter,
} from 'pixi.js';
import { clamp, clamp01, damp, lerp } from '../core/mathUtils';
import { profiler } from '../core/profiler';
import type { Settings } from '../core/settings';
import { getSkin, type SkinDef } from '../game/cosmetics';
import { getMap } from '../game/maps';
import type { GameSession } from '../game/session';
import type { WorldMap } from '../game/types';
import { BackgroundSystem } from './background';
import { CinematicCamera } from './camera';
import { WorldDecor } from './decor';
import { EntityViews } from './entityViews';
import { cssOf, makeCanvas } from './paint';
import { ParticleSystem } from './particles';
import { PopupSystem } from './popups';
import { SnakeView } from './snakeView';
import { buildTextures, type TextureLibrary } from './textures';

type QualityTier = 'low' | 'medium' | 'high';

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];

interface TierParams {
  particleDensity: number;
  weatherScale: number;
  glowStride: number;
  ghosts: boolean;
  bloom: boolean;
  fogDensity: number;
  maxResolution: number;
  decorDensity: number;
}

const TIERS: Record<QualityTier, TierParams> = {
  low: {
    particleDensity: 0.4,
    weatherScale: 0.35,
    glowStride: 6,
    ghosts: false,
    bloom: false,
    fogDensity: 0.5,
    maxResolution: 1,
    decorDensity: 0.5,
  },
  medium: {
    particleDensity: 0.7,
    weatherScale: 0.7,
    glowStride: 4,
    ghosts: true,
    bloom: false,
    fogDensity: 0.8,
    maxResolution: 1.5,
    decorDensity: 0.8,
  },
  high: {
    particleDensity: 1,
    weatherScale: 1,
    glowStride: 3,
    ghosts: true,
    bloom: true,
    fogDensity: 1,
    maxResolution: 2,
    decorDensity: 1,
  },
};

function vignetteTexture(): Texture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const g = ctx.createRadialGradient(256, 256, 130, 256, 256, 370);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.24)');
  g.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return Texture.from(canvas);
}

export class GameRenderer {
  readonly app: Application;
  readonly camera = new CinematicCamera();
  private tex: TextureLibrary;

  private background!: BackgroundSystem;
  private worldWrap = new Container();
  private world = new Container();
  private decor: WorldDecor | null = null;
  private snakeView: SnakeView | null = null;
  private entities: EntityViews | null = null;
  private particles = new ParticleSystem();
  private popups = new PopupSystem();
  private worldLight = new Sprite();

  private vignette!: Sprite;
  private nightOverlay!: Sprite;
  private flashOverlay!: Sprite;
  private colorFilter = new ColorMatrixFilter();

  private bloomSprite: Sprite | null = null;
  private bloomRT: RenderTexture | null = null;
  private bloomEnabled = true;

  private session: GameSession | null = null;
  private sessionUnsubs: (() => void)[] = [];
  private map: WorldMap;
  private skin: SkinDef;

  private ambientTime = 0;
  private trailTimer = 0;
  private flash = 0;
  private desat = 0;
  private dyingT = 0;

  private settings: Settings;
  private tier: QualityTier = 'high';
  private autoTimer = 0;
  private goodStreak = 0;
  private width = 1280;
  private height = 720;

  private constructor(app: Application, settings: Settings) {
    this.app = app;
    this.settings = settings;
    this.tex = buildTextures();
    this.map = getMap('miregloom-gardens');
    this.skin = getSkin('emberwyrm');
  }

  static async create(host: HTMLElement, settings: Settings): Promise<GameRenderer> {
    // Fail with a nameable reason rather than deep inside Pixi's init.
    if (!GameRenderer.hasWebGL()) {
      throw new Error('WebGL is unavailable on this device');
    }
    const app = new Application();
    await app.init({
      background: 0x0a0d14,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(app.canvas);
    app.canvas.style.position = 'absolute';
    app.canvas.style.inset = '0';
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';

    const renderer = new GameRenderer(app, settings);
    renderer.buildStage();
    renderer.applySettings(settings);
    renderer.resize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    renderer.enterAmbient();

    app.ticker.maxFPS = 0; // uncapped; browsers vsync (60–144Hz)
    app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
      profiler.frame(ticker.deltaMS);
      renderer.frame(dt);
    });
    return renderer;
  }

  /** Probe for a usable WebGL context before committing to Pixi. */
  private static hasWebGL(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl');
      return gl !== null;
    } catch {
      return false;
    }
  }

  private buildStage(): void {
    const stage = this.app.stage;
    this.background = new BackgroundSystem(this.map, this.tex);

    this.worldWrap.addChild(this.world);

    this.worldLight = new Sprite(this.tex.glow);
    this.worldLight.anchor.set(0.5);
    this.worldLight.blendMode = 'add';
    this.worldLight.alpha = 0.1;

    this.vignette = new Sprite(vignetteTexture());
    this.nightOverlay = new Sprite(Texture.WHITE);
    this.nightOverlay.tint = 0x060a18;
    this.nightOverlay.alpha = 0;
    this.flashOverlay = new Sprite(Texture.WHITE);
    this.flashOverlay.tint = 0xfff5e8;
    this.flashOverlay.alpha = 0;

    stage.addChild(
      this.background.container,
      this.worldWrap,
      this.background.overlay,
      this.nightOverlay,
      this.vignette,
      this.flashOverlay,
    );
    this.worldWrap.filters = [this.colorFilter];
  }

  // ------------------------------------------------------------- sessions
  attachSession(session: GameSession, skinId: string, forceNight: boolean): void {
    this.detachSession();
    this.session = session;
    this.skin = getSkin(skinId);
    this.map = session.map;
    this.background.setMap(this.map);
    this.background.forceNight = forceNight;
    this.background.cycleLength = session.mode.id === 'zen' ? 360 : 240;

    this.rebuildWorld(session);
    this.camera.worldWidth = this.map.width;
    this.camera.worldHeight = this.map.height;
    this.camera.snapTo(session.snake.pos.x, session.snake.pos.y);
    this.camera.resetZoom();
    this.desat = 0;
    this.dyingT = 0;
    this.bindSessionEvents(session);
  }

  private rebuildWorld(session: GameSession | null): void {
    this.world.removeChildren();
    this.decor?.destroy();
    this.snakeView?.destroy();
    this.entities?.destroy();
    this.particles.clear();
    this.popups.clear();

    const tierParams = TIERS[this.tier];
    this.decor = new WorldDecor(
      this.map,
      this.tex,
      session ? session.bellflowers : [],
      tierParams.decorDensity,
    );
    this.entities = new EntityViews(this.tex, this.map.palette);
    this.entities.colorblind = this.settings.colorblind;
    this.snakeView = new SnakeView(this.tex, this.skin);
    this.snakeView.glowStride = tierParams.glowStride;
    this.snakeView.ghostsEnabled = tierParams.ghosts && !this.settings.reduceMotion;

    this.world.addChild(
      this.decor.under,
      this.worldLight,
      this.entities.foodLayer,
      this.entities.hazardLayer,
      this.snakeView.container,
      this.entities.bossLayer,
      this.decor.over,
      this.particles.container,
      this.popups.container,
    );
    if (!session) this.snakeView.container.visible = false;
  }

  private bindSessionEvents(session: GameSession): void {
    const ev = session.events;
    const colors = this.skin.colors;
    const accent = this.map.palette.accentWarm;
    const sub = <K extends keyof import('../game/types').SessionEvents>(
      k: K,
      fn: (p: import('../game/types').SessionEvents[K]) => void,
    ) => this.sessionUnsubs.push(ev.on(k, fn));

    sub('food_eaten', ({ food, combo, multiplier, gained }) => {
      this.particles.burst(food.pos.x, food.pos.y, {
        texture: this.tex.spark,
        tint: colors.particle,
        life: [0.3, 0.7],
        speed: [40, 190],
        scale: [0.4, 0.9],
        drag: 3,
        alphaEnd: 0,
      }, 12);
      this.popups.spawn(`+${gained}`, food.pos.x, food.pos.y - 18, 0xf5e8c8, 18);
      if (combo >= 3) {
        this.popups.spawn(
          `×${multiplier.toFixed(1)}`,
          food.pos.x,
          food.pos.y + 8,
          colors.glow,
          13,
        );
      }
      this.snakeView?.pulse();
      this.camera.addTrauma(0.08);
    });

    sub('combo_milestone', ({ combo }) => {
      const head = session.snake.pos;
      this.popups.spawn(`COMBO ${combo}`, head.x, head.y - 46, 0xf5c869, 24);
      this.particles.burst(head.x, head.y, {
        texture: this.tex.ring,
        tint: 0xf5c869,
        life: [0.5, 0.6],
        speed: [10, 30],
        scale: [0.3, 0.4],
        scaleEnd: 3.2,
        alphaEnd: 0,
      }, 1);
    });

    sub('near_miss', ({ pos }) => {
      this.particles.burst(pos.x, pos.y, {
        texture: this.tex.spark,
        tint: 0xffffff,
        life: [0.2, 0.4],
        speed: [30, 90],
        scale: [0.3, 0.5],
        alphaEnd: 0,
      }, 4);
      this.camera.addTrauma(0.1);
    });

    sub('death', ({ pos }) => {
      this.camera.addTrauma(0.85);
      this.triggerFlash(0.55);
      this.particles.burst(pos.x, pos.y, {
        texture: this.tex.spark,
        tint: colors.glow,
        life: [0.5, 1.3],
        speed: [60, 340],
        scale: [0.5, 1.2],
        drag: 2,
        gravity: 140,
        alphaEnd: 0,
      }, 46);
      this.particles.burst(pos.x, pos.y, {
        texture: this.tex.glow,
        tint: colors.glow,
        life: [0.6, 0.9],
        speed: [5, 30],
        scale: [1.5, 2.5],
        scaleEnd: 4,
        alpha: [0.4, 0.5],
        alphaEnd: 0,
      }, 3);
    });

    sub('bell_chime', ({ pos }) => {
      this.decor?.chime(pos);
      this.particles.burst(pos.x, pos.y - 40, {
        texture: this.tex.petal,
        tint: accent,
        life: [0.8, 1.6],
        speed: [20, 80],
        scale: [0.3, 0.55],
        gravity: 60,
        drag: 1.2,
        spin: [-3, 3],
        alphaEnd: 0,
        additive: false,
      }, 8);
    });

    sub('hazard_activated', ({ hazard }) => {
      if (hazard.kind === 'rift') {
        this.camera.addTrauma(0.3);
        this.particles.burst(hazard.pos.x, hazard.pos.y, {
          texture: this.tex.spark,
          tint: 0xf56a4a,
          life: [0.3, 0.8],
          speed: [60, 240],
          scale: [0.4, 0.8],
          gravity: 200,
          alphaEnd: 0,
        }, 18);
      }
    });

    sub('boss_spawned', ({ pos }) => {
      this.camera.addTrauma(0.5);
      this.camera.focusOn(pos);
      window.setTimeout(() => this.camera.focusOn(null), 2600);
    });

    sub('boss_sigil_collected', ({ pos }) => {
      this.particles.burst(pos.x, pos.y, {
        texture: this.tex.spark,
        tint: 0xf5c869,
        life: [0.4, 1],
        speed: [50, 220],
        scale: [0.5, 1],
        drag: 2.5,
        alphaEnd: 0,
      }, 22);
      this.camera.addTrauma(0.2);
    });

    sub('boss_defeated', ({ pos }) => {
      this.camera.addTrauma(0.7);
      this.triggerFlash(0.4);
      this.particles.burst(pos.x, pos.y, {
        texture: this.tex.spark,
        tint: 0xf5c869,
        life: [0.6, 1.6],
        speed: [80, 420],
        scale: [0.6, 1.3],
        drag: 1.5,
        alphaEnd: 0,
      }, 60);
      this.popups.spawn('THE WARDEN RETREATS', pos.x, pos.y - 90, 0xf5c869, 26);
    });

    sub('food_expired', ({ food }) => {
      this.particles.burst(food.pos.x, food.pos.y, {
        texture: this.tex.mote,
        tint: 0x8a9aa8,
        life: [0.4, 0.8],
        speed: [8, 30],
        scale: [0.4, 0.7],
        alphaEnd: 0,
      }, 5);
    });
  }

  detachSession(): void {
    for (const off of this.sessionUnsubs) off();
    this.sessionUnsubs = [];
    this.session = null;
  }

  /** Ambient vista behind the menus: the Gardens at dusk, slowly drifting. */
  enterAmbient(): void {
    this.detachSession();
    this.map = getMap('miregloom-gardens');
    this.background.setMap(this.map);
    this.background.forceNight = false;
    this.camera.worldWidth = this.map.width;
    this.camera.worldHeight = this.map.height;
    this.rebuildWorld(null);
    this.camera.snapTo(this.map.width / 2, this.map.height / 2);
    this.desat = 0;
  }

  triggerFlash(strength: number): void {
    if (this.settings.reduceFlashes) return;
    this.flash = Math.max(this.flash, strength);
  }

  // ---------------------------------------------------------------- frame
  private frame(dt: number): void {
    const session = this.session;
    this.autoQuality(dt);

    if (session) {
      const snake = session.snake;
      const dying = session.state === 'dying';
      this.dyingT = dying ? this.dyingT + dt : 0;

      this.camera.update(dt, {
        pos: snake.pos,
        velocityAngle: snake.heading,
        speed: session.state === 'running' ? snake.speed : snake.speed * 0.2,
      });

      this.snakeView?.update(snake, dt, dying);
      if (dying) this.snakeView?.setDeathFade(this.dyingT / 1.5);
      this.entities?.update(dt, session.foods, session.sigilFood, session.hazards, session.boss);
      this.decor?.update(dt, snake.pos, this.background.nightFactor);

      // Soft light pool travelling with the wyrm.
      this.worldLight.position.set(snake.pos.x, snake.pos.y);
      this.worldLight.tint = this.skin.colors.glow;
      this.worldLight.scale.set(7 + Math.sin(this.ambientTime * 1.8) * 0.3);
      this.worldLight.alpha = 0.07 + this.background.nightFactor * 0.05;

      // Passive trail motes shed by the moving wyrm.
      this.trailTimer -= dt;
      if (this.trailTimer <= 0 && session.state === 'running') {
        this.trailTimer = 0.12;
        const tail = snake.segments[snake.segments.length - 1] ?? snake.pos;
        this.particles.burst(tail.x, tail.y, {
          texture: this.tex.mote,
          tint: this.skin.colors.particle,
          life: [0.5, 1.1],
          speed: [4, 18],
          scale: [0.2, 0.45],
          alpha: [0.25, 0.45],
          alphaEnd: 0,
        }, 1);
      }

      this.desat = damp(this.desat, dying || session.state === 'ended' ? 1 : 0, 3, dt);
      this.background.update(dt, this.camera.pos, session.time, TIERS[this.tier].weatherScale);
    } else {
      // Menu ambient: slow orbital drift around the heart of the Gardens.
      this.ambientTime += dt;
      const cx = this.map.width / 2 + Math.cos(this.ambientTime * 0.05) * 320;
      const cy = this.map.height / 2 + Math.sin(this.ambientTime * 0.037) * 220;
      this.camera.update(dt, { pos: { x: cx, y: cy }, velocityAngle: 0, speed: 0 });
      this.decor?.update(dt, { x: -9999, y: -9999 }, this.background.nightFactor);
      this.desat = damp(this.desat, 0, 3, dt);
      this.background.update(dt, this.camera.pos, this.ambientTime, TIERS[this.tier].weatherScale);
    }
    this.ambientTime += dt;

    this.particles.update(dt);
    this.popups.update(dt);

    // --- camera transform ---
    const cam = this.camera;
    this.world.scale.set(cam.zoom);
    this.world.position.set(
      this.width / 2 - cam.pos.x * cam.zoom + cam.shakeOffset.x,
      this.height / 2 - cam.pos.y * cam.zoom + cam.shakeOffset.y,
    );
    this.worldWrap.pivot.set(this.width / 2, this.height / 2);
    this.worldWrap.position.set(this.width / 2, this.height / 2);
    this.worldWrap.rotation = cam.shakeRoll;

    this.decor?.cull(cam.pos.x, cam.pos.y, this.width / 2 / cam.zoom, this.height / 2 / cam.zoom);

    // --- lighting ---
    const bossDim = session?.boss && session.boss.phase === 'active' ? 0.18 : 0;
    this.nightOverlay.alpha = this.background.nightFactor * 0.34 + bossDim;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.flashOverlay.alpha = this.flash * 0.85;
    this.colorFilter.reset();
    if (this.desat > 0.01) this.colorFilter.saturate(-0.65 * this.desat, true);
    this.worldWrap.filters = this.desat > 0.01 ? [this.colorFilter] : [];

    this.renderBloom();
    profiler.drawObjects = this.world.children.length;
  }

  private renderBloom(): void {
    if (!this.bloomEnabled || !this.bloomSprite || !this.bloomRT) {
      if (this.bloomSprite) this.bloomSprite.visible = false;
      return;
    }
    this.bloomSprite.visible = false;
    this.app.renderer.render({
      container: this.app.stage,
      target: this.bloomRT,
      transform: new Matrix(0.25, 0, 0, 0.25, 0, 0),
      clear: true,
    });
    this.bloomSprite.visible = true;
  }

  // ------------------------------------------------------------- settings
  applySettings(settings: Settings): void {
    this.settings = settings;
    this.camera.shakeScale = settings.reduceMotion ? 0 : settings.screenShake;
    const preferred: QualityTier =
      settings.quality === 'auto' ? this.tier : (settings.quality as QualityTier);
    this.setTier(preferred, true);
    if (this.entities) this.entities.colorblind = settings.colorblind;
    if (this.snakeView) {
      this.snakeView.ghostsEnabled = TIERS[this.tier].ghosts && !settings.reduceMotion;
    }
  }

  applySkin(skinId: string): void {
    this.skin = getSkin(skinId);
    this.snakeView?.applySkin(this.skin);
  }

  private setTier(tier: QualityTier, force = false): void {
    if (tier === this.tier && !force) return;
    this.tier = tier;
    const p = TIERS[tier];
    const densityPref =
      this.settings.particleDensity === 'low' ? 0.4 : this.settings.particleDensity === 'medium' ? 0.7 : 1;
    this.particles.density = p.particleDensity * densityPref;
    this.background.fogDensity = p.fogDensity;
    if (this.snakeView) {
      this.snakeView.glowStride = p.glowStride;
      this.snakeView.ghostsEnabled = p.ghosts && !this.settings.reduceMotion;
    }
    this.setBloom(p.bloom && this.settings.bloom);
    const res = Math.min(window.devicePixelRatio || 1, p.maxResolution);
    if (Math.abs(this.app.renderer.resolution - res) > 0.01) {
      this.app.renderer.resolution = res;
      this.resize(this.width, this.height);
    }
  }

  private setBloom(on: boolean): void {
    this.bloomEnabled = on;
    if (on && !this.bloomSprite) {
      this.bloomRT = RenderTexture.create({
        width: Math.max(2, Math.ceil(this.width / 4)),
        height: Math.max(2, Math.ceil(this.height / 4)),
      });
      this.bloomSprite = new Sprite(this.bloomRT);
      this.bloomSprite.scale.set(4);
      this.bloomSprite.blendMode = 'add';
      this.bloomSprite.alpha = 0.32;
      const blur = new BlurFilter({ strength: 6, quality: 3 });
      this.bloomSprite.filters = [blur];
      this.app.stage.addChild(this.bloomSprite);
    }
    if (this.bloomSprite) this.bloomSprite.visible = on;
  }

  private autoQuality(dt: number): void {
    if (this.settings.quality !== 'auto') return;
    this.autoTimer += dt;
    if (this.autoTimer < 4) return;
    this.autoTimer = 0;
    const idx = TIER_ORDER.indexOf(this.tier);
    if (profiler.health < 0.45 && idx > 0) {
      this.setTier(TIER_ORDER[idx - 1]!);
      this.goodStreak = 0;
    } else if (profiler.health > 0.88) {
      this.goodStreak++;
      if (this.goodStreak >= 3 && idx < TIER_ORDER.length - 1) {
        this.setTier(TIER_ORDER[idx + 1]!);
        this.goodStreak = 0;
      }
    } else {
      this.goodStreak = 0;
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.camera.resize(width, height);
    this.background.resize(width, height);
    this.vignette.width = width;
    this.vignette.height = height;
    this.nightOverlay.width = width;
    this.nightOverlay.height = height;
    this.flashOverlay.width = width;
    this.flashOverlay.height = height;
    if (this.bloomRT && this.bloomSprite) {
      this.bloomRT.resize(Math.max(2, Math.ceil(width / 4)), Math.max(2, Math.ceil(height / 4)));
      this.bloomSprite.scale.set(4);
    }
  }

  get nightFactor(): number {
    return this.background.nightFactor;
  }

  get weatherIntensity(): number {
    return this.background.weatherIntensity;
  }

  get weatherKind(): string {
    return this.background.weather;
  }

  destroy(): void {
    this.detachSession();
    this.app.destroy(true, { children: true, texture: true });
  }
}

export { clamp, clamp01, lerp, cssOf };
