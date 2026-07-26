import { describe, expect, it } from 'vitest';
import { Snake } from '../src/game/snake';

function makeSnake(startLength = 10): Snake {
  const snake = new Snake({ x: 500, y: 500, heading: 0, startLength });
  snake.speed = 180;
  return snake;
}

function step(snake: Snake, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) snake.update(dt);
}

describe('Snake', () => {
  it('is born at full length with segments trailing behind', () => {
    const snake = makeSnake(10);
    expect(snake.segments.length).toBe(10);
    // Heading is 0 (east), so the tail extends west of the head.
    const tail = snake.segments[snake.segments.length - 1]!;
    expect(tail.x).toBeLessThan(snake.pos.x);
    expect(Math.abs(tail.y - snake.pos.y)).toBeLessThan(1);
  });

  it('moves the head at the configured speed', () => {
    const snake = makeSnake();
    const x0 = snake.pos.x;
    step(snake, 1);
    expect(snake.pos.x - x0).toBeCloseTo(180, 0);
    expect(snake.distance).toBeCloseTo(180, 0);
  });

  it('keeps segments spaced at segmentSpacing along the path', () => {
    const snake = makeSnake();
    step(snake, 2);
    for (let i = 0; i < snake.segments.length - 1; i++) {
      const a = snake.segments[i]!;
      const b = snake.segments[i + 1]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      expect(d).toBeGreaterThan(snake.segmentSpacing * 0.8);
      expect(d).toBeLessThan(snake.segmentSpacing * 1.2);
    }
  });

  it('turns smoothly toward the target heading, never snapping', () => {
    const snake = makeSnake();
    snake.turnRate = 4;
    snake.setTargetHeading(Math.PI / 2);
    snake.update(1 / 60);
    // After one frame the heading must have moved but not arrived.
    expect(snake.heading).toBeGreaterThan(0);
    expect(snake.heading).toBeLessThan(Math.PI / 2);
    step(snake, 1);
    expect(snake.heading).toBeCloseTo(Math.PI / 2, 3);
  });

  it('grows toward the target length smoothly', () => {
    const snake = makeSnake(10);
    snake.grow(5);
    expect(snake.length).toBe(15);
    expect(snake.segments.length).toBeLessThan(15); // grows over time
    step(snake, 2);
    expect(snake.segments.length).toBe(15);
  });

  it('does not self-collide when travelling straight', () => {
    const snake = makeSnake(30);
    step(snake, 3);
    expect(snake.selfCollides()).toBe(false);
  });

  it('self-collides when doubling back through its own body', () => {
    const snake = makeSnake(60);
    step(snake, 1);
    // Drive in a tight circle far smaller than the body length.
    for (let i = 0; i < 400; i++) {
      snake.setTargetHeading(snake.heading + 0.5);
      snake.update(1 / 60);
      if (snake.selfCollides()) break;
    }
    expect(snake.selfCollides()).toBe(true);
  });

  it('normalises target headings into [0, 2π)', () => {
    const snake = makeSnake();
    snake.setTargetHeading(-Math.PI / 2);
    expect(snake.targetHeading).toBeCloseTo((3 * Math.PI) / 2, 5);
    snake.setTargetHeading(Math.PI * 5);
    expect(snake.targetHeading).toBeCloseTo(Math.PI, 5);
  });
});
