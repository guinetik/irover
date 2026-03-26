# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Interactive 3D Mars globe visualization using real NASA/JPL/USGS imagery from ArcGIS MDIM tile service. Built with Vue 3 + Three.js + GLSL shaders. Features ~30 landmarks (mission landing sites and geological features) with fly-to camera animations and detail cards.

## Common Commands

```bash
npm run dev          # Vite dev server (port 9966)
npm run build        # vue-tsc type check + vite build
npm run test         # vitest run (all tests)
npm run test:watch   # vitest watch mode
```

## Architecture

### Directory Layout

```
src/
├── components/      # Vue components (MarsCanvas, tooltips, cards, overlays)
├── composables/     # useThreeScene (camera/controls/render loop), useMarsData (landmark loading)
├── lib/               # Domain math & rules (areography, weather/REMS, mission time, …)
├── lib/areography/    # Lat/lon, MDIM tiles, Google elevation quadtree paths
├── lib/weather/       # REMS site atmosphere (pure functions); composable owns Vue + storm FSM
├── lib/terrain/       # Golombek SFD, mineral catalog + spawn weights (`rocks.ts`); GL in `three/terrain/RockTypes`
├── lib/optical/       # ChemCam LIBS spectrum generation (`chemCamSpectrum.ts`)
├── lib/neutron/       # DAN passive sampling priors (`danSampling.ts`)
├── three/           # All Three.js scene code + GLSL shaders
├── types/           # Shared DTOs (landmarks, `terrain` site params, …)
└── views/           # HomeView (single view)
```

### Three.js Scene Architecture (`src/three/`)

Layered scene composition via `MarsScene` assembler:

1. **MarsGlobe** (`MarsGlobe.ts`) — Sphere textured with ArcGIS MDIM tiles composited at zoom level 2 (32 tiles → 4096x2048 equirectangular canvas).
2. **MarsAtmosphere** (`MarsAtmosphere.ts`) — Fresnel rim glow shader (orange-red atmospheric limb).
3. **MarsLandmarks** (`MarsLandmarks.ts`) — Landmark pins + CSS2D labels + raycaster hit testing.
4. **BackgroundStars** (`BackgroundStars.ts`) — 14k-point starfield with twinkle shader.

Each layer implements: `init(): Promise<void>`, `update(elapsed: number)`, `dispose()`.

### Composables

- **useThreeScene** — WebGL + CSS2D renderers, PerspectiveCamera, OrbitControls, fly-to animation, pointer tracking. Owns the render loop and clock.
- **useMarsData** — Loads `public/data/landmarks.json`, exposes typed `Landmark[]`.

### Key Conventions

- Path alias: `@/` maps to `src/`
- TypeScript strict mode, ES2020 target
- GLSL shaders imported via `?raw` suffix
- Areocentric coordinates: latitude (-90 to 90), longitude (-180 to 180, east-positive)
- Scene units: `GLOBE_RADIUS = 10` (1 unit ≈ 1 Mars radius conceptually)
- Mars obliquity: 25.19° axial tilt applied to globe group
- ArcGIS MDIM: `lib/areography/mdimTileService.ts` (512×512 JPEG, equirectangular, WKID 104971)
- In-game sol length: `lib/marsTimeConstants.ts` (used by `MarsSky` and HUD math)
