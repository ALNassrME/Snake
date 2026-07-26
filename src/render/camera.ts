/**
 * Cinematic camera: damped follow with velocity look-ahead, dynamic zoom,
 * trauma-based shake and scripted focus transitions (boss entrances).
 */
import { clamp, damp, wobble, type Vec2 } from '../core/mathUtils';

export interface CameraTarget {
  pos: Vec2;
  velocityAngle: number;
  speed: number;
}

export class CinematicCamera {
  /** World-space centre of the view. */
  pos: Vec2 = { x: 0, y: 0 };
  zoom = 1;
  private targetZoom = 1;
  private baseZoom = 1;

  /** Quick zoom kick on pickups; decays fast for a "bite" feel. */
  private punchT = 0;

  /** Shake "trauma" 0..1; shake magnitude is trauma², which feels natural. */
  private trauma = 0;
  private shakeTime = 0;
  shakeOffset: Vec2 = { x: 0, y: 0 };
  shakeRoll = 0;

  /** Optional scripted focus point (boss intro); overrides follow. */
  private focusPoint: Vec2 | null = null;
  private focusStrength = 0;

  /** External scale on all shake (settings / reduce motion). */
  shakeScale = 1;

  viewWidth = 1280;
  viewHeight = 720;
  worldWidth = 3200;
  worldHeight = 2400;

  snapTo(x: number, y: number): void {
    this.pos.x = x;
    this.pos.y = y;
  }

  setBaseZoom(z: number): void {
    this.baseZoom = z;
  }

  /** Snap zoom back to the neutral framing (used when a session starts). */
  resetZoom(): void {
    this.zoom = this.baseZoom;
    this.targetZoom = this.baseZoom;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Momentary zoom-in kick, scaled by settings like shake. */
  punch(amount = 1): void {
    this.punchT = Math.min(1, this.punchT + amount);
  }

  focusOn(point: Vec2 | null): void {
    this.focusPoint = point ? { ...point } : null;
  }

  update(dt: number, target: CameraTarget): void {
    // --- follow with look-ahead ---
    const lookAhead = clamp(target.speed * 0.55, 0, 190);
    const desired: Vec2 = {
      x: target.pos.x + Math.cos(target.velocityAngle) * lookAhead,
      y: target.pos.y + Math.sin(target.velocityAngle) * lookAhead,
    };

    this.focusStrength = damp(this.focusStrength, this.focusPoint ? 1 : 0, 2.2, dt);
    if (this.focusPoint && this.focusStrength > 0.001) {
      desired.x = desired.x + (this.focusPoint.x - desired.x) * this.focusStrength;
      desired.y = desired.y + (this.focusPoint.y - desired.y) * this.focusStrength;
    }

    this.pos.x = damp(this.pos.x, desired.x, 3.4, dt);
    this.pos.y = damp(this.pos.y, desired.y, 3.4, dt);

    // --- dynamic zoom: pull back as the wyrm speeds up, push in on focus ---
    const speedFactor = clamp((target.speed - 150) / 300, 0, 1);
    let z = this.baseZoom * (1.02 - speedFactor * 0.16);
    if (this.focusStrength > 0.001) z *= 1 - 0.1 * this.focusStrength;
    this.targetZoom = z;
    this.zoom = damp(this.zoom, this.targetZoom, 1.8, dt);
    // Punch rides on top of the smoothed zoom so it never fights the damping.
    this.punchT = Math.max(0, this.punchT - dt * 5);
    this.zoom *= 1 + this.punchT * this.punchT * 0.035 * this.shakeScale;

    // --- clamp the view inside the arena (with soft margin) ---
    const halfW = this.viewWidth / 2 / this.zoom;
    const halfH = this.viewHeight / 2 / this.zoom;
    const margin = 40;
    if (halfW * 2 < this.worldWidth) {
      this.pos.x = clamp(this.pos.x, halfW - margin, this.worldWidth - halfW + margin);
    } else {
      this.pos.x = this.worldWidth / 2;
    }
    if (halfH * 2 < this.worldHeight) {
      this.pos.y = clamp(this.pos.y, halfH - margin, this.worldHeight - halfH + margin);
    } else {
      this.pos.y = this.worldHeight / 2;
    }

    // --- shake ---
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.shakeTime += dt;
    const magnitude = this.trauma * this.trauma * this.shakeScale;
    const t = this.shakeTime * 18;
    this.shakeOffset.x = wobble(t, 1.3) * 22 * magnitude;
    this.shakeOffset.y = wobble(t, 7.9) * 22 * magnitude;
    this.shakeRoll = wobble(t, 4.2) * 0.02 * magnitude;
  }

  resize(viewWidth: number, viewHeight: number): void {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    // Reference framing tuned for ~1280px wide; scale zoom so the wyrm's
    // world footprint feels the same on every screen. The 1.24 pushes the
    // camera close enough that the creature reads as a character, not a dot —
    // off-screen food is covered by the edge-of-screen guide wisps.
    const fit = clamp(Math.min(viewWidth / 1280, viewHeight / 800), 0.62, 1.5);
    this.setBaseZoom(fit * 1.24);
  }
}
