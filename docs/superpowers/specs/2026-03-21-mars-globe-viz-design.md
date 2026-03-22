# Mars Globe Visualization — Design Spec

## Overview

Interactive 3D Mars globe visualization built with Vue 3 + Three.js, textured with real Mars imagery from the ArcGIS MDIM tile service. Features ~25-30 scientifically accurate landmarks (mission landing sites and major geological features) with fly-to camera animations and detail cards. Follows the architectural patterns established in the sibling `galaxies` project.

## Goals

- Scientifically grounded: real Mars imagery, IAU coordinate conventions, accurate landmark positions
- Cinematic realism: atmospheric limb glow, solar lighting, twinkling starfield
- Smooth interaction: orbit controls with damping, fly-to animations on landmark click
- Clean architecture: separated math/rendering/data layers, composable-based lifecycle

## Tech Stack

| Dependency | Version | Purpose |
|---|---|---|
| Vue 3 | ^3.5 | UI framework |
| Three.js | ^0.183 | 3D rendering |
| Vite | ^6.0 | Build tool |
| Tailwind CSS | ^4.0 | Styling |
| TypeScript | ~5.6 | Strict mode |
| Vitest | ^4.0 | Testing |

## Project Structure

```
mars/
├── public/
│   └── data/
│       └── landmarks.json
├── src/
│   ├── components/
│   │   ├── MarsCanvas.vue
│   │   ├── LandmarkTooltip.vue
│   │   ├── LandmarkInfoCard.vue
│   │   ├── LoadingOverlay.vue
│   │   └── AppHeader.vue
│   ├── composables/
│   │   ├── useThreeScene.ts
│   │   └── useMarsData.ts
│   ├── lib/
│   │   └── areography/
│   │       ├── coordinates.ts
│   │       ├── tiles.ts
│   │       └── index.ts
│   ├── three/
│   │   ├── MarsScene.ts
│   │   ├── MarsGlobe.ts
│   │   ├── MarsAtmosphere.ts
│   │   ├── MarsLandmarks.ts
│   │   ├── BackgroundStars.ts
│   │   ├── constants.ts
│   │   └── shaders/
│   │       ├── atmosphere.vert.glsl
│   │       └── atmosphere.frag.glsl
│   ├── types/
│   │   └── landmark.ts
│   ├── router/
│   │   └── index.ts
│   ├── views/
│   │   └── HomeView.vue
│   ├── App.vue
│   ├── main.ts
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
└── CLAUDE.md
```

## Data Model

### Landmark Types

```typescript
interface LandmarkBase {
  id: string
  name: string
  lat: number          // areocentric latitude (-90 to 90)
  lon: number          // areocentric longitude (-180 to 180, east-positive)
  description: string
  accent: string       // hex color for pin/label theming
}

interface LandingSite extends LandmarkBase {
  type: 'landing-site'
  mission: string
  agency: string       // NASA, ESA, Roscosmos, CNSA
  year: number
  status: 'operational' | 'completed' | 'failed' | 'lost'
}

interface GeologicalFeature extends LandmarkBase {
  type: 'geological'
  featureType: 'volcano' | 'canyon' | 'basin' | 'plain' | 'polar-cap'
  diameterKm?: number
  elevationKm?: number
}

type Landmark = LandingSite | GeologicalFeature
```

### Initial Dataset (~25-30 landmarks)

**Landing sites:** Viking 1 & 2, Pathfinder, Spirit, Opportunity, Phoenix, Curiosity, InSight, Perseverance, Mars 2, Mars 3, Mars 6, Schiaparelli, Beagle 2, Mars Polar Lander, Zhurong

**Geological features:** Olympus Mons, Valles Marineris, Hellas Basin, Tharsis Montes (Ascraeus, Pavonis, Arsia), Elysium Mons, Syrtis Major, Utopia Planitia, Acidalia Planitia, Argyre Basin, North Polar Cap, South Polar Cap

All coordinates use IAU areocentric convention. Data lives in `public/data/landmarks.json`, loaded at runtime by `useMarsData`.

## Three.js Scene Architecture

### Layer Composition

```
MarsScene (orchestrator)
  ├── MarsGlobe        (sphere + ArcGIS tile textures)
  ├── MarsAtmosphere   (Fresnel rim glow shader)
  ├── MarsLandmarks    (pins + CSS2D labels + hit testing)
  └── BackgroundStars  (decorative starfield)
```

