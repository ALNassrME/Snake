import type { Vec2 } from '../core/mathUtils';

export type GameModeId = 'classic' | 'endless' | 'survival' | 'timeattack' | 'hardcore' | 'zen';

export type FoodKind = 'ember' | 'bloom' | 'chrono' | 'sigil';

export interface Food {
  id: number;
  kind: FoodKind;
  pos: Vec2;
  radius: number;
  value: number;
  growth: number;
  born: number; // session time
  ttl: number | null;
}

export type HazardKind = 'thorns' | 'wisp' | 'rift';
export type HazardState = 'telegraph' | 'active' | 'fading';

export interface Hazard {
  id: number;
  kind: HazardKind;
  pos: Vec2;
  radius: number;
  state: HazardState;
  /** Seconds spent in the current state. */
  stateT: number;
  vel: Vec2;
  /** Remaining active lifetime in seconds (Infinity for permanent). */
  lifetime: number;
  seed: number;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
  /** Visual variant used by the renderer. */
  kind: 'stone' | 'pillar' | 'crystal';
}

/** Interactive world element: chimes and lights up when the wyrm passes. */
export interface Bellflower {
  id: number;
  pos: Vec2;
  cooldown: number;
}

export type DeathCause = 'wall' | 'self' | 'obstacle' | 'hazard' | 'boss' | 'time';

export type SessionState = 'countdown' | 'running' | 'dying' | 'ended';

export interface RunSummary {
  mode: GameModeId;
  score: number;
  timeSeconds: number;
  foodEaten: number;
  maxCombo: number;
  maxLength: number;
  distance: number;
  bossesDefeated: number;
  cause: DeathCause | 'completed';
  isBestScore: boolean;
}

export interface SessionEvents extends Record<string, unknown> {
  countdown: { n: number };
  started: Record<string, never>;
  food_eaten: { food: Food; combo: number; multiplier: number; gained: number };
  food_spawned: { food: Food };
  food_expired: { food: Food };
  combo_break: { combo: number };
  combo_milestone: { combo: number };
  score_changed: { score: number; multiplier: number };
  near_miss: { pos: Vec2 };
  hazard_spawned: { hazard: Hazard };
  hazard_activated: { hazard: Hazard };
  hazard_expired: { hazard: Hazard };
  boss_spawned: { pos: Vec2 };
  boss_sigil_spawned: { pos: Vec2; index: number };
  boss_sigil_collected: { collected: number; total: number; pos: Vec2 };
  boss_defeated: { pos: Vec2 };
  boss_departed: Record<string, never>;
  bell_chime: { pos: Vec2 };
  time_warning: { remaining: number };
  death: { cause: DeathCause; pos: Vec2 };
  run_ended: { summary: RunSummary };
  grew: { length: number };
}

export interface MapPalette {
  /** Ambient sky gradient (day). */
  skyTop: number;
  skyBottom: number;
  /** Night variants blended in by the day/night cycle. */
  nightTop: number;
  nightBottom: number;
  fog: number;
  /** Far -> near parallax silhouette tints. */
  layers: [number, number, number];
  ground: number;
  accent: number;
  accentWarm: number;
  plant: number;
  plantAlt: number;
}

export interface WorldMap {
  id: string;
  name: string;
  epigraph: string;
  width: number;
  height: number;
  palette: MapPalette;
  obstacles: Obstacle[];
  decorSeed: number;
  /** Ambient weather bias for this region. */
  weatherBias: ('clear' | 'spores' | 'rain' | 'embers')[];
}

export interface ModeConfig {
  id: GameModeId;
  name: string;
  tagline: string;
  mapId: string;
  baseSpeed: number;
  speedPerFood: number;
  maxSpeedBonus: number;
  turnRate: number;
  startLength: number;
  foodCount: number;
  scoreMult: number;
  comboWindow: number;
  hazards: boolean;
  hazardIntervalStart: number;
  hazardIntervalMin: number;
  boss: boolean;
  bossFirstScore: number;
  bossScoreStep: number;
  timeLimit: number | null;
  invulnerable: boolean;
  /** Survival scoring: passive score per second. */
  scorePerSecond: number;
}
