/**
 * GameSession — one run of the game.
 * Owns the simulation: snake, food, combo, hazards, boss, timers and score.
 * Pure logic; rendering and audio subscribe to its event stream.
 */
import { Emitter } from '../core/events';
import { clamp, clamp01, dist, type Vec2 } from '../core/mathUtils';
import { Rng } from '../core/rng';
import { BossEncounter } from './boss';
import { ComboTracker } from './combo';
import { findSpawnPoint, makeFood, rollFoodKind } from './food';
import { hazardHits, spawnHazard, updateHazard } from './hazards';
import { getMap } from './maps';
import { Snake } from './snake';
import type {
  Bellflower,
  DeathCause,
  Food,
  Hazard,
  ModeConfig,
  RunSummary,
  SessionEvents,
  SessionState,
  WorldMap,
} from './types';

const COUNTDOWN_SECONDS = 3;
const DYING_SECONDS = 1.5;
const FOOD_MAGNET_RADIUS = 64;
const FOOD_MAGNET_SPEED = 190;
const CHRONO_TIME_BONUS = 5;

export interface SessionConfig {
  mode: ModeConfig;
  previousBest: number;
  seed?: number;
  /** Daily-challenge modifiers, applied on top of the mode config. */
  speedScale?: number;
  comboWindowScale?: number;
  foodCountScale?: number;
}

export class GameSession {
  readonly events = new Emitter<SessionEvents>();
  readonly mode: ModeConfig;
  readonly map: WorldMap;
  readonly snake: Snake;
  readonly rng: Rng;
  readonly combo: ComboTracker;
  readonly bellflowers: Bellflower[] = [];

  foods: Food[] = [];
  hazards: Hazard[] = [];
  boss: BossEncounter | null = null;
  sigilFood: Food | null = null;

  state: SessionState = 'countdown';
  /** Simulation time since the run started (excludes countdown). */
  time = 0;
  countdownLeft = COUNTDOWN_SECONDS;
  score = 0;
  foodEaten = 0;
  bossesDefeated = 0;
  timeRemaining: number | null;

  private readonly cfg: SessionConfig;
  private scoreFraction = 0;
  private dyingT = 0;
  private deathCause: DeathCause | null = null;
  private hazardTimer: number;
  private nextBossScore: number;
  private sigilDelay = 0;
  private nearMissCooldown = 0;
  private lastCountdownWhole = COUNTDOWN_SECONDS + 1;
  private warned30 = false;
  private warned10 = false;
  private ended = false;

  constructor(config: SessionConfig) {
    this.cfg = config;
    this.mode = config.mode;
    this.map = getMap(config.mode.mapId);
    this.rng = new Rng(config.seed ?? ((Math.random() * 0xffffffff) >>> 0));
    this.combo = new ComboTracker(config.mode.comboWindow * (config.comboWindowScale ?? 1));
    this.timeRemaining = config.mode.timeLimit;
    this.hazardTimer = config.mode.hazardIntervalStart;
    this.nextBossScore = config.mode.bossFirstScore;

    const spawn = this.findSpawn();
    this.snake = new Snake({
      x: spawn.x,
      y: spawn.y,
      heading: spawn.heading,
      startLength: config.mode.startLength,
    });
    this.snake.turnRate = config.mode.turnRate;
    this.snake.speed = 0;

    this.spawnBellflowers();
    const foodTarget = this.foodTarget();
    for (let i = 0; i < foodTarget; i++) this.spawnFood();
  }

