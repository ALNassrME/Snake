/**
 * Lightweight performance profiler.
 * Tracks frame times and exposes a rolling FPS plus an "auto quality" signal
 * so the renderer can shed visual load on weaker devices.
 */

export interface ProfilerSnapshot {
  fps: number;
  frameMs: number;
  worstMs: number;
  particles: number;
  drawObjects: number;
}

export class Profiler {
  private samples: number[] = [];
  private sampleIndex = 0;
  private readonly windowSize = 90;
  private accumulator = 0;
  private lastSnapshot: ProfilerSnapshot = {
    fps: 60,
    frameMs: 16.7,
    worstMs: 16.7,
    particles: 0,
    drawObjects: 0,
  };
  particles = 0;
  drawObjects = 0;

  /** Rolling average frame budget health in [0..1]; 1 = comfortably at 60fps. */
  health = 1;

  frame(deltaMs: number): void {
    const ms = Math.min(deltaMs, 100);
    if (this.samples.length < this.windowSize) {
      this.samples.push(ms);
    } else {
      this.samples[this.sampleIndex] = ms;
      this.sampleIndex = (this.sampleIndex + 1) % this.windowSize;
    }
    this.accumulator += ms;
    if (this.accumulator >= 250) {
      this.accumulator = 0;
      this.refreshSnapshot();
    }
  }

  private refreshSnapshot(): void {
    if (this.samples.length === 0) return;
    let sum = 0;
    let worst = 0;
    for (const s of this.samples) {
      sum += s;
      if (s > worst) worst = s;
    }
    const avg = sum / this.samples.length;
    this.lastSnapshot = {
      fps: Math.round(1000 / avg),
      frameMs: Math.round(avg * 10) / 10,
      worstMs: Math.round(worst * 10) / 10,
      particles: this.particles,
      drawObjects: this.drawObjects,
    };
    // 16.7ms -> 1.0 health, 33ms -> ~0 health
    this.health = Math.max(0, Math.min(1, (33.4 - avg) / 16.7));
  }

  get snapshot(): ProfilerSnapshot {
    return this.lastSnapshot;
  }
}

export const profiler = new Profiler();
