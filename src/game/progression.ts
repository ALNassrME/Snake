/** XP curve, level math and end-of-run XP awards. */
import type { RunSummary } from './types';

export const MAX_LEVEL = 30;

/** XP required to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return Math.round(120 * Math.pow(level, 1.35));
}

/** Total XP required to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpForLevel(l);
  return sum;
}

export interface LevelInfo {
  level: number;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** XP needed to complete the current level (0 at max). */
  forNext: number;
  /** 0..1 progress within the current level. */
  progress: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (level < MAX_LEVEL) {
    const need = xpForLevel(level);
    if (remaining < need) {
      return { level, intoLevel: remaining, forNext: need, progress: remaining / need };
    }
    remaining -= need;
    level++;
  }
  return { level: MAX_LEVEL, intoLevel: 0, forNext: 0, progress: 1 };
}

export interface XpAward {
  base: number;
  comboBonus: number;
  bossBonus: number;
  survivalBonus: number;
  total: number;
}

export function computeRunXp(summary: RunSummary): XpAward {
  const base = Math.round(summary.score * 0.12 + summary.foodEaten * 2);
  const comboBonus = summary.maxCombo >= 5 ? Math.round(summary.maxCombo * 4) : 0;
  const bossBonus = summary.bossesDefeated * 80;
  const survivalBonus =
    summary.mode === 'survival' || summary.mode === 'endless'
      ? Math.round(summary.timeSeconds / 10)
      : 0;
  const total = base + comboBonus + bossBonus + survivalBonus;
  return { base, comboBonus, bossBonus, survivalBonus, total };
}
