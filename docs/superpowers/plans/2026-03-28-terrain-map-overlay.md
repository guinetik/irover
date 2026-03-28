# Terrain Map Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen 2D map overlay (press M) showing heightmap-colored terrain with grid, cursor lat/lon, and rover position dot.

**Architecture:** Pure-function `mapColors.ts` generates two 512x512 canvases (Mars color + hypsometric) from the existing heightmap Float32Array. `GlbTerrainGenerator` calls it after heightmap build and exposes the canvases via `ITerrainGenerator`. `MapOverlay.vue` renders them with a grid, cursor readout, and pulsing rover dot. Mic keybinding moves from M to P.

**Tech Stack:** Vue 3, Canvas 2D API, TypeScript

---

### Task 1: Color Ramp Definitions and Map Canvas Generator

**Files:**
- Create: `src/lib/terrain/mapColors.ts`

- [ ] **Step 1: Create `mapColors.ts` with color ramps and generator function**

```typescript
// src/lib/terrain/mapColors.ts

/** A stop in a color ramp: t in [0,1], r/g/b in [0,255]. */
interface ColorStop { t: number; r: number; g: number; b: number }

/** Terracotta (low) → latte → white (high). */
export const MARS_COLOR_RAMP: ColorStop[] = [
  { t: 0.00, r: 122, g: 74, b: 48 },
  { t: 0.12, r: 139, g: 90, b: 58 },
  { t: 0.25, r: 160, g: 104, b: 64 },
  { t: 0.40, r: 192, g: 128, b: 80 },
  { t: 0.55, r: 216, g: 160, b: 112 },
  { t: 0.68, r: 224, g: 184, b: 136 },
  { t: 0.80, r: 236, g: 208, b: 160 },
  { t: 0.92, r: 245, g: 224, b: 192 },
  { t: 1.00, r: 255, g: 255, b: 255 },
]

/** Blue (low) → green → yellow → red (high). */
export const HYPSOMETRIC_RAMP: ColorStop[] = [
  { t: 0.00, r: 0, g: 0, b: 170 },
  { t: 0.15, r: 0, g: 68, b: 204 },
  { t: 0.25, r: 0, g: 170, b: 204 },
  { t: 0.35, r: 0, g: 204, b: 102 },
  { t: 0.45, r: 68, g: 221, b: 0 },
  { t: 0.55, r: 204, g: 221, b: 0 },
  { t: 0.65, r: 255, g: 204, b: 0 },
  { t: 0.75, r: 255, g: 136, b: 0 },
  { t: 0.85, r: 255, g: 51, b: 0 },
  { t: 0.95, r: 204, g: 0, b: 0 },
  { t: 1.00, r: 136, g: 0, b: 0 },
]

/** Linearly interpolate a color from a ramp at normalized t ∈ [0,1]. */
function sampleRamp(ramp: ColorStop[], t: number): [number, number, number] {
  if (t <= ramp[0].t) return [ramp[0].r, ramp[0].g, ramp[0].b]
  if (t >= ramp[ramp.length - 1].t) {
    const last = ramp[ramp.length - 1]
    return [last.r, last.g, last.b]
  }
  for (let i = 0; i < ramp.length - 1; i++) {
    const lo = ramp[i], hi = ramp[i + 1]
    if (t >= lo.t && t <= hi.t) {
      const f = (t - lo.t) / (hi.t - lo.t)
      return [
        Math.round(lo.r + (hi.r - lo.r) * f),
        Math.round(lo.g + (hi.g - lo.g) * f),
        Math.round(lo.b + (hi.b - lo.b) * f),
      ]
    }
  }
  return [0, 0, 0]
}

/**
 * Generate a colored map canvas from a heightmap grid.
 * @param heightmap - Float32Array of gridSize*gridSize height values
 * @param gridSize  - width/height of the square grid
 * @param hMin      - minimum height value
 * @param hMax      - maximum height value
 * @param ramp      - color ramp to use
 * @returns An HTMLCanvasElement with the colored map
 */
export function generateMapCanvas(
  heightmap: Float32Array,
  gridSize: number,
  hMin: number,
  hMax: number,
  ramp: ColorStop[],
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = gridSize
  canvas.height = gridSize
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(gridSize, gridSize)
  const range = hMax - hMin || 1

  for (let i = 0; i < heightmap.length; i++) {
    const t = (heightmap[i] - hMin) / range
    const [r, g, b] = sampleRamp(ramp, t)
    const p = i * 4
    img.data[p] = r
    img.data[p + 1] = g
    img.data[p + 2] = b
    img.data[p + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/terrain/mapColors.ts
git commit -m "feat(map): add color ramp definitions and heightmap canvas generator"
```