Each layer implements a common interface:

```typescript
interface SceneLayer {
  readonly root: THREE.Object3D
  update(elapsed: number, delta: number): void
  dispose(): void
}
```

`MarsScene` is a thin orchestrator: creates the `THREE.Scene`, instantiates layers, adds each layer's `root` to the scene, and calls `update()` on each per frame. Owns the `THREE.Clock`.

### MarsGlobe

- `THREE.SphereGeometry` (64 segments) with `MeshStandardMaterial` (`roughness: 0.9`, `metalness: 0.0`)
- Tilted 25.19 degrees on its axis (real Mars obliquity)
- Texture: `CanvasTexture` composited from ArcGIS tiles (see Tile Strategy below)

### MarsAtmosphere

- Slightly larger sphere (1.5% bigger radius than globe)
- Custom `ShaderMaterial` with Fresnel-based rim glow:
  - Face-on angles: transparent
  - Grazing angles: orange-red glow (`vec3(0.8, 0.35, 0.1)` to `vec3(1.0, 0.6, 0.2)`)
  - Fresnel power: ~3.5
- Additive blending, no depth write, back-face culling

### MarsLandmarks

- Receives typed `Landmark[]` array
- For each landmark: converts `(lat, lon)` to 3D position via `areography/coordinates.ts`
- Creates small marker meshes (pins/rings) on the surface
- `CSS2DObject` labels for crisp text at any zoom
- Raycaster-based hit testing each frame for hover/click detection
- Exposes `flyTo(landmarkId)` which emits target position + zoom distance

### BackgroundStars

- Adapted from the galaxies project's `BackgroundStars` class
- Point cloud on a large sphere (`GLOBE_RADIUS * 80`), ~14000 points
- `RawShaderMaterial` with twinkle animation (per-star phase offset)
- Color variation: cool whites, warm whites, occasional yellow/orange

## ArcGIS Tile Strategy

### Service Details

- **Endpoint:** `https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer/tile/{z}/{y}/{x}?blankTile=false`
- **Tile size:** 512x512 pixels, JPEG format
- **Projection:** GCS_Mars_2000_Sphere (WKID 104971) — equirectangular/plate carree
- **Tile origin:** (-180, 90) — top-left of map
- **Zoom levels:** 0-17
- **Sphere radius:** 3,396,190 meters (IAU standard)
- **Source:** NASA/JPL/USGS/Esri

### Loading Strategy

**Base layer (startup):** Fetch all tiles at zoom level 2 (8 columns x 4 rows = 32 tiles). Composite onto a single offscreen canvas (4096x2048 pixels). Apply as `CanvasTexture` on the globe's `MeshStandardMaterial.map`. This provides immediate full-globe coverage at good quality.

**Detail layer (on zoom):** When the camera moves close enough to a region, fetch higher-resolution tiles (zoom 4-5) for the visible area and update the corresponding region of the canvas texture. Progressive enhancement — base layer always visible underneath.

### Tile Math

The equirectangular projection maps directly to standard spherical UV coordinates — no Mercator reprojection needed. `lib/areography/tiles.ts` handles:

- `tileUrl(z, y, x)` — builds the full URL
- `tileGridSize(zoom)` — columns and rows at a zoom level
- `latLonToTile(lat, lon, zoom)` — which tile contains a coordinate
- `compositeToCanvas(zoom)` — fetches all tiles in parallel, paints to offscreen canvas, returns `CanvasTexture`

## Lighting

- **`DirectionalLight`** — simulates the Sun, positioned to create natural shading across the globe surface. No hard terminator, just directional depth.
- **`AmbientLight`** — subtle fill so the dark side isn't pitch black (Mars has atmospheric scattering that prevents true darkness).
- Globe material: `MeshStandardMaterial` with `roughness: 0.9`, `metalness: 0.0` (rocky surface, no specular).

## Camera & Interaction

### Orbit Controls

- `OrbitControls` from `three/addons/controls/OrbitControls.js`
- Target: globe center `(0, 0, 0)`
- Min distance: `GLOBE_RADIUS * 1.2` (just above surface)
- Max distance: `GLOBE_RADIUS * 4` (full planet view)
- Damping: `enableDamping: true`, `dampingFactor: 0.05`
- Auto-rotate: `autoRotateSpeed: 0.3`, pauses on interaction, resumes after 3s idle

