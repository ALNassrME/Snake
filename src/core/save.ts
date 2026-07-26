/** Versioned player profile persisted to localStorage, with forward migration. */

import type { GameModeId } from '../game/types';

export interface LifetimeStats {
  gamesPlayed: number;
  totalScore: number;
  totalFood: number;
  totalDistance: number; // world units travelled
  totalPlaySeconds: number;
  bossesDefeated: number;
  highestCombo: number;
  longestSnake: number;
  deathsToHazards: number;
  zenSeconds: number;
}

export interface DailyState {
  /** ISO date (YYYY-MM-DD) of the last day a challenge was completed. */
  lastCompletedDate: string | null;
  /** ISO date the current progress belongs to. */
  activeDate: string | null;
  progress: number;
  completed: boolean;
  streak: number;
  bestStreak: number;
}

export interface Profile {
  version: number;
  createdAt: number;
  xp: number;
  bestScores: Partial<Record<GameModeId, number>>;
  bestSurvivalSeconds: number;
  unlockedSkins: string[];
  selectedSkin: string;
  /** Achievement id -> unlock timestamp (ms). */
  achievements: Record<string, number>;
  daily: DailyState;
  stats: LifetimeStats;
  seenIntro: boolean;
}

export const SAVE_VERSION = 1;
const SAVE_KEY = 'umbravale.profile.v1';

export function createDefaultProfile(now = Date.now()): Profile {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    xp: 0,
    bestScores: {},
    bestSurvivalSeconds: 0,
    unlockedSkins: ['emberwyrm'],
    selectedSkin: 'emberwyrm',
    achievements: {},
    daily: {
      lastCompletedDate: null,
      activeDate: null,
      progress: 0,
      completed: false,
      streak: 0,
      bestStreak: 0,
    },
    stats: {
      gamesPlayed: 0,
      totalScore: 0,
      totalFood: 0,
      totalDistance: 0,
      totalPlaySeconds: 0,
      bossesDefeated: 0,
      highestCombo: 0,
      longestSnake: 0,
      deathsToHazards: 0,
      zenSeconds: 0,
    },
    seenIntro: false,
  };
}

/**
 * Migrate any older/partial persisted shape up to the current version.
 * Unknown fields are dropped; missing fields are filled from defaults.
 */
export function migrateProfile(raw: unknown, now = Date.now()): Profile {
  const defaults = createDefaultProfile(now);
  if (typeof raw !== 'object' || raw === null) return defaults;
  const src = raw as Record<string, unknown>;

  const profile: Profile = {
    ...defaults,
    ...pickNumbers(src, ['createdAt', 'xp', 'bestSurvivalSeconds']),
    version: SAVE_VERSION,
    bestScores: isRecord(src.bestScores) ? (src.bestScores as Profile['bestScores']) : {},
    unlockedSkins: isStringArray(src.unlockedSkins) ? src.unlockedSkins : defaults.unlockedSkins,
    selectedSkin: typeof src.selectedSkin === 'string' ? src.selectedSkin : defaults.selectedSkin,
    achievements: isRecord(src.achievements)
      ? (src.achievements as Record<string, number>)
      : {},
    daily: isRecord(src.daily) ? { ...defaults.daily, ...(src.daily as object) } : defaults.daily,
    stats: isRecord(src.stats) ? { ...defaults.stats, ...(src.stats as object) } : defaults.stats,
    seenIntro: src.seenIntro === true,
  };

  if (!profile.unlockedSkins.includes('emberwyrm')) profile.unlockedSkins.push('emberwyrm');
  if (!profile.unlockedSkins.includes(profile.selectedSkin)) profile.selectedSkin = 'emberwyrm';
  profile.xp = Math.max(0, profile.xp);
  return profile;
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createDefaultProfile();
    return migrateProfile(JSON.parse(raw));
  } catch (err) {
    console.warn('[save] corrupted profile, starting fresh', err);
    return createDefaultProfile();
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn('[save] failed to persist profile', err);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((e) => typeof e === 'string');
}

function pickNumbers<K extends string>(
  src: Record<string, unknown>,
  keys: readonly K[],
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}
