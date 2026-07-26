/**
 * Pacing regression guard.
 *
 * Players reported the first tuning pass as boring: food sat so far apart
 * that combos expired before they could be chained and the wyrm never grew
 * long enough to threaten itself. These tests drive a competent-but-simple
 * greedy player through a real session and assert that the game still hands
 * out decisions at an arcade rate.
 */
import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { MODES } from '../src/game/modes';
import type { GameModeId } from '../src/game/types';

interface PlayResult {
  foodEaten: number;
  maxCombo: number;
  score: number;
  maxLength: number;
  survived: number;
}

/**
 * Steer straight at the nearest food, nudging around obstacles and away from
 * the walls. Deliberately simple: it stands in for an average player, not an
 * optimal one.
 */
function playGreedy(mode: GameModeId, seconds: number, seed = 4242): PlayResult {
  const session = new GameSession({ mode: MODES[mode], previousBest: 0, seed });
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(4 / dt); i++) session.update(dt); // countdown

  let maxLength = session.snake.length;
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps && session.state === 'running'; i++) {
    const head = session.snake.pos;
    let target = session.foods[0] ?? null;
    let best = Infinity;
    for (const food of session.foods) {
      const d = Math.hypot(food.pos.x - head.x, food.pos.y - head.y);
      if (d < best) {
        best = d;
        target = food;
      }
    }

    let desired = target
      ? Math.atan2(target.pos.y - head.y, target.pos.x - head.x)
      : session.snake.heading;

    // Steer away from an obstacle directly ahead.
    for (const o of session.map.obstacles) {
      const dx = o.x - head.x;
      const dy = o.y - head.y;
      const dist = Math.hypot(dx, dy);
      if (dist < o.r + 110) {
        const away = Math.atan2(head.y - o.y, head.x - o.x);
        desired = away + Math.PI / 2.2;
      }
    }
    // And from the arena edge.
    const m = 130;
    if (head.x < m) desired = 0;
    else if (head.x > session.map.width - m) desired = Math.PI;
    else if (head.y < m) desired = Math.PI / 2;
    else if (head.y > session.map.height - m) desired = -Math.PI / 2;

    session.setTargetHeading(desired);
    session.update(dt);
    maxLength = Math.max(maxLength, session.snake.length);
  }

  return {
    foodEaten: session.foodEaten,
    maxCombo: session.combo.maxCombo,
    score: session.score,
    maxLength,
    survived: session.time,
  };
}

describe('pacing', () => {
  it('classic keeps a player fed at an arcade rate', () => {
    const r = playGreedy('classic', 60);
    // Roughly one pickup every few seconds, not one every ten.
    expect(r.foodEaten).toBeGreaterThanOrEqual(15);
    expect(r.score).toBeGreaterThan(200);
  });

  it('combo chains are actually reachable', () => {
    const r = playGreedy('classic', 60);
    // The multiplier is the game's scoring depth; if food is spaced wider
    // than the combo window it is dead content.
    expect(r.maxCombo).toBeGreaterThanOrEqual(6);
  });

  it('the wyrm grows into a real obstacle within a minute', () => {
    const r = playGreedy('classic', 60);
    expect(r.maxLength).toBeGreaterThanOrEqual(40);
  });

  it('spawns with an open run ahead on every map', () => {
    // Facing a standing stone at spawn ended runs in about two seconds.
    for (const mode of Object.keys(MODES) as GameModeId[]) {
      const session = new GameSession({ mode: MODES[mode], previousBest: 0, seed: 11 });
      const { pos, heading } = session.snake;
      const dx = Math.cos(heading);
      const dy = Math.sin(heading);
      let clear = Infinity;
      for (const o of session.map.obstacles) {
        const ox = o.x - pos.x;
        const oy = o.y - pos.y;
        const along = ox * dx + oy * dy;
        if (along <= 0) continue;
        const perp = Math.abs(ox * dy - oy * dx);
        const need = o.r + session.snake.headRadius;
        if (perp < need) clear = Math.min(clear, along - Math.sqrt(need * need - perp * perp));
      }
      // At ~235 units/s this is over a second of reaction time.
      expect(clear, `${mode} spawns facing an obstacle`).toBeGreaterThan(300);
    }
  });

  it('a player is never trapped at spawn on any map', () => {
    for (const mode of Object.keys(MODES) as GameModeId[]) {
      const session = new GameSession({ mode: MODES[mode], previousBest: 0, seed: 7 });
      const head = session.snake.pos;
      for (const o of session.map.obstacles) {
        const d = Math.hypot(head.x - o.x, head.y - o.y);
        expect(d, `${mode} spawns inside an obstacle`).toBeGreaterThan(o.r + session.snake.headRadius);
      }
    }
  });
});