### Fly-To Animation

On landmark click:

1. Temporarily disable `OrbitControls`
2. Lerp camera position along a smooth arc toward the landmark's surface normal, at close zoom distance
3. Simultaneously lerp controls target to landmark's 3D position
4. Duration: ~1.5s, eased with smoothstep
5. Re-enable `OrbitControls` with new target on completion

Exposed as `flyTo(position: Vector3, distance: number): Promise<void>` on the `useThreeScene` composable.

### Reactive State

- `currentZoom: Ref<number>` — normalized 0-1 (far to close)
- `currentTarget: Ref<Vector3>` — current orbit center

## Component Architecture

### Vue Component Tree

```
App.vue
  ├── AppHeader.vue
  └── HomeView.vue
      ├── MarsCanvas.vue
      ├── LandmarkTooltip.vue
      ├── LandmarkInfoCard.vue
      └── LoadingOverlay.vue
```

### Event Flow

1. `MarsLandmarks` raycasts each frame against landmark pin meshes
2. **Hover** → emits `{ landmark, screenX, screenY }` up through `MarsCanvas` → `HomeView` shows `LandmarkTooltip`
3. **Click** → emits `{ landmark }` → `HomeView` shows `LandmarkInfoCard` + calls `useThreeScene().flyTo()` to animate camera
4. **Click elsewhere / Escape** → dismisses card, camera stays at current position

### MarsCanvas.vue

Thin wrapper following galaxies' `GalaxyCanvas.vue` pattern:
- Provides `<canvas>` element
- Calls `useThreeScene().init(canvas)` on mount
- Instantiates `MarsScene`, passes landmark data
- Exposes methods/events to parent via `defineExpose`
- Calls `dispose()` on all layers on unmount

## Constants

```typescript
// Mars physical constants (IAU 2015)
MARS_RADIUS_KM = 3389.5
MARS_OBLIQUITY_DEG = 25.19

// Scene units (1 unit = 1 Mars radius)
GLOBE_RADIUS = 10
ATMOSPHERE_RADIUS = GLOBE_RADIUS * 1.015
STAR_SPHERE_RADIUS = GLOBE_RADIUS * 80

// Camera
CAMERA_FOV = 45
CAMERA_NEAR = 0.1
CAMERA_FAR = STAR_SPHERE_RADIUS * 2
CAMERA_MIN_DISTANCE = GLOBE_RADIUS * 1.2
CAMERA_MAX_DISTANCE = GLOBE_RADIUS * 4
CAMERA_DEFAULT_DISTANCE = GLOBE_RADIUS * 2.8

// Atmosphere
ATMOSPHERE_COLOR = [0.8, 0.35, 0.1]
ATMOSPHERE_FRESNEL_POWER = 3.5

// Landmark accent colors
LANDMARK_COLORS = {
  'landing-site': '#4fc3f7',
  volcano: '#ff7043',
  canyon: '#ab47bc',
  basin: '#66bb6a',
  plain: '#ffca28',
  'polar-cap': '#e0e0e0',
}
```

## Areography Math Layer

`src/lib/areography/` — Mars-specific coordinate and tile math, mirroring galaxies' `lib/astronomy/`:

### coordinates.ts

- `latLonToCartesian(lat, lon, radius)` → `THREE.Vector3`
- `cartesianToLatLon(position, radius)` → `{ lat, lon }`
- `surfaceNormal(lat, lon)` → `THREE.Vector3` (unit normal for fly-to direction)

### tiles.ts

- `tileUrl(z, y, x)` → URL string
- `tileGridSize(zoom)` → `{ cols, rows }`
- `latLonToTile(lat, lon, zoom)` → `{ x, y }`
- `compositeToCanvas(zoom)` → `Promise<HTMLCanvasElement>`

## Testing Strategy

- **Unit tests** for `lib/areography/` — coordinate conversions, tile math
- **Shader compilation tests** — validate GLSL compiles (following galaxies' `shaders.test.ts` pattern)
- **Landmark data validation** — verify all coordinates fall within valid ranges, no duplicate IDs

## Out of Scope

- 2D map view / mini-map
- Phobos/Deimos moons
- Day/night terminator based on real solar position
- Terrain bump mapping / displacement
- Dust storm overlays
- Multiple routes/views (start with single HomeView)
- i18n (can be added later following galaxies' pattern)
- Analytics
