/**
 * Procedural texture library.
 * Everything is painted once at boot into canvases and uploaded as textures.
 * Art is authored in white/greyscale wherever possible so a single texture can
 * be re-tinted per map palette and per skin at zero extra memory cost.
 */
import { Texture } from 'pixi.js';
import { Rng } from '../core/rng';
import {
  blobPath,
  cssOf,
  darken,
  lighten,
  makeCanvas,
  paintGlow,
  paintShadedDisc,
  periodicRidge,
  speckle,
} from './paint';

export interface TextureLibrary {
  /** Pure soft radial glow, white. */
  glow: Texture;
  /** Tighter glow with brighter core, for small sparks. */
  spark: Texture;
  /** Crisp disc with painterly shading, white. */
  orb: Texture;
  /** Flat soft-edged disc for snake segments, white. */
  segment: Texture;
  /** Thin annulus ring, white. */
  ring: Texture;
  /** Large irregular fog mass, white. */
  fog: Texture;
  /** Slanted rain streak, white. */
  rain: Texture;
  /** Small leaf/petal, white. */
  petal: Texture;
  /** Curved grass blade silhouette, white, pivot at base centre. */
  blades: Texture[];
  /** Tiny four-point star. */
  star: Texture;
  /** Thorn bramble cluster, greyscale. */
  thorns: Texture;
  /** Boulder variants, greyscale with painted shading. */
  stones: Texture[];
  /** Standing pillar variants, greyscale. */
  pillars: Texture[];
  /** Crystal shard clusters, greyscale-blue neutral. */
  crystals: Texture[];
  /** Bellflower plant, painted in neutral tones + white bell. */
  bellflower: Texture;
  /** The Warden's idol body, painted greyscale. */
  warden: Texture;
  /** Ground mottling tile, greyscale. */
  ground: Texture;
  /** Parallax ridge strips (periodic), white silhouettes with soft tops. */
  ridges: Texture[];
  /** Distant tree/root silhouette clumps for parallax dressing, white. */
  flora: Texture[];
  /** Moth/firefly wing dot. */
  mote: Texture;
  /** Rotating light rays — halos behind food and the fever-state head. */
  rays: Texture;
  /** Soft membrane fin, pivot at base — dorsal frills along the wyrm. */
  fin: Texture;
  /** Wide soft aurora band, horizontally seamless. */
  aurora: Texture;
  /** Horizontal motion streak for shooting stars and light sweeps. */
  streak: Texture;
}

function glowTexture(size: number, innerAlpha: number, falloff: number): Texture {
  const [canvas, ctx] = makeCanvas(size, size);
  paintGlow(ctx, size / 2, size / 2, size / 2, 0xffffff, innerAlpha, falloff);
  return Texture.from(canvas);
}

function orbTexture(size: number): Texture {
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.46;
  paintShadedDisc(ctx, c, c, r, 0xdddddd, 0xffffff, 0x777777);
  // Crisp rim light along the upper edge sells a hard, lit surface.
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r * 0.94, -Math.PI * 0.92, -Math.PI * 0.08);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = size * 0.035;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Broad specular pool below the rim.
  const spec = ctx.createRadialGradient(
    c - r * 0.3, c - r * 0.42, 0,
    c - r * 0.3, c - r * 0.42, r * 0.55,
  );
  spec.addColorStop(0, 'rgba(255,255,255,0.55)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return Texture.from(canvas);
}

