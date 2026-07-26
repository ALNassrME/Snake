/** Unlockable wyrm skins — palettes consumed by the snake renderer. */

export interface SkinColors {
  head: number;
  bodyA: number;
  bodyB: number;
  belly: number;
  glow: number;
  eye: number;
  particle: number;
}

export type SkinUnlock =
  | { type: 'default' }
  | { type: 'level'; level: number }
  | { type: 'achievement'; achievementId: string; label: string }
  | { type: 'streak'; days: number };

export interface SkinDef {
  id: string;
  name: string;
  lore: string;
  colors: SkinColors;
  unlock: SkinUnlock;
}

export const SKINS: readonly SkinDef[] = [
  {
    id: 'emberwyrm',
    name: 'Palegloam',
    lore: 'A porcelain mask over a cloak of night — the Vale wears its wyrm.',
    colors: {
      head: 0xf2f6f8,
      bodyA: 0x2c3d51,
      bodyB: 0x1a2534,
      belly: 0x41556c,
      glow: 0x9fdcec,
      eye: 0x0c1822,
      particle: 0x9fd0e0,
    },
    unlock: { type: 'default' },
  },
  {
    id: 'verdant',
    name: 'Mossheart',
    lore: 'Grown over with living garden — the Vale claims its own.',
    colors: {
      head: 0xd8f0b0,
      bodyA: 0x9ccf6a,
      bodyB: 0x3f7038,
      belly: 0xe8f5cc,
      glow: 0x8fdc6a,
      eye: 0x233514,
      particle: 0xc0e896,
    },
    unlock: { type: 'level', level: 3 },
  },
  {
    id: 'gilded',
    name: 'Gildedrake',
    lore: 'Scaled in temple-gold. It remembers being worshipped.',
    colors: {
      head: 0xfff2cc,
      bodyA: 0xf0c060,
      bodyB: 0x9c6a20,
      belly: 0xfae8bc,
      glow: 0xf5cc70,
      eye: 0x3d2808,
      particle: 0xfad98a,
    },
    unlock: { type: 'level', level: 6 },
  },
  {
    id: 'abyssal',
    name: 'Duskmaw',
    lore: 'A silhouette that swallowed its own shadow.',
    colors: {
      head: 0xcabcf5,
      bodyA: 0x7a5fd0,
      bodyB: 0x2c1f5e,
      belly: 0xb4a5ea,
      glow: 0x9a7af5,
      eye: 0xe8e0ff,
      particle: 0xb49af5,
    },
    unlock: { type: 'level', level: 10 },
  },
  {
    id: 'bloodmoon',
    name: 'Cinderveil',
    lore: 'Beneath the red moon, even embers dream of wildfire.',
    colors: {
      head: 0xffd6c8,
      bodyA: 0xf08560,
      bodyB: 0x8a2c24,
      belly: 0xfac0aa,
      glow: 0xf56a4a,
      eye: 0x30100a,
      particle: 0xfa9a78,
    },
    unlock: { type: 'level', level: 14 },
  },
  {
    id: 'aurora',
    name: 'Skyrend',
    lore: 'Torn from the northern lights by the Warden itself — and it escaped.',
    colors: {
      head: 0xe0fbff,
      bodyA: 0x7ae0f0,
      bodyB: 0xc86ad8,
      belly: 0xd0f5fa,
      glow: 0x8ae8ea,
      eye: 0x142c3a,
      particle: 0xaaf0f5,
    },
    unlock: { type: 'achievement', achievementId: 'warden_banisher', label: 'Banish the Warden' },
  },
  {
    id: 'spectral',
    name: 'Hushbone',
    lore: 'What is left when a wyrm forgets to stop moving.',
    colors: {
      head: 0xffffff,
      bodyA: 0xdce8ea,
      bodyB: 0x7a92a0,
      belly: 0xf0f6f8,
      glow: 0xcfe8f0,
      eye: 0x9ab8c8,
      particle: 0xe8f4f8,
    },
    unlock: { type: 'streak', days: 3 },
  },
];

export function getSkin(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function unlockDescription(skin: SkinDef): string {
  switch (skin.unlock.type) {
    case 'default':
      return 'Yours from the beginning.';
    case 'level':
      return `Reach level ${skin.unlock.level}.`;
    case 'achievement':
      return skin.unlock.label;
    case 'streak':
      return `Complete daily challenges ${skin.unlock.days} days in a row.`;
  }
}
