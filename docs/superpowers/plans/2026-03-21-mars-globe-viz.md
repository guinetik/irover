# Mars Globe Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive 3D Mars globe with ArcGIS MDIM tile textures, ~30 landmarks (landing sites + geological features), atmospheric glow, and fly-to camera animations.

**Architecture:** Layered Three.js scene composition (MarsGlobe, MarsAtmosphere, MarsLandmarks, BackgroundStars) orchestrated by MarsScene, with Vue 3 composables for camera/data lifecycle. Separated areography math layer for coordinates and tile math. Uses @threejs-fundamentals, @threejs-shaders, @threejs-lighting, @threejs-interaction skills.

**Tech Stack:** Vue 3.5, Three.js 0.183, Vite 6, Tailwind 4, TypeScript 5.6 strict, Vitest 4

**Spec:** `docs/superpowers/specs/2026-03-21-mars-globe-viz-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and scripts |
| `vite.config.ts` | Vite + Vue + Tailwind, GLSL raw imports, manual chunks |
| `tsconfig.json` | Project references |
| `tsconfig.app.json` | App compiler options, `@/` alias, GLSL module declarations |
| `tsconfig.node.json` | Vite config compiler options |
| `index.html` | Entry point |
| `src/main.ts` | Vue app bootstrap |
| `src/App.vue` | Root component (AppHeader + HomeView) |
| `src/vite-env.d.ts` | Vite client types + `*.glsl?raw` module declaration |
| `src/assets/main.css` | Tailwind import + global styles |
| `src/types/landmark.ts` | Landmark, LandingSite, GeologicalFeature interfaces |
| `src/lib/areography/coordinates.ts` | lat/lon <-> cartesian, surface normal |
| `src/lib/areography/tiles.ts` | ArcGIS tile URL builder, grid math, canvas compositor |
| `src/lib/areography/index.ts` | Re-exports |
| `src/three/SceneLayer.ts` | SceneLayer interface (root, init, update, dispose) |
| `src/three/constants.ts` | Mars physical constants, camera defaults, landmark colors |
| `src/three/BackgroundStars.ts` | Starfield point cloud with twinkle shader |
| `src/three/shaders/atmosphere.vert.glsl` | Atmosphere vertex shader |
| `src/three/shaders/atmosphere.frag.glsl` | Atmosphere fragment shader |
| `src/three/MarsAtmosphere.ts` | Atmosphere glow sphere |
| `src/three/MarsGlobe.ts` | Mars sphere + tile texture management |
| `src/three/MarsLandmarks.ts` | Landmark pins, CSS2D labels, raycaster hit testing |
| `src/three/MarsScene.ts` | Scene assembler, delegates to layers |
| `src/composables/useThreeScene.ts` | Renderer, camera, OrbitControls, CSS2DRenderer, flyTo, animation loop |
| `src/composables/useMarsData.ts` | Loads landmarks.json, returns typed array |
| `src/components/MarsCanvas.vue` | Canvas wrapper, wires scene + composables |
| `src/components/AppHeader.vue` | Site title bar |
| `src/components/LoadingOverlay.vue` | Tile loading progress |
| `src/components/LandmarkTooltip.vue` | Hover tooltip |
| `src/components/LandmarkInfoCard.vue` | Click detail card |
| `src/views/HomeView.vue` | Main view, composes all components |
| `public/data/landmarks.json` | Landmark dataset (~30 entries) |
| `src/lib/areography/__tests__/coordinates.test.ts` | Coordinate math tests |
| `src/lib/areography/__tests__/tiles.test.ts` | Tile math tests |
| `src/three/__tests__/shaders.test.ts` | GLSL compilation tests |
| `CLAUDE.md` | Project documentation for Claude Code |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.ts`, `src/App.vue`, `src/vite-env.d.ts`, `src/assets/main.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mars",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "three": "^0.183.0",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/three": "^0.183.0",
    "@vitejs/plugin-vue": "^5.2.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.6.0",
    "vite": "^6.0.0",
    "vitest": "^4.0.18",
    "vue-tsc": "^2.2.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) return 'three'
            if (id.includes('vue')) return 'vue-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 9966,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Create tsconfig files**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mars — Interactive Globe Visualization</title>
    <meta name="description" content="Explore Mars in 3D with real NASA/JPL imagery, mission landing sites, and major geological features." />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.glsl?raw' {
  const value: string
  export default value
}
```

- [ ] **Step 6: Create src/assets/main.css**

```css
@import "tailwindcss";

html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 7: Create src/main.ts**

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
app.mount('#app')
```

- [ ] **Step 8: Create src/App.vue (minimal placeholder)**

```vue
<template>
  <div class="w-full h-full">
    <p class="text-white p-4">Mars Globe — scaffolding works</p>
  </div>
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 9: Install dependencies and verify dev server starts**

Run: `npm install && npm run dev`
Expected: Vite dev server starts on port 9966, page shows "Mars Globe — scaffolding works"

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "scaffold: Vue 3 + Vite + Tailwind 4 + Three.js project"
```

---

### Task 2: Types & Constants

**Files:**
- Create: `src/types/landmark.ts`, `src/three/SceneLayer.ts`, `src/three/constants.ts`

- [ ] **Step 1: Create src/types/landmark.ts**

```typescript
export interface LandmarkBase {
  id: string
  name: string
  lat: number
  lon: number
  description: string
  accent: string
}

export interface LandingSite extends LandmarkBase {
  type: 'landing-site'
  mission: string
  agency: string
  year: number
  status: 'operational' | 'completed' | 'failed' | 'lost'
}

export interface GeologicalFeature extends LandmarkBase {
  type: 'geological'
  featureType: 'volcano' | 'canyon' | 'basin' | 'plain' | 'polar-cap'
  diameterKm?: number
  elevationKm?: number
}

export type Landmark = LandingSite | GeologicalFeature

export interface LandmarkHoverEvent {
  landmark: Landmark
  screenX: number
  screenY: number
}
```

- [ ] **Step 2: Create src/three/SceneLayer.ts**

```typescript
// src/three/SceneLayer.ts
import type * as THREE from 'three'

/**
 * Common interface for all scene layers.
 * Each layer owns a root Object3D that gets added to the scene.
 */
export interface SceneLayer {
  readonly root: THREE.Object3D
  init(): Promise<void>
  update(elapsed: number): void
  dispose(): void
}
```

- [ ] **Step 3: Create src/three/constants.ts**

