/** Achievements — evaluated against run summaries and lifetime stats. */
import type { LifetimeStats, Profile } from '../core/save';
import type { RunSummary } from './types';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Original glyph drawn by the UI (SVG path id, see AchievementGlyph). */
  glyph: 'spark' | 'chain' | 'crown' | 'warden' | 'depth' | 'bloom' | 'moon' | 'storm';
  secret?: boolean;
  check: (ctx: { summary: RunSummary | null; stats: LifetimeStats; profile: Profile }) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first_light',
    name: 'First Light',
    description: 'Devour your first ember.',
    glyph: 'spark',
    check: ({ stats }) => stats.totalFood >= 1,
  },
  {
    id: 'kindled',
    name: 'Kindled',
    description: 'Reach a score of 500 in any rite.',
    glyph: 'spark',
    check: ({ summary }) => (summary?.score ?? 0) >= 500,
  },
  {
    id: 'valeflame',
    name: 'Valeflame',
    description: 'Reach a score of 2,000 in any rite.',
    glyph: 'crown',
    check: ({ summary }) => (summary?.score ?? 0) >= 2000,
  },
  {
    id: 'chainlight',
    name: 'Chainlight',
    description: 'Weave a combo of 10.',
    glyph: 'chain',
    check: ({ summary }) => (summary?.maxCombo ?? 0) >= 10,
  },
  {
    id: 'unbroken_hunger',
    name: 'Unbroken Hunger',
    description: 'Weave a combo of 25.',
    glyph: 'chain',
    check: ({ summary }) => (summary?.maxCombo ?? 0) >= 25,
  },
  {
    id: 'great_length',
    name: 'The Great Length',
    description: 'Grow to 60 segments in a single run.',
    glyph: 'depth',
    check: ({ summary }) => (summary?.maxLength ?? 0) >= 60,
  },
  {
    id: 'long_watch',
    name: 'The Long Watch',
    description: 'Survive five minutes in Survival.',
    glyph: 'moon',
    check: ({ summary }) => summary?.mode === 'survival' && summary.timeSeconds >= 300,
  },
  {
    id: 'warden_banisher',
    name: 'Warden Banisher',
    description: 'Banish the Warden of the Vale.',
    glyph: 'warden',
    check: ({ summary }) => (summary?.bossesDefeated ?? 0) >= 1,
  },
  {
    id: 'twice_banished',
    name: 'Twice Banished',
    description: 'Banish two Wardens in a single run.',
    glyph: 'warden',
    secret: true,
    check: ({ summary }) => (summary?.bossesDefeated ?? 0) >= 2,
  },
  {
    id: 'borrowed_light',
    name: 'Borrowed Light',
    description: 'Score 1,500 in Time Attack.',
    glyph: 'storm',
    check: ({ summary }) => summary?.mode === 'timeattack' && summary.score >= 1500,
  },
  {
    id: 'iron_scale',
    name: 'Iron Scale',
    description: 'Score 800 in Hardcore.',
    glyph: 'storm',
    check: ({ summary }) => summary?.mode === 'hardcore' && summary.score >= 800,
  },
  {
    id: 'gardener',
    name: 'Gardener of the Gloam',
    description: 'Devour 500 embers across all runs.',
    glyph: 'bloom',
    check: ({ stats }) => stats.totalFood >= 500,
  },
  {
    id: 'pilgrim',
    name: 'Pilgrim of the Vale',
    description: 'Travel 50,000 paces in total.',
    glyph: 'depth',
    check: ({ stats }) => stats.totalDistance >= 50000,
  },
  {
    id: 'stillness',
    name: 'Stillness',
    description: 'Drift through Zen for ten minutes in total.',
    glyph: 'moon',
    check: ({ stats }) => stats.zenSeconds >= 600,
  },
  {
    id: 'six_rites',
    name: 'The Six Rites',
    description: 'Complete a run in every mode.',
    glyph: 'crown',
    check: ({ profile }) => {
      const modes = ['classic', 'endless', 'survival', 'timeattack', 'hardcore', 'zen'] as const;
      return modes.every((m) => (profile.bestScores[m] ?? -1) >= 0);
    },
  },
  {
    id: 'dawnkeeper',
    name: 'Dawnkeeper',
    description: 'Keep a daily-challenge streak of 7.',
    glyph: 'bloom',
    check: ({ profile }) => profile.daily.streak >= 7,
  },
];

/** Returns ids of achievements newly earned (not yet on the profile). */
export function evaluateAchievements(
  profile: Profile,
  summary: RunSummary | null,
): string[] {
  const earned: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (profile.achievements[def.id]) continue;
    try {
      if (def.check({ summary, stats: profile.stats, profile })) earned.push(def.id);
    } catch (err) {
      console.error(`[achievements] check failed for ${def.id}`, err);
    }
  }
  return earned;
}
