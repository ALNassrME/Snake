# 🐍 Umbra Vale

**A premium dark-fantasy snake odyssey for the web.**

Guide the last emberwyrm through the dusk-lit Vale — a hand-painted world of
glowing spores, singing bellflowers, drifting fog and patient old gods. Classic
snake, reimagined with fluid analog movement, cinematic camera work, a
generative orchestral-ambient soundtrack and full progression.

Built from scratch with **TypeScript + React + Vite + PixiJS**. Every texture,
every sound and every note of music is generated procedurally at runtime —
there are no binary art assets, no placeholders, and no external services.

---

## ✦ Features

**Gameplay**
- Fluid, analog snake movement with natural arc-length body physics
- Six modes: **Classic · Endless · Survival · Time Attack · Hardcore · Zen**
- Combo chains with score multipliers and tightening decay windows
- Boss encounters — banish **the Vale Warden** by devouring its five sigils
- Environmental hazards: bramble thorns, homing grave-wisps, erupting rifts
- Interactive world: bellflowers that chime, plants that bow as you pass,
  moths that scatter, fireflies, ambient veilbirds
- Cinematic camera: damped follow, velocity look-ahead, dynamic zoom,
  trauma-based screen shake, scripted boss focus

**World & Rendering**
- Three handcrafted arenas (the Miregloom Gardens, the Ashen Reach, the
  Lumen Deeps), each with its own palette, weather and architecture
- Procedurally painted textures — stones, crystals, pillars, plants, fog
- Multi-layer parallax silhouettes, volumetric fog, god-rays
- Full day/night cycle and dynamic weather (rain, spore drift, embers)
- Real render-texture bloom, additive glow layering, vignette, death desaturation
- Pooled particle system with a dozen bespoke effects
- Automatic quality scaling that sheds visual load to hold frame rate (60–144 fps)

**Audio**
- Fully generative soundtrack in D dorian: breathing drones, slow pads,
  pentatonic arp plucks, far bells — with distinct menu / explore / boss /
  zen / elegy themes and smooth crossfades
- Music intensity follows combos, difficulty and boss fights
- Synthesised SFX with stereo positioning, distance attenuation and a
  generated-impulse convolution reverb

**Progression**
- XP, 30 levels, seven unlockable wyrmskins with original lore
- 16 achievements (including secret deeds)
- Deterministic daily challenges with modifiers, streaks and streak rewards
- Versioned, migration-safe local save system

**Platform**
- Keyboard (8-way), mouse pointer-steering, touch with a drifting virtual
  joystick, and gamepad (including menu navigation and rumble)
- Installable PWA with offline support
- Accessibility: reduce motion, reduce flashes, colour-assist palettes,
  shake intensity, UI scaling
- Performance profiler overlay (FPS / frame-time), zero-error hardening

---

## Getting Started

Requires **Node.js ≥ 20**.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

### Build for production

```bash
npm run build      # typechecks, then bundles to dist/
npm run preview    # serve the production build locally
```

### Tests & checks

```bash
npm test           # vitest unit suite (snake physics, combo, session, saves, daily, progression)
npm run typecheck  # strict TypeScript, zero errors
```

---

## Deployment

The build output in `dist/` is fully static — deploy it to any static host.

**GitHub Pages**

```bash
npm run build
# publish dist/ to the gh-pages branch (e.g. with your CI of choice)
```

The Vite config uses `base: './'`, so the game works from any subpath.

**Netlify / Vercel / Cloudflare Pages**

- Build command: `npm run build`
- Output directory: `dist`

No environment variables, no server, no database. The service worker
(`public/sw.js`) precaches the shell and caches hashed assets on first play,
so the game keeps working offline after the first visit.

---

## Controls

| Input | Action |
| --- | --- |
| **WASD / Arrows** | Steer (8-way, smoothed) |
| **Mouse** | Pointer steering — the wyrm chases your cursor (toggleable) |
| **Touch** | Drag anywhere — drifting virtual joystick |
| **Gamepad** | Left stick steers · Start pauses · A/B navigate menus |
| **Esc / P** | Pause |

---

## Documentation

Architecture, module map and rendering/audio pipelines are documented in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

All code and generated art/audio in this repository are original work.
Bundled fonts (Cinzel, Spectral) are licensed under the
[SIL Open Font License](https://openfontlicense.org/).