```typescript
/** Mars physical constants (IAU 2015) */
export const MARS_RADIUS_KM = 3389.5
export const MARS_OBLIQUITY_DEG = 25.19
export const MARS_OBLIQUITY_RAD = MARS_OBLIQUITY_DEG * Math.PI / 180

/** Scene units: 1 unit = 1 Mars radius conceptually */
export const GLOBE_RADIUS = 10
export const GLOBE_SEGMENTS = 64
export const ATMOSPHERE_RADIUS = GLOBE_RADIUS * 1.015
export const STAR_SPHERE_RADIUS = GLOBE_RADIUS * 80

/** Camera */
export const CAMERA_FOV = 45
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = STAR_SPHERE_RADIUS * 2
export const CAMERA_MIN_DISTANCE = GLOBE_RADIUS * 1.2
export const CAMERA_MAX_DISTANCE = GLOBE_RADIUS * 4
export const CAMERA_DEFAULT_DISTANCE = GLOBE_RADIUS * 2.8

/** Auto-rotate */
export const AUTO_ROTATE_SPEED = 0.3
export const AUTO_ROTATE_RESUME_DELAY = 3000

/** Fly-to animation */
export const FLY_TO_DURATION = 1.5
export const FLY_TO_DISTANCE = GLOBE_RADIUS * 1.6

/** Atmosphere shader */
export const ATMOSPHERE_COLOR: [number, number, number] = [0.8, 0.35, 0.1]
export const ATMOSPHERE_FRESNEL_POWER = 3.5

/** ArcGIS MDIM tile service */
export const TILE_SERVICE_BASE = 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer/tile'
export const TILE_SIZE = 512
export const TILE_BASE_ZOOM = 2

/** Landmark accent colors by type */
export const LANDMARK_COLORS: Record<string, string> = {
  'landing-site': '#4fc3f7',
  volcano: '#ff7043',
  canyon: '#ab47bc',
  basin: '#66bb6a',
  plain: '#ffca28',
  'polar-cap': '#e0e0e0',
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/landmark.ts src/three/SceneLayer.ts src/three/constants.ts
git commit -m "feat: add landmark types, SceneLayer interface, and Mars constants"
```

---

### Task 3: Areography Math Layer — Coordinates

**Files:**
- Create: `src/lib/areography/coordinates.ts`, `src/lib/areography/index.ts`, `src/lib/areography/__tests__/coordinates.test.ts`

- [ ] **Step 1: Write coordinate math tests**

```typescript
// src/lib/areography/__tests__/coordinates.test.ts
import { describe, it, expect } from 'vitest'
import { latLonToCartesian, cartesianToLatLon, surfaceNormal } from '../coordinates'

describe('latLonToCartesian', () => {
  it('places north pole at (0, radius, 0)', () => {
    const v = latLonToCartesian(90, 0, 10)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(10, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('places south pole at (0, -radius, 0)', () => {
    const v = latLonToCartesian(-90, 0, 10)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(-10, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('places equator/prime meridian at (0, 0, radius)', () => {
    const v = latLonToCartesian(0, 0, 10)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(10, 5)
  })

  it('places equator/90E at (radius, 0, 0)', () => {
    const v = latLonToCartesian(0, 90, 10)
    expect(v.x).toBeCloseTo(10, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(0, 4)
  })
})

describe('cartesianToLatLon', () => {
  it('round-trips through latLonToCartesian', () => {
    const testCases = [
      { lat: 45, lon: 30 },
      { lat: -23.5, lon: -46.6 },
      { lat: 0, lon: 180 },
      { lat: 89, lon: -120 },
    ]
    for (const { lat, lon } of testCases) {
      const v = latLonToCartesian(lat, lon, 10)
      const result = cartesianToLatLon(v, 10)
      expect(result.lat).toBeCloseTo(lat, 3)
      expect(result.lon).toBeCloseTo(lon, 3)
    }
  })
})

describe('surfaceNormal', () => {
  it('returns a unit vector', () => {
    const n = surfaceNormal(45, 90)
    expect(n.length()).toBeCloseTo(1, 5)
  })

  it('points outward from the sphere center', () => {
    const n = surfaceNormal(0, 0)
    expect(n.z).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/areography/__tests__/coordinates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement coordinates.ts**

```typescript
// src/lib/areography/coordinates.ts
import * as THREE from 'three'

/**
 * Convert areocentric latitude/longitude to 3D cartesian coordinates.
 * Y-up convention: lat 90 = north pole = +Y, lon 0 = +Z (prime meridian).
 */
export function latLonToCartesian(lat: number, lon: number, radius: number): THREE.Vector3 {
  const latRad = lat * THREE.MathUtils.DEG2RAD
  const lonRad = lon * THREE.MathUtils.DEG2RAD
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lonRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lonRad),
  )
}

/**
 * Convert 3D cartesian position back to areocentric latitude/longitude.
 */
export function cartesianToLatLon(position: THREE.Vector3, radius: number): { lat: number; lon: number } {
  const lat = Math.asin(position.y / radius) * THREE.MathUtils.RAD2DEG
  const lon = Math.atan2(position.x, position.z) * THREE.MathUtils.RAD2DEG
  return { lat, lon }
}

/**
 * Unit surface normal at a given lat/lon (outward-pointing).
 */
export function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  return latLonToCartesian(lat, lon, 1)
}
```

- [ ] **Step 4: Create index.ts re-export**

```typescript
// src/lib/areography/index.ts
export { latLonToCartesian, cartesianToLatLon, surfaceNormal } from './coordinates'
// tiles re-export added in Task 4 after tiles.ts is created
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/areography/__tests__/coordinates.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/areography/
git commit -m "feat: areography coordinate math with tests"
```

---

### Task 4: Areography Math Layer — Tiles

**Files:**
- Create: `src/lib/areography/tiles.ts`, `src/lib/areography/__tests__/tiles.test.ts`
- Modify: `src/lib/areography/index.ts` (uncomment tiles re-export)

- [ ] **Step 1: Write tile math tests**

```typescript
// src/lib/areography/__tests__/tiles.test.ts
import { describe, it, expect } from 'vitest'
import { tileUrl, tileGridSize, latLonToTile } from '../tiles'

describe('tileUrl', () => {
  it('builds correct ArcGIS tile URL', () => {
    const url = tileUrl(5, 23, 22)
    expect(url).toBe(
      'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer/tile/5/23/22?blankTile=false'
    )
  })
})

