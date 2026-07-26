import { describe, expect, it } from 'vitest';
import { hashString, Rng } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const runA = Array.from({ length: 10 }, () => a.next());
    const runB = Array.from({ length: 10 }, () => b.next());
    expect(runA).not.toEqual(runB);
  });

  it('stays within [0, 1) and covers the range', () => {
    const rng = new Rng(99);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(0.05);
    expect(max).toBeGreaterThan(0.95);
  });

  it('int() is inclusive of both bounds', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted() respects zero-ish weights', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 200; i++) {
      const pick = rng.weighted([
        { item: 'a', weight: 1 },
        { item: 'b', weight: 0.000001 },
      ]);
      expect(pick).toBe('a');
    }
  });

  it('hashString is stable and collision-averse for close inputs', () => {
    expect(hashString('umbravale-daily-2026-07-26')).toBe(hashString('umbravale-daily-2026-07-26'));
    expect(hashString('umbravale-daily-2026-07-26')).not.toBe(
      hashString('umbravale-daily-2026-07-27'),
    );
  });
});
