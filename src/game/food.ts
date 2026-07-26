/** Procedural food spawning with placement rejection sampling. */
import { distSq, type Vec2 } from '../core/mathUtils';
import type { Rng } from '../core/rng';
import type { Snake } from './snake';
import type { Food, FoodKind, Hazard, WorldMap } from './types';

export interface FoodKindDef {
  kind: FoodKind;
  radius: number;
  value: number;
  growth: number;
  ttl: number | null;
  weight: number;
}

export const FOOD_DEFS: Record<FoodKind, FoodKindDef> = {
  ember: { kind: 'ember', radius: 9, value: 10, growth: 2, ttl: null, weight: 0.86 },
  bloom: { kind: 'bloom', radius: 12, value: 50, growth: 5, ttl: 12, weight: 0.14 },
  chrono: { kind: 'chrono', radius: 10, value: 15, growth: 2, ttl: 9, weight: 0.22 },
  sigil: { kind: 'sigil', radius: 13, value: 120, growth: 1, ttl: null, weight: 0 },
};

const ARENA_MARGIN = 70;

let nextFoodId = 1;

export function makeFood(kind: FoodKind, pos: Vec2, born: number): Food {
  const def = FOOD_DEFS[kind];
  return {
    id: nextFoodId++,
    kind,
    pos: { ...pos },
    radius: def.radius,
    value: def.value,
    growth: def.growth,
    born,
    ttl: def.ttl,
  };
}

/**
 * Find a spawn point that is comfortably clear of the snake, obstacles,
 * other foods and hazards. Falls back to the best candidate found if the
 * arena is crowded, so spawning never hard-fails.
 */
export function findSpawnPoint(
  rng: Rng,
  map: WorldMap,
  snake: Snake,
  foods: readonly Food[],
  hazards: readonly Hazard[],
): Vec2 {
  let best: Vec2 = {
    x: rng.range(ARENA_MARGIN, map.width - ARENA_MARGIN),
    y: rng.range(ARENA_MARGIN, map.height - ARENA_MARGIN),
  };
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 24; attempt++) {
    const p: Vec2 = {
      x: rng.range(ARENA_MARGIN, map.width - ARENA_MARGIN),
      y: rng.range(ARENA_MARGIN, map.height - ARENA_MARGIN),
    };

    let minClear = distSq(p, snake.pos);
    for (const seg of snake.segments) minClear = Math.min(minClear, distSq(p, seg));
    for (const f of foods) minClear = Math.min(minClear, distSq(p, f.pos));

    let blocked = false;
    for (const o of map.obstacles) {
      const rr = o.r + 40;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      if (dx * dx + dy * dy < rr * rr) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const h of hazards) {
        const rr = h.radius + 60;
        if (distSq(p, h.pos) < rr * rr) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;

    // Prefer clear space, but keep food within reach of the head so play flows.
    // Keep food inside the camera's reach: far enough to require a decision,
    // close enough to chain before the combo window lapses.
    const headDist = Math.sqrt(distSq(p, snake.pos));
    const reachPenalty = headDist > 520 ? (headDist - 520) * 4 : 0;
    const tooClosePenalty = headDist < 120 ? (120 - headDist) * 30 : 0;
    const score = Math.min(minClear, 190 * 190) - reachPenalty - tooClosePenalty;
    if (score > bestScore) {
      bestScore = score;
      best = p;
      if (minClear > 130 * 130 && headDist > 145 && headDist < 460) break;
    }
  }
  return best;
}

export function rollFoodKind(rng: Rng, allowChrono: boolean): FoodKind {
  const pool: { item: FoodKind; weight: number }[] = [
    { item: 'ember', weight: FOOD_DEFS.ember.weight },
    { item: 'bloom', weight: FOOD_DEFS.bloom.weight },
  ];
  if (allowChrono) pool.push({ item: 'chrono', weight: FOOD_DEFS.chrono.weight });
  return rng.weighted(pool);
}