---

### Task 2: Expose Map Canvases from Terrain Generators

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts:25-38` (ITerrainGenerator interface)
- Modify: `src/three/terrain/GlbTerrainGenerator.ts:61-74` (add canvas fields + generation call)
- Modify: `src/three/terrain/TerrainGenerator.ts:50-56` (DefaultTerrainGenerator — stub)

- [ ] **Step 1: Add `mapCanvasMars` and `mapCanvasHypso` to `ITerrainGenerator`**

In `src/three/terrain/TerrainGenerator.ts`, add two optional readonly properties to the interface:

```typescript
// Add after line 37 (before the closing brace of ITerrainGenerator)
  /** 2D color map canvas (Mars terracotta ramp), available after generate(). */
  readonly mapCanvasMars: HTMLCanvasElement | null
  /** 2D color map canvas (hypsometric blue-red ramp), available after generate(). */
  readonly mapCanvasHypso: HTMLCanvasElement | null
```

- [ ] **Step 2: Add stub properties to `DefaultTerrainGenerator`**

In `src/three/terrain/TerrainGenerator.ts`, add to the `DefaultTerrainGenerator` class body (after line 56):

```typescript
  readonly mapCanvasMars: HTMLCanvasElement | null = null
  readonly mapCanvasHypso: HTMLCanvasElement | null = null
```

Also check if `MarsGlobalTerrainGenerator` and `ElevationTerrainGenerator` implement `ITerrainGenerator` — if so, add the same stub to each. (They likely do since they're returned by `createTerrainGenerator`.)

- [ ] **Step 3: Generate map canvases in `GlbTerrainGenerator`**

In `src/three/terrain/GlbTerrainGenerator.ts`:

Add import at the top:
```typescript
import { generateMapCanvas, MARS_COLOR_RAMP, HYPSOMETRIC_RAMP } from '@/lib/terrain/mapColors'
```

Change the private fields (around line 70-74) to add public canvas fields:
```typescript
  mapCanvasMars: HTMLCanvasElement | null = null
  mapCanvasHypso: HTMLCanvasElement | null = null
```

At the end of `buildHeightmap()` (after line 257, after `this.coverage = cov`), add:
```typescript
    // Generate 2D map images from the heightmap
    this.mapCanvasMars = generateMapCanvas(hm, GRID_SIZE, this.heightMin, this.heightMax, MARS_COLOR_RAMP)
    this.mapCanvasHypso = generateMapCanvas(hm, GRID_SIZE, this.heightMin, this.heightMax, HYPSOMETRIC_RAMP)
```

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: No type errors. All generators satisfy the updated `ITerrainGenerator` interface.

- [ ] **Step 5: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts src/three/terrain/GlbTerrainGenerator.ts
git commit -m "feat(map): expose mapCanvasMars/mapCanvasHypso on terrain generators"
```

---

### Task 3: Create MapOverlay.vue Component

**Files:**
- Create: `src/components/MapOverlay.vue`

This component receives the two map canvases, the site location, rover position, and terrain scale. It renders the map as a full-screen overlay with grid lines, cursor lat/lon readout, and a pulsing rover dot.

- [ ] **Step 1: Create `MapOverlay.vue`**

