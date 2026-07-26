/**
 * Environmental hazards.
 *  - thorns: static bramble patch, telegraphed before it hardens.
 *  - wisp:   a slow, mournful light that drifts toward the wyrm.
 *  - rift:   a tear in the ground that erupts after a warning ring.
 */
import { clamp, type Vec2 } from '../core/mathUtils';
import type { Rng } from '../core/rng';
import type { Snake } from './snake';
import type { Hazard, HazardKind, WorldMap } from './types';

const TELEGRAPH_TIME: Record<HazardKind, number> = { thorns: 1.6, wisp: 1.1, rift: 1.4 };
const FADE_TIME = 0.9;

let nextHazardId = 1;

export function spawnHazard(
  rng: Rng,
  map: WorldMap,
  snake: Snake,
  difficulty: number, // 0..1 ramp over the run
): Hazard {
  const kind: HazardKind = rng.weighted([
    { item: 'thorns' as HazardKind, weight: 0.4 },
    { item: 'wisp' as HazardKind, weight: 0.3 + difficulty * 0.25 },
    { item: 'rift' as HazardKind, weight: 0.3 + difficulty * 0.2 },
  ]);

  // Spawn within a band around the player so hazards matter, but never
  // directly on top of the head.
  const margin = 110;
  let pos: Vec2 = { x: map.width / 2, y: map.height / 2 };
  for (let i = 0; i < 16; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(260, 760);
    const p = {
      x: clamp(snake.pos.x + Math.cos(angle) * radius, margin, map.width - margin),
      y: clamp(snake.pos.y + Math.sin(angle) * radius, margin, map.height - margin),
    };
    const dx = p.x - snake.pos.x;
    const dy = p.y - snake.pos.y;
    if (dx * dx + dy * dy > 220 * 220) {
      pos = p;
      break;
    }
  }

  const radius =
    kind === 'thorns' ? rng.range(46, 74) : kind === 'rift' ? rng.range(56, 92) : 16;
  const lifetime =
    kind === 'thorns'
      ? rng.range(14, 22)
      : kind === 'rift'
        ? rng.range(5, 8)
        : rng.range(12, 18);

  return {
    id: nextHazardId++,
    kind,
    pos,
    radius,
    state: 'telegraph',
    stateT: 0,
    vel: { x: 0, y: 0 },
    lifetime,
    seed: rng.int(0, 0xffff),
  };
}

/** Advance one hazard; returns 'activated' | 'expired' | null state transitions. */
export function updateHazard(
  h: Hazard,
  dt: number,
  snake: Snake,
  difficulty: number,
): 'activated' | 'expired' | null {
  h.stateT += dt;

  if (h.state === 'telegraph') {
    if (h.stateT >= TELEGRAPH_TIME[h.kind]) {
      h.state = 'active';
      h.stateT = 0;
      return 'activated';
    }
    return null;
  }

  if (h.state === 'active') {
    if (h.kind === 'wisp') {
      // Mournful pursuit: accelerate gently toward the head, capped speed.
      const dx = snake.pos.x - h.pos.x;
      const dy = snake.pos.y - h.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const accel = 60 + difficulty * 50;
      const maxSpeed = 85 + difficulty * 55;
      h.vel.x += (dx / d) * accel * dt;
      h.vel.y += (dy / d) * accel * dt;
      const sp = Math.hypot(h.vel.x, h.vel.y);
      if (sp > maxSpeed) {
        h.vel.x = (h.vel.x / sp) * maxSpeed;
        h.vel.y = (h.vel.y / sp) * maxSpeed;
      }
      h.pos.x += h.vel.x * dt;
      h.pos.y += h.vel.y * dt;
    }
    h.lifetime -= dt;
    if (h.lifetime <= 0) {
      h.state = 'fading';
      h.stateT = 0;
    }
    return null;
  }

  // fading
  if (h.stateT >= FADE_TIME) return 'expired';
  return null;
}

/** True when the head is lethally inside the hazard (active state only). */
export function hazardHits(h: Hazard, headPos: Vec2, headRadius: number): boolean {
  if (h.state !== 'active') return false;
  const rr = h.radius + headRadius * 0.8;
  const dx = headPos.x - h.pos.x;
  const dy = headPos.y - h.pos.y;
  return dx * dx + dy * dy < rr * rr;
}
