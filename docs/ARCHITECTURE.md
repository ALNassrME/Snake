# Umbra Vale — Architecture

## Design Goals

1. **Simulation is pure.** Everything under `src/game/` and `src/core/` is
   plain TypeScript with no DOM, Pixi or React imports — it runs headless in
   vitest and is deterministic under a seeded RNG.
2. **Presentation subscribes.** The renderer, the audio engine and the React
   UI all observe the simulation through typed event streams; nothing in the
   simulation knows they exist.
3. **Everything is generated.** Textures are painted into canvases at boot,
   music and SFX are synthesised in WebAudio, and world dressing is scattered
   from per-map seeds. Zero binary assets keeps the repo clean and the bundle
   small (~260 kB gzipped, fonts included).

## Module Map

```
src/
├── core/            Foundations (no game knowledge)
│   ├── events.ts        Typed event emitter (listener-safe dispatch)
│   ├── rng.ts           Seeded mulberry32 RNG + FNV string hashing
│   ├── mathUtils.ts     Vectors, damping, angles, formatting
│   ├── save.ts          Versioned profile persistence + migration
│   ├── settings.ts      Settings model, sanitising, persistence
│   └── profiler.ts      Rolling frame-time window → fps + health signal
│
├── game/            Pure simulation
│   ├── types.ts         Shared entity/config/event types
│   ├── snake.ts         Continuous steering head + arc-length body sampling
│   ├── combo.ts         Chain / multiplier / decay-window logic
│   ├── food.ts          Kind definitions + rejection-sampled spawning
│   ├── hazards.ts       Thorns / wisps / rifts with telegraph → active → fade
│   ├── boss.ts          The Vale Warden encounter state machine
│   ├── maps.ts          Three handcrafted arenas (palette, obstacles, seeds)
│   ├── modes.ts         Six mode configurations
│   ├── session.ts       GameSession — one run; owns all of the above
│   ├── progression.ts   XP curve, level math, run XP awards
│   ├── cosmetics.ts     Skin palettes + unlock rules
│   ├── achievements.ts  Deed definitions + evaluation
│   └── daily.ts         Date-seeded challenges, streak folding
│
├── render/          PixiJS presentation
│   ├── paint.ts         Canvas "brushes": glows, shaded discs, blobs, ridges
│   ├── textures.ts      One-time procedural texture library (tint-neutral)
│   ├── renderer.ts      GameRenderer — stage graph, bloom, lighting, quality
│   ├── camera.ts        Damped follow, look-ahead, zoom, trauma shake
│   ├── background.ts    Sky, stars, god-rays, parallax, fog, weather, day/night
│   ├── decor.ts         Ground, obstacles, plants, bellflowers, wildlife
│   ├── snakeView.ts     Segment sprites, heart-line glow, eyes, ghost trail
│   ├── entityViews.ts   Food / hazard / boss views synced by id
│   ├── particles.ts     Pooled particle system
│   └── popups.ts        World-space floating text
│
├── audio/           WebAudio
│   ├── audioEngine.ts   Context lifecycle, bus graph, IR reverb, panning
│   ├── music.ts         Generative themes + lookahead note scheduler
│   └── sfx.ts           Synthesised one-shot effects (rate-limited)
│
├── input/input.ts   Keyboard / pointer / touch joystick / gamepad → heading
│
├── app/             Composition
│   ├── store.ts         Tiny observable store + useSyncExternalStore hook
│   ├── controller.ts    The conductor: sessions ⇄ renderer ⇄ audio ⇄ profile
│   └── App.tsx          Screen router, overlays, gamepad focus navigation
│
└── ui/              React presentation (menus, HUD, overlays) + styles.css
```

## Key Decisions

### Snake movement
The head steers continuously: the target heading rotates toward input at a
capped turn rate, so keyboard input produces smooth arcs rather than snaps.
The body is *not* a spring chain — the head records a travel path and each
segment is placed by walking back along that path at fixed arc-length
intervals. This gives perfect, lag-free body-follow that tightens naturally in
corners, with zero oscillation artifacts.

### One session = one object graph
`GameSession` owns snake, foods, hazards, boss and score for a single run and
communicates only through `session.events`. The renderer and controller each
subscribe on attach and fully unsubscribe on teardown, which makes
restart/quit leak-free by construction.

### Rendering pipeline
Stage order: sky/parallax → world (camera-transformed: ground, decor, entities,
snake, particles, popups) → fog/weather overlay → night tint → vignette →
flash → bloom. Bloom is real: the frame is re-rendered into a quarter-resolution
render texture, blurred, and composited additively — cheap enough for mobile
and disabled automatically on the low quality tier.

The camera applies shake as decaying *trauma²* with smoothed noise (never
random jitter), plus a small roll on a pivoted wrapper container.

### Quality scaling
`profiler.ts` maintains a rolling frame-time window and a 0–1 "health" value.
On `auto`, the renderer steps between low/medium/high tiers (particle density,
glow stride, fog, ghosts, bloom, resolution cap) with hysteresis, so weak
devices settle instead of oscillating.

### Audio
A single `AudioContext` is unlocked on first gesture. Buses:
`master ← music/sfx (dry) ← reverb sends → convolver (generated impulse)`.
Music is rule-based, not sampled: each theme defines a chord progression,
tempo and layer levels; a 90 ms lookahead scheduler writes pads, plucks and
bells just-in-time, and a live `intensity` parameter (combo/difficulty/boss)
drives arp density, filter cutoff and swell. Positional SFX derive pan and
gain from camera-relative x.

### Persistence
Profile and settings are separate localStorage documents. `migrateProfile`
accepts *any* JSON shape and reconstructs a valid profile (unknown fields
dropped, missing fields defaulted, invariants re-established), so corrupted or
future saves can never brick the game.

### Daily challenges
The challenge is derived from `hash("umbravale-daily-" + YYYY-MM-DD)`, so
every player sees the same rite each day with no server. Streaks fold in at
run end: completing today continues yesterday's streak or starts a new one.

## Error Handling

- A window-level `error` handler surfaces a styled recovery screen ("The Vale
  Trembles") instead of a black canvas; saves are unaffected.
- Event listeners are individually try/caught so one failure can't stall the
  frame loop.
- Audio degrades to silence (never throws) when WebAudio is unavailable.
- Save/settings reads fall back to defaults on any parse failure.

## Testing

`tests/` covers the deterministic core: snake kinematics and self-collision,
combo timing, session lifecycle (countdown, wall death, zen invulnerability,
time-attack completion, seeded reproducibility), RNG determinism, save
migration, XP curve inversion, achievements and daily streak folding — 50
tests, all headless.

A Playwright smoke script (run during development against the production
build in real Chromium) verifies boot, menu navigation, gameplay, pause,
settings and the summary flow with zero console errors.