```vue
<template>
  <Transition name="map-fade">
    <div v-if="open" class="map-overlay" @click.self="$emit('close')" @keydown.escape="$emit('close')">
      <div class="map-overlay__panel">
        <div class="map-overlay__header font-instrument">
          <span class="map-overlay__title">{{ siteName }} — TERRAIN MAP</span>
          <button class="map-overlay__mode-btn" @click="toggleMode">
            {{ mode === 'mars' ? 'HYPSOMETRIC' : 'MARS COLOR' }}
          </button>
          <button class="map-overlay__close-btn" @click="$emit('close')">ESC</button>
        </div>
        <div class="map-overlay__canvas-wrap" ref="wrapRef">
          <canvas
            ref="displayCanvas"
            class="map-overlay__canvas"
            @mousemove="onMouseMove"
            @mouseleave="cursorLatLon = null"
          />
          <!-- Rover dot -->
          <div
            v-if="roverPixel"
            class="map-overlay__rover-dot"
            :style="{ left: roverPixel.x + 'px', top: roverPixel.y + 'px' }"
          />
          <!-- Cursor readout -->
          <div
            v-if="cursorLatLon"
            class="map-overlay__cursor-readout font-instrument"
            :style="{ left: cursorScreenPos.x + 'px', top: cursorScreenPos.y + 'px' }"
          >
            {{ cursorLatLon.latStr }} {{ cursorLatLon.lonStr }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

const DEG_PER_METER = 1 / 59200

const props = defineProps<{
  open: boolean
  siteName: string
  mapCanvasMars: HTMLCanvasElement | null
  mapCanvasHypso: HTMLCanvasElement | null
  baseLat: number
  baseLon: number
  roverX: number
  roverZ: number
  terrainScale: number
  gridSize: number
}>()

defineEmits<{ close: [] }>()

const displayCanvas = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const mode = ref<'mars' | 'hypso'>('mars')
const cursorLatLon = ref<{ latStr: string; lonStr: string } | null>(null)
const cursorScreenPos = ref({ x: 0, y: 0 })

function toggleMode() {
  mode.value = mode.value === 'mars' ? 'hypso' : 'mars'
}

/** Convert world X/Z to pixel coordinates on the displayed canvas. */
function worldToPixel(wx: number, wz: number) {
  const canvas = displayCanvas.value
  if (!canvas) return null
  const px = ((wx / props.terrainScale + 0.5) * canvas.width)
  const py = ((wz / props.terrainScale + 0.5) * canvas.height)
  return { x: px, y: py }
}

/** Convert pixel to lat/lon strings. */
function pixelToLatLon(px: number, py: number, canvasW: number, canvasH: number) {
  const wx = (px / canvasW - 0.5) * props.terrainScale
  const wz = (py / canvasH - 0.5) * props.terrainScale
  const lat = props.baseLat + (-wz * DEG_PER_METER)
  const cosLat = Math.cos((props.baseLat * Math.PI) / 180)
  const degPerMeterLon = DEG_PER_METER / (cosLat || 1)
  const lon = props.baseLon + (wx * degPerMeterLon)
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'
  return {
    latStr: `${Math.abs(lat).toFixed(4)}\u00B0${latDir}`,
    lonStr: `${Math.abs(lon).toFixed(4)}\u00B0${lonDir}`,
  }
}

const roverPixel = computed(() => worldToPixel(props.roverX, props.roverZ))

function onMouseMove(e: MouseEvent) {
  const canvas = displayCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  // Map mouse position to canvas pixel coords (account for CSS scaling)
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * scaleX
  const cy = (e.clientY - rect.top) * scaleY
  cursorLatLon.value = pixelToLatLon(cx, cy, canvas.width, canvas.height)
  // Position readout relative to the canvas wrapper
  cursorScreenPos.value = {
    x: e.clientX - rect.left + 12,
    y: e.clientY - rect.top - 24,
  }
}

/** Draw the map + grid onto the display canvas. */
function redraw() {
  const dc = displayCanvas.value
  const src = mode.value === 'mars' ? props.mapCanvasMars : props.mapCanvasHypso
  if (!dc || !src) return

  dc.width = src.width
  dc.height = src.height
  const ctx = dc.getContext('2d')!

  // Draw base map
  ctx.drawImage(src, 0, 0)

  // Draw grid lines
  drawGrid(ctx, dc.width, dc.height)
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const totalDegreesLat = (props.terrainScale * DEG_PER_METER)
  const cosLat = Math.cos((props.baseLat * Math.PI) / 180)
  const degPerMeterLon = DEG_PER_METER / (cosLat || 1)
  const totalDegreesLon = (props.terrainScale * degPerMeterLon)

  // Pick a grid spacing that gives ~5-8 lines
  const spacing = pickGridSpacing(Math.max(totalDegreesLat, totalDegreesLon))

  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.font = '10px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'

  // Lat lines (horizontal)
  const latMin = props.baseLat - totalDegreesLat / 2
  const latMax = props.baseLat + totalDegreesLat / 2
  const firstLatLine = Math.ceil(latMin / spacing) * spacing
  for (let lat = firstLatLine; lat <= latMax; lat += spacing) {
    const wz = -(lat - props.baseLat) / DEG_PER_METER
    const py = (wz / props.terrainScale + 0.5) * h
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(w, py)
    ctx.stroke()
    const dir = lat >= 0 ? 'N' : 'S'
    ctx.fillText(`${Math.abs(lat).toFixed(3)}\u00B0${dir}`, 4, py - 3)
  }

  // Lon lines (vertical)
  const lonMin = props.baseLon - totalDegreesLon / 2
  const lonMax = props.baseLon + totalDegreesLon / 2
  const firstLonLine = Math.ceil(lonMin / spacing) * spacing
  for (let lon = firstLonLine; lon <= lonMax; lon += spacing) {
    const wx = (lon - props.baseLon) / degPerMeterLon
    const px = (wx / props.terrainScale + 0.5) * w
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
    ctx.stroke()
    const dir = lon >= 0 ? 'E' : 'W'
    ctx.fillText(`${Math.abs(lon).toFixed(3)}\u00B0${dir}`, px + 3, h - 6)
  }
}

/** Pick a sensible grid spacing in degrees for ~5-8 grid lines. */
function pickGridSpacing(totalDegrees: number): number {
  const candidates = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1]
  for (const s of candidates) {
    if (totalDegrees / s >= 4 && totalDegrees / s <= 10) return s
  }
  return totalDegrees / 6
}

// Redraw when mode changes or overlay opens
watch([mode, () => props.open], async () => {
  if (props.open) {
    await nextTick()
    redraw()
  }
})

// Also redraw when map canvases arrive (they may load after mount)
watch([() => props.mapCanvasMars, () => props.mapCanvasHypso], () => {
  if (props.open) redraw()
})
</script>

<style scoped>
.map-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-overlay__panel {
  display: flex;
  flex-direction: column;
  max-width: 90vw;
  max-height: 90vh;
}

.map-overlay__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  color: #e0b888;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.map-overlay__title {
  flex: 1;
}

.map-overlay__mode-btn,
.map-overlay__close-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(224, 184, 136, 0.3);
  color: #e0b888;
  padding: 4px 12px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.map-overlay__mode-btn:hover,
.map-overlay__close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.map-overlay__canvas-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-overlay__canvas {
  max-width: 80vw;
  max-height: 80vh;
  image-rendering: pixelated;
  cursor: crosshair;
}

.map-overlay__rover-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #00ffcc;
  box-shadow: 0 0 8px #00ffcc, 0 0 16px rgba(0, 255, 204, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: rover-pulse 1.5s ease-in-out infinite;
}

@keyframes rover-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.7; }
}

.map-overlay__cursor-readout {
  position: absolute;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.8);
  color: #e0b888;
  padding: 2px 6px;
  font-size: 11px;
  white-space: nowrap;
  border: 1px solid rgba(224, 184, 136, 0.3);
}

.map-fade-enter-active,
.map-fade-leave-active {
  transition: opacity 0.2s ease;
}
.map-fade-enter-from,
.map-fade-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MapOverlay.vue
git commit -m "feat(map): create MapOverlay.vue component with grid, cursor, and rover dot"
```