  /**
   * Pick a start position clear of the arena's obstacles, facing the centre.
   * A fixed spawn point silently breaks whenever a map's layout changes — it
   * once placed the wyrm inside a standing stone, killing it on frame one.
   */
  private findSpawn(): { x: number; y: number; heading: number } {
    const { width, height, obstacles } = this.map;
    const cx = width / 2;
    const cy = height / 2;
    const margin = 140;
    // Candidate rings around the centre, nearest first, so the wyrm still
    // starts in open ground below the middle when the map allows it.
    const candidates: { x: number; y: number }[] = [];
    for (const frac of [0.24, 0.3, 0.36, 0.16]) {
      for (let i = 0; i < 12; i++) {
        // Start pointing down-screen and sweep around.
        const a = Math.PI / 2 + (i / 12) * Math.PI * 2;
        candidates.push({
          x: clamp(cx + Math.cos(a) * width * frac, margin, width - margin),
          y: clamp(cy + Math.sin(a) * height * frac, margin, height - margin),
        });
      }
    }
    candidates.push({ x: cx, y: cy });

    const headRoom = 46;

    /** How far the wyrm can travel from `p` along `angle` before hitting something. */
    const clearRun = (px: number, py: number, angle: number): number => {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let limit = 900;
      // Walls.
      if (dx > 0.001) limit = Math.min(limit, (width - margin - px) / dx);
      if (dx < -0.001) limit = Math.min(limit, (margin - px) / dx);
      if (dy > 0.001) limit = Math.min(limit, (height - margin - py) / dy);
      if (dy < -0.001) limit = Math.min(limit, (margin - py) / dy);
      // Obstacles: nearest intersection along the ray.
      for (const o of obstacles) {
        const ox = o.x - px;
        const oy = o.y - py;
        const along = ox * dx + oy * dy;
        if (along <= 0) continue;
        const perp = Math.abs(ox * dy - oy * dx);
        const need = o.r + headRoom;
        if (perp < need) {
          limit = Math.min(limit, along - Math.sqrt(need * need - perp * perp));
        }
      }
      return Math.max(0, limit);
    };

    let bestSpot = { x: cx, y: cy, heading: -Math.PI / 2 };
    let bestRun = -1;
    for (const c of candidates) {
      // The body unfolds behind the head, so the spot itself must be clear.
      const spotClear = obstacles.every(
        (o) => Math.hypot(c.x - o.x, c.y - o.y) > o.r + headRoom,
      );
      if (!spotClear) continue;
      // Face whichever direction offers the longest open run, so the wyrm is
      // never aimed straight into a standing stone on the first frame.
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const behindX = c.x - Math.cos(angle) * 90;
        const behindY = c.y - Math.sin(angle) * 90;
        const tailClear = obstacles.every(
          (o) => Math.hypot(behindX - o.x, behindY - o.y) > o.r + headRoom,
        );
        if (!tailClear) continue;
        const run = clearRun(c.x, c.y, angle);
        if (run > bestRun) {
          bestRun = run;
          bestSpot = { x: c.x, y: c.y, heading: angle };
        }
      }
      // A run this long is already comfortable; stop searching.
      if (bestRun > 620) break;
    }
    return bestSpot;
  }

  private foodTarget(): number {
    return Math.max(1, Math.round(this.mode.foodCount * (this.cfg.foodCountScale ?? 1)));
  }

  private speedScale(): number {
    return this.cfg.speedScale ?? 1;
  }

  /** Difficulty ramp 0..1 driving hazard cadence and aggression. */
  get difficulty(): number {
    return clamp01(this.time / 200 + this.score / 4000);
  }

  private spawnBellflowers(): void {
    const rng = new Rng(this.map.decorSeed ^ 0x5f5f);
    const count = 7;
    for (let i = 0; i < count && this.bellflowers.length < count; i++) {
      const p: Vec2 = {
        x: rng.range(180, this.map.width - 180),
        y: rng.range(180, this.map.height - 180),
      };
      const clearOfObstacles = this.map.obstacles.every(
        (o) => Math.hypot(p.x - o.x, p.y - o.y) > o.r + 90,
      );
      if (clearOfObstacles) {
        this.bellflowers.push({ id: i + 1, pos: p, cooldown: 0 });
      }
    }
  }

  private spawnFood(): void {
    const pos = findSpawnPoint(this.rng, this.map, this.snake, this.foods, this.hazards);
    const kind = rollFoodKind(this.rng, this.mode.timeLimit !== null);
    const food = makeFood(kind, pos, this.time);
    this.foods.push(food);
    this.events.emit('food_spawned', { food });
  }

  setTargetHeading(angle: number): void {
    if (this.state === 'running' || this.state === 'countdown') {
      this.snake.setTargetHeading(angle);
    }
  }

  update(dt: number): void {
    if (this.state === 'ended') return;

    if (this.state === 'countdown') {
      this.countdownLeft -= dt;
      const whole = Math.max(0, Math.ceil(this.countdownLeft));
      if (whole !== this.lastCountdownWhole && whole > 0) {
        this.lastCountdownWhole = whole;
        this.events.emit('countdown', { n: whole });
      }
      if (this.countdownLeft <= 0) {
        this.state = 'running';
        this.events.emit('started', {});
      }
      return;
    }

    if (this.state === 'dying') {
      this.dyingT += dt;
      // The world keeps breathing during the death beat, in slow motion.
      const slow = dt * 0.25;
      this.updateAmbient(slow);
      if (this.dyingT >= DYING_SECONDS) this.finish(this.deathCause ?? 'wall');
      return;
    }

    // --- running ---
    this.time += dt;
    this.snake.speed =
      (this.mode.baseSpeed +
        Math.min(this.mode.maxSpeedBonus, this.foodEaten * this.mode.speedPerFood)) *
      this.speedScale();
    this.snake.update(dt);

    this.handleWalls();
    if (this.state !== ('dying' as SessionState)) this.handleObstacles();
    if (this.state !== ('dying' as SessionState)) this.handleSelf();
    if (this.state !== ('dying' as SessionState)) {
      this.updateFood(dt);
      this.updateComboState(dt);
      this.updateHazards(dt);
      this.updateBoss(dt);
      this.updateBells(dt);
      this.updateTimers(dt);
      this.updatePassiveScore(dt);
      this.nearMissCooldown = Math.max(0, this.nearMissCooldown - dt);
    }
  }

  /** Systems that continue in the death slow-mo so the frame doesn't freeze. */
  private updateAmbient(dt: number): void {
    for (const h of this.hazards) updateHazard(h, dt, this.snake, this.difficulty);
    this.boss?.update(dt);
  }

  private handleWalls(): void {
    const { pos } = this.snake;
    const r = this.snake.headRadius;
    const { width, height } = this.map;

    if (this.mode.invulnerable) {
      // Zen: the Vale gently holds the wyrm inside — slide along the edge.
      const nx = clamp(pos.x, r + 4, width - r - 4);
      const ny = clamp(pos.y, r + 4, height - r - 4);
      if (nx !== pos.x || ny !== pos.y) this.snake.nudge(nx - pos.x, ny - pos.y);
      return;
    }

    if (pos.x < r || pos.x > width - r || pos.y < r || pos.y > height - r) {
      this.beginDeath('wall');
    }
  }

  private handleObstacles(): void {
    const { pos } = this.snake;
    const headR = this.snake.headRadius * 0.85;
    for (const o of this.map.obstacles) {
      const dx = pos.x - o.x;
      const dy = pos.y - o.y;
      const d2 = dx * dx + dy * dy;
      const hitR = o.r * 0.92 + headR;
      if (d2 < hitR * hitR) {
        if (this.mode.invulnerable) {
          // Push out along the normal.
          const d = Math.sqrt(d2) || 1;
          const push = hitR - d + 0.5;
          this.snake.nudge((dx / d) * push, (dy / d) * push);
          return;
        }
        this.beginDeath('obstacle');
        return;
      }
      const nearR = hitR + 26;
      if (d2 < nearR * nearR) this.registerNearMiss(pos);
    }
  }

  private handleSelf(): void {
    if (this.mode.invulnerable) return;
    if (this.time < 1.5) return; // grace period while the body unfolds
    if (this.snake.selfCollides()) this.beginDeath('self');
  }

  private updateFood(dt: number): void {
    const head = this.snake.pos;
    const eatR = this.snake.headRadius + 5;

    for (let i = this.foods.length - 1; i >= 0; i--) {
      const food = this.foods[i]!;

      if (food.ttl !== null && this.time - food.born > food.ttl) {
        this.foods.splice(i, 1);
        this.events.emit('food_expired', { food });
        this.spawnFood();
        continue;
      }

      const d = dist(head, food.pos);
      if (d < FOOD_MAGNET_RADIUS && d > 1) {
        // Food yearns toward the wyrm once it is close: satisfying pickup feel.
        const pull = FOOD_MAGNET_SPEED * (1 - d / FOOD_MAGNET_RADIUS) * dt;
        food.pos.x += ((head.x - food.pos.x) / d) * pull;
        food.pos.y += ((head.y - food.pos.y) / d) * pull;
      }

      if (d < eatR + food.radius) {
        this.foods.splice(i, 1);
        this.eat(food);
        this.spawnFood();
      }
    }

    // Sigil food (boss relic) is tracked separately from the regular pool.
    if (this.sigilFood) {
      const d = dist(head, this.sigilFood.pos);
      if (d < FOOD_MAGNET_RADIUS && d > 1) {
        const pull = FOOD_MAGNET_SPEED * (1 - d / FOOD_MAGNET_RADIUS) * dt;
        this.sigilFood.pos.x += ((head.x - this.sigilFood.pos.x) / d) * pull;
        this.sigilFood.pos.y += ((head.y - this.sigilFood.pos.y) / d) * pull;
      }
      if (d < eatR + this.sigilFood.radius) {
        const sigil = this.sigilFood;
        this.sigilFood = null;
        this.eat(sigil);
        this.collectSigil(sigil.pos);
      }
    }
  }

  private eat(food: Food): void {
    const { combo, multiplier, milestone } = this.combo.registerEat();
    const gained = Math.round(food.value * multiplier * this.mode.scoreMult);
    this.addScore(gained);
    this.foodEaten += 1;
    this.snake.grow(food.growth);
    this.events.emit('grew', { length: this.snake.length });

    if (food.kind === 'chrono' && this.timeRemaining !== null) {
      this.timeRemaining += CHRONO_TIME_BONUS;
    }

    this.events.emit('food_eaten', { food, combo, multiplier, gained });
    if (milestone) this.events.emit('combo_milestone', { combo });
  }

  private updateComboState(dt: number): void {
    const broke = this.combo.update(dt);
    if (broke) this.events.emit('combo_break', { combo: this.combo.maxCombo });
  }

  private updateHazards(dt: number): void {
    if (this.mode.hazards) {
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0) {
        const interval = Math.max(
          this.mode.hazardIntervalMin,
          this.mode.hazardIntervalStart - this.difficulty * 10,
        );
        this.hazardTimer = interval * this.rng.range(0.8, 1.25);
        const hazard = spawnHazard(this.rng, this.map, this.snake, this.difficulty);
        this.hazards.push(hazard);
        this.events.emit('hazard_spawned', { hazard });
      }
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]!;
      const transition = updateHazard(h, dt, this.snake, this.difficulty);
      if (transition === 'activated') this.events.emit('hazard_activated', { hazard: h });
      if (transition === 'expired') {
        this.hazards.splice(i, 1);
        this.events.emit('hazard_expired', { hazard: h });
        continue;
      }
      if (hazardHits(h, this.snake.pos, this.snake.headRadius)) {
        if (!this.mode.invulnerable) {
          this.beginDeath('hazard');
          return;
        }
      } else if (h.state === 'active') {
        const d = dist(this.snake.pos, h.pos);
        if (d < h.radius + this.snake.headRadius + 30) this.registerNearMiss(this.snake.pos);
      }
    }
  }

  private updateBoss(dt: number): void {
    if (!this.boss) {
      if (this.mode.boss && this.score >= this.nextBossScore) {
        this.boss = new BossEncounter(this.map, this.snake, this.rng);
        this.nextBossScore += this.mode.bossScoreStep;
        this.events.emit('boss_spawned', { pos: { ...this.boss.pos } });
      }
      return;
    }

    const boss = this.boss;
    const { wantsRift, departed, landed } = boss.update(dt);

    if (landed) this.queueSigil(0.8);

    if (wantsRift) {
      const rift = spawnHazard(this.rng, this.map, this.snake, 1);
      rift.kind = 'rift';
      rift.radius = this.rng.range(60, 96);
      rift.lifetime = this.rng.range(4, 6);
      this.hazards.push(rift);
      this.events.emit('hazard_spawned', { hazard: rift });
    }

    if (this.sigilDelay > 0) {
      this.sigilDelay -= dt;
      if (this.sigilDelay <= 0 && boss.phase === 'active' && !this.sigilFood) {
        const pos = boss.placeSigil(this.map);
        this.sigilFood = makeFood('sigil', pos, this.time);
        this.events.emit('boss_sigil_spawned', { pos: { ...pos }, index: boss.sigilsCollected });
      }
    }

    if (boss.hits(this.snake.pos, this.snake.headRadius) && !this.mode.invulnerable) {
      this.beginDeath('boss');
      return;
    }

    if (departed) {
      const wasBanished = boss.phase === 'banished';
      this.boss = null;
      this.sigilFood = null;
      if (!wasBanished) this.events.emit('boss_departed', {});
    }
  }

  private queueSigil(delay: number): void {
    this.sigilDelay = delay;
  }

  private collectSigil(pos: Vec2): void {
    const boss = this.boss;
    if (!boss) return;
    const banished = boss.collectSigil();
    this.events.emit('boss_sigil_collected', {
      collected: boss.sigilsCollected,
      total: 5,
      pos: { ...pos },
    });
    if (banished) {
      this.bossesDefeated += 1;
      this.addScore(Math.round(500 * this.mode.scoreMult));
      this.events.emit('boss_defeated', { pos: { ...boss.pos } });
    } else {
      this.queueSigil(1.6);
    }
  }

  private updateBells(dt: number): void {
    for (const bell of this.bellflowers) {
      bell.cooldown = Math.max(0, bell.cooldown - dt);
      if (bell.cooldown === 0 && dist(this.snake.pos, bell.pos) < 70) {
        bell.cooldown = 9;
        this.addScore(Math.round(5 * this.mode.scoreMult));
        this.events.emit('bell_chime', { pos: { ...bell.pos } });
      }
    }
  }

  private updateTimers(dt: number): void {
    if (this.timeRemaining === null) return;
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 30 && !this.warned30) {
      this.warned30 = true;
      this.events.emit('time_warning', { remaining: 30 });
    }
    if (this.timeRemaining <= 10 && !this.warned10) {
      this.warned10 = true;
      this.events.emit('time_warning', { remaining: 10 });
    }
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.finish('completed');
    }
  }

  private updatePassiveScore(dt: number): void {
    if (this.mode.scorePerSecond <= 0) return;
    this.scoreFraction += this.mode.scorePerSecond * dt * (1 + this.difficulty);
    if (this.scoreFraction >= 1) {
      const whole = Math.floor(this.scoreFraction);
      this.scoreFraction -= whole;
      this.addScore(whole);
    }
  }

  private addScore(points: number): void {
    this.score += points;
    this.events.emit('score_changed', { score: this.score, multiplier: this.combo.multiplier });
  }

  private registerNearMiss(pos: Vec2): void {
    if (this.nearMissCooldown > 0) return;
    this.nearMissCooldown = 1.1;
    this.events.emit('near_miss', { pos: { ...pos } });
  }

  private beginDeath(cause: DeathCause): void {
    if (this.state !== 'running') return;
    this.state = 'dying';
    this.deathCause = cause;
    this.dyingT = 0;
    this.events.emit('death', { cause, pos: { ...this.snake.pos } });
  }

  private finish(cause: DeathCause | 'completed'): void {
    if (this.ended) return;
    this.ended = true;
    this.state = 'ended';
    const summary: RunSummary = {
      mode: this.mode.id,
      score: this.score,
      timeSeconds: this.time,
      foodEaten: this.foodEaten,
      maxCombo: this.combo.maxCombo,
      maxLength: this.snake.length,
      distance: this.snake.distance,
      bossesDefeated: this.bossesDefeated,
      cause,
      isBestScore: this.score > this.cfg.previousBest,
    };
    this.events.emit('run_ended', { summary });
  }

  /** Zen has no fail state; the player leaves via the pause menu. */
  endVoluntarily(): void {
    if (this.state === 'ended') return;
    this.finish('completed');
  }
}
