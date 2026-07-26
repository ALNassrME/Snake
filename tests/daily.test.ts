import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../src/core/save';
import {
  applyRunToDaily,
  generateDailyChallenge,
  previousDateKey,
} from '../src/game/daily';
import type { RunSummary } from '../src/game/types';

function summaryFor(challenge: ReturnType<typeof generateDailyChallenge>, big: boolean): RunSummary {
  return {
    mode: challenge.mode,
    score: big ? 999999 : 1,
    timeSeconds: big ? 99999 : 1,
    foodEaten: big ? 9999 : 0,
    maxCombo: big ? 999 : 0,
    maxLength: 10,
    distance: 100,
    bossesDefeated: 0,
    cause: 'wall',
    isBestScore: false,
  };
}

describe('daily challenges', () => {
  it('is deterministic per date', () => {
    const a = generateDailyChallenge('2026-07-26');
    const b = generateDailyChallenge('2026-07-26');
    expect(a).toEqual(b);
  });

  it('varies across dates', () => {
    const days = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24'];
    const kinds = new Set(days.map((d) => generateDailyChallenge(d).goal.kind + generateDailyChallenge(d).mode));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('previousDateKey handles month boundaries', () => {
    expect(previousDateKey('2026-08-01')).toBe('2026-07-31');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });

  it('completes a challenge and starts a streak', () => {
    const profile = createDefaultProfile();
    const challenge = generateDailyChallenge('2026-07-26');
    const result = applyRunToDaily(profile, challenge, summaryFor(challenge, true));
    expect(result.completedNow).toBe(true);
    expect(profile.daily.completed).toBe(true);
    expect(profile.daily.streak).toBe(1);
    expect(profile.daily.lastCompletedDate).toBe('2026-07-26');
  });

  it('continues a streak from yesterday and resets after a gap', () => {
    const profile = createDefaultProfile();
    const day1 = generateDailyChallenge('2026-07-26');
    applyRunToDaily(profile, day1, summaryFor(day1, true));

    const day2 = generateDailyChallenge('2026-07-27');
    applyRunToDaily(profile, day2, summaryFor(day2, true));
    expect(profile.daily.streak).toBe(2);

    // Skip a day: streak restarts at 1.
    const day4 = generateDailyChallenge('2026-07-29');
    applyRunToDaily(profile, day4, summaryFor(day4, true));
    expect(profile.daily.streak).toBe(1);
    expect(profile.daily.bestStreak).toBe(2);
  });

  it('accumulates partial progress without completing', () => {
    const profile = createDefaultProfile();
    const challenge = generateDailyChallenge('2026-07-26');
    const result = applyRunToDaily(profile, challenge, summaryFor(challenge, false));
    expect(result.completedNow).toBe(false);
    expect(profile.daily.completed).toBe(false);
    expect(profile.daily.streak).toBe(0);
  });

  it('ignores runs in the wrong mode', () => {
    const profile = createDefaultProfile();
    const challenge = generateDailyChallenge('2026-07-26');
    const wrongMode: RunSummary = { ...summaryFor(challenge, true), mode: 'zen' };
    const result = applyRunToDaily(profile, challenge, wrongMode);
    expect(result.completedNow).toBe(false);
    expect(profile.daily.progress).toBe(0);
  });

  it('does not double-complete the same day', () => {
    const profile = createDefaultProfile();
    const challenge = generateDailyChallenge('2026-07-26');
    applyRunToDaily(profile, challenge, summaryFor(challenge, true));
    const again = applyRunToDaily(profile, challenge, summaryFor(challenge, true));
    expect(again.completedNow).toBe(false);
    expect(profile.daily.streak).toBe(1);
  });
});
