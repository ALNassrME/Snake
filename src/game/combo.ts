/**
 * Combo & score multiplier.
 * Each food eaten within the decay window extends the chain; the multiplier
 * scales with chain length and is applied to all score gains.
 */

export class ComboTracker {
  private window: number;
  combo = 0;
  timer = 0;
  maxCombo = 0;

  constructor(windowSeconds: number) {
    this.window = windowSeconds;
  }

  /** Fraction of the decay window remaining, for the HUD meter. */
  get meter(): number {
    if (this.combo === 0) return 0;
    return Math.max(0, Math.min(1, this.timer / this.effectiveWindow()));
  }

  get multiplier(): number {
    return Math.min(5, 1 + this.combo * 0.08);
  }

  /** The window tightens slightly as the chain grows, rewarding flow. */
  private effectiveWindow(): number {
    return Math.max(this.window * 0.45, this.window - this.combo * 0.06);
  }

  registerEat(): { combo: number; multiplier: number; milestone: boolean } {
    this.combo += 1;
    this.timer = this.effectiveWindow();
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    return {
      combo: this.combo,
      multiplier: this.multiplier,
      milestone: this.combo > 0 && this.combo % 5 === 0,
    };
  }

  /** Returns true when the chain just broke this tick. */
  update(dt: number): boolean {
    if (this.combo === 0) return false;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.combo = 0;
      this.timer = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.combo = 0;
    this.timer = 0;
  }
}
