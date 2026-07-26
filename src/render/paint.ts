/**
 * Canvas painting toolkit — the "brushes" behind every procedural texture.
 * All art in the game is generated at runtime from these primitives, tuned to
 * read as soft, hand-painted forms rather than geometric vector shapes.
 */
import { Rng } from '../core/rng';

export function hexToRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

export function cssOf(color: number, alpha = 1): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mixColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function lighten(color: number, amount: number): number {
  return mixColor(color, 0xffffff, amount);
}

export function darken(color: number, amount: number): number {
  return mixColor(color, 0x000000, amount);
}

export function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return [canvas, ctx];
}

/** Soft radial glow — the fundamental brush of the whole art style. */
export function paintGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: number,
  innerAlpha = 1,
  falloff = 1,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, cssOf(color, innerAlpha));
  g.addColorStop(Math.min(0.99, 0.35 * falloff), cssOf(color, innerAlpha * 0.5));
  g.addColorStop(1, cssOf(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** A disc with a softened rim and an off-centre highlight, like a painted bead. */
export function paintShadedDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  base: number,
  highlight: number,
  shadow: number,
): void {
  const g = ctx.createRadialGradient(
    x - radius * 0.32,
    y - radius * 0.38,
    radius * 0.1,
    x,
    y,
    radius,
  );
  g.addColorStop(0, cssOf(highlight, 1));
  g.addColorStop(0.45, cssOf(base, 1));
  g.addColorStop(0.85, cssOf(shadow, 1));
  g.addColorStop(1, cssOf(shadow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Irregular painterly blob: a disc whose rim is displaced by layered
 * harmonics, then filled with a soft gradient. Reads as brushwork.
 */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rng: Rng,
  roughness = 0.16,
  points = 18,
): void {
  const phases = [rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2)];
  const amps = [roughness, roughness * 0.5, roughness * 0.28];
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const wob =
      1 +
      amps[0]! * Math.sin(a * 3 + phases[0]!) +
      amps[1]! * Math.sin(a * 5 + phases[1]!) +
      amps[2]! * Math.sin(a * 8 + phases[2]!);
    const px = x + Math.cos(a) * radius * wob;
    const py = y + Math.sin(a) * radius * wob;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Scatter fine speckles — lichen, mineral grain, distant motes. */
export function speckle(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  color: number,
  alphaMax = 0.35,
  sizeMax = 2.2,
): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = cssOf(color, rng.range(alphaMax * 0.25, alphaMax));
    const r = rng.range(0.5, sizeMax);
    ctx.beginPath();
    ctx.arc(x + rng.range(0, w), y + rng.range(0, h), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Horizontally-periodic ridge height at u ∈ [0,1) — used for parallax
 * silhouettes that must tile seamlessly.
 */
export function periodicRidge(u: number, seed: number, jaggedness = 1): number {
  const a = u * Math.PI * 2;
  return (
    0.5 +
    0.22 * Math.sin(a + seed) +
    0.14 * Math.sin(a * 2 + seed * 1.7) +
    0.09 * jaggedness * Math.sin(a * 5 + seed * 2.3) +
    0.05 * jaggedness * Math.sin(a * 9 + seed * 3.1)
  );
}
