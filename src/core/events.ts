/** Minimal, fully-typed event emitter used across game, render and audio layers. */
export type EventMap = Record<string, unknown>;

export class Emitter<T extends EventMap> {
  private listeners = new Map<keyof T, Set<(payload: never) => void>>();

  on<K extends keyof T>(event: K, fn: (payload: T[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as (payload: never) => void);
    return () => this.off(event, fn);
  }

  once<K extends keyof T>(event: K, fn: (payload: T[K]) => void): () => void {
    const off = this.on(event, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof T>(event: K, fn: (payload: T[K]) => void): void {
    this.listeners.get(event)?.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (payload: T[K]) => void)(payload);
      } catch (err) {
        // A misbehaving listener must never break the frame loop.
        console.error(`[events] listener for "${String(event)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
