/**
 * Generative soundtrack.
 * Every theme is a small ruleset — a chord progression in D dorian, a tempo
 * and layer intensities — realised in real time by a lookahead scheduler:
 * breathing drones, slow-attack pads, pentatonic arpeggio plucks and sparse
 * far-away bells. Themes crossfade by ramping whole layer groups.
 */
import type { AudioEngine } from './audioEngine';

export type ThemeId = 'menu' | 'explore' | 'boss' | 'zen' | 'ended';

interface ThemeDef {
  /** Chord progression as semitone offsets from D3; one chord per bar. */
  progression: number[][];
  tempo: number; // BPM (eighth-note grid for the arp)
  droneGain: number;
  padGain: number;
  arpGain: number;
  bellGain: number;
  /** Probability an arp slot fires at intensity 1. */
  arpDensity: number;
  pulseGain: number; // low percussive heartbeat (boss)
  filterHz: number;
}

const D3 = 146.83;

const THEMES: Record<ThemeId, ThemeDef> = {
  menu: {
    progression: [
      [0, 3, 7, 14],
      [-4, 3, 7, 12],
      [-7, 0, 5, 12],
      [-2, 5, 8, 12],
    ],
    tempo: 56,
    droneGain: 0.16,
    padGain: 0.12,
    arpGain: 0.055,
    bellGain: 0.05,
    arpDensity: 0.28,
    pulseGain: 0,
    filterHz: 1100,
  },
  explore: {
    progression: [
      [0, 3, 7, 12],
      [-4, 3, 7, 10],
      [5, 8, 12, 15],
      [-2, 2, 5, 12],
    ],
    tempo: 74,
    droneGain: 0.14,
    padGain: 0.1,
    arpGain: 0.075,
    bellGain: 0.04,
    arpDensity: 0.5,
    pulseGain: 0,
    filterHz: 1500,
  },
  boss: {
    progression: [
      [0, 3, 6, 12],
      [0, 3, 6, 12],
      [-2, 1, 6, 10],
      [-4, 0, 6, 9],
    ],
    tempo: 92,
    droneGain: 0.2,
    padGain: 0.1,
    arpGain: 0.09,
    bellGain: 0.02,
    arpDensity: 0.72,
    pulseGain: 0.22,
    filterHz: 900,
  },
  zen: {
    progression: [
      [0, 7, 14, 21],
      [-4, 7, 12, 19],
      [-7, 5, 12, 17],
      [-4, 3, 12, 19],
    ],
    tempo: 44,
    droneGain: 0.17,
    padGain: 0.14,
    arpGain: 0.045,
    bellGain: 0.07,
    arpDensity: 0.18,
    pulseGain: 0,
    filterHz: 950,
  },
  ended: {
    progression: [
      [-7, 0, 5, 12],
      [-9, -2, 3, 10],
    ],
    tempo: 48,
    droneGain: 0.12,
    padGain: 0.12,
    arpGain: 0,
    bellGain: 0.06,
    arpDensity: 0,
    pulseGain: 0,
    filterHz: 700,
  },
};

const PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

function freqOf(semitone: number, octave = 0): number {
  return D3 * Math.pow(2, (semitone + octave * 12) / 12);
}

interface ActiveTheme {
  id: ThemeId;
  def: ThemeDef;
  group: GainNode;
  filter: BiquadFilterNode;
  droneOscs: OscillatorNode[];
  droneGain: GainNode;
  padGain: GainNode;
  arpGain: GainNode;
  bellGain: GainNode;
  pulseGain: GainNode;
  nextNoteTime: number;
  step: number;
  disposed: boolean;
}

export class MusicDirector {
  private engine: AudioEngine;
  private current: ActiveTheme | null = null;
  private timer: number | null = null;
  /** 0..1 excitement that pushes arp density, filter and level. */
  intensity = 0.4;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  play(theme: ThemeId): void {
    const ctx = this.engine.context;
    const music = this.engine.music;
    if (!ctx || !music) return;
    if (this.current?.id === theme && !this.current.disposed) return;

    if (this.current) this.fadeOutAndDispose(this.current, 2.2);
    this.current = this.buildTheme(ctx, music.bus, music.send, theme);

    if (this.timer === null) {
      this.timer = window.setInterval(() => this.schedule(), 90);
    }
  }

