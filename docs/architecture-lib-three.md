# Layering: `lib` vs `three`

## `src/lib/`

Domain and simulation rules that should be testable without mounting a WebGL context or Vue components.

- **Time** — `marsTimeConstants.ts` defines sol length and HUD clock minutes; `missionTime.ts` converts mission language to scene seconds.
- **Areography** — `areography/` holds lat/lon math, MDIM globe tiling (`mdimTileService.ts`, `tiles.ts`), tangent-plane offsets, and Google Mars elevation quadtree paths (`googleMarsElevationQuadtree.ts`).
- **Weather (REMS)** — `weather/rems.ts` for deterministic site readouts, storm wind peaks, and compass labels; `useSiteRemsWeather` wires refs and the dust-storm FSM.
- **Terrain (rocks)** — `terrain/golombekDistribution.ts` is the Golombek–Rapp SFD + ejecta clustering; `terrain/rocks.ts` is the mineral catalog + spawn weights + `pickRockType` (no Three.js). `three/terrain/RockTypes.ts` re-exports `rocks` and adds `createRockGeometry` / `createRockMaterial`.
- **Gameplay helpers** — e.g. `skyCraneTouchdown.ts` for normalized crane/tether progress curves.
- **Optical (ChemCam)** — `optical/chemCamSpectrum.ts` for procedural LIBS-style peaks; types in `types/chemcam.ts`.
- **Neutron (DAN)** — `neutron/danSampling.ts` for passive hit probability, signal quality labels, and water-confirm odds.

`lib` must not import from `src/three/` (exception: `areography/coordinates.ts` still uses `THREE.Vector3` for globe math). Shared terrain DTOs: `src/types/terrain.ts` (`TerrainParams`, `TerrainFeatureType`).

`lib/math/simplexNoise.ts` — seeded 2D noise used by terrain heightmaps and rock placement (implementations in `three/terrain` import it).

`lib/terrain/detailTextures.ts` — deterministic orbital detail texture pairs for the terrain shader (shared by all generators).

## `src/three/`

Scene graph, materials, loaders, shaders, and per-frame object updates. Keeps I/O that is inherently browser/GL-specific (e.g. elevation tile fetch in `terrain/marsElevationTiles.ts`) while delegating pure geography to `lib/areography/` where appropriate.

## Imports

Prefer: `three` → `lib` and `composables` → `lib` + `three`. Avoid `lib` → `three` for constants-only concerns (those belong in `lib`).
