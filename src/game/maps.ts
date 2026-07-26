/**
 * Handcrafted arenas of the Vale.
 * Obstacle layouts are authored by hand; decorative detail on top of them is
 * procedurally scattered by the renderer using each map's decorSeed.
 */
import { Rng } from '../core/rng';
import type { Obstacle, WorldMap } from './types';

function ringOfStones(
  cx: number,
  cy: number,
  ringRadius: number,
  count: number,
  stoneRadius: number,
  kind: Obstacle['kind'],
  seed: number,
  gapEvery = 0,
): Obstacle[] {
  const rng = new Rng(seed);
  const out: Obstacle[] = [];
  for (let i = 0; i < count; i++) {
    if (gapEvery > 0 && i % gapEvery === 0) continue;
    const a = (i / count) * Math.PI * 2 + rng.range(-0.06, 0.06);
    out.push({
      x: cx + Math.cos(a) * ringRadius * rng.range(0.96, 1.04),
      y: cy + Math.sin(a) * ringRadius * rng.range(0.96, 1.04),
      r: stoneRadius * rng.range(0.8, 1.2),
      kind,
    });
  }
  return out;
}

const miregloomGardens: WorldMap = {
  id: 'miregloom-gardens',
  name: 'The Miregloom Gardens',
  epigraph: 'Where the first seeds of the Vale still dream beneath the moss.',
  width: 3200,
  height: 2400,
  palette: {
    skyTop: 0x13202b,
    skyBottom: 0x0a1219,
    nightTop: 0x0a111e,
    nightBottom: 0x05080e,
    fog: 0x2a4a4a,
    layers: [0x101c26, 0x0c161e, 0x081014],
    ground: 0x0d1a1c,
    accent: 0x7ad8c4,
    accentWarm: 0xd8b46a,
    plant: 0x2c5a50,
    plantAlt: 0x3d7263,
  },
  obstacles: [
    ...ringOfStones(1600, 1200, 520, 9, 52, 'stone', 101, 3),
    { x: 620, y: 560, r: 78, kind: 'stone' },
    { x: 760, y: 700, r: 54, kind: 'stone' },
    { x: 2560, y: 520, r: 66, kind: 'stone' },
    { x: 2700, y: 660, r: 46, kind: 'stone' },
    { x: 560, y: 1860, r: 62, kind: 'stone' },
    { x: 2640, y: 1880, r: 72, kind: 'stone' },
    { x: 2480, y: 1740, r: 44, kind: 'stone' },
    { x: 1600, y: 380, r: 58, kind: 'stone' },
    { x: 1600, y: 2040, r: 58, kind: 'stone' },
  ],
  decorSeed: 8231,
  weatherBias: ['clear', 'spores', 'rain'],
};

const ashenReach: WorldMap = {
  id: 'ashen-reach',
  name: 'The Ashen Reach',
  epigraph: 'A burnt cathedral of pillars, still warm with old prayers.',
  width: 3600,
  height: 2600,
  palette: {
    skyTop: 0x241a18,
    skyBottom: 0x120c0c,
    nightTop: 0x140e12,
    nightBottom: 0x080508,
    fog: 0x4a3228,
    layers: [0x1e1412, 0x160e0d, 0x0e0808],
    ground: 0x180f0e,
    accent: 0xe8905a,
    accentWarm: 0xf0c060,
    plant: 0x5a3c2c,
    plantAlt: 0x74503a,
  },
  obstacles: [
    // Two colonnades marching across the reach.
    ...[0, 1, 2, 3, 4].map<Obstacle>((i) => ({
      x: 800 + i * 500,
      y: 820,
      r: 60,
      kind: 'pillar',
    })),
    ...[0, 1, 2, 3, 4].map<Obstacle>((i) => ({
      x: 1050 + i * 500,
      y: 1780,
      r: 60,
      kind: 'pillar',
    })),
    { x: 1800, y: 1300, r: 92, kind: 'pillar' },
    { x: 480, y: 1300, r: 56, kind: 'stone' },
    { x: 3120, y: 1300, r: 56, kind: 'stone' },
  ],
  decorSeed: 5417,
  weatherBias: ['embers', 'clear', 'embers', 'spores'],
};

const lumenDeeps: WorldMap = {
  id: 'lumen-deeps',
  name: 'The Lumen Deeps',
  epigraph: 'Far below the roots, the dark itself learned to glow.',
  width: 3000,
  height: 2200,
  palette: {
    skyTop: 0x141a33,
    skyBottom: 0x0a0d1f,
    nightTop: 0x0d1026,
    nightBottom: 0x060714,
    fog: 0x2c3a6a,
    layers: [0x111631, 0x0c1024, 0x070a17],
    ground: 0x0c1024,
    accent: 0x8a9af5,
    accentWarm: 0xc887e8,
    plant: 0x2a3a72,
    plantAlt: 0x3d4f92,
  },
  obstacles: [
    ...ringOfStones(900, 700, 300, 6, 46, 'crystal', 301, 3),
    ...ringOfStones(2150, 1550, 340, 7, 50, 'crystal', 302, 4),
    { x: 1500, y: 1100, r: 84, kind: 'crystal' },
    { x: 2450, y: 500, r: 58, kind: 'crystal' },
    { x: 550, y: 1700, r: 62, kind: 'crystal' },
  ],
  decorSeed: 9203,
  weatherBias: ['clear', 'spores', 'clear'],
};

export const MAPS: readonly WorldMap[] = [miregloomGardens, ashenReach, lumenDeeps];

export function getMap(id: string): WorldMap {
  return MAPS.find((m) => m.id === id) ?? miregloomGardens;
}