describe('tileGridSize', () => {
  it('returns 1x1 at zoom 0 (single 512px tile for 360x180 is not enough — actually 2x1)', () => {
    // At zoom 0: resolution 0.3515625 deg/px, tile = 512px = 180deg
    // 360/180 = 2 cols, 180/180 = 1 row
    const { cols, rows } = tileGridSize(0)
    expect(cols).toBe(2)
    expect(rows).toBe(1)
  })

  it('returns 8x4 at zoom 2', () => {
    const { cols, rows } = tileGridSize(2)
    expect(cols).toBe(8)
    expect(rows).toBe(4)
  })

  it('returns 16x8 at zoom 3', () => {
    const { cols, rows } = tileGridSize(3)
    expect(cols).toBe(16)
    expect(rows).toBe(8)
  })
})

describe('latLonToTile', () => {
  it('maps north-west corner to tile (0, 0)', () => {
    // Tile origin is (-180, 90) — top-left
    const { x, y } = latLonToTile(89, -179, 2)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('maps equator/prime meridian to correct tile', () => {
    const { x, y } = latLonToTile(0, 0, 2)
    // At zoom 2: each tile covers 45 deg lon, 45 deg lat
    // lon 0 → col 4 (from -180), lat 0 → row 2 (from 90)
    expect(x).toBe(4)
    expect(y).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/areography/__tests__/tiles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tiles.ts**

```typescript
// src/lib/areography/tiles.ts
import { TILE_SERVICE_BASE, TILE_SIZE } from '@/three/constants'

/**
 * Build ArcGIS MDIM tile URL.
 */
export function tileUrl(z: number, y: number, x: number): string {
  return `${TILE_SERVICE_BASE}/${z}/${y}/${x}?blankTile=false`
}

/**
 * Number of tile columns and rows at a given zoom level.
 * At zoom 0: resolution = 0.3515625 deg/px, tile = 512px = 180 deg.
 * Full extent is 360x180 degrees.
 */
export function tileGridSize(zoom: number): { cols: number; rows: number } {
  const cols = 2 * Math.pow(2, zoom)
  const rows = 1 * Math.pow(2, zoom)
  return { cols, rows }
}

/**
 * Convert areocentric lat/lon to tile column/row at a given zoom level.
 * Tile origin is (-180, 90) — top-left of the map.
 */
export function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const { cols, rows } = tileGridSize(zoom)
  const tileLonDeg = 360 / cols
  const tileLatDeg = 180 / rows
  const x = Math.floor((lon + 180) / tileLonDeg)
  const y = Math.floor((90 - lat) / tileLatDeg)
  return {
    x: Math.max(0, Math.min(cols - 1, x)),
    y: Math.max(0, Math.min(rows - 1, y)),
  }
}

/**
 * Fetch all tiles at a zoom level and composite onto an offscreen canvas.
 * Returns the canvas (caller wraps in THREE.CanvasTexture).
 * Calls onProgress(loaded, total) for each tile fetched.
 */
export async function compositeToCanvas(
  zoom: number,
  onProgress?: (loaded: number, total: number) => void,
): Promise<HTMLCanvasElement> {
  const { cols, rows } = tileGridSize(zoom)
  const canvas = document.createElement('canvas')
  canvas.width = cols * TILE_SIZE
  canvas.height = rows * TILE_SIZE
  const ctx = canvas.getContext('2d')!

  const total = cols * rows
  let loaded = 0

  const promises: Promise<void>[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const url = tileUrl(zoom, y, x)
      const tileX = x
      const tileY = y
      promises.push(
        loadImage(url)
          .then((img) => {
            ctx.drawImage(img, tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          })
          .catch(() => {
            // Failed tile — leave transparent, base layer shows through
          })
          .finally(() => {
            loaded++
            onProgress?.(loaded, total)
          })
      )
    }
  }

  await Promise.all(promises)
  return canvas
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}
```

- [ ] **Step 4: Update index.ts to uncomment tiles re-export**

Ensure `src/lib/areography/index.ts` exports both modules:

```typescript
export { latLonToCartesian, cartesianToLatLon, surfaceNormal } from './coordinates'
export { tileUrl, tileGridSize, latLonToTile, compositeToCanvas } from './tiles'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/areography/__tests__/tiles.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/areography/
git commit -m "feat: ArcGIS tile math with URL builder and canvas compositor"
```

---

### Task 5: BackgroundStars

**Files:**
- Create: `src/three/BackgroundStars.ts`

- [ ] **Step 1: Implement BackgroundStars (adapted from galaxies)**

```typescript
// src/three/BackgroundStars.ts
import * as THREE from 'three'
import type { SceneLayer } from './SceneLayer'
import { STAR_SPHERE_RADIUS } from './constants'

const STAR_COUNT = 14000
const POINT_SIZE = 1.4

export class BackgroundStars implements SceneLayer {
  readonly root: THREE.Points

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3)
    const sizes = new Float32Array(STAR_COUNT)
    const opacities = new Float32Array(STAR_COUNT)
    const colors = new Float32Array(STAR_COUNT * 3)
    const phases = new Float32Array(STAR_COUNT)

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = STAR_SPHERE_RADIUS * Math.cos(phi)
      positions[i * 3 + 2] = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)

      sizes[i] = POINT_SIZE * (0.5 + Math.random() * 0.8)
      opacities[i] = 0.58 + Math.random() * 0.38
      phases[i] = Math.random() * Math.PI * 2

      const t = Math.random()
      if (t < 0.5) {
        colors[i * 3] = 0.85 + Math.random() * 0.12
        colors[i * 3 + 1] = 0.88 + Math.random() * 0.10
        colors[i * 3 + 2] = 0.95 + Math.random() * 0.05
      } else if (t < 0.85) {
        colors[i * 3] = 0.95 + Math.random() * 0.05
        colors[i * 3 + 1] = 0.90 + Math.random() * 0.08
        colors[i * 3 + 2] = 0.80 + Math.random() * 0.12
      } else {
        colors[i * 3] = 0.98 + Math.random() * 0.02
        colors[i * 3 + 1] = 0.92 + Math.random() * 0.06
        colors[i * 3 + 2] = 0.75 + Math.random() * 0.15
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

    const material = new THREE.RawShaderMaterial({
      vertexShader: /* glsl */ `
        precision mediump float;
        attribute float aSize;
        attribute float aOpacity;
        attribute vec3 aColor;
        attribute float aPhase;
        attribute vec3 position;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        varying float vOpacity;
        varying vec3 vColor;

        void main() {
          vColor = aColor;
          float twinkle = sin(uTime * 1.8 + aPhase) * 0.32 + 0.68;
          vOpacity = aOpacity * twinkle;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (620.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying float vOpacity;
        varying vec3 vColor;

        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, dist) * vOpacity;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
      },
    })

    this.root = new THREE.Points(geometry, material)
    this.root.frustumCulled = false
  }

  async init(): Promise<void> {
    // No async setup needed
  }

  update(elapsed: number): void {
    ;(this.root.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed
  }

  dispose(): void {
    this.root.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/BackgroundStars.ts
git commit -m "feat: background stars with twinkle shader"
```

---

### Task 6: Atmosphere Shader & MarsAtmosphere

**Files:**
- Create: `src/three/shaders/atmosphere.vert.glsl`, `src/three/shaders/atmosphere.frag.glsl`, `src/three/MarsAtmosphere.ts`

- [ ] **Step 1: Create atmosphere vertex shader**

Use @threejs-shaders Fresnel pattern. File: `src/three/shaders/atmosphere.vert.glsl`

```glsl
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

- [ ] **Step 2: Create atmosphere fragment shader**

File: `src/three/shaders/atmosphere.frag.glsl`

```glsl
uniform vec3 uAtmosphereColor;
uniform float uFresnelPower;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - dot(viewDirection, vNormal), uFresnelPower);

  // Warm gradient from deep orange at edge to lighter orange-yellow
  vec3 innerColor = uAtmosphereColor;
  vec3 outerColor = vec3(1.0, 0.6, 0.2);
  vec3 color = mix(innerColor, outerColor, fresnel);

  gl_FragColor = vec4(color, fresnel * 0.8);
}
```

- [ ] **Step 3: Implement MarsAtmosphere.ts**

```typescript
// src/three/MarsAtmosphere.ts
import * as THREE from 'three'
import type { SceneLayer } from './SceneLayer'
import { ATMOSPHERE_RADIUS, GLOBE_SEGMENTS, ATMOSPHERE_COLOR, ATMOSPHERE_FRESNEL_POWER } from './constants'
import atmosphereVertexShader from './shaders/atmosphere.vert.glsl?raw'
import atmosphereFragmentShader from './shaders/atmosphere.frag.glsl?raw'

export class MarsAtmosphere implements SceneLayer {
  readonly root: THREE.Mesh

  constructor() {
    const geometry = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, GLOBE_SEGMENTS, GLOBE_SEGMENTS)
    const material = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uAtmosphereColor: { value: new THREE.Color(...ATMOSPHERE_COLOR) },
        uFresnelPower: { value: ATMOSPHERE_FRESNEL_POWER },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    })

    this.root = new THREE.Mesh(geometry, material)
  }

  async init(): Promise<void> {}

  update(_elapsed: number): void {}

  dispose(): void {
    this.root.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/three/shaders/ src/three/MarsAtmosphere.ts
git commit -m "feat: atmospheric limb glow with Fresnel shader"
```

---

### Task 7: MarsGlobe — Sphere + Tile Textures

**Files:**
- Create: `src/three/MarsGlobe.ts`

- [ ] **Step 1: Implement MarsGlobe.ts**

```typescript
// src/three/MarsGlobe.ts
import * as THREE from 'three'
import type { SceneLayer } from './SceneLayer'
import {
  GLOBE_RADIUS,
  GLOBE_SEGMENTS,
  TILE_BASE_ZOOM,
} from './constants'
import { compositeToCanvas } from '@/lib/areography/tiles'

export class MarsGlobe implements SceneLayer {
  readonly root: THREE.Mesh
  private readonly material: THREE.MeshStandardMaterial
  private texture: THREE.CanvasTexture | null = null
  private onProgress?: (loaded: number, total: number) => void

  constructor(onProgress?: (loaded: number, total: number) => void) {
    this.onProgress = onProgress

    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.0,
      color: 0x886655, // Fallback color before texture loads
    })

    const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, GLOBE_SEGMENTS, GLOBE_SEGMENTS)
    this.root = new THREE.Mesh(geometry, this.material)
  }

  async init(): Promise<void> {
    const canvas = await compositeToCanvas(TILE_BASE_ZOOM, this.onProgress)
    this.texture = new THREE.CanvasTexture(canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.material.map = this.texture
    this.material.color.set(0xffffff) // Remove fallback tint
    this.material.needsUpdate = true
  }

  update(_elapsed: number): void {}

  dispose(): void {
    this.root.geometry.dispose()
    this.material.dispose()
    this.texture?.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/MarsGlobe.ts
git commit -m "feat: Mars globe sphere with ArcGIS tile texture loading"
```

---

### Task 8: Landmark Data

**Files:**
- Create: `public/data/landmarks.json`, `src/composables/useMarsData.ts`

- [ ] **Step 1: Create landmarks.json**

Research and compile ~30 landmarks with accurate IAU areocentric coordinates. File: `public/data/landmarks.json`

The JSON should be an array of `Landmark` objects matching the types in `src/types/landmark.ts`. Include all landing sites and geological features listed in the spec. Use scientifically accurate coordinates from IAU/USGS sources.

Key coordinates to verify:
- Olympus Mons: lat 18.65, lon -133.8
- Valles Marineris: lat -14.0, lon -59.2
- Hellas Basin: lat -42.7, lon 70.0
- Curiosity (Gale Crater): lat -4.6, lon 137.4
- Perseverance (Jezero Crater): lat 18.4, lon 77.7

- [ ] **Step 2: Implement useMarsData composable**

```typescript
// src/composables/useMarsData.ts
import { ref, readonly } from 'vue'
import type { Landmark } from '@/types/landmark'

const landmarks = ref<Landmark[]>([])
const isLoading = ref(false)
let loaded = false

export function useMarsData() {
  async function loadLandmarks(): Promise<Landmark[]> {
    if (loaded) return landmarks.value
    isLoading.value = true
    try {
      const response = await fetch('/data/landmarks.json')
      landmarks.value = await response.json()
      loaded = true
    } finally {
      isLoading.value = false
    }
    return landmarks.value
  }

  return {
    landmarks: readonly(landmarks),
    isLoading: readonly(isLoading),
    loadLandmarks,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/data/landmarks.json src/composables/useMarsData.ts
git commit -m "feat: landmark dataset (~30 sites) and useMarsData composable"
```

---

### Task 9: MarsLandmarks — Pins, Labels, Hit Testing

**Files:**
- Create: `src/three/MarsLandmarks.ts`

- [ ] **Step 1: Implement MarsLandmarks.ts**

```typescript
// src/three/MarsLandmarks.ts
import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { SceneLayer } from './SceneLayer'
import type { Landmark, LandmarkHoverEvent } from '@/types/landmark'
import { latLonToCartesian, surfaceNormal } from '@/lib/areography/coordinates'
import { GLOBE_RADIUS, FLY_TO_DISTANCE } from './constants'

const PIN_RADIUS = 0.06
const PIN_HEIGHT = 0.15
const PICK_THROTTLE_FRAMES = 3

export class MarsLandmarks implements SceneLayer {
  readonly root: THREE.Group
  private readonly raycaster = new THREE.Raycaster()
  private readonly pinMeshes: THREE.Mesh[] = []
  private readonly landmarkMap = new Map<THREE.Mesh, Landmark>()
  private pinGeometry: THREE.SphereGeometry | null = null
  private frameCount = 0
  private hoveredMesh: THREE.Mesh | null = null

  onHover: ((event: LandmarkHoverEvent | null) => void) | null = null
  onClick: ((landmark: Landmark) => void) | null = null

  constructor(private readonly landmarks: Landmark[]) {
    this.root = new THREE.Group()
  }

  async init(): Promise<void> {
    this.pinGeometry = new THREE.SphereGeometry(PIN_RADIUS, 8, 8)
    const pinGeometry = this.pinGeometry

    for (const landmark of this.landmarks) {
      const position = latLonToCartesian(landmark.lat, landmark.lon, GLOBE_RADIUS * 1.005)
      const color = new THREE.Color(landmark.accent)

      // Pin mesh
      const material = new THREE.MeshBasicMaterial({ color })
      const pin = new THREE.Mesh(pinGeometry, material)
      pin.position.copy(position)
      this.root.add(pin)
      this.pinMeshes.push(pin)
      this.landmarkMap.set(pin, landmark)

      // CSS2D label
      const labelDiv = document.createElement('div')
      labelDiv.className = 'landmark-label'
      labelDiv.textContent = landmark.name
      labelDiv.style.color = landmark.accent
      labelDiv.style.fontSize = '11px'
      labelDiv.style.fontWeight = '400'
      labelDiv.style.letterSpacing = '0.05em'
      labelDiv.style.textShadow = '0 1px 4px rgba(0,0,0,0.8)'
      labelDiv.style.pointerEvents = 'none'
      labelDiv.style.whiteSpace = 'nowrap'

      const label = new CSS2DObject(labelDiv)
      const normal = surfaceNormal(landmark.lat, landmark.lon)
      label.position.copy(position).addScaledVector(normal, PIN_HEIGHT)
      this.root.add(label)
    }
  }

  /**
   * Resolve a landmark ID to a fly-to target.
   */
  getLandmarkTarget(id: string): { position: THREE.Vector3; distance: number } | null {
    const landmark = this.landmarks.find(l => l.id === id)
    if (!landmark) return null
    const position = latLonToCartesian(landmark.lat, landmark.lon, GLOBE_RADIUS)
    return { position, distance: FLY_TO_DISTANCE }
  }

  /**
   * Run throttled raycaster pick test.
   */
  pick(pointer: THREE.Vector2, camera: THREE.Camera): void {
    this.frameCount++
    if (this.frameCount % PICK_THROTTLE_FRAMES !== 0) return

    this.raycaster.setFromCamera(pointer, camera)
    const intersects = this.raycaster.intersectObjects(this.pinMeshes)

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      if (mesh !== this.hoveredMesh) {
        this.hoveredMesh = mesh
        const landmark = this.landmarkMap.get(mesh)!
        const screenPos = intersects[0].point.clone().project(camera)
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight
        this.onHover?.({ landmark, screenX: x, screenY: y })
      }
    } else if (this.hoveredMesh) {
      this.hoveredMesh = null
      this.onHover?.(null)
    }
  }

  /**
   * Handle click — check if pointer hits a landmark pin.
   */
  clickTest(pointer: THREE.Vector2, camera: THREE.Camera): void {
    this.raycaster.setFromCamera(pointer, camera)
    const intersects = this.raycaster.intersectObjects(this.pinMeshes)
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      const landmark = this.landmarkMap.get(mesh)
      if (landmark) this.onClick?.(landmark)
    }
  }

  update(_elapsed: number): void {}

  dispose(): void {
    this.pinGeometry?.dispose()
    for (const mesh of this.pinMeshes) {
      ;(mesh.material as THREE.MeshBasicMaterial).dispose()
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/MarsLandmarks.ts
git commit -m "feat: landmark pins with CSS2D labels and raycaster hit testing"
```

---

### Task 10: MarsScene Assembler

**Files:**
- Create: `src/three/MarsScene.ts`

- [ ] **Step 1: Implement MarsScene.ts**

```typescript
// src/three/MarsScene.ts
import * as THREE from 'three'
import { MarsGlobe } from './MarsGlobe'
import { MarsAtmosphere } from './MarsAtmosphere'
import { MarsLandmarks } from './MarsLandmarks'
import { BackgroundStars } from './BackgroundStars'
import { MARS_OBLIQUITY_RAD } from './constants'
import type { Landmark } from '@/types/landmark'

export class MarsScene {
  readonly scene: THREE.Scene
  readonly globe: MarsGlobe
  readonly atmosphere: MarsAtmosphere
  readonly landmarks: MarsLandmarks
  readonly stars: BackgroundStars

  constructor(
    landmarkData: Landmark[],
    onTileProgress?: (loaded: number, total: number) => void,
  ) {
    this.scene = new THREE.Scene()

    this.globe = new MarsGlobe(onTileProgress)
    this.atmosphere = new MarsAtmosphere()
    this.landmarks = new MarsLandmarks(landmarkData)
    this.stars = new BackgroundStars()

    // Parent group for all Mars-relative layers — tilted to Mars obliquity.
    // Globe, atmosphere, and landmarks all share this tilt so positions align.
    const marsGroup = new THREE.Group()
    marsGroup.rotation.z = MARS_OBLIQUITY_RAD
    marsGroup.add(this.globe.root)
    marsGroup.add(this.atmosphere.root)
    marsGroup.add(this.landmarks.root)
    this.scene.add(marsGroup)

    // Stars are not tilted — they are scene-global
    this.scene.add(this.stars.root)

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(5, 3, 4)
    this.scene.add(sunLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(ambientLight)
  }

  async init(): Promise<void> {
    await Promise.all([
      this.globe.init(),
      this.atmosphere.init(),
      this.landmarks.init(),
      this.stars.init(),
    ])
  }

  update(elapsed: number): void {
    this.globe.update(elapsed)
    this.atmosphere.update(elapsed)
    this.landmarks.update(elapsed)
    this.stars.update(elapsed)
  }

  dispose(): void {
    this.globe.dispose()
    this.atmosphere.dispose()
    this.landmarks.dispose()
    this.stars.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/MarsScene.ts
git commit -m "feat: MarsScene assembler with lighting"
```

---

### Task 11: useThreeScene Composable

**Files:**
- Create: `src/composables/useThreeScene.ts`

- [ ] **Step 1: Implement useThreeScene.ts**

```typescript
// src/composables/useThreeScene.ts
import { ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_DEFAULT_DISTANCE,
  AUTO_ROTATE_SPEED,
  AUTO_ROTATE_RESUME_DELAY,
  FLY_TO_DURATION,
} from '@/three/constants'

export function useThreeScene() {
  const currentZoom = ref(0)
  const currentTarget = ref(new THREE.Vector3())

  let renderer: THREE.WebGLRenderer | null = null
  let css2dRenderer: CSS2DRenderer | null = null
  let camera: THREE.PerspectiveCamera | null = null
  let controls: OrbitControls | null = null
  let clock: THREE.Clock | null = null
  let animationId = 0
  let updateCallback: ((elapsed: number) => void) | null = null

  // Auto-rotate idle timer
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  // Fly-to state
  let flyToActive = false
  let flyToStart = 0
  let flyToStartPos = new THREE.Vector3()
  let flyToEndPos = new THREE.Vector3()
  let flyToStartTarget = new THREE.Vector3()
  let flyToEndTarget = new THREE.Vector3()
  let flyToResolve: (() => void) | null = null

  // Pointer tracking for raycaster
  const pointer = new THREE.Vector2(-999, -999)

  function init(canvas: HTMLCanvasElement, css2dContainer: HTMLDivElement) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    renderer.setClearColor(0x000000, 1)

    css2dRenderer = new CSS2DRenderer({ element: css2dContainer })
    css2dRenderer.setSize(canvas.clientWidth, canvas.clientHeight)

    camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      canvas.clientWidth / canvas.clientHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    )
    camera.position.set(0, 0, CAMERA_DEFAULT_DISTANCE)

    controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = CAMERA_MIN_DISTANCE
    controls.maxDistance = CAMERA_MAX_DISTANCE
    controls.autoRotate = true
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED
    controls.enablePan = false

    controls.addEventListener('start', onInteractionStart)
    controls.addEventListener('end', onInteractionEnd)

    clock = new THREE.Clock()

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('click', onPointerClick)
    window.addEventListener('resize', onResize)
  }

  function onInteractionStart() {
    if (controls) controls.autoRotate = false
    if (idleTimer) clearTimeout(idleTimer)
  }

  function onInteractionEnd() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (controls) controls.autoRotate = true
    }, AUTO_ROTATE_RESUME_DELAY)
  }

  function onPointerMove(e: PointerEvent) {
    const canvas = renderer?.domElement
    if (!canvas) return
    pointer.x = (e.offsetX / canvas.clientWidth) * 2 - 1
    pointer.y = -(e.offsetY / canvas.clientHeight) * 2 + 1
  }

  let onClickCallback: ((pointer: THREE.Vector2, camera: THREE.Camera) => void) | null = null

  function onPointerClick(_e: PointerEvent) {
    if (camera && onClickCallback) {
      onClickCallback(pointer, camera)
    }
  }

  function setClickHandler(handler: (pointer: THREE.Vector2, camera: THREE.Camera) => void) {
    onClickCallback = handler
  }

  function onResize() {
    const canvas = renderer?.domElement
    if (!canvas || !camera || !renderer || !css2dRenderer) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    css2dRenderer.setSize(width, height)
  }

  function startLoop(scene: THREE.Scene, onUpdate: (elapsed: number) => void) {
    updateCallback = onUpdate

    function animate() {
      animationId = requestAnimationFrame(animate)
      if (!renderer || !camera || !controls || !clock || !css2dRenderer) return

      const elapsed = clock.getElapsedTime()

      // Fly-to animation
      if (flyToActive) {
        const t = Math.min(1, (elapsed - flyToStart) / FLY_TO_DURATION)
        const eased = t * t * (3 - 2 * t) // smoothstep
        camera.position.lerpVectors(flyToStartPos, flyToEndPos, eased)
        controls.target.lerpVectors(flyToStartTarget, flyToEndTarget, eased)

        if (t >= 1) {
          flyToActive = false
          controls.enabled = true
          flyToResolve?.()
        }
      }

      controls.update()
      updateCallback?.(elapsed)

      // Update zoom ref
      const dist = camera.position.distanceTo(controls.target)
      currentZoom.value = 1 - (dist - CAMERA_MIN_DISTANCE) / (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE)
      currentTarget.value.copy(controls.target)

      renderer.render(scene, camera)
      css2dRenderer.render(scene, camera)
    }

    animate()
  }

  function flyTo(targetPosition: THREE.Vector3, distance: number): Promise<void> {
    if (!camera || !controls || !clock) return Promise.resolve()

    return new Promise((resolve) => {
      flyToResolve = resolve
      flyToActive = true
      flyToStart = clock!.getElapsedTime()
      flyToStartPos.copy(camera!.position)
      flyToStartTarget.copy(controls!.target)
      flyToEndTarget.copy(targetPosition)

      // Position camera along the surface normal at the given distance
      const direction = targetPosition.clone().normalize()
      flyToEndPos.copy(targetPosition).addScaledVector(direction, distance)

      controls!.enabled = false
      controls!.autoRotate = false
    })
  }

  function getCamera(): THREE.PerspectiveCamera | null {
    return camera
  }

  function getPointer(): THREE.Vector2 {
    return pointer
  }

  function dispose() {
    if (animationId) cancelAnimationFrame(animationId)
    controls?.removeEventListener('start', onInteractionStart)
    controls?.removeEventListener('end', onInteractionEnd)
    controls?.dispose()
    renderer?.domElement.removeEventListener('pointermove', onPointerMove)
    renderer?.domElement.removeEventListener('click', onPointerClick)
    window.removeEventListener('resize', onResize)
    renderer?.dispose()
    if (idleTimer) clearTimeout(idleTimer)
  }

  return {
    currentZoom,
    currentTarget,
    init,
    startLoop,
    flyTo,
    getCamera,
    getPointer,
    setClickHandler,
    dispose,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useThreeScene.ts
git commit -m "feat: useThreeScene composable with OrbitControls, CSS2DRenderer, flyTo"
```

---

### Task 12: Vue Components — MarsCanvas, LoadingOverlay, AppHeader

**Files:**
- Create: `src/components/MarsCanvas.vue`, `src/components/LoadingOverlay.vue`, `src/components/AppHeader.vue`

- [ ] **Step 1: Create MarsCanvas.vue**

```vue
<template>
  <div class="relative w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <div ref="css2dRef" class="absolute inset-0 pointer-events-none overflow-hidden" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useThreeScene } from '@/composables/useThreeScene'
import { useMarsData } from '@/composables/useMarsData'
import { MarsScene } from '@/three/MarsScene'
import type { Landmark, LandmarkHoverEvent } from '@/types/landmark'

const emit = defineEmits<{
  ready: []
  hover: [event: LandmarkHoverEvent | null]
  select: [landmark: Landmark]
  progress: [loaded: number, total: number]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const css2dRef = ref<HTMLDivElement | null>(null)

const { init, startLoop, flyTo, getCamera, getPointer, setClickHandler, dispose } = useThreeScene()
const { loadLandmarks } = useMarsData()

let marsScene: MarsScene | null = null

onMounted(async () => {
  if (!canvasRef.value || !css2dRef.value) return

  init(canvasRef.value, css2dRef.value)

  const landmarks = await loadLandmarks()

  marsScene = new MarsScene(landmarks, (loaded, total) => {
    emit('progress', loaded, total)
  })

  marsScene.landmarks.onHover = (event) => emit('hover', event)
  marsScene.landmarks.onClick = (landmark) => {
    emit('select', landmark)
    const target = marsScene!.landmarks.getLandmarkTarget(landmark.id)
    if (target) flyTo(target.position, target.distance)
  }

  setClickHandler((pointer, camera) => {
    marsScene?.landmarks.clickTest(pointer, camera)
  })

  await marsScene.init()

  startLoop(marsScene.scene, (elapsed) => {
    marsScene!.update(elapsed)
    const cam = getCamera()
    if (cam) {
      marsScene!.landmarks.pick(getPointer(), cam)
    }
  })

  emit('ready')
})

onUnmounted(() => {
  marsScene?.dispose()
  dispose()
})
</script>
```

- [ ] **Step 2: Create LoadingOverlay.vue**

```vue
<template>
  <Transition name="fade">
    <div v-if="isLoading" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div class="text-center">
        <p class="text-white/60 text-sm tracking-widest uppercase">Loading Mars surface...</p>
        <p v-if="total > 0" class="text-white/40 text-xs mt-2">{{ loaded }} / {{ total }}</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  isLoading: boolean
  loaded: number
  total: number
}>()
</script>

<style scoped>
.fade-leave-active { transition: opacity 0.6s ease; }
.fade-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 3: Create AppHeader.vue**

```vue
<template>
  <header class="fixed top-0 left-0 right-0 z-40 h-12 flex items-center px-4 bg-black/30 backdrop-blur-sm border-b border-white/5">
    <h1 class="text-white/70 text-sm font-light tracking-[0.25em] uppercase">Mars</h1>
  </header>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MarsCanvas.vue src/components/LoadingOverlay.vue src/components/AppHeader.vue
git commit -m "feat: MarsCanvas, LoadingOverlay, AppHeader components"
```

---

### Task 13: Vue Components — LandmarkTooltip & LandmarkInfoCard

**Files:**
- Create: `src/components/LandmarkTooltip.vue`, `src/components/LandmarkInfoCard.vue`

- [ ] **Step 1: Create LandmarkTooltip.vue**

```vue
<template>
  <div
    v-if="landmark"
    class="landmark-tooltip"
    :style="{ left: `${x}px`, top: `${y}px` }"
  >
    <span class="tooltip-dot" :style="{ backgroundColor: landmark.accent }" />
    <span class="tooltip-name">{{ landmark.name }}</span>
    <span v-if="landmark.type === 'landing-site'" class="tooltip-year">({{ landmark.year }})</span>
  </div>
</template>

<script setup lang="ts">
import type { Landmark } from '@/types/landmark'

defineProps<{
  landmark: Landmark | null
  x: number
  y: number
}>()
</script>

<style scoped>
.landmark-tooltip {
  position: fixed;
  z-index: 30;
  transform: translate(12px, -50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
  white-space: nowrap;
}

.tooltip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tooltip-name {
  font-weight: 400;
}

.tooltip-year {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
}
</style>
```

- [ ] **Step 2: Create LandmarkInfoCard.vue**

```vue
<template>
  <Transition name="card">
    <div v-if="landmark" class="info-card">
      <button class="card-close" @click="$emit('close')">&times;</button>
      <div class="card-accent" :style="{ backgroundColor: landmark.accent }" />
      <h2 class="card-title">{{ landmark.name }}</h2>
      <p class="card-description">{{ landmark.description }}</p>

      <div class="card-details">
        <template v-if="landmark.type === 'landing-site'">
          <div class="detail-row">
            <span class="detail-label">Mission</span>
            <span class="detail-value">{{ landmark.mission }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Agency</span>
            <span class="detail-value">{{ landmark.agency }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Year</span>
            <span class="detail-value">{{ landmark.year }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value capitalize">{{ landmark.status }}</span>
          </div>
        </template>

        <template v-if="landmark.type === 'geological'">
          <div class="detail-row">
            <span class="detail-label">Feature</span>
            <span class="detail-value capitalize">{{ landmark.featureType.replace('-', ' ') }}</span>
          </div>
          <div v-if="landmark.diameterKm" class="detail-row">
            <span class="detail-label">Diameter</span>
            <span class="detail-value">{{ landmark.diameterKm.toLocaleString() }} km</span>
          </div>
          <div v-if="landmark.elevationKm" class="detail-row">
            <span class="detail-label">Elevation</span>
            <span class="detail-value">{{ landmark.elevationKm > 0 ? '+' : '' }}{{ landmark.elevationKm }} km</span>
          </div>
        </template>

        <div class="detail-row">
          <span class="detail-label">Coordinates</span>
          <span class="detail-value">{{ landmark.lat.toFixed(2) }}°, {{ landmark.lon.toFixed(2) }}°</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { Landmark } from '@/types/landmark'

defineProps<{
  landmark: Landmark | null
}>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.info-card {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 30;
  width: 320px;
  padding: 20px;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.card-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}

.card-close:hover {
  color: rgba(255, 255, 255, 0.8);
}

.card-accent {
  width: 24px;
  height: 3px;
  border-radius: 2px;
  margin-bottom: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 8px;
  letter-spacing: 0.03em;
}

.card-description {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
  margin: 0 0 16px;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.detail-label {
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-value {
  color: rgba(255, 255, 255, 0.7);
}

.card-enter-active { transition: all 0.3s ease-out; }
.card-leave-active { transition: all 0.2s ease-in; }
.card-enter-from { opacity: 0; transform: translateY(16px); }
.card-leave-to { opacity: 0; transform: translateY(8px); }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandmarkTooltip.vue src/components/LandmarkInfoCard.vue
git commit -m "feat: LandmarkTooltip and LandmarkInfoCard components"
```

---

### Task 14: HomeView & App Integration

**Files:**
- Modify: `src/App.vue`
- Create: `src/views/HomeView.vue`

- [ ] **Step 1: Create HomeView.vue**

```vue
<template>
  <div class="w-full h-full">
    <MarsCanvas
      @ready="onReady"
      @hover="onHover"
      @select="onSelect"
      @progress="onProgress"
    />
    <LandmarkTooltip
      v-if="!isMobile"
      :landmark="hoveredLandmark"
      :x="tooltipX"
      :y="tooltipY"
    />
    <LandmarkInfoCard
      :landmark="selectedLandmark"
      @close="selectedLandmark = null"
    />
    <LoadingOverlay
      :is-loading="isLoading"
      :loaded="tilesLoaded"
      :total="tilesTotal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import MarsCanvas from '@/components/MarsCanvas.vue'
import LandmarkTooltip from '@/components/LandmarkTooltip.vue'
import LandmarkInfoCard from '@/components/LandmarkInfoCard.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import type { Landmark, LandmarkHoverEvent } from '@/types/landmark'

const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const isLoading = ref(true)
const tilesLoaded = ref(0)
const tilesTotal = ref(0)
const hoveredLandmark = ref<Landmark | null>(null)
const selectedLandmark = ref<Landmark | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

function onReady() {
  isLoading.value = false
}

function onHover(event: LandmarkHoverEvent | null) {
  if (event) {
    hoveredLandmark.value = event.landmark
    tooltipX.value = event.screenX
    tooltipY.value = event.screenY
  } else {
    hoveredLandmark.value = null
  }
}

function onSelect(landmark: Landmark) {
  selectedLandmark.value = landmark
}

function onProgress(loaded: number, total: number) {
  tilesLoaded.value = loaded
  tilesTotal.value = total
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') selectedLandmark.value = null
}

window.addEventListener('keydown', onKeyDown)
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>
```

- [ ] **Step 2: Update App.vue**

```vue
<template>
  <AppHeader />
  <HomeView />
</template>

<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import HomeView from '@/views/HomeView.vue'
</script>
```

- [ ] **Step 3: Run dev server and verify the full scene renders**

Run: `npm run dev`
Expected: Mars globe visible with tile texture, atmospheric glow, stars, landmark labels. Hovering landmarks shows tooltip. Clicking flies to landmark and shows info card.

- [ ] **Step 4: Commit**

```bash
git add src/views/HomeView.vue src/App.vue
git commit -m "feat: HomeView integration — full Mars globe with landmarks"
```

---

### Task 15: Shader & Data Validation Tests

**Files:**
- Create: `src/three/__tests__/shaders.test.ts`, `src/lib/areography/__tests__/landmarks-data.test.ts`

- [ ] **Step 1: Write shader compilation test**

```typescript
// src/three/__tests__/shaders.test.ts
import { describe, it, expect } from 'vitest'
import atmosphereVert from '../shaders/atmosphere.vert.glsl?raw'
import atmosphereFrag from '../shaders/atmosphere.frag.glsl?raw'

describe('GLSL shaders', () => {
  it('atmosphere vertex shader is non-empty and contains main()', () => {
    expect(atmosphereVert).toBeTruthy()
    expect(atmosphereVert).toContain('void main()')
    expect(atmosphereVert).toContain('vNormal')
    expect(atmosphereVert).toContain('vWorldPosition')
  })

  it('atmosphere fragment shader is non-empty and contains main()', () => {
    expect(atmosphereFrag).toBeTruthy()
    expect(atmosphereFrag).toContain('void main()')
    expect(atmosphereFrag).toContain('uAtmosphereColor')
    expect(atmosphereFrag).toContain('uFresnelPower')
  })
})
```

- [ ] **Step 2: Write landmark data validation test**

```typescript
// src/lib/areography/__tests__/landmarks-data.test.ts
import { describe, it, expect } from 'vitest'
import landmarksJson from '../../../../public/data/landmarks.json'
import type { Landmark } from '@/types/landmark'

const landmarks = landmarksJson as Landmark[]

describe('landmarks.json data validation', () => {
  it('has at least 20 landmarks', () => {
    expect(landmarks.length).toBeGreaterThanOrEqual(20)
  })

  it('all latitudes are in valid range [-90, 90]', () => {
    for (const l of landmarks) {
      expect(l.lat).toBeGreaterThanOrEqual(-90)
      expect(l.lat).toBeLessThanOrEqual(90)
    }
  })

  it('all longitudes are in valid range [-180, 180]', () => {
    for (const l of landmarks) {
      expect(l.lon).toBeGreaterThanOrEqual(-180)
      expect(l.lon).toBeLessThanOrEqual(180)
    }
  })

  it('has no duplicate IDs', () => {
    const ids = landmarks.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all landmarks have required base fields', () => {
    for (const l of landmarks) {
      expect(l.id).toBeTruthy()
      expect(l.name).toBeTruthy()
      expect(l.description).toBeTruthy()
      expect(l.accent).toBeTruthy()
      expect(l.type).toMatch(/^(landing-site|geological)$/)
    }
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/three/__tests__/shaders.test.ts src/lib/areography/__tests__/landmarks-data.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/three/__tests__/shaders.test.ts src/lib/areography/__tests__/landmarks-data.test.ts
git commit -m "test: shader validation and landmark data integrity checks"
```

---

### Task 16: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write CLAUDE.md**

```markdown
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
├── lib/areography/  # Mars-specific math (lat/lon conversions, ArcGIS tile math)
├── three/           # All Three.js scene code + GLSL shaders
├── types/           # Landmark interfaces (LandingSite, GeologicalFeature)
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
- ArcGIS tiles: 512x512 JPEG, equirectangular projection, WKID 104971
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project guide"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass (coordinates, tiles, shaders)

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc -b`
Expected: No type errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Visual verification**

Run: `npm run dev` and verify:
- Globe renders with Mars tile texture
- Atmospheric orange rim glow visible
- Stars twinkle in background
- Landmark labels visible on globe surface
- Hovering a landmark shows tooltip
- Clicking a landmark flies camera to it and shows info card
- Escape dismisses the info card
- Globe auto-rotates, pauses on interaction, resumes after idle
- Loading overlay shows tile progress and dismisses

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments from integration testing"
```
