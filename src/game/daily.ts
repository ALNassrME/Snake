/** Daily challenges — deterministically generated from the calendar date. */
import { hashString, Rng } from '../core/rng';
import type { Profile } from '../core/save';
import type { GameModeId, RunSummary } from './types';

export type DailyGoalKind = 'score' | 'food' | 'combo' | 'survive';

export interface DailyModifier {
  id: 'swift' | 'famine' | 'brittle' | 'longnight';
  name: string;
  description: string;
  speedScale?: number;
  foodCountScale?: number;
  comboWindowScale?: number;
  forceNight?: boolean;
}

export interface DailyChallenge {
  date: string; // YYYY-MM-DD (local)
  mode: GameModeId;
  goal: { kind: DailyGoalKind; target: number; label: string };
  modifier: DailyModifier;
  xpReward: number;
}

const MODIFIERS: readonly DailyModifier[] = [
  {
    id: 'swift',
    name: 'Swiftblood',
    description: 'The wyrm moves 20% faster.',
    speedScale: 1.2,
  },
  {
    id: 'famine',
    name: 'Famine',
    description: 'Half as much food grows in the Vale.',
    foodCountScale: 0.5,
  },
  {
    id: 'brittle',
    name: 'Brittle Chain',
    description: 'Combos decay 40% faster.',
    comboWindowScale: 0.6,
  },
  {
    id: 'longnight',
    name: 'The Long Night',
    description: 'The sun never rises today.',
    forceNight: true,
  },
];

const DAILY_MODES: readonly GameModeId[] = ['classic', 'endless', 'survival', 'timeattack', 'hardcore'];

export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateDailyChallenge(dateKey: string): DailyChallenge {
  const rng = new Rng(hashString(`umbravale-daily-${dateKey}`));
  const mode = rng.pick(DAILY_MODES);
  const modifier = rng.pick(MODIFIERS);

  let goal: DailyChallenge['goal'];
  const roll = rng.next();
  if (mode === 'survival' && roll < 0.4) {
    const target = rng.int(3, 5) * 60;
    goal = { kind: 'survive', target, label: `Survive ${target / 60} minutes` };
  } else if (roll < 0.45) {
    const target = rng.int(25, 45);
    goal = { kind: 'food', target, label: `Devour ${target} embers in one run` };
  } else if (roll < 0.65) {
    const target = rng.int(8, 15);
    goal = { kind: 'combo', target, label: `Weave a combo of ${target}` };
  } else {
    const base = mode === 'hardcore' ? 700 : mode === 'timeattack' ? 900 : 600;
    const target = Math.round((base * rng.range(0.9, 1.6)) / 50) * 50;
    goal = { kind: 'score', target, label: `Score ${target.toLocaleString('en-US')}` };
  }

  return { date: dateKey, mode, goal, modifier, xpReward: 180 };
}

/** Progress a run summary contributes toward the day's goal. */
export function dailyProgressFromRun(challenge: DailyChallenge, summary: RunSummary): number {
  if (summary.mode !== challenge.mode) return 0;
  switch (challenge.goal.kind) {
    case 'score':
      return summary.score;
    case 'food':
      return summary.foodEaten;
    case 'combo':
      return summary.maxCombo;
    case 'survive':
      return Math.floor(summary.timeSeconds);
  }
}

export interface DailyUpdateResult {
  progress: number;
  completedNow: boolean;
  streak: number;
}

/**
 * Fold a finished run into the profile's daily state.
 * Handles day rollover, streak continuation and streak loss.
 */
export function applyRunToDaily(
  profile: Profile,
  challenge: DailyChallenge,
  summary: RunSummary,
  today = challenge.date,
): DailyUpdateResult {
  const daily = profile.daily;

  if (daily.activeDate !== today) {
    daily.activeDate = today;
    daily.progress = 0;
    daily.completed = false;
  }

  if (daily.completed) {
    return { progress: daily.progress, completedNow: false, streak: daily.streak };
  }

  const runProgress = dailyProgressFromRun(challenge, summary);
  daily.progress = Math.max(daily.progress, runProgress);

  if (daily.progress >= challenge.goal.target) {
    daily.completed = true;
    const yesterday = previousDateKey(today);
    daily.streak = daily.lastCompletedDate === yesterday ? daily.streak + 1 : 1;
    daily.bestStreak = Math.max(daily.bestStreak, daily.streak);
    daily.lastCompletedDate = today;
    return { progress: daily.progress, completedNow: true, streak: daily.streak };
  }

  return { progress: daily.progress, completedNow: false, streak: daily.streak };
}

export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

/** A streak survives only if yesterday (or today) was completed. */
export function effectiveStreak(profile: Profile, today: string): number {
  const last = profile.daily.lastCompletedDate;
  if (!last) return 0;
  if (last === today || last === previousDateKey(today)) return profile.daily.streak;
  return 0;
}
