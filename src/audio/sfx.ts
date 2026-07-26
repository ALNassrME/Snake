/**
 * Synthesised sound effects. Each effect builds a tiny one-shot node graph
 * on the sfx bus; world-positioned effects are panned and attenuated via the
 * engine's listener state.
 */
import type { AudioEngine } from './audioEngine';

export class SfxPlayer {
  private engine: AudioEngine;
  private lastPlayed = new Map<string, number>();

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /** Rate limit per effect key so bursts never phase-stack into noise. */
  private gate(key: string, minInterval: number): boolean {
    const ctx = this.engine.context;
    if (!ctx) return false;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < minInterval) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private out(x?: number): { node: AudioNode; ctx: AudioContext } | null {
    const ctx = this.engine.context;
    const sfx = this.engine.sfx;
    if (!ctx || !sfx) return null;
    if (x === undefined) return { node: sfx.bus, ctx };
    // World-positioned: attenuate by distance, pan by horizontal offset,
    // and send a slice to the shared reverb for depth.
    const { pan, gain } = this.engine.positional(x);
    const g = ctx.createGain();
    g.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    g.connect(panner);
    panner.connect(sfx.bus);
    g.connect(sfx.send);
    return { node: g, ctx };
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Ember pickup: a warm pluck whose pitch climbs with the combo. */
  eat(combo: number, x?: number): void {
    if (!this.gate('eat', 0.03)) return;
    const o = this.out(x);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const step = Math.min(combo, 24);
    const freq = 330 * Math.pow(2, (step % 12) / 12);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.07);
    const harm = ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    osc.connect(g);
    harm.connect(hg);
    hg.connect(g);
    g.connect(node);
    osc.start(t);
    harm.start(t);
    osc.stop(t + 0.4);
    harm.stop(t + 0.4);
  }

  bloomPickup(x?: number): void {
    const o = this.out(x);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (const [freq, delay] of [
      [523.25, 0],
      [659.25, 0.06],
      [783.99, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.4, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.7);
      osc.connect(g);
      g.connect(node);
      osc.start(t + delay);
      osc.stop(t + delay + 0.8);
    }
  }

  comboMilestone(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, [0, 4, 7, 12][i]! / 12);
      const g = ctx.createGain();
      const start = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.28, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(g);
      g.connect(node);
      osc.start(start);
      osc.stop(start + 0.6);
    }
  }

  comboBreak(): void {
    if (!this.gate('break', 0.4)) return;
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  death(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    // Deep body drop.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 1.4);
    // Shattering air.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.9);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(2400, t);
    nf.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(node);
    noise.start(t);
  }

  bell(x?: number): void {
    if (!this.gate('bell', 0.2)) return;
    const o = this.out(x);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const base = 660;
    for (const [ratio, level, dur] of [
      [1, 0.4, 2.2],
      [2.4, 0.18, 1.6],
      [4.1, 0.08, 1.1],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(node);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  hazardWarning(x?: number): void {
    if (!this.gate('warn', 0.25)) return;
    const o = this.out(x);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 196;
      const g = ctx.createGain();
      const start = t + i * 0.16;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.07, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      osc.connect(lp);
      lp.connect(g);
      g.connect(node);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  riftErupt(x?: number): void {
    if (!this.gate('rift', 0.3)) return;
    const o = this.out(x);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    noise.connect(filter);
    filter.connect(g);
    g.connect(node);
    noise.start(t);
  }

  bossRoar(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (const detune of [-8, 0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(52, t);
      osc.frequency.exponentialRampToValueAtTime(88, t + 0.7);
      osc.frequency.exponentialRampToValueAtTime(40, t + 2.2);
      osc.detune.value = detune;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(240, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.8);
      lp.frequency.exponentialRampToValueAtTime(160, t + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      osc.connect(lp);
      lp.connect(g);
      g.connect(node);
      osc.start(t);
      osc.stop(t + 2.8);
    }
  }

  sigil(x?: number): void {
    const o = this.out(x);
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, t);
    osc.frequency.exponentialRampToValueAtTime(784, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 1);
  }

  achievement(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (const [semi, delay] of [
      [0, 0],
      [7, 0.09],
      [12, 0.18],
      [19, 0.27],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 523.25 * Math.pow(2, semi / 12);
      const g = ctx.createGain();
      const start = t + delay;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
      osc.connect(g);
      g.connect(node);
      osc.start(start);
      osc.stop(start + 0.9);
    }
  }

  uiHover(): void {
    if (!this.gate('hover', 0.05)) return;
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  uiClick(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  uiBack(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  countdownTick(final: boolean): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = final ? 880 : 587;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(final ? 0.3 : 0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (final ? 0.6 : 0.25));
    osc.connect(g);
    g.connect(node);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  timeWarning(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, node } = o;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 740;
      const g = ctx.createGain();
      const start = t + i * 0.14;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(g);
      g.connect(node);
      osc.start(start);
      osc.stop(start + 0.12);
    }
  }
}
