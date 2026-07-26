/** Small math toolkit shared by simulation and rendering. */

export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing. `rate` ≈ how fast we converge per second. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function dampVec(current: Vec2, target: Vec2, rate: number, dt: number): void {
  const t = 1 - Math.exp(-rate * dt);
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Shortest signed angular difference from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Rotate `current` toward `target` by at most `maxStep` radians. */
export function rotateToward(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Cheap value-noise: smooth pseudo-random 1D signal, useful for organic wobble. */
export function wobble(t: number, seed = 0): number {
  return (
    Math.sin(t * 1.3 + seed) * 0.5 +
    Math.sin(t * 2.7 + seed * 1.7 + 1.3) * 0.3 +
    Math.sin(t * 5.9 + seed * 0.3 + 2.1) * 0.2
  );
}

export function formatScore(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
