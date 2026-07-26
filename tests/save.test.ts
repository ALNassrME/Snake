import { describe, expect, it } from 'vitest';
import { createDefaultProfile, migrateProfile, SAVE_VERSION } from '../src/core/save';

describe('save migration', () => {
  it('creates a sane default profile', () => {
    const p = createDefaultProfile(1000);
    expect(p.version).toBe(SAVE_VERSION);
    expect(p.unlockedSkins).toContain('emberwyrm');
    expect(p.selectedSkin).toBe('emberwyrm');
    expect(p.xp).toBe(0);
  });

  it('recovers from garbage input', () => {
    for (const garbage of [null, undefined, 42, 'hello', [], { random: true }]) {
      const p = migrateProfile(garbage);
      expect(p.version).toBe(SAVE_VERSION);
      expect(p.unlockedSkins).toContain('emberwyrm');
    }
  });

  it('preserves valid fields and fills missing ones', () => {
    const p = migrateProfile({
      xp: 5000,
      selectedSkin: 'gilded',
      unlockedSkins: ['emberwyrm', 'gilded'],
      bestScores: { classic: 900 },
      stats: { totalFood: 123 },
    });
    expect(p.xp).toBe(5000);
    expect(p.selectedSkin).toBe('gilded');
    expect(p.bestScores.classic).toBe(900);
    expect(p.stats.totalFood).toBe(123);
    expect(p.stats.gamesPlayed).toBe(0); // filled from defaults
    expect(p.daily.streak).toBe(0);
  });

  it('resets a selected skin that is not unlocked', () => {
    const p = migrateProfile({ selectedSkin: 'aurora', unlockedSkins: ['emberwyrm'] });
    expect(p.selectedSkin).toBe('emberwyrm');
  });

  it('always re-adds the default skin', () => {
    const p = migrateProfile({ unlockedSkins: ['gilded'] });
    expect(p.unlockedSkins).toContain('emberwyrm');
    expect(p.unlockedSkins).toContain('gilded');
  });

  it('clamps negative xp', () => {
    const p = migrateProfile({ xp: -500 });
    expect(p.xp).toBe(0);
  });
});
