import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { MODES } from '../src/game/modes';
import type { RunSummary } from '../src/game/types';

function makeSession(mode: keyof typeof MODES, seed = 1234): GameSession {
  return new GameSession({ mode: MODES[mode], previousBest: 0, seed });
}

function step(session: GameSession, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) session.update(dt);
}

describe('GameSession', () => {
  it('counts down, then starts', () => {
    const session = makeSession('classic');
    const seen: number[] = [];
    session.events.on('countdown', ({ n }) => seen.push(n));
    let started = false;
    session.events.on('started', () => (started = true));
    expect(session.state).toBe('countdown');
    step(session, 3.2);
    expect(started).toBe(true);
    expect(session.state).toBe('running');
    expect(seen).toContain(1);
  });

  it('spawns the configured amount of food inside the arena, clear of obstacles', () => {
    const session = makeSession('endless');
    expect(session.foods.length).toBe(MODES.endless.foodCount);
    for (const food of session.foods) {
      expect(food.pos.x).toBeGreaterThan(0);
      expect(food.pos.x).toBeLessThan(session.map.width);
      expect(food.pos.y).toBeGreaterThan(0);
      expect(food.pos.y).toBeLessThan(session.map.height);
      for (const o of session.map.obstacles) {
        expect(Math.hypot(food.pos.x - o.x, food.pos.y - o.y)).toBeGreaterThan(o.r);
      }
    }
  });

  it('dies against the arena wall and ends the run', () => {
    const session = makeSession('classic');
    step(session, 3.2); // through countdown
    // Reposition into open ground with a clear lane to the left wall.
    session.snake.pos.x = 1600;
    session.snake.pos.y = 300;
    session.snake.heading = Math.PI;
    session.setTargetHeading(Math.PI);
    const deaths: string[] = [];
    let summary: RunSummary | null = null;
    session.events.on('death', ({ cause }) => deaths.push(cause));
    session.events.on('run_ended', (e) => (summary = e.summary));
    step(session, 20);
    expect(deaths).toEqual(['wall']);
    expect(session.state).toBe('ended');
    expect(summary).not.toBeNull();
    expect(summary!.cause).toBe('wall');
  });

  it('zen never dies at the wall — it slides', () => {
    const session = makeSession('zen');
    step(session, 3.2);
    session.setTargetHeading(Math.PI / 2);
    step(session, 25);
    expect(session.state).toBe('running');
    const r = session.snake.headRadius;
    expect(session.snake.pos.y).toBeLessThanOrEqual(session.map.height - r);
  });

  it('time attack completes when the clock runs out', () => {
    const session = makeSession('timeattack');
    step(session, 3.2);
    // Circle tightly in the open north-west corner until the clock expires.
    session.snake.pos.x = 350;
    session.snake.pos.y = 350;
    session.timeRemaining = 35;
    let summary: RunSummary | null = null;
    const warnings: number[] = [];
    session.events.on('time_warning', ({ remaining }) => warnings.push(remaining));
    session.events.on('run_ended', (e) => (summary = e.summary));
    for (let i = 0; i < 40 * 60 && !summary; i++) {
      session.setTargetHeading(session.snake.heading + 2.5 / 60);
      session.update(1 / 60);
    }
    expect(summary).not.toBeNull();
    expect(summary!.cause).toBe('completed');
    expect(warnings).toContain(30);
    expect(warnings).toContain(10);
  });

  it('zen can end voluntarily with a completed summary', () => {
    const session = makeSession('zen');
    step(session, 4);
    let summary: RunSummary | null = null;
    session.events.on('run_ended', (e) => (summary = e.summary));
    session.endVoluntarily();
    expect(summary).not.toBeNull();
    expect(summary!.cause).toBe('completed');
    expect(session.state).toBe('ended');
  });

  it('identical seeds produce identical food layouts', () => {
    const a = makeSession('classic', 777);
    const b = makeSession('classic', 777);
    expect(a.foods.map((f) => ({ ...f.pos }))).toEqual(b.foods.map((f) => ({ ...f.pos })));
  });
});