---

### Task 4: Wire MapOverlay into MartianSiteView and Rebind Keys

**Files:**
- Modify: `src/views/MartianSiteView.vue`

This task wires the `MapOverlay` component into the view, adds the map toggle state, rebinds M→map and P→mic, and updates the HUD button labels.

- [ ] **Step 1: Add import**

In `src/views/MartianSiteView.vue`, add near the other component imports (around line 580-591):

```typescript
import MapOverlay from '@/components/MapOverlay.vue'
```

- [ ] **Step 2: Add state refs**

Near the other panel refs (around line 935-936 where `inventoryOpen` and `profileOpen` are):

```typescript
const mapOpen = ref(false)
```

- [ ] **Step 3: Add computed props for map canvases and terrain scale**

Near the other computed properties:

```typescript
const mapCanvasMars = computed(() => siteHandle.value?.siteScene?.terrain.mapCanvasMars ?? null)
const mapCanvasHypso = computed(() => siteHandle.value?.siteScene?.terrain.mapCanvasHypso ?? null)
const terrainScale = computed(() => siteHandle.value?.siteScene?.terrain.scale ?? 1000)
const terrainGridSize = computed(() => 512) // GLB terrain grid size
```

- [ ] **Step 4: Add toggle function**

Near `toggleMicPanel()`:

```typescript
function toggleMapOverlay() {
  if (isSleeping.value || wheelsHudBlocked.value) return
  playUiCue('ui.switch')
  mapOpen.value = !mapOpen.value
}
```

- [ ] **Step 5: Update keybindings in `onGlobalKeyDown`**

Change lines 1845-1848 from:
```typescript
  if (e.key === 'm' || e.key === 'M') {
    toggleMicPanel()
    return
  }
```
to:
```typescript
  if (e.key === 'm' || e.key === 'M') {
    toggleMapOverlay()
    return
  }
  if (e.key === 'p' || e.key === 'P') {
    toggleMicPanel()
    return
  }
```

