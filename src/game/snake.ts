/**
 * Fluid snake simulation.
 * The head steers continuously toward a target heading; the body is laid out
 * by arc-length sampling along the head's recorded travel path, which gives a
 * naturally flowing, physical body-follow with zero springiness artifacts.
 */
import { TAU, rotateToward, type Vec2 } from '../core/mathUtils';

const PATH_RESOLUTION = 2.5; // record a path point every N world units of travel

export interface SnakeConfig {
  x: number;
  y: number;
  heading: number;
  startLength: number;
  segmentSpacing?: number;
  headRadius?: number;
}

export class Snake {
  pos: Vec2;
  heading: number;
  targetHeading: number;
  /** Current cruise speed (world units / s); owned by the session. */
  speed = 0;
  turnRate = 4;

  readonly segmentSpacing: number;
  readonly headRadius: number;

  /** Number of body segments the snake should currently have. */
  targetLength: number;
  /** Smoothly animated visual length (grows toward targetLength). */
  private currentLength: number;

  /** Flat [x0,y0,x1,y1,...] path history; index 0 is the oldest point. */
  private path: number[] = [];
  private lastRecorded: Vec2;
  private travelledSinceRecord = 0;

  /** Computed world positions, index 0 = segment just behind the head. */
  segments: Vec2[] = [];
  /** Total distance travelled this run (for stats). */
  distance = 0;

  constructor(cfg: SnakeConfig) {
    this.pos = { x: cfg.x, y: cfg.y };
    this.heading = cfg.heading;
    this.targetHeading = cfg.heading;
    this.targetLength = cfg.startLength;
    this.currentLength = cfg.startLength;
    this.segmentSpacing = cfg.segmentSpacing ?? 12;
    this.headRadius = cfg.headRadius ?? 11;
    this.lastRecorded = { ...this.pos };
    // Seed the path with a straight tail behind the spawn point so the snake
    // is born at full length rather than unfolding from a single point.
    const back = cfg.heading + Math.PI;
    const tailLen = (cfg.startLength + 2) * this.segmentSpacing;
    const steps = Math.ceil(tailLen / PATH_RESOLUTION);
    for (let i = steps; i >= 0; i--) {
      const d = (i / steps) * tailLen;
      this.path.push(this.pos.x + Math.cos(back) * d, this.pos.y + Math.sin(back) * d);
    }
    this.rebuildSegments();
  }

  setTargetHeading(angle: number): void {
    this.targetHeading = ((angle % TAU) + TAU) % TAU;
  }

  grow(bySegments: number): void {
    this.targetLength += bySegments;
  }

  get length(): number {
    return this.targetLength;
  }

  /** Radius of a body segment at index i (tapers toward the tail). */
  segmentRadius(i: number): number {
    const t = this.segments.length <= 1 ? 0 : i / (this.segments.length - 1);
    const taper = 1 - 0.45 * Math.pow(t, 1.4);
    return this.headRadius * 0.92 * taper;
  }

  update(dt: number): void {
    this.heading = rotateToward(this.heading, this.targetHeading, this.turnRate * dt);

    const step = this.speed * dt;
    this.pos.x += Math.cos(this.heading) * step;
    this.pos.y += Math.sin(this.heading) * step;
    this.distance += step;

    this.travelledSinceRecord += step;
    if (this.travelledSinceRecord >= PATH_RESOLUTION) {
      this.path.push(this.pos.x, this.pos.y);
      this.lastRecorded.x = this.pos.x;
      this.lastRecorded.y = this.pos.y;
      this.travelledSinceRecord = 0;
      this.trimPath();
    }

    // Length eases toward the target so growth reads as a smooth swell.
    if (this.currentLength < this.targetLength) {
      this.currentLength = Math.min(this.targetLength, this.currentLength + dt * 6);
    } else if (this.currentLength > this.targetLength) {
      this.currentLength = Math.max(this.targetLength, this.currentLength - dt * 6);
    }

    this.rebuildSegments();
  }

  /** Teleport-safe reposition used by Zen wall-sliding: moves head without drawing a path streak. */
  nudge(dx: number, dy: number): void {
    this.pos.x += dx;
    this.pos.y += dy;
  }

  private trimPath(): void {
    const needed =
      Math.ceil(((this.currentLength + 3) * this.segmentSpacing) / PATH_RESOLUTION) + 8;
    const excessPoints = this.path.length / 2 - needed;
    if (excessPoints > 32) {
      this.path.splice(0, excessPoints * 2);
    }
  }

  private rebuildSegments(): void {
    const count = Math.max(1, Math.round(this.currentLength));
    if (this.segments.length !== count) {
      const old = this.segments;
      this.segments = new Array<Vec2>(count);
      for (let i = 0; i < count; i++) {
        this.segments[i] = old[i] ?? { x: this.pos.x, y: this.pos.y };
      }
    }

    // Walk backwards along [path..., head] accumulating arc length and place a
    // segment every `segmentSpacing` units.
    let segIndex = 0;
    let nextAt = this.segmentSpacing;
    let walked = 0;
    let px = this.pos.x;
    let py = this.pos.y;

    for (let i = this.path.length - 2; i >= 0 && segIndex < count; i -= 2) {
      const qx = this.path[i]!;
      const qy = this.path[i + 1]!;
      const segLen = Math.hypot(px - qx, py - qy);
      while (walked + segLen >= nextAt && segIndex < count) {
        const t = segLen === 0 ? 0 : (nextAt - walked) / segLen;
        const seg = this.segments[segIndex]!;
        seg.x = px + (qx - px) * t;
        seg.y = py + (qy - py) * t;
        segIndex++;
        nextAt += this.segmentSpacing;
      }
      walked += segLen;
      px = qx;
      py = qy;
    }
    // If the recorded path is shorter than the body (early frames), stack the
    // remainder at the path's end.
    for (; segIndex < count; segIndex++) {
      const seg = this.segments[segIndex]!;
      seg.x = px;
      seg.y = py;
    }
  }

  /**
   * True when the head overlaps its own body.
   * The first few segments are ignored — they always sit next to the head.
   */
  selfCollides(): boolean {
    const skip = Math.ceil((this.headRadius * 2.6) / this.segmentSpacing) + 2;
    const hr = this.headRadius * 0.82;
    for (let i = skip; i < this.segments.length; i++) {
      const s = this.segments[i]!;
      const rr = hr + this.segmentRadius(i) * 0.78;
      const dx = this.pos.x - s.x;
      const dy = this.pos.y - s.y;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }
}
