/**
 * GameController — the conductor.
 * Owns the renderer, audio, input, profile and the live session; translates
 * session events into UI state, audio, haptics and persistence.
 */
import { UPDATE_PRIORITY } from 'pixi.js';
import { profiler } from '../core/profiler';
import {
  loadProfile,
  saveProfile,
  type Profile,
} from '../core/save';
import {
  loadSettings,
  saveSettings,
  type Settings,
} from '../core/settings';
import { audioEngine } from '../audio/audioEngine';
import { MusicDirector, type ThemeId } from '../audio/music';
import { SfxPlayer } from '../audio/sfx';
import { ACHIEVEMENTS, evaluateAchievements } from '../game/achievements';
import { SKINS } from '../game/cosmetics';
import {
  applyRunToDaily,
  generateDailyChallenge,
  localDateKey,
  type DailyChallenge,
} from '../game/daily';
import { MODES } from '../game/modes';
import { computeRunXp, levelFromXp } from '../game/progression';
import { GameSession } from '../game/session';
import type { GameModeId, RunSummary } from '../game/types';
import { input } from '../input/input';
import { GameRenderer } from '../render/renderer';
import { EMPTY_HUD, getStore, type GameOverInfo, type Screen, type Toast } from './store';

const VEIL_MS = 420;

export class GameController {
  private renderer: GameRenderer | null = null;
  private session: GameSession | null = null;
  private music = new MusicDirector(audioEngine);
  private sfx = new SfxPlayer(audioEngine);
  private profile: Profile;
  private settings: Settings;
  private paused = false;
  private hudAccumulator = 0;
  private toastId = 1;
  private sessionUnsubs: (() => void)[] = [];
  private dailyRun: DailyChallenge | null = null;
  private zenAccumulator = 0;
  private pendingTheme: ThemeId = 'menu';

