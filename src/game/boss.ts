/**
 * Boss encounter: The Warden of the Vale.
 * A vast lantern-idol descends and slowly patrols the arena. It scatters
 * five burning sigils, one at a time; devour all five to banish it. Touching
 * the Warden is death. Linger too long and it departs on its own, taking the
 * unclaimed reward with it.
 */
import { clamp, TAU, type Vec2 } from '../core/mathUtils';
import type { Rng } from '../core/rng';
import type { Snake } from './snake';
import type { WorldMap } from './types';

export type BossPhase = 'descending' | 'active' | 'banished' | 'departing';

export const BOSS_SIGIL_TOTAL = 5;
export const BOSS_PATIENCE = 75; // seconds before the Warden departs
export const BOSS_RADIUS = 64;

export class BossEncounter {
  phase: BossPhase = 'descending';
  pos: Vec2;
  /** Current visual/logical altitude 1 -> 0 while descending. */
  altitude = 1;
  sigilsCollected = 0;
  /** Position of the currently burning sigil, if one is out. */
  sigilPos: Vec2 | null = null;
  timeLeft = BOSS_PATIENCE;
  phaseT = 0;

  private orbitAngle: number;
  private orbitCenter: Vec2;
  private orbitRadius: number;
  private rng: Rng;
  private riftTimer = 6;

  constructor(map: WorldMap, snake: Snake, rng: Rng) {
    this.rng = rng;
    this.orbitCenter = { x: map.width / 2, y: map.height / 2 };
    this.orbitRadius = Math.min(map.width, map.height) * 0.28;
    // Enter on the far side of the arena from the player.
    const away = Math.atan2(snake.pos.y - this.orbitCenter.y, snake.pos.x - this.orbitCenter.x);
    this.orbitAngle = away + Math.PI;
    this.pos = this.orbitPoint();
  }

  private orbitPoint(): Vec2 {
    return {
      x: this.orbitCenter.x + Math.cos(this.orbitAngle) * this.orbitRadius,
      y: this.orbitCenter.y + Math.sin(this.orbitAngle) * this.orbitRadius,
    };
  }

  /** Pick a spot for the next sigil: near the Warden but reachable. */
  placeSigil(map: WorldMap): Vec2 {
    const margin = 120;
    const angle = this.rng.range(0, TAU);
    const dist = this.rng.range(180, 340);
    return {
      x: clamp(this.pos.x + Math.cos(angle) * dist, margin, map.width - margin),
      y: clamp(this.pos.y + Math.sin(angle) * dist, margin, map.height - margin),
    };
  }

  /**
   * Advance the encounter.
   * Returns events that occurred this tick for the session to broadcast.
   */
  update(dt: number): { wantsRift: boolean; departed: boolean; landed: boolean } {
    this.phaseT += dt;
    let wantsRift = false;
    let departed = false;
    let landed = false;

    switch (this.phase) {
      case 'descending': {
        this.altitude = Math.max(0, this.altitude - dt / 2.4);
        if (this.altitude === 0) {
          this.phase = 'active';
          this.phaseT = 0;
          landed = true;
        }
        break;
      }
      case 'active': {
        // Slow, inevitable patrol.
        this.orbitAngle += dt * 0.11;
        const target = this.orbitPoint();
        this.pos.x += (target.x - this.pos.x) * Math.min(1, dt * 1.2);
        this.pos.y += (target.y - this.pos.y) * Math.min(1, dt * 1.2);

        this.timeLeft -= dt;
        this.riftTimer -= dt;
        if (this.riftTimer <= 0) {
          this.riftTimer = this.rng.range(7, 11);
          wantsRift = true;
        }
        if (this.timeLeft <= 0) {
          this.phase = 'departing';
          this.phaseT = 0;
        }
        break;
      }
      case 'banished':
      case 'departing': {
        this.altitude = Math.min(1, this.altitude + dt / 2);
        if (this.altitude === 1 && this.phaseT > 2.2) departed = true;
        break;
      }
    }
    return { wantsRift, departed, landed };
  }

  collectSigil(): boolean {
    this.sigilsCollected += 1;
    this.sigilPos = null;
    if (this.sigilsCollected >= BOSS_SIGIL_TOTAL) {
      this.phase = 'banished';
      this.phaseT = 0;
      return true;
    }
    return false;
  }

  /** Lethal contact only while the Warden is grounded. */
  hits(headPos: Vec2, headRadius: number): boolean {
    if (this.phase !== 'active') return false;
    const rr = BOSS_RADIUS * 0.88 + headRadius * 0.8;
    const dx = headPos.x - this.pos.x;
    const dy = headPos.y - this.pos.y;
    return dx * dx + dy * dy < rr * rr;
  }
}
