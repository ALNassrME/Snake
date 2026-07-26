/**
 * Unified input: keyboard (8-way), pointer steering, touch joystick and
 * gamepad — all reduced to a single desired heading for the wyrm, plus
 * navigation events for the menus.
 */
import { Emitter } from '../core/events';

export type InputSource = 'keyboard' | 'pointer' | 'touch' | 'gamepad';
export type MenuDirection = 'up' | 'down' | 'left' | 'right';

export interface InputEvents extends Record<string, unknown> {
  pause: Record<string, never>;
  menu_nav: { dir: MenuDirection };
  menu_select: Record<string, never>;
  menu_back: Record<string, never>;
  any_gesture: Record<string, never>;
}

export interface JoystickState {
  active: boolean;
  baseX: number;
  baseY: number;
  stickX: number;
  stickY: number;
}

const KEY_VECTORS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export class InputManager {
  readonly events = new Emitter<InputEvents>();

  /** Latest desired heading in radians, or null before any steering input. */
  targetHeading: number | null = null;
  lastSource: InputSource = 'keyboard';
  pointerSteeringEnabled = true;
  /** Gameplay steering enabled (off while menus are open). */
  steering = false;

  readonly joystick: JoystickState = { active: false, baseX: 0, baseY: 0, stickX: 0, stickY: 0 };

  private pressed = new Set<string>();
  private pointerPos: { x: number; y: number } | null = null;
  private pointerFresh = false;
  private touchId: number | null = null;
  private gamepadButtons: boolean[] = [];
  private gamepadAxisLatch = { x: 0, y: 0 };
  private gestured = false;
  private detachFns: (() => void)[] = [];

  attach(host: HTMLElement): void {
    const listen = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      fn: (ev: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, options);
      this.detachFns.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    listen(window, 'keydown', (e) => this.onKeyDown(e));
    listen(window, 'keyup', (e) => this.pressed.delete(e.code));
    listen(window, 'blur', () => this.pressed.clear());

    listen(host, 'pointermove', (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerType === 'mouse') {
        this.pointerPos = { x: pe.clientX, y: pe.clientY };
        this.pointerFresh = true;
      }
    });
    listen(host, 'pointerdown', (e) => {
      const pe = e as PointerEvent;
      this.registerGesture();
      if (pe.pointerType === 'touch') {
        if (this.touchId === null && this.steering) {
          this.touchId = pe.pointerId;
          this.joystick.active = true;
          this.joystick.baseX = pe.clientX;
          this.joystick.baseY = pe.clientY;
          this.joystick.stickX = pe.clientX;
          this.joystick.stickY = pe.clientY;
        }
      } else {
        this.pointerPos = { x: pe.clientX, y: pe.clientY };
        this.pointerFresh = true;
      }
    });
    listen(host, 'pointermove', (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerId === this.touchId) {
        this.joystick.stickX = pe.clientX;
        this.joystick.stickY = pe.clientY;
        const dx = pe.clientX - this.joystick.baseX;
        const dy = pe.clientY - this.joystick.baseY;
        if (dx * dx + dy * dy > 18 * 18) {
          this.targetHeading = Math.atan2(dy, dx);
          this.lastSource = 'touch';
        }
        // A drifting anchor keeps long swipes comfortable.
        const dist = Math.hypot(dx, dy);
        const maxR = 70;
        if (dist > maxR) {
          const excess = dist - maxR;
          this.joystick.baseX += (dx / dist) * excess;
          this.joystick.baseY += (dy / dist) * excess;
        }
      }
    });
    const endTouch = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.pointerId === this.touchId) {
        this.touchId = null;
        this.joystick.active = false;
      }
    };
    listen(host, 'pointerup', endTouch);
    listen(host, 'pointercancel', endTouch);
    listen(window, 'gamepadconnected', () => {
      this.lastSource = 'gamepad';
    });
  }

  detach(): void {
    for (const fn of this.detachFns) fn();
    this.detachFns = [];
  }

  private registerGesture(): void {
    if (!this.gestured) {
      this.gestured = true;
      this.events.emit('any_gesture', {});
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.registerGesture();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.events.emit('pause', {});
      return;
    }
    if (KEY_VECTORS[e.code]) {
      this.pressed.add(e.code);
      this.lastSource = 'keyboard';
      if (this.steering) e.preventDefault();
    }
    // Menu navigation from arrows when not steering.
    if (!this.steering) {
      const navMap: Record<string, MenuDirection> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        KeyW: 'up',
        KeyS: 'down',
        KeyA: 'left',
        KeyD: 'right',
      };
      const dir = navMap[e.code];
      if (dir) this.events.emit('menu_nav', { dir });
      if (e.code === 'Enter' || e.code === 'Space') this.events.emit('menu_select', {});
      if (e.code === 'Backspace') this.events.emit('menu_back', {});
    }
  }

  /** Poll continuous sources; call once per frame. */
  update(viewWidth: number, viewHeight: number): void {
    // --- keyboard composite vector ---
    let kx = 0;
    let ky = 0;
    for (const code of this.pressed) {
      const v = KEY_VECTORS[code];
      if (v) {
        kx += v[0];
        ky += v[1];
      }
    }
    if (this.steering && (kx !== 0 || ky !== 0)) {
      this.targetHeading = Math.atan2(ky, kx);
      this.lastSource = 'keyboard';
    }

    // --- pointer steering (mouse): head chases the cursor ---
    if (
      this.steering &&
      this.pointerSteeringEnabled &&
      this.pointerFresh &&
      this.pointerPos &&
      this.lastSource !== 'keyboard' &&
      this.touchId === null
    ) {
      const cx = viewWidth / 2;
      const cy = viewHeight / 2;
      const dx = this.pointerPos.x - cx;
      const dy = this.pointerPos.y - cy;
      if (dx * dx + dy * dy > 46 * 46) {
        this.targetHeading = Math.atan2(dy, dx);
        this.lastSource = 'pointer';
      }
    }

    this.pollGamepad();
  }

  /** Mouse movement re-arms pointer steering after keyboard use. */
  notePointerActivity(): void {
    if (this.pointerPos) this.lastSource = 'pointer';
  }

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;

    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const mag = Math.hypot(ax, ay);
    if (this.steering && mag > 0.3) {
      this.targetHeading = Math.atan2(ay, ax);
      this.lastSource = 'gamepad';
    }

    // Edge-detect buttons.
    const justPressed = (i: number): boolean => {
      const now = pad.buttons[i]?.pressed ?? false;
      const was = this.gamepadButtons[i] ?? false;
      this.gamepadButtons[i] = now;
      return now && !was;
    };

    if (justPressed(9)) this.events.emit('pause', {}); // start
    if (justPressed(0)) {
      this.registerGesture();
      if (!this.steering) this.events.emit('menu_select', {});
    }
    if (justPressed(1) && !this.steering) this.events.emit('menu_back', {});

    if (!this.steering) {
      if (justPressed(12)) this.events.emit('menu_nav', { dir: 'up' });
      if (justPressed(13)) this.events.emit('menu_nav', { dir: 'down' });
      if (justPressed(14)) this.events.emit('menu_nav', { dir: 'left' });
      if (justPressed(15)) this.events.emit('menu_nav', { dir: 'right' });
      // Stick as d-pad with latch.
      const latch = this.gamepadAxisLatch;
      const stickNav = (value: number, prev: number, neg: MenuDirection, pos: MenuDirection) => {
        if (value < -0.6 && prev >= -0.6) this.events.emit('menu_nav', { dir: neg });
        if (value > 0.6 && prev <= 0.6) this.events.emit('menu_nav', { dir: pos });
      };
      stickNav(ax, latch.x, 'left', 'right');
      stickNav(ay, latch.y, 'up', 'down');
      latch.x = ax;
      latch.y = ay;
    }

    if (pad.buttons.some((b) => b.pressed)) this.registerGesture();
  }

  /**
   * Gamepad rumble only — device vibration is handled by the platform
   * haptics layer, so the two never fire together for one event.
   */
  vibrate(durationMs: number, weak: number, strong: number): void {
    const pads = navigator.getGamepads?.();
    const pad = pads ? Array.from(pads).find((p) => p && p.connected) : null;
    const actuator = (
      pad as unknown as {
        vibrationActuator?: {
          playEffect: (type: string, params: object) => Promise<unknown>;
        };
      } | null
    )?.vibrationActuator;
    if (!actuator) return;
    void actuator
      .playEffect('dual-rumble', {
        duration: durationMs,
        weakMagnitude: weak,
        strongMagnitude: strong,
      })
      .catch(() => undefined);
  }
}

export const input = new InputManager();