function segmentTexture(size: number): Texture {
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.46;
  const g = ctx.createRadialGradient(c - r * 0.18, c - r * 0.3, r * 0.1, c, c, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(232,232,232,1)');
  g.addColorStop(0.85, 'rgba(178,178,178,1)');
  g.addColorStop(0.97, 'rgba(120,120,120,1)');
  g.addColorStop(1, 'rgba(96,96,96,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  // Scale scallops: two nested crescents shading the trailing half.
  for (let i = 0; i < 2; i++) {
    const sr = r * (0.62 + i * 0.28);
    ctx.beginPath();
    ctx.arc(c, c + r * 0.34, sr, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = `rgba(70,70,70,${0.16 - i * 0.05})`;
    ctx.lineWidth = size * 0.05;
    ctx.stroke();
  }
  // Rim light on the leading edge — every segment catches the vale's glow.
  ctx.beginPath();
  ctx.arc(c, c, r * 0.92, -Math.PI * 0.88, -Math.PI * 0.12);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = size * 0.045;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
  return Texture.from(canvas);
}

function ringTexture(size: number, thickness: number): Texture {
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = thickness;
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.shadowBlur = thickness * 1.5;
  ctx.beginPath();
  ctx.arc(c, c, c - thickness * 2.5, 0, Math.PI * 2);
  ctx.stroke();
  return Texture.from(canvas);
}

function fogTexture(rng: Rng): Texture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  for (let i = 0; i < 14; i++) {
    const x = size / 2 + rng.range(-size * 0.24, size * 0.24);
    const y = size / 2 + rng.range(-size * 0.16, size * 0.16);
    paintGlow(ctx, x, y, rng.range(size * 0.16, size * 0.34), 0xffffff, rng.range(0.05, 0.12), 1.4);
  }
  return Texture.from(canvas);
}

function rainTexture(): Texture {
  const [canvas, ctx] = makeCanvas(6, 44);
  const g = ctx.createLinearGradient(0, 0, 0, 44);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(2, 0, 2, 44);
  return Texture.from(canvas);
}

function petalTexture(): Texture {
  const [canvas, ctx] = makeCanvas(24, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.quadraticCurveTo(22, 12, 12, 30);
  ctx.quadraticCurveTo(2, 12, 12, 2);
  ctx.fill();
  return Texture.from(canvas);
}

function bladeTexture(rng: Rng): Texture {
  const w = 40;
  const h = 96;
  const [canvas, ctx] = makeCanvas(w, h);
  const lean = rng.range(-14, 14);
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 5, h);
  ctx.quadraticCurveTo(w / 2 - 6 + lean * 0.4, h * 0.45, w / 2 + lean, rng.range(4, 20));
  ctx.quadraticCurveTo(w / 2 + 5 + lean * 0.4, h * 0.5, w / 2 + 5, h);
  ctx.closePath();
  ctx.fill();
  return Texture.from(canvas);
}

function starTexture(): Texture {
  const size = 24;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  paintGlow(ctx, c, c, c, 0xffffff, 0.9, 0.7);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(c - 7, c);
  ctx.lineTo(c + 7, c);
  ctx.moveTo(c, c - 7);
  ctx.lineTo(c, c + 7);
  ctx.stroke();
  return Texture.from(canvas);
}

function thornsTexture(rng: Rng): Texture {
  const size = 192;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  blobPath(ctx, c, c, size * 0.34, rng, 0.22);
  ctx.fill();
  // Curved thorn spikes radiating out of the mass.
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const inner = size * rng.range(0.16, 0.3);
    const outer = size * rng.range(0.34, 0.48);
    const bend = rng.range(-0.5, 0.5);
    const x0 = c + Math.cos(a) * inner;
    const y0 = c + Math.sin(a) * inner;
    const x1 = c + Math.cos(a + bend * 0.3) * outer;
    const y1 = c + Math.sin(a + bend * 0.3) * outer;
    const mx = c + Math.cos(a + bend * 0.15) * (inner + outer) * 0.55;
    const my = c + Math.sin(a + bend * 0.15) * (inner + outer) * 0.55;
    ctx.strokeStyle = `rgba(${rng.int(40, 70)},${rng.int(35, 55)},${rng.int(45, 65)},0.95)`;
    ctx.lineWidth = rng.range(2, 4.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
  }
  speckle(ctx, rng, 0, 0, size, size, 40, 0x9a9a9a, 0.3, 1.6);
  return Texture.from(canvas);
}

function stoneTexture(rng: Rng): Texture {
  const size = 224;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.4;
  // Body — steep top-left key light against a near-black base reads as a
  // hard, dimensional boulder instead of a flat grey blob. The silhouette is
  // generated once (blobPath consumes rng) and replayed for clip and rim.
  const phases = [rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2)];
  const amps = [0.13, 0.065, 0.036];
  const wobbleAt = (a: number): number =>
    1 +
    amps[0]! * Math.sin(a * 3 + phases[0]!) +
    amps[1]! * Math.sin(a * 5 + phases[1]!) +
    amps[2]! * Math.sin(a * 8 + phases[2]!);
  const trace = (scale = 1): void => {
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rr = r * wobbleAt(a) * scale;
      const px = c + Math.cos(a) * rr;
      const py = c + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  trace();
  const g = ctx.createRadialGradient(c - r * 0.45, c - r * 0.55, r * 0.08, c, c, r * 1.2);
  g.addColorStop(0, 'rgba(235,235,240,1)');
  g.addColorStop(0.35, 'rgba(150,150,162,1)');
  g.addColorStop(0.7, 'rgba(84,84,96,1)');
  g.addColorStop(1, 'rgba(30,30,38,1)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  trace();
  ctx.clip();
  // Rim light hugging the lit shoulder: replay the silhouette slightly
  // inset so the stroke follows the actual crags.
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = size * 0.022;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = -Math.PI * 0.95 + (i / 7) * Math.PI * 0.62;
    const rr = r * wobbleAt(a) * 0.96;
    const px = c + Math.cos(a) * rr;
    const py = c + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // Grounding shadow pooling at the base.
  const ground = ctx.createLinearGradient(0, c + r * 0.2, 0, c + r);
  ground.addColorStop(0, 'rgba(0,0,0,0)');
  ground.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = ground;
  ctx.fillRect(0, c, size, size / 2);
  ctx.restore();
  // Cracks
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(40,40,48,${rng.range(0.3, 0.6)})`;
    ctx.lineWidth = rng.range(1, 2.2);
    ctx.beginPath();
    let x = c + rng.range(-r * 0.5, r * 0.5);
    let y = c + rng.range(-r * 0.5, r * 0.5);
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += rng.range(-r * 0.3, r * 0.3);
      y += rng.range(-r * 0.2, r * 0.35);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  speckle(ctx, rng, size * 0.15, size * 0.15, size * 0.7, size * 0.7, 60, 0xffffff, 0.14, 1.8);
  speckle(ctx, rng, size * 0.15, size * 0.15, size * 0.7, size * 0.7, 40, 0x202028, 0.35, 1.5);
  return Texture.from(canvas);
}

function pillarTexture(rng: Rng): Texture {
  const w = 176;
  const h = 260;
  const [canvas, ctx] = makeCanvas(w, h);
  const cx = w / 2;
  // Broken column seen from above-ish: an ellipse cap over a shaft silhouette.
  const shaftW = w * 0.52;
  const g = ctx.createLinearGradient(cx - shaftW / 2, 0, cx + shaftW / 2, 0);
  g.addColorStop(0, 'rgba(70,66,74,1)');
  g.addColorStop(0.35, 'rgba(165,158,168,1)');
  g.addColorStop(0.65, 'rgba(120,112,124,1)');
  g.addColorStop(1, 'rgba(52,48,58,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - shaftW / 2, h * 0.28);
  ctx.lineTo(cx - shaftW / 2 + rng.range(-4, 4), h * 0.92);
  ctx.quadraticCurveTo(cx, h * 1.0, cx + shaftW / 2 + rng.range(-4, 4), h * 0.92);
  ctx.lineTo(cx + shaftW / 2, h * 0.28);
  ctx.closePath();
  ctx.fill();
  // Jagged broken top
  ctx.fillStyle = 'rgba(190,184,196,1)';
  ctx.beginPath();
  ctx.moveTo(cx - shaftW / 2, h * 0.3);
  for (let i = 0; i <= 6; i++) {
    ctx.lineTo(cx - shaftW / 2 + (shaftW * i) / 6, h * (0.3 - (i % 2 === 0 ? 0 : rng.range(0.03, 0.08))));
  }
  ctx.lineTo(cx + shaftW / 2, h * 0.34);
  ctx.closePath();
  ctx.fill();
  // Fluting lines
  for (let i = 1; i < 5; i++) {
    const x = cx - shaftW / 2 + (shaftW * i) / 5;
    ctx.strokeStyle = 'rgba(30,28,36,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.32);
    ctx.lineTo(x + rng.range(-3, 3), h * 0.9);
    ctx.stroke();
  }
  speckle(ctx, rng, cx - shaftW / 2, h * 0.3, shaftW, h * 0.6, 50, 0xffffff, 0.1, 1.4);
  return Texture.from(canvas);
}

function crystalTexture(rng: Rng): Texture {
  const size = 224;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size * 0.62;
  const shards = rng.int(4, 6);
  for (let i = 0; i < shards; i++) {
    const a = -Math.PI / 2 + rng.range(-0.9, 0.9);
    const len = size * rng.range(0.22, 0.44);
    const wHalf = size * rng.range(0.035, 0.075);
    const tipX = cx + Math.cos(a) * len;
    const tipY = cy + Math.sin(a) * len;
    const perp = a + Math.PI / 2;
    const bx = cx + Math.cos(perp) * wHalf;
    const by = cy + Math.sin(perp) * wHalf;
    const dx = cx - Math.cos(perp) * wHalf;
    const dy = cy - Math.sin(perp) * wHalf;
    const g = ctx.createLinearGradient(cx, cy, tipX, tipY);
    g.addColorStop(0, 'rgba(90,90,110,1)');
    g.addColorStop(0.6, 'rgba(180,180,210,1)');
    g.addColorStop(1, 'rgba(245,245,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fill();
    // Facet line
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo((bx + dx) / 2, (by + dy) / 2);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
  // Rocky base
  blobPath(ctx, cx, cy + size * 0.06, size * 0.2, rng, 0.2);
  ctx.fillStyle = 'rgba(70,68,84,1)';
  ctx.fill();
  return Texture.from(canvas);
}

function bellflowerTexture(rng: Rng): Texture {
  const w = 96;
  const h = 148;
  const [canvas, ctx] = makeCanvas(w, h);
  const baseX = w / 2;
  // Stem with a gentle double curve.
  ctx.strokeStyle = 'rgba(120,140,120,0.95)';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseX, h - 4);
  ctx.bezierCurveTo(baseX - 14, h * 0.62, baseX + 16, h * 0.42, baseX + 4, h * 0.2);
  ctx.stroke();
  // Leaves at the base.
  for (const side of [-1, 1]) {
    ctx.fillStyle = 'rgba(110,132,112,0.9)';
    ctx.beginPath();
    ctx.moveTo(baseX, h - 6);
    ctx.quadraticCurveTo(baseX + side * 26, h - 26 + rng.range(-4, 4), baseX + side * 40, h - 14);
    ctx.quadraticCurveTo(baseX + side * 20, h - 8, baseX, h - 6);
    ctx.fill();
  }
  // The bell: a hanging lantern-bloom, white so it can be tinted.
  const bx = baseX + 4;
  const by = h * 0.2;
  paintGlow(ctx, bx, by + 14, 30, 0xffffff, 0.35, 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.beginPath();
  ctx.moveTo(bx - 12, by);
  ctx.quadraticCurveTo(bx - 15, by + 20, bx - 7, by + 26);
  ctx.lineTo(bx + 7, by + 26);
  ctx.quadraticCurveTo(bx + 15, by + 20, bx + 12, by);
  ctx.quadraticCurveTo(bx, by - 8, bx - 12, by);
  ctx.fill();
  // Clapper spark.
  paintGlow(ctx, bx, by + 28, 8, 0xffffff, 0.9, 0.8);
  return Texture.from(canvas);
}

function wardenTexture(rng: Rng): Texture {
  const w = 320;
  const h = 400;
  const [canvas, ctx] = makeCanvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  // Halo
  paintGlow(ctx, cx, cy, w * 0.48, 0xffffff, 0.16, 1.3);
  // The idol: an elongated rounded lozenge, like a carved lantern of stone.
  const bodyW = w * 0.34;
  const bodyH = h * 0.72;
  const g = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
  g.addColorStop(0, 'rgba(58,56,66,1)');
  g.addColorStop(0.4, 'rgba(150,146,160,1)');
  g.addColorStop(0.7, 'rgba(96,92,106,1)');
  g.addColorStop(1, 'rgba(40,38,48,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, cy - bodyH / 2);
  ctx.bezierCurveTo(cx + bodyW * 0.85, cy - bodyH * 0.28, cx + bodyW * 0.7, cy + bodyH * 0.3, cx, cy + bodyH / 2);
  ctx.bezierCurveTo(cx - bodyW * 0.7, cy + bodyH * 0.3, cx - bodyW * 0.85, cy - bodyH * 0.28, cx, cy - bodyH / 2);
  ctx.fill();
  // Carved ring collars.
  for (const ry of [-0.22, 0.05, 0.3]) {
    ctx.strokeStyle = 'rgba(24,22,30,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + bodyH * ry, bodyW * (0.62 - Math.abs(ry) * 0.55), 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The face: three slit eyes, painted bright for additive tinting later.
  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  for (const [ex, ey, esc] of [
    [-0.16, -0.16, 1],
    [0.16, -0.16, 1],
    [0, -0.02, 0.7],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(cx + bodyW * ex, cy + bodyH * ey, 7 * esc, 20 * esc, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hanging chains of light beneath.
  for (let i = 0; i < 5; i++) {
    const x = cx + rng.range(-bodyW * 0.4, bodyW * 0.4);
    for (let j = 0; j < 4; j++) {
      paintGlow(ctx, x + rng.range(-3, 3), cy + bodyH * 0.5 + 14 + j * 13, 5, 0xffffff, 0.5 - j * 0.1, 0.8);
    }
  }
  speckle(ctx, rng, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, 40, 0xffffff, 0.12, 1.4);
  return Texture.from(canvas);
}

function groundTexture(rng: Rng): Texture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = 'rgba(128,128,128,1)';
  ctx.fillRect(0, 0, size, size);
  // Large soft mottling, wrapped at the edges so the tile is seamless.
  for (let i = 0; i < 46; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(30, 90);
    const bright = rng.chance(0.5);
    const color = bright ? 0xb4b4b4 : 0x6a6a6a;
    const alpha = rng.range(0.05, 0.14);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        paintGlow(ctx, x + ox, y + oy, r, color, alpha, 1.5);
      }
    }
  }
  speckle(ctx, rng, 0, 0, size, size, 220, 0xdddddd, 0.1, 1.6);
  speckle(ctx, rng, 0, 0, size, size, 160, 0x3a3a3a, 0.12, 1.8);
  return Texture.from(canvas);
}

function ridgeTexture(seed: number, jaggedness: number, treeDensity: number): Texture {
  const w = 1024;
  const h = 420;
  const rng = new Rng(seed);
  const [canvas, ctx] = makeCanvas(w, h);
  // Silhouette body with soft-faded crest.
  const crest: number[] = [];
  for (let x = 0; x <= w; x += 4) {
    crest.push(h * (0.34 + 0.32 * (1 - periodicRidge(x / w, seed, jaggedness))));
  }
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.55, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  crest.forEach((y, i) => ctx.lineTo(i * 4, y));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Gnarled trees / root spires standing on the crest.
  const trees = Math.round(treeDensity * 26);
  for (let i = 0; i < trees; i++) {
    const x = rng.range(0, w);
    const crestY = h * (0.34 + 0.32 * (1 - periodicRidge(x / w, seed, jaggedness)));
    const th = rng.range(20, 85) * (0.7 + jaggedness * 0.5);
    const lean = rng.range(-0.25, 0.25);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = rng.range(2, 5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, crestY + 6);
    ctx.quadraticCurveTo(x + lean * th, crestY - th * 0.5, x + lean * th * 2, crestY - th);
    ctx.stroke();
    // Branches
    const branches = rng.int(1, 3);
    for (let b = 0; b < branches; b++) {
      const t = rng.range(0.4, 0.85);
      const bx = x + lean * th * 2 * t;
      const by = crestY - th * t;
      const ba = rng.range(-2.4, -0.7) * (rng.chance(0.5) ? 1 : -1);
      ctx.lineWidth = rng.range(1, 2.4);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + Math.cos(ba) * th * 0.25,
        by + Math.sin(ba) * th * 0.25 - 4,
        bx + Math.cos(ba) * th * 0.45,
        by + Math.sin(ba) * th * 0.45 - 8,
      );
      ctx.stroke();
    }
  }
  return Texture.from(canvas);
}

function floraTexture(rng: Rng): Texture {
  const w = 160;
  const h = 200;
  const [canvas, ctx] = makeCanvas(w, h);
  const cx = w / 2;
  // A clump of giant curled ferns / root tendrils, silhouette only.
  const fronds = rng.int(4, 6);
  for (let i = 0; i < fronds; i++) {
    const a = -Math.PI / 2 + rng.range(-0.8, 0.8);
    const len = rng.range(60, 120);
    ctx.strokeStyle = `rgba(255,255,255,${rng.range(0.7, 0.95)})`;
    ctx.lineWidth = rng.range(3, 6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, h - 6);
    const curl = rng.range(0.6, 1.8) * (rng.chance(0.5) ? 1 : -1);
    ctx.bezierCurveTo(
      cx + Math.cos(a) * len * 0.4,
      h - 6 + Math.sin(a) * len * 0.5,
      cx + Math.cos(a + curl * 0.4) * len * 0.8,
      h - 6 + Math.sin(a) * len * 0.9,
      cx + Math.cos(a + curl) * len * 0.75,
      h - 6 + Math.sin(a) * len - rng.range(0, 24),
    );
    ctx.stroke();
  }
  return Texture.from(canvas);
}

function raysTexture(rng: Rng): Texture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  // Uneven ray lengths and widths read as painted light, not a vector star.
  const rays = 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const len = c * rng.range(0.55, 0.95);
    const halfW = rng.range(0.04, 0.09);
    const g = ctx.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a - halfW) * 10, c + Math.sin(a - halfW) * 10);
    ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
    ctx.lineTo(c + Math.cos(a + halfW) * 10, c + Math.sin(a + halfW) * 10);
    ctx.closePath();
    ctx.fill();
  }
  paintGlow(ctx, c, c, size * 0.2, 0xffffff, 0.55, 0.8);
  return Texture.from(canvas);
}

function finTexture(): Texture {
  const w = 48;
  const h = 64;
  const [canvas, ctx] = makeCanvas(w, h);
  // A translucent membrane between two spines, like a betta fin.
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.5 - 8, h);
  ctx.quadraticCurveTo(w * 0.12, h * 0.45, w * 0.3, 6);
  ctx.quadraticCurveTo(w * 0.5, h * 0.35, w * 0.7, 6);
  ctx.quadraticCurveTo(w * 0.88, h * 0.45, w * 0.5 + 8, h);
  ctx.closePath();
  ctx.fill();
  // Spine ribs.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.6;
  for (const fx of [0.3, 0.5, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h - 2);
    ctx.quadraticCurveTo(w * fx, h * 0.5, w * fx, 8);
    ctx.stroke();
  }
  return Texture.from(canvas);
}

function auroraTexture(rng: Rng): Texture {
  const w = 512;
  const h = 160;
  const [canvas, ctx] = makeCanvas(w, h);
  // Vertical falloff band whose alpha ripples horizontally — tiles seamlessly
  // because the ripple is built from whole-cycle sines.
  for (let x = 0; x < w; x++) {
    const u = x / w;
    const ripple =
      0.55 +
      0.3 * Math.sin(u * Math.PI * 2 * 3 + 1.7) +
      0.15 * Math.sin(u * Math.PI * 2 * 7 + rng.range(0, 0.01));
    const top = h * (0.15 + 0.12 * Math.sin(u * Math.PI * 2 * 2));
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, `rgba(255,255,255,${0.5 * ripple})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1, h);
  }
  return Texture.from(canvas);
}

function streakTexture(): Texture {
  const [canvas, ctx] = makeCanvas(128, 10);
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 3, 128, 4);
  return Texture.from(canvas);
}

