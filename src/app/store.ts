/** Minimal observable store bridging the game engine and the React UI. */
import { useSyncExternalStore } from 'react';
import type { Profile } from '../core/save';
import type { Settings } from '../core/settings';
import type { DailyChallenge } from '../game/daily';
import type { XpAward } from '../game/progression';
import type { GameModeId, RunSummary } from '../game/types';

export type Screen =
  | 'menu'
  | 'modes'
  | 'settings'
  | 'cosmetics'
  | 'achievements'
  | 'daily'
  | 'game';

export type Overlay = 'none' | 'pause' | 'gameover';

export interface HudState {
  score: number;
  best: number;
  combo: number;
  comboMeter: number;
  multiplier: number;
  timeElapsed: number;
  timeRemaining: number | null;
  length: number;
  bossActive: boolean;
  bossSigils: number;
  bossTimeLeft: number;
}

export interface Toast {
  id: number;
  kind: 'achievement' | 'unlock' | 'daily';
  title: string;
  body: string;
}

export interface GameOverInfo {
  summary: RunSummary;
  xp: XpAward;
  dailyXp: number;
  leveledUp: boolean;
  newLevel: number;
  newAchievements: string[];
  newSkins: string[];
  dailyCompleted: boolean;
}

export interface AppState {
  ready: boolean;
  fatalError: string | null;
  screen: Screen;
  veil: boolean;
  overlay: Overlay;
  hud: HudState;
  countdown: number | null;
  bossBanner: boolean;
  profile: Profile;
  settings: Settings;
  toasts: Toast[];
  gameOver: GameOverInfo | null;
  currentMode: GameModeId | null;
  dailyChallenge: DailyChallenge | null;
  dailyRunActive: boolean;
  fps: number;
}

type Listener = () => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const EMPTY_HUD: HudState = {
  score: 0,
  best: 0,
  combo: 0,
  comboMeter: 0,
  multiplier: 1,
  timeElapsed: 0,
  timeRemaining: null,
  length: 0,
  bossActive: false,
  bossSigils: 0,
  bossTimeLeft: 0,
};

let store: Store | null = null;

export function initStore(initial: AppState): Store {
  store = new Store(initial);
  return store;
}

export function getStore(): Store {
  if (!store) throw new Error('Store accessed before initialisation');
  return store;
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  const s = getStore();
  return useSyncExternalStore(s.subscribe, () => selector(s.get()));
}
