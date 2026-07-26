/**
 * Handcrafted arenas of the Vale.
 *
 * Arena size is a gameplay dial, not decoration: the camera shows roughly
 * 1200x750 world units, so an arena much larger than that leaves the player
 * hunting for food they cannot see. These are sized so most of the board is
 * on screen, which keeps decisions frequent and makes the wyrm's own body —
 * rather than empty travel — the real obstacle.
 *
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
      r: stoneRadius * rng.range(0.85, 1.15),
      kind,
    });
  }
  return out;
}

const miregloomGardens: WorldMap = {
  id: 'miregloom-gardens',
  name: 'The Miregloom Gardens',
  epigraph: 'Where the first seeds of the Vale still dream beneath the moss.',
  width: 1900,
  height: 1400,
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
    // A broken ring at the heart: something to weave through, with gaps wide
    // enough that it never becomes a wall.
    ...ringOfStones(950, 700, 300, 8, 44, 'stone', 101, 3),
    { x: 380, y: 330, r: 52, kind: 'stone' },
    { x: 1530, y: 320, r: 46, kind: 'stone' },
    { x: 350, y: 1080, r: 46, kind: 'stone' },
    { x: 1560, y: 1090, r: 52, kind: 'stone' },
  ],
  decorSeed: 8231,
  weatherBias: ['clear', 'spores', 'rain'],
};

const ashenReach: WorldMap = {
  id: 'ashen-reach',
  name: 'The Ashen Reach',
  epigraph: 'A burnt cathedral of pillars, still warm with old prayers.',
  width: 2100,
  height: 1500,
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
    // Two colonnades that divide the reach into lanes without sealing them.
    ...[0, 1, 2, 3].map<Obstacle>((i) => ({
      x: 480 + i * 380,
      y: 470,
      r: 46,
      kind: 'pillar',
    })),
    ...[0, 1, 2, 3].map<Obstacle>((i) => ({
      x: 670 + i * 380,
      y: 1030,
      r: 46,
      kind: 'pillar',
    })),
    { x: 1050, y: 750, r: 62, kind: 'pillar' },
  ],
  decorSeed: 5417,
  weatherBias: ['embers', 'clear', 'embers', 'spores'],
};

const lumenDeeps: WorldMap = {
  id: 'lumen-deeps',
  name: 'The Lumen Deeps',
  epigraph: 'Far below the roots, the dark itself learned to glow.',
  width: 1800,
  height: 1350,
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
    ...ringOfStones(560, 430, 190, 6, 38, 'crystal', 301, 3),
    ...ringOfStones(1280, 930, 210, 6, 40, 'crystal', 302, 3),
    { x: 900, y: 675, r: 56, kind: 'crystal' },
  ],
  decorSeed: 9203,
  weatherBias: ['clear', 'spores', 'clear'],
};

export const MAPS: readonly WorldMap[] = [miregloomGardens, ashenReach, lumenDeeps];

export function getMap(id: string): WorldMap {
  return MAPS.find((m) => m.id === id) ?? miregloomGardens;
}