- [ ] **Step 6: Update mic HUD button label from M to P**

Change the mic button (around lines 530-535):

Title attribute from:
```
:title="micListening ? 'Microphone [M] — LISTENING' : 'Microphone [M]'"
```
to:
```
:title="micListening ? 'Microphone [P] — LISTENING' : 'Microphone [P]'"
```

Key label from:
```html
<span class="wheels-hud-key font-instrument">M</span>
```
to:
```html
<span class="wheels-hud-key font-instrument">P</span>
```

- [ ] **Step 7: Add MapOverlay to template**

Add the `MapOverlay` component in the template, near the other overlays (after `ProfilePanel` or similar):

```html
<MapOverlay
  :open="mapOpen"
  :site-name="siteId"
  :map-canvas-mars="mapCanvasMars"
  :map-canvas-hypso="mapCanvasHypso"
  :base-lat="siteLat"
  :base-lon="siteLon"
  :rover-x="roverWorldX"
  :rover-z="roverWorldZ"
  :terrain-scale="terrainScale"
  :grid-size="terrainGridSize"
  @close="mapOpen = false"
/>
```

- [ ] **Step 8: Verify build compiles and test manually**

Run: `npm run build`
Expected: Clean build, no type errors.

Manual test: `npm run dev`, navigate to a GLB terrain site (e.g. `curiosity`), press M — map overlay appears with colored heightmap, grid lines, rover dot. Press P — mic toggles. Press M again or Escape — map closes.

- [ ] **Step 9: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(map): wire MapOverlay into site view, rebind M=map P=mic"
```

---

### Task 5: Handle Non-GLB Terrain Sites and Rover Dot Scaling

**Files:**
- Modify: `src/components/MapOverlay.vue`
- Modify: `src/three/terrain/TerrainGenerator.ts`

Non-GLB sites (DefaultTerrainGenerator) have a private heightmap too. We should generate map canvases for them as well so the map works on all sites.

- [ ] **Step 1: Add map canvas generation to `DefaultTerrainGenerator`**

In `src/three/terrain/TerrainGenerator.ts`, add the import:

```typescript
import { generateMapCanvas, MARS_COLOR_RAMP, HYPSOMETRIC_RAMP } from '@/lib/terrain/mapColors'
```

Change the stub properties from:
```typescript
  readonly mapCanvasMars: HTMLCanvasElement | null = null
  readonly mapCanvasHypso: HTMLCanvasElement | null = null
```
to non-readonly fields:
```typescript
  mapCanvasMars: HTMLCanvasElement | null = null
  mapCanvasHypso: HTMLCanvasElement | null = null
```

Then in the `DefaultTerrainGenerator.generate()` method, after the heightmap is built and `heightMin`/`heightMax` are computed, add:

```typescript
    this.mapCanvasMars = generateMapCanvas(this.heightmap!, GRID_SIZE, this.heightMin, this.heightMax, MARS_COLOR_RAMP)
    this.mapCanvasHypso = generateMapCanvas(this.heightmap!, GRID_SIZE, this.heightMin, this.heightMax, HYPSOMETRIC_RAMP)
```

(Find the spot in `generate()` right after `this.heightMax` is set — search for `this.heightMax` assignment.)

- [ ] **Step 2: Fix rover dot position to account for CSS canvas scaling**

In `MapOverlay.vue`, the rover dot uses pixel coordinates from the 512px canvas but the canvas is CSS-scaled to fit the viewport. Update `roverPixel` to use the displayed (CSS) size:

Replace the `roverPixel` computed and update the component to account for the canvas CSS dimensions:

```typescript
const roverPixel = computed(() => {
  const dc = displayCanvas.value
  if (!dc) return null
  // Normalized [0,1] position
  const nx = props.roverX / props.terrainScale + 0.5
  const ny = props.roverZ / props.terrainScale + 0.5
  // Map to CSS displayed size
  const rect = dc.getBoundingClientRect()
  return { x: nx * rect.width, y: ny * rect.height }
})
```

- [ ] **Step 3: Verify build and manual test**

Run: `npm run build`
Expected: Clean build.

Manual test: Visit a non-GLB site (any site not in `GLB_TERRAIN_SITES`). Press M — map should still render with the procedural terrain heightmap.

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts src/components/MapOverlay.vue
git commit -m "feat(map): generate map canvases for default terrain, fix rover dot scaling"
```
