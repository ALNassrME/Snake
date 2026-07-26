/**
 * WebAudio foundation: context lifecycle (autoplay-policy safe), bus graph,
 * generated impulse-response reverb and stereo positioning helpers.
 *
 *   master ─────────────► destination
 *     ├── musicBus (dry)
 *     ├── sfxBus (dry)
 *     └── reverb (convolver) ◄── sends from music & sfx
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicReverbSend: GainNode | null = null;
  private sfxReverbSend: GainNode | null = null;

  private masterVolume = 0.8;
  private musicVolume = 0.7;
  private sfxVolume = 0.85;

  /** Camera x + half view width, fed by the game loop for positional audio. */
  listenerX = 0;
  listenerRange = 900;

  /** Lazily create the context — must be called from a user gesture. */
  unlock(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(ctx.destination);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);

      const convolver = ctx.createConvolver();
      convolver.buffer = this.makeImpulse(ctx, 2.6, 2.4);
      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.85;
      convolver.connect(reverbGain);
      reverbGain.connect(this.master);

      this.musicReverbSend = ctx.createGain();
      this.musicReverbSend.gain.value = 0.4;
      this.musicReverbSend.connect(convolver);

      this.sfxReverbSend = ctx.createGain();
      this.sfxReverbSend.gain.value = 0.22;
      this.sfxReverbSend.connect(convolver);
      return ctx;
    } catch (err) {
      console.warn('[audio] context unavailable', err);
      return null;
    }
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get music(): { bus: GainNode; send: GainNode } | null {
    return this.musicBus && this.musicReverbSend
      ? { bus: this.musicBus, send: this.musicReverbSend }
      : null;
  }

  get sfx(): { bus: GainNode; send: GainNode } | null {
    return this.sfxBus && this.sfxReverbSend ? { bus: this.sfxBus, send: this.sfxReverbSend } : null;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.masterVolume = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    const t = this.ctx?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(master, t, 0.08);
    this.musicBus?.gain.setTargetAtTime(music, t, 0.08);
    this.sfxBus?.gain.setTargetAtTime(sfx, t, 0.08);
  }

  /** Stereo pan (-1..1) and distance gain (0..1) for a world x position. */
  positional(x: number): { pan: number; gain: number } {
    const dx = x - this.listenerX;
    const pan = Math.max(-1, Math.min(1, dx / this.listenerRange));
    const gain = Math.max(0.25, 1 - Math.abs(dx) / (this.listenerRange * 2.4));
    return { pan, gain };
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }
}

export const audioEngine = new AudioEngine();
