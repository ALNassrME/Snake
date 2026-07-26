import { describe, expect, it } from 'vitest';
import { ComboTracker } from '../src/game/combo';

describe('ComboTracker', () => {
  it('starts neutral', () => {
    const combo = new ComboTracker(4);
    expect(combo.combo).toBe(0);
    expect(combo.multiplier).toBe(1);
    expect(combo.meter).toBe(0);
  });

  it('increments and reports milestones every 5', () => {
    const combo = new ComboTracker(4);
    for (let i = 1; i <= 4; i++) {
      expect(combo.registerEat().milestone).toBe(false);
    }
    expect(combo.registerEat().milestone).toBe(true); // 5
    expect(combo.combo).toBe(5);
  });

  it('scales the multiplier with chain length, capped at 5x', () => {
    const combo = new ComboTracker(4);
    combo.registerEat();
    expect(combo.multiplier).toBeCloseTo(1.08, 5);
    for (let i = 0; i < 200; i++) combo.registerEat();
    expect(combo.multiplier).toBe(5);
  });

  it('breaks when the window elapses', () => {
    const combo = new ComboTracker(4);
    combo.registerEat();
    expect(combo.update(1)).toBe(false);
    expect(combo.update(4)).toBe(true);
    expect(combo.combo).toBe(0);
    // A broken combo does not break twice.
    expect(combo.update(4)).toBe(false);
  });

  it('refreshes the timer on every eat', () => {
    const combo = new ComboTracker(4);
    combo.registerEat();
    combo.update(3);
    combo.registerEat();
    expect(combo.update(3)).toBe(false); // window was refreshed
    expect(combo.combo).toBe(2);
  });

  it('tightens the window as the chain grows but never below 45%', () => {
    const combo = new ComboTracker(4);
    for (let i = 0; i < 100; i++) combo.registerEat();
    combo.update(0);
    // With a floor of 45% of 4s = 1.8s, surviving 1.7s must hold.
    expect(combo.update(1.7)).toBe(false);
    expect(combo.update(0.2)).toBe(true);
  });

  it('tracks the best chain of the run', () => {
    const combo = new ComboTracker(4);
    for (let i = 0; i < 7; i++) combo.registerEat();
    combo.update(10);
    combo.registerEat();
    expect(combo.maxCombo).toBe(7);
  });
});
