import { describe, expect, it } from 'vitest';
import { evaluateAchievements } from '../src/game/achievements';
import { computeRunXp, levelFromXp, MAX_LEVEL, totalXpForLevel, xpForLevel } from '../src/game/progression';
import { createDefaultProfile } from '../src/core/save';
import type { RunSummary } from '../src/game/types';

const baseSummary: RunSummary = {
  mode: 'classic',
  score: 0,
  timeSeconds: 60,
  foodEaten: 0,
  maxCombo: 0,
  maxLength: 9,
  distance: 1000,
  bossesDefeated: 0,
  cause: 'wall',
  isBestScore: false,
};

describe('progression', () => {
  it('level curve is monotonic', () => {
    for (let l = 1; l < MAX_LEVEL - 1; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });

  it('levelFromXp inverts totalXpForLevel', () => {
    for (const level of [1, 2, 5, 10, 20, MAX_LEVEL]) {
      const info = levelFromXp(totalXpForLevel(level));
      expect(info.level).toBe(level);
    }
  });

  it('caps at MAX_LEVEL', () => {
    const info = levelFromXp(10_000_000);
    expect(info.level).toBe(MAX_LEVEL);
    expect(info.forNext).toBe(0);
    expect(info.progress).toBe(1);
  });

  it('progress within a level is in [0, 1)', () => {
    const info = levelFromXp(totalXpForLevel(3) + Math.floor(xpForLevel(3) / 2));
    expect(info.level).toBe(3);
    expect(info.progress).toBeGreaterThan(0.4);
    expect(info.progress).toBeLessThan(0.6);
  });

  it('run xp rewards score, combos, bosses and endurance', () => {
    const quiet = computeRunXp({ ...baseSummary, score: 100, foodEaten: 10 });
    expect(quiet.total).toBe(quiet.base);
    const loud = computeRunXp({
      ...baseSummary,
      mode: 'survival',
      score: 2000,
      foodEaten: 80,
      maxCombo: 12,
      bossesDefeated: 1,
      timeSeconds: 300,
    });
    expect(loud.comboBonus).toBeGreaterThan(0);
    expect(loud.bossBonus).toBe(80);
    expect(loud.survivalBonus).toBe(30);
    expect(loud.total).toBe(loud.base + loud.comboBonus + loud.bossBonus + loud.survivalBonus);
  });
});

describe('achievements', () => {
  it('grants score and combo deeds from a single run', () => {
    const profile = createDefaultProfile();
    profile.stats.totalFood = 10;
    const earned = evaluateAchievements(profile, {
      ...baseSummary,
      score: 2500,
      maxCombo: 12,
    });
    expect(earned).toContain('kindled');
    expect(earned).toContain('valeflame');
    expect(earned).toContain('chainlight');
    expect(earned).toContain('first_light');
  });

  it('never re-grants an earned deed', () => {
    const profile = createDefaultProfile();
    profile.achievements['kindled'] = 123;
    const earned = evaluateAchievements(profile, { ...baseSummary, score: 800 });
    expect(earned).not.toContain('kindled');
  });

  it('grants the six rites only when every mode has been played', () => {
    const profile = createDefaultProfile();
    profile.bestScores = { classic: 1, endless: 1, survival: 1, timeattack: 1, hardcore: 1 };
    expect(evaluateAchievements(profile, null)).not.toContain('six_rites');
    profile.bestScores.zen = 0;
    expect(evaluateAchievements(profile, null)).toContain('six_rites');
  });
});