  stop(): void {
    if (this.current) {
      this.fadeOutAndDispose(this.current, 1.6);
      this.current = null;
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private buildTheme(
    ctx: AudioContext,
    bus: GainNode,
    send: GainNode,
    id: ThemeId,
  ): ActiveTheme {
    const def = THEMES[id];
    const group = ctx.createGain();
    group.gain.value = 0;
    group.gain.setTargetAtTime(1, ctx.currentTime, 0.9);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = def.filterHz;
    filter.Q.value = 0.4;
    group.connect(filter);
    filter.connect(bus);
    filter.connect(send);

    const makeLayer = (gain: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(group);
      return g;
    };

    const droneGain = makeLayer(def.droneGain);
    const padGain = makeLayer(def.padGain);
    const arpGain = makeLayer(def.arpGain);
    const bellGain = makeLayer(def.bellGain);
    const pulseGain = makeLayer(def.pulseGain);

    // Continuous breathing drone: root + fifth, softly detuned pairs.
    const droneOscs: OscillatorNode[] = [];
    for (const [semi, detune, level] of [
      [-12, -4, 1],
      [-12, 5, 0.8],
      [-5, -3, 0.55],
      [0, 3, 0.3],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = semi === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freqOf(semi, 0);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(droneGain);
      // Slow amplitude breath.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = level * 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.start();
      lfo.start();
      droneOscs.push(osc, lfo);
    }

    return {
      id,
      def,
      group,
      filter,
      droneOscs,
      droneGain,
      padGain,
      arpGain,
      bellGain,
      pulseGain,
      nextNoteTime: ctx.currentTime + 0.1,
      step: 0,
      disposed: false,
    };
  }

  private fadeOutAndDispose(theme: ActiveTheme, seconds: number): void {
    const ctx = this.engine.context;
    if (!ctx || theme.disposed) return;
    theme.disposed = true;
    theme.group.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
    window.setTimeout(() => {
      for (const osc of theme.droneOscs) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      theme.group.disconnect();
      theme.filter.disconnect();
    }, seconds * 1000 + 400);
  }

  /** Lookahead scheduler: quantised pads/arps/bells written just-in-time. */
  private schedule(): void {
    const ctx = this.engine.context;
    const theme = this.current;
    if (!ctx || !theme || theme.disposed) return;

    const eighth = 60 / theme.def.tempo / 2;
    const horizon = ctx.currentTime + 0.35;

    while (theme.nextNoteTime < horizon) {
      const t = theme.nextNoteTime;
      const stepsPerBar = 8;
      const bar = Math.floor(theme.step / stepsPerBar);
      const stepInBar = theme.step % stepsPerBar;
      const chord = theme.def.progression[bar % theme.def.progression.length]!;

      // Pad chord at each bar start.
      if (stepInBar === 0) {
        for (const semi of chord) {
          this.pad(ctx, theme.padGain, freqOf(semi, 0), t, eighth * stepsPerBar * 1.05);
        }
        if (theme.def.pulseGain > 0) this.pulse(ctx, theme.pulseGain, t);
      }
      if (theme.def.pulseGain > 0 && stepInBar === 4) this.pulse(ctx, theme.pulseGain, t, 0.6);

      // Arp plucks on the eighth grid.
      const density = theme.def.arpDensity * (0.55 + this.intensity * 0.65);
      if (theme.def.arpGain > 0 && Math.random() < density) {
        const useChord = Math.random() < 0.6;
        const semi = useChord
          ? chord[Math.floor(Math.random() * chord.length)]!
          : PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]!;
        const octave = Math.random() < 0.3 ? 2 : 1;
        this.pluck(ctx, theme.arpGain, freqOf(semi, octave), t);
      }

      // A far bell, rarely, on off-beats.
      if (theme.def.bellGain > 0 && stepInBar % 2 === 1 && Math.random() < 0.06) {
        const semi = chord[Math.floor(Math.random() * chord.length)]!;
        this.bell(ctx, theme.bellGain, freqOf(semi, 2), t);
      }

      // Filter follows intensity for a slow swell.
      theme.filter.frequency.setTargetAtTime(
        theme.def.filterHz * (0.7 + this.intensity * 0.9),
        t,
        0.5,
      );

      theme.step++;
      theme.nextNoteTime += eighth;
    }
  }

  private pad(ctx: AudioContext, out: GainNode, freq: number, t: number, dur: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = Math.random() * 8 - 4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq * 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + dur * 0.4);
    g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.18);
    osc.connect(lp);
    lp.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur * 1.6);
  }

  private pluck(ctx: AudioContext, out: GainNode, freq: number, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const harm = ctx.createOscillator();
    harm.type = 'sine';
    harm.frequency.value = freq * 2;
    const g = ctx.createGain();
    const hg = ctx.createGain();
    hg.gain.value = 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g);
    harm.connect(hg);
    hg.connect(g);
    g.connect(out);
    osc.start(t);
    harm.start(t);
    osc.stop(t + 1);
    harm.stop(t + 1);
  }

  private bell(ctx: AudioContext, out: GainNode, freq: number, t: number): void {
    const partials = [1, 2.76, 5.4];
    for (let i = 0; i < partials.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * partials[i]!;
      const g = ctx.createGain();
      const level = 0.4 / (i + 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 - i * 0.5);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 2.6);
    }
  }

  private pulse(ctx: AudioContext, out: GainNode, t: number, level = 1): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(72, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.35);
  }
}