  constructor() {
    this.profile = loadProfile();
    this.settings = loadSettings();
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  async init(host: HTMLElement): Promise<void> {
    const store = getStore();
    this.renderer = await GameRenderer.create(host, this.settings);
    input.attach(host);
    input.pointerSteeringEnabled = this.settings.pointerSteering;

    input.events.on('any_gesture', () => {
      audioEngine.unlock();
      audioEngine.setVolumes(
        this.settings.masterVolume,
        this.settings.musicVolume,
        this.settings.sfxVolume,
      );
      this.music.play(this.pendingTheme);
    });
    input.events.on('pause', () => {
      const s = getStore().get();
      if (s.screen === 'game' && s.overlay !== 'gameover') this.togglePause();
    });

    // Simulation + HUD tick, ahead of the render pass.
    this.renderer.app.ticker.add(
      (ticker) => this.tick(Math.min(ticker.deltaMS / 1000, 1 / 20)),
      undefined,
      UPDATE_PRIORITY.HIGH,
    );

    window.addEventListener('resize', () => this.handleResize(host));
    new ResizeObserver(() => this.handleResize(host)).observe(host);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        const s = getStore().get();
        if (s.screen === 'game' && s.overlay === 'none') this.togglePause(true);
        audioEngine.suspend();
      } else {
        audioEngine.resume();
      }
    });

    const today = localDateKey();
    store.set({
      ready: true,
      profile: { ...this.profile },
      settings: { ...this.settings },
      dailyChallenge: generateDailyChallenge(today),
    });
    this.setTheme('menu');
  }

  private handleResize(host: HTMLElement): void {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.renderer?.resize(w, h);
  }

  private setTheme(theme: ThemeId): void {
    this.pendingTheme = theme;
    this.music.play(theme);
  }

  // -------------------------------------------------------------- navigation
  navigate(screen: Screen): void {
    const store = getStore();
    if (store.get().screen === screen) return;
    this.sfx.uiClick();
    store.set({ veil: true });
    window.setTimeout(() => {
      store.set({ screen, veil: false });
      if (screen === 'menu') {
        this.leaveGameWorld();
      }
    }, VEIL_MS);
  }

  playHover(): void {
    this.sfx.uiHover();
  }

  playBack(): void {
    this.sfx.uiBack();
  }

  // ------------------------------------------------------------------- runs
  startRun(modeId: GameModeId, asDaily = false): void {
    const store = getStore();
    const state = store.get();
    const challenge = asDaily ? state.dailyChallenge : null;
    this.dailyRun = challenge;
    this.sfx.uiClick();
    store.set({ veil: true });
    window.setTimeout(() => {
      this.beginSession(modeId, challenge);
      store.set({
        veil: false,
        screen: 'game',
        overlay: 'none',
        gameOver: null,
        currentMode: modeId,
        dailyRunActive: asDaily,
        hud: { ...EMPTY_HUD, best: this.profile.bestScores[modeId] ?? 0 },
      });
    }, VEIL_MS);
  }

  private beginSession(modeId: GameModeId, challenge: DailyChallenge | null): void {
    this.teardownSession();
    const mode = MODES[modeId];
    const session = new GameSession({
      mode,
      previousBest: this.profile.bestScores[modeId] ?? 0,
      speedScale: challenge?.modifier.speedScale ?? 1,
      comboWindowScale: challenge?.modifier.comboWindowScale ?? 1,
      foodCountScale: challenge?.modifier.foodCountScale ?? 1,
    });
    this.session = session;
    this.paused = false;
    this.zenAccumulator = 0;

    this.renderer?.attachSession(
      session,
      this.profile.selectedSkin,
      challenge?.modifier.forceNight ?? false,
    );
    input.steering = true;
    this.setTheme(modeId === 'zen' ? 'zen' : 'explore');
    this.bindSessionAudioAndState(session);
  }

  private bindSessionAudioAndState(session: GameSession): void {
    const store = getStore();
    const sub = session.events.on.bind(session.events);
    const track = (off: () => void) => this.sessionUnsubs.push(off);

    track(
      sub('countdown', ({ n }) => {
        store.set({ countdown: n });
        this.sfx.countdownTick(false);
        void n;
      }),
    );
    track(
      sub('started', () => {
        store.set({ countdown: null });
        this.sfx.countdownTick(true);
      }),
    );
    track(
      sub('food_eaten', ({ food, combo }) => {
        if (food.kind === 'bloom') this.sfx.bloomPickup(food.pos.x);
        else if (food.kind === 'sigil') this.sfx.sigil(food.pos.x);
        else this.sfx.eat(combo, food.pos.x);
        if (this.settings.hapticsEnabled && combo % 5 === 0 && combo > 0) {
          input.vibrate(30, 0.2, 0);
        }
      }),
    );
    track(sub('combo_milestone', () => this.sfx.comboMilestone()));
    track(sub('combo_break', () => this.sfx.comboBreak()));
    track(sub('bell_chime', ({ pos }) => this.sfx.bell(pos.x)));
    track(
      sub('hazard_spawned', ({ hazard }) => {
        this.sfx.hazardWarning(hazard.pos.x);
      }),
    );
    track(
      sub('hazard_activated', ({ hazard }) => {
        if (hazard.kind === 'rift') this.sfx.riftErupt(hazard.pos.x);
      }),
    );
    track(
      sub('boss_spawned', () => {
        this.sfx.bossRoar();
        this.setTheme('boss');
        store.set({ bossBanner: true });
        window.setTimeout(() => store.set({ bossBanner: false }), 3400);
        if (this.settings.hapticsEnabled) input.vibrate(300, 0.4, 0.6);
      }),
    );
    track(sub('boss_sigil_collected', ({ pos }) => this.sfx.sigil(pos.x)));
    track(
      sub('boss_defeated', () => {
        this.sfx.achievement();
        this.setTheme(this.session?.mode.id === 'zen' ? 'zen' : 'explore');
      }),
    );
    track(
      sub('boss_departed', () => {
        this.setTheme(this.session?.mode.id === 'zen' ? 'zen' : 'explore');
      }),
    );
    track(sub('time_warning', () => this.sfx.timeWarning()));
    track(
      sub('death', () => {
        this.sfx.death();
        if (this.settings.hapticsEnabled) input.vibrate(260, 0.8, 1);
        input.steering = false;
      }),
    );
    track(sub('run_ended', ({ summary }) => this.onRunEnded(summary)));
  }

  private onRunEnded(summary: RunSummary): void {
    const store = getStore();
    input.steering = false;
    this.setTheme('ended');

    // --- lifetime stats ---
    const stats = this.profile.stats;
    stats.gamesPlayed += 1;
    stats.totalScore += summary.score;
    stats.totalFood += summary.foodEaten;
    stats.totalDistance += Math.round(summary.distance);
    stats.totalPlaySeconds += Math.round(summary.timeSeconds);
    stats.bossesDefeated += summary.bossesDefeated;
    stats.highestCombo = Math.max(stats.highestCombo, summary.maxCombo);
    stats.longestSnake = Math.max(stats.longestSnake, summary.maxLength);
    if (summary.cause === 'hazard') stats.deathsToHazards += 1;
    if (summary.mode === 'zen') stats.zenSeconds += Math.round(summary.timeSeconds);

    const prevBest = this.profile.bestScores[summary.mode] ?? -1;
    this.profile.bestScores[summary.mode] = Math.max(prevBest, summary.score);
    if (summary.mode === 'survival') {
      this.profile.bestSurvivalSeconds = Math.max(
        this.profile.bestSurvivalSeconds,
        summary.timeSeconds,
      );
    }

    // --- XP ---
    const before = levelFromXp(this.profile.xp);
    const xp = computeRunXp(summary);
    this.profile.xp += xp.total;

    // --- daily challenge ---
    let dailyXp = 0;
    let dailyCompleted = false;
    const state = store.get();
    if (this.dailyRun && state.dailyChallenge && this.dailyRun.date === state.dailyChallenge.date) {
      const result = applyRunToDaily(this.profile, this.dailyRun, summary);
      if (result.completedNow) {
        dailyCompleted = true;
        dailyXp = this.dailyRun.xpReward;
        this.profile.xp += dailyXp;
        this.pushToast({
          kind: 'daily',
          title: 'Daily Rite Complete',
          body: `Streak: ${this.profile.daily.streak} day${this.profile.daily.streak === 1 ? '' : 's'}`,
        });
      }
    }

    // --- achievements ---
    const newAchievements = evaluateAchievements(this.profile, summary);
    for (const id of newAchievements) {
      this.profile.achievements[id] = Date.now();
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) {
        this.pushToast({ kind: 'achievement', title: 'Achievement', body: def.name });
      }
    }
    if (newAchievements.length > 0) this.sfx.achievement();

    // --- cosmetics unlocks ---
    const after = levelFromXp(this.profile.xp);
    const newSkins: string[] = [];
    for (const skin of SKINS) {
      if (this.profile.unlockedSkins.includes(skin.id)) continue;
      const u = skin.unlock;
      const unlocked =
        (u.type === 'level' && after.level >= u.level) ||
        (u.type === 'achievement' && Boolean(this.profile.achievements[u.achievementId])) ||
        (u.type === 'streak' && this.profile.daily.streak >= u.days);
      if (unlocked) {
        this.profile.unlockedSkins.push(skin.id);
        newSkins.push(skin.id);
        this.pushToast({ kind: 'unlock', title: 'New Skin', body: skin.name });
      }
    }

    saveProfile(this.profile);

    const info: GameOverInfo = {
      summary,
      xp,
      dailyXp,
      leveledUp: after.level > before.level,
      newLevel: after.level,
      newAchievements,
      newSkins,
      dailyCompleted,
    };
    window.setTimeout(() => {
      store.set({ overlay: 'gameover', gameOver: info, profile: { ...this.profile } });
    }, 500);
  }

  private pushToast(toast: Omit<Toast, 'id'>): void {
    const store = getStore();
    const t: Toast = { ...toast, id: this.toastId++ };
    store.set({ toasts: [...store.get().toasts, t] });
    window.setTimeout(() => {
      store.set({ toasts: store.get().toasts.filter((x) => x.id !== t.id) });
    }, 4200);
  }

  // ------------------------------------------------------------- pause/quit
  togglePause(forcePause = false): void {
    if (!this.session || this.session.state === 'ended' || this.session.state === 'dying') return;
    const store = getStore();
    this.paused = forcePause ? true : !this.paused;
    input.steering = !this.paused;
    store.set({ overlay: this.paused ? 'pause' : 'none' });
    if (this.paused) this.sfx.uiBack();
    else this.sfx.uiClick();
    this.music.intensity = this.paused ? 0.15 : 0.5;
  }

  restartRun(): void {
    const store = getStore();
    const mode = store.get().currentMode;
    if (!mode) return;
    this.startRun(mode, store.get().dailyRunActive);
  }

  quitToMenu(): void {
    // Zen leaves gracefully with a summary; other modes just exit.
    if (this.session && this.session.mode.id === 'zen' && this.session.state === 'running') {
      this.session.endVoluntarily();
      return;
    }
    this.navigate('menu');
  }

  private leaveGameWorld(): void {
    this.teardownSession();
    this.renderer?.enterAmbient();
    this.setTheme('menu');
    const store = getStore();
    store.set({ overlay: 'none', gameOver: null, countdown: null, dailyRunActive: false });
  }

  private teardownSession(): void {
    for (const off of this.sessionUnsubs) off();
    this.sessionUnsubs = [];
    this.session = null;
    this.paused = false;
    input.steering = false;
  }

  // ------------------------------------------------------------------ tick
  private tick(dt: number): void {
    const store = getStore();
    const state = store.get();

    input.update(window.innerWidth, window.innerHeight);

    const session = this.session;
    if (session && !this.paused && state.overlay !== 'gameover') {
      if (input.targetHeading !== null) session.setTargetHeading(input.targetHeading);
      session.update(dt);

      // Zen playtime achievement accrual (saved periodically).
      if (session.mode.id === 'zen' && session.state === 'running') {
        this.zenAccumulator += dt;
        if (this.zenAccumulator > 30) {
          this.profile.stats.zenSeconds += Math.round(this.zenAccumulator);
          this.zenAccumulator = 0;
          saveProfile(this.profile);
        }
      }

      // Music intensity follows the action.
      const bossActive = session.boss !== null && session.boss.phase === 'active';
      this.music.intensity = Math.min(
        1,
        0.3 + session.combo.combo * 0.04 + session.difficulty * 0.3 + (bossActive ? 0.3 : 0),
      );

      // Positional-audio listener follows the camera.
      if (this.renderer) {
        audioEngine.listenerX = this.renderer.camera.pos.x;
        audioEngine.listenerRange = Math.max(500, window.innerWidth / this.renderer.camera.zoom / 2);
      }
    }

    // HUD sync at ~15 Hz — React shouldn't re-render at frame rate.
    this.hudAccumulator += dt;
    if (this.hudAccumulator >= 1 / 15) {
      this.hudAccumulator = 0;
      if (session && state.screen === 'game') {
        const boss = session.boss;
        store.set({
          hud: {
            score: session.score,
            best: Math.max(state.hud.best, session.score),
            combo: session.combo.combo,
            comboMeter: session.combo.meter,
            multiplier: session.combo.multiplier,
            timeElapsed: session.time,
            timeRemaining: session.timeRemaining,
            length: session.snake.length,
            bossActive: boss !== null && boss.phase !== 'banished',
            bossSigils: boss?.sigilsCollected ?? 0,
            bossTimeLeft: boss?.timeLeft ?? 0,
          },
          fps: profiler.snapshot.fps,
        });
      } else if (state.settings.showFps && state.fps !== profiler.snapshot.fps) {
        store.set({ fps: profiler.snapshot.fps });
      }
    }
  }

  // -------------------------------------------------------------- settings
  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    getStore().set({ settings: { ...this.settings } });
    this.renderer?.applySettings(this.settings);
    audioEngine.setVolumes(
      this.settings.masterVolume,
      this.settings.musicVolume,
      this.settings.sfxVolume,
    );
    input.pointerSteeringEnabled = this.settings.pointerSteering;
    document.documentElement.style.setProperty('--ui-scale', String(this.settings.uiScale));
  }

  selectSkin(skinId: string): void {
    if (!this.profile.unlockedSkins.includes(skinId)) return;
    this.profile.selectedSkin = skinId;
    saveProfile(this.profile);
    getStore().set({ profile: { ...this.profile } });
    this.renderer?.applySkin(skinId);
    this.sfx.uiClick();
  }

  markIntroSeen(): void {
    this.profile.seenIntro = true;
    saveProfile(this.profile);
    getStore().set({ profile: { ...this.profile } });
  }
}

export const controller = new GameController();