let cached: TextureLibrary | null = null;

/** Build (or return) the global texture library. Safe to call repeatedly. */
export function buildTextures(): TextureLibrary {
  if (cached) return cached;
  const rng = new Rng(0xa11ce);
  cached = {
    glow: glowTexture(160, 0.85, 1),
    spark: glowTexture(64, 1, 0.6),
    orb: orbTexture(96),
    segment: segmentTexture(80),
    ring: ringTexture(160, 6),
    fog: fogTexture(rng),
    rain: rainTexture(),
    petal: petalTexture(),
    blades: [bladeTexture(rng), bladeTexture(rng), bladeTexture(rng), bladeTexture(rng)],
    star: starTexture(),
    thorns: thornsTexture(rng),
    stones: [stoneTexture(rng), stoneTexture(rng), stoneTexture(rng)],
    pillars: [pillarTexture(rng), pillarTexture(rng)],
    crystals: [crystalTexture(rng), crystalTexture(rng), crystalTexture(rng)],
    bellflower: bellflowerTexture(rng),
    warden: wardenTexture(rng),
    ground: groundTexture(rng),
    ridges: [ridgeTexture(3.7, 0.5, 0.5), ridgeTexture(8.1, 0.9, 0.8), ridgeTexture(13.9, 1.3, 1)],
    flora: [floraTexture(rng), floraTexture(rng), floraTexture(rng)],
    mote: glowTexture(28, 1, 0.5),
    rays: raysTexture(rng),
    fin: finTexture(),
    aurora: auroraTexture(rng),
    streak: streakTexture(),
  };
  return cached;
}

export { cssOf, darken, lighten };
