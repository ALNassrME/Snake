/** Floating world-space text popups (score gains, combo callouts). */
import { Container, Text } from 'pixi.js';
import { clamp01 } from '../core/mathUtils';

interface Popup {
  text: Text;
  life: number;
  maxLife: number;
  vy: number;
  scaleTarget: number;
}

export class PopupSystem {
  readonly container = new Container();
  private pool: Text[] = [];
  private active: Popup[] = [];

  spawn(message: string, x: number, y: number, color: number, size = 20): void {
    let text = this.pool.pop();
    if (!text) {
      text = new Text({
        text: message,
        style: {
          fontFamily: 'Cinzel, Georgia, serif',
          fontSize: 22,
          fontWeight: '700',
          fill: 0xffffff,
          align: 'center',
          dropShadow: { alpha: 0.6, blur: 4, color: 0x000000, distance: 2 },
        },
      });
      text.anchor.set(0.5);
    }
    text.text = message;
    text.style.fontSize = size;
    text.style.fill = color;
    text.position.set(x, y);
    text.alpha = 0;
    text.scale.set(0.5);
    this.container.addChild(text);
    this.active.push({ text, life: 1.1, maxLife: 1.1, vy: -46, scaleTarget: 1 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.container.removeChild(p.text);
        this.pool.push(p.text);
        this.active.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.text.y += p.vy * dt;
      p.vy *= 1 - dt * 1.4;
      const appear = clamp01(t / 0.15);
      const fade = clamp01((1 - t) / 0.35);
      p.text.alpha = Math.min(appear, fade);
      const s = 0.5 + (p.scaleTarget - 0.5) * Math.min(1, t / 0.12);
      p.text.scale.set(s);
    }
  }

  clear(): void {
    for (const p of this.active) {
      this.container.removeChild(p.text);
      this.pool.push(p.text);
    }
    this.active.length = 0;
  }
}
