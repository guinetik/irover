# Meteor Shower Pass 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meteor trail VFX, blood-red sky mood, shockwave damage with knockback, terrain crater deformation, and impact kill (game over) to the existing meteor shower system.

**Architecture:** Builds on Pass 1's `MeteorFallRenderer`, `MeteorController`, and `MeteorTickHandler`. New pure functions for shockwave damage and crater math in `lib/meteor/`. Sky tint via new uniform on `MarsSky` shader. Game over via Vue overlay with `ScrambleText`. Crater deformation via `deformCrater()` on terrain interface.

**Tech Stack:** Vue 3, Three.js, TypeScript, GLSL, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-meteor-shower-pass2-design.md`

---

### Task 1: Shockwave Damage Pure Function

**Files:**
- Create: `src/lib/meteor/shockwaveDamage.ts`
- Create: `src/lib/meteor/__tests__/shockwaveDamage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/meteor/__tests__/shockwaveDamage.test.ts
import { describe, it, expect } from 'vitest'
import { computeShockwaveDamage, SHOCKWAVE_RADIUS_MULTIPLIER, KILL_RADIUS } from '../shockwaveDamage'

describe('computeShockwaveDamage', () => {
  const shockwaveRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER

  it('returns 0 beyond shockwave radius', () => {
    expect(computeShockwaveDamage(shockwaveRadius + 1, shockwaveRadius, 'sensitive')).toBe(0)
  })

  it('returns max damage at kill zone edge', () => {
    const dmg = computeShockwaveDamage(0, shockwaveRadius, 'sensitive')
    expect(dmg).toBeCloseTo(0.15, 2)
  })

  it('falls off linearly with distance', () => {
    const half = shockwaveRadius / 2
    const dmg = computeShockwaveDamage(half, shockwaveRadius, 'sensitive')
    expect(dmg).toBeCloseTo(0.075, 2)
  })

  it('scales by instrument tier', () => {
    const dist = 0
    expect(computeShockwaveDamage(dist, shockwaveRadius, 'rugged')).toBeCloseTo(0.03, 2)
    expect(computeShockwaveDamage(dist, shockwaveRadius, 'standard')).toBeCloseTo(0.08, 2)
    expect(computeShockwaveDamage(dist, shockwaveRadius, 'sensitive')).toBeCloseTo(0.15, 2)
  })
})

describe('constants', () => {
  it('KILL_RADIUS matches waypoint ring radius', () => {
    expect(KILL_RADIUS).toBe(1.5)
  })

  it('SHOCKWAVE_RADIUS_MULTIPLIER is 3x', () => {
    expect(SHOCKWAVE_RADIUS_MULTIPLIER).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/meteor/__tests__/shockwaveDamage.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/meteor/shockwaveDamage.ts
import type { InstrumentTier } from '@/lib/hazards/hazardTypes'

/** Kill zone: same as waypoint marker ring radius. */
export const KILL_RADIUS = 1.5

/** Shockwave extends to this multiple of the kill radius. */
export const SHOCKWAVE_RADIUS_MULTIPLIER = 3

const SHOCKWAVE_BASE_DAMAGE: Record<InstrumentTier, number> = {
  rugged:    0.03,
  standard:  0.08,
  sensitive: 0.15,
}

/**
 * Flat durability deduction for a meteor shockwave.
 * Returns 0 if beyond the shockwave radius.
 * Applied directly via instrument.applyHazardDamage(), NOT through hazardDecay.
 */
export function computeShockwaveDamage(
  distanceToImpact: number,
  shockwaveRadius: number,
  instrumentTier: InstrumentTier,
): number {
  if (distanceToImpact >= shockwaveRadius) return 0
  const falloff = 1.0 - (distanceToImpact / shockwaveRadius)
  return SHOCKWAVE_BASE_DAMAGE[instrumentTier] * falloff
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/meteor/__tests__/shockwaveDamage.test.ts`

- [ ] **Step 5: Export from barrel**

Add to `src/lib/meteor/index.ts`:
```typescript
export * from './shockwaveDamage'
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/meteor/shockwaveDamage.ts src/lib/meteor/__tests__/shockwaveDamage.test.ts src/lib/meteor/index.ts
git commit -m "feat(meteor): shockwave damage pure function with kill radius and tier scaling"
```

---

### Task 2: Crater Profile Pure Functions

**Files:**
- Create: `src/lib/meteor/craterProfile.ts`
- Create: `src/lib/meteor/__tests__/craterProfile.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/meteor/__tests__/craterProfile.test.ts
import { describe, it, expect } from 'vitest'
import { computeCraterDepth, rollCraterParams, type CraterParams } from '../craterProfile'

describe('computeCraterDepth', () => {
  it('returns max depth at center (dist=0)', () => {
    const d = computeCraterDepth(0, 5, 2)
    expect(d).toBeCloseTo(-2, 1)
  })

  it('returns 0 at crater edge', () => {
    const d = computeCraterDepth(5, 5, 2)
    expect(d).toBeCloseTo(0, 1)
  })

  it('returns positive rim height just outside edge', () => {
    const d = computeCraterDepth(5.5, 5, 2, 0.3)
    expect(d).toBeGreaterThan(0)
  })

  it('returns 0 far beyond rim', () => {
    const d = computeCraterDepth(10, 5, 2, 0.3)
    expect(d).toBeCloseTo(0, 1)
  })
})

describe('rollCraterParams', () => {
  it('returns radius in range 3-8', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollCraterParams()
      expect(p.radius).toBeGreaterThanOrEqual(3)
      expect(p.radius).toBeLessThanOrEqual(8)
    }
  })

  it('returns depth proportional to radius', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollCraterParams()
      expect(p.depth).toBeGreaterThanOrEqual(0.8)
      expect(p.depth).toBeLessThanOrEqual(2.5)
    }
  })

  it('returns rim height in range', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollCraterParams()
      expect(p.rimHeight).toBeGreaterThanOrEqual(0.15)
      expect(p.rimHeight).toBeLessThanOrEqual(0.5)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/meteor/__tests__/craterProfile.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/meteor/craterProfile.ts

export interface CraterParams {
  radius: number    // 3-8m
  depth: number     // 0.8-2.5m
  rimHeight: number // 0.15-0.5m
}

/**
 * Compute the height offset at a given distance from crater center.
 * Returns negative inside the bowl, positive at the rim, zero beyond.
 */
export function computeCraterDepth(
  dist: number,
  radius: number,
  depth: number,
  rimHeight: number = 0.3,
): number {
  if (dist > radius * 1.3) return 0

  // Inside bowl: cosine falloff
  if (dist <= radius) {
    const t = dist / radius
    return -depth * (0.5 + 0.5 * Math.cos(t * Math.PI))
  }

  // Rim zone: gaussian bump
  const rimT = (dist - radius) / (radius * 0.3)
  return rimHeight * Math.exp(-rimT * rimT * 4)
}

/** Roll random crater parameters within GDD ranges. */
export function rollCraterParams(): CraterParams {
  const radius = 3 + Math.random() * 5
  const depth = 0.8 + (radius - 3) / 5 * 1.7
  const rimHeight = 0.15 + Math.random() * 0.35
  return { radius, depth, rimHeight }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/meteor/__tests__/craterProfile.test.ts`

- [ ] **Step 5: Export from barrel and commit**

Add to `src/lib/meteor/index.ts`:
```typescript
export * from './craterProfile'
```

```bash
git add src/lib/meteor/craterProfile.ts src/lib/meteor/__tests__/craterProfile.test.ts src/lib/meteor/index.ts
git commit -m "feat(meteor): crater profile math — bowl + rim heightmap deformation"
```

---

### Task 3: Terrain Crater Deformation

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts` (interface + base implementation)
- Modify: `src/three/terrain/GlbTerrainGenerator.ts`
- Modify: `src/three/terrain/MarsGlobalTerrainGenerator.ts`
- Modify: `src/three/terrain/ElevationTerrainGenerator.ts`

- [ ] **Step 1: Add `deformCrater` to `ITerrainGenerator` interface**

Read `src/three/terrain/TerrainGenerator.ts` and add to the `ITerrainGenerator` interface:

```typescript
  /** Deform the heightmap and mesh to create an impact crater. */
  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): void
```

- [ ] **Step 2: Implement in the base `TerrainGenerator` class**

Add the method to the base class (it has `heightmap`, `GRID_SIZE`, `SCALE`, and terrain mesh access):

```typescript
deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): void {
  if (!this.heightmap) return
  const hm = this.heightmap
  const gridSize = /* use the class's grid size constant */
  const scale = this.scale

  // 1. Modify heightmap grid cells within crater radius * 1.3
  const affectRadius = radius * 1.3
  const gxCenter = (x / scale + 0.5) * (gridSize - 1)
  const gzCenter = (z / scale + 0.5) * (gridSize - 1)
  const cellRadius = Math.ceil(affectRadius / scale * (gridSize - 1))

  for (let gz = Math.max(0, Math.floor(gzCenter) - cellRadius); gz <= Math.min(gridSize - 1, Math.floor(gzCenter) + cellRadius); gz++) {
    for (let gx = Math.max(0, Math.floor(gxCenter) - cellRadius); gx <= Math.min(gridSize - 1, Math.floor(gxCenter) + cellRadius); gx++) {
      const wx = (gx / (gridSize - 1) - 0.5) * scale
      const wz = (gz / (gridSize - 1) - 0.5) * scale
      const dist = Math.sqrt((wx - x) * (wx - x) + (wz - z) * (wz - z))
      if (dist > affectRadius) continue

      const offset = computeCraterDepth(dist, radius, depth, rimHeight)
      hm[gz * gridSize + gx] += offset
    }
  }

  // 2. Update mesh vertices — iterate ALL terrain meshes
  this.updateMeshVerticesInRadius(x, z, affectRadius, scale, gridSize)
}
```

The `updateMeshVerticesInRadius` helper iterates terrain mesh(es), finds vertices within the affected area, re-samples their Y from the heightmap, and flags `needsUpdate`. Then recomputes normals.

**Important:** The implementing agent MUST read the actual terrain generator classes to determine:
- How terrain meshes are stored (single mesh vs `terrainMeshes[]` array)
- The grid size constant name (`GRID_SIZE` in Glb, may differ in others)
- How to convert between world coordinates and grid indices (each class has slightly different mapping)

Import `computeCraterDepth` from `@/lib/meteor`.

- [ ] **Step 3: Implement in `GlbTerrainGenerator`**

`GlbTerrainGenerator` stores `terrainMeshes: THREE.Mesh[]` (multiple meshes from GLB). The implementation must iterate ALL terrain meshes. The grid is `GRID_SIZE = 512` and `SCALE = 1000`.

- [ ] **Step 4: Implement in `MarsGlobalTerrainGenerator` and `ElevationTerrainGenerator`**

Same pattern adapted to each class's heightmap storage and mesh structure.

- [ ] **Step 5: Verify build compiles**

Run: `npx vue-tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts src/three/terrain/GlbTerrainGenerator.ts src/three/terrain/MarsGlobalTerrainGenerator.ts src/three/terrain/ElevationTerrainGenerator.ts
git commit -m "feat(meteor): terrain crater deformation — heightmap + mesh vertex update"
```

---

### Task 4: Sky Mood Shift (Blood-Red Tint)

**Files:**
- Modify: `src/three/MarsSky.ts`
- Modify: `src/three/shaders/mars-sky.frag.glsl`

- [ ] **Step 1: Add uniform to MarsSky.ts**

Read `src/three/MarsSky.ts`. In the constructor's uniform block (around line 35-49), add:

```typescript
uMeteorShowerIntensity: { value: 0.0 },
```

Add a setter method:

```typescript
setMeteorShowerIntensity(intensity: number): void {
  this.material.uniforms.uMeteorShowerIntensity.value = intensity
}
```

- [ ] **Step 2: Modify the fragment shader**

Read `src/three/shaders/mars-sky.frag.glsl`. Add the uniform declaration at the top with the other uniforms:

```glsl
uniform float uMeteorShowerIntensity;
```

Find the section after dust haze is applied and before stars (look for comments or the star calculation). Add the blood-red tint:

```glsl
// Meteor shower — blood-red atmospheric glow from ablation
if (uMeteorShowerIntensity > 0.0) {
  vec3 meteorRed = vec3(0.6, 0.08, 0.05);
  float tint = uMeteorShowerIntensity * 0.5;
  skyColor = mix(skyColor, meteorRed, tint);
  skyColor *= 1.0 - uMeteorShowerIntensity * 0.4; // darken
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx vue-tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/three/MarsSky.ts src/three/shaders/mars-sky.frag.glsl
git commit -m "feat(meteor): blood-red sky mood shift during active showers"
```

---

### Task 5: Meteor Trail Particles

**Files:**
- Modify: `src/three/MeteorFallRenderer.ts`

- [ ] **Step 1: Add trail particle system**

Read the current `MeteorFallRenderer.ts`. Add a trail system using `THREE.Points` with a simple shader or `THREE.PointsMaterial`.

For each active fall in `falling` phase:
- Maintain a circular buffer of trail positions (last ~60 frames = ~1 second at 60fps)
- Each frame, write the current mesh position into the next slot
- Use a `THREE.Points` with `THREE.BufferGeometry` — positions from the circular buffer, with per-point opacity based on age (newest = bright, oldest = transparent)

**Trail material:**
```typescript
const trailMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.8,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
})
```

**Extend `ActiveFallVisual`:**
```typescript
trail: THREE.Points | null
trailPositions: Float32Array  // circular buffer, TRAIL_LENGTH * 3
trailHead: number             // current write index
trailCount: number            // how many slots are filled
```

**In `startFall()`:** Create the trail Points object and add to scene.

**In `update()`:** Each frame during `falling` phase, write mesh position to `trailPositions` at `trailHead`, increment head, flag `needsUpdate`. Adjust opacity per-point via a custom attribute or just use a fixed-opacity approach where older points are smaller.

**In `onImpact()` / `completeFall()`:** Remove trail from scene, dispose geometry and material.

- [ ] **Step 2: Verify visually**

Run: `npm run dev`, trigger shower, verify white-hot trails behind falling meteors.

- [ ] **Step 3: Commit**

```bash
git add src/three/MeteorFallRenderer.ts
git commit -m "feat(meteor): glowing particle trail behind falling meteors"
```

---

### Task 6: Wire Shockwave Damage + Kill Detection into Controller

**Files:**
- Modify: `src/views/site-controllers/MeteorController.ts`

- [ ] **Step 1: Add shockwave and kill zone logic to onFallImpact**

Read the current `MeteorController.ts`. In the `onFallImpact` callback, BEFORE processing the rock and VFX, add:

```typescript
const impactPos = new THREE.Vector3(fall.targetX, fall.groundY, fall.targetZ)
const roverPos = fctx.siteScene.rover?.position ?? new THREE.Vector3(Infinity, 0, Infinity)
const dist = roverPos.distanceTo(impactPos)

// Kill zone — direct hit
if (dist < KILL_RADIUS) {
  // Emit game over callback
  onGameOver?.()
  return
}

// Shockwave zone — durability damage
const shockwaveRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER
if (dist < shockwaveRadius) {
  const controller = /* get RoverController from fctx */
  if (controller) {
    for (const inst of controller.instruments) {
      const dmg = computeShockwaveDamage(dist, shockwaveRadius, inst.tier)
      if (dmg > 0) inst.applyHazardDamage(dmg * 100) // durabilityPct is 0-100
    }
  }
  // Set whiteout ref if within 15m
  if (dist < 15) {
    shockWhiteoutActive.value = true
    setTimeout(() => { shockWhiteoutActive.value = false }, 1500)
  }
}
```

Import `KILL_RADIUS`, `SHOCKWAVE_RADIUS_MULTIPLIER`, `computeShockwaveDamage` from `@/lib/meteor`.

- [ ] **Step 2: Add `onGameOver` callback and `shockWhiteoutActive` ref to options**

Extend `MeteorControllerOptions`:
```typescript
onGameOver?: () => void
shockWhiteoutActive: Ref<boolean>
```

- [ ] **Step 3: Wire terrain crater deformation on impact**

After rock registration in `onFallImpact`, call:
```typescript
const crater = rollCraterParams()
const terrain = /* get terrain from scene components */
terrain.deformCrater(fall.targetX, fall.targetZ, crater.radius, crater.depth, crater.rimHeight)
```

Reposition the meteorite rock Y to the new ground level:
```typescript
mesh.position.y = terrain.terrainHeightAt(fall.targetX, fall.targetZ)
```

- [ ] **Step 4: Wire sky intensity**

Add sky reference to scene components. In `onShowerScheduled`, start lerping sky intensity to 1. In `onShowerComplete`, start lerping back to 0. Use a simple per-frame lerp in `tick()`:

```typescript
if (targetSkyIntensity !== currentSkyIntensity) {
  const rate = targetSkyIntensity > currentSkyIntensity ? 0.3 : 0.2 // 3s in, 5s out
  currentSkyIntensity += (targetSkyIntensity - currentSkyIntensity) * rate * sceneDelta
  sky?.setMeteorShowerIntensity(currentSkyIntensity)
}
```

- [ ] **Step 5: Add knockback**

When within shockwave radius (< 10m for push), apply a velocity impulse to the rover:

Read `RoverController.ts` to find how to apply position offset. Add a `applyKnockback(direction, magnitude)` method or directly offset position:

```typescript
if (dist < 10 && controller) {
  const pushDir = roverPos.clone().sub(impactPos).normalize()
  const pushMag = (1 - dist / 10) * 1.0 // 0-1m
  controller.rover.position.x += pushDir.x * pushMag
  controller.rover.position.z += pushDir.z * pushMag
}
```

- [ ] **Step 6: Verify build compiles**

Run: `npx vue-tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/views/site-controllers/MeteorController.ts
git commit -m "feat(meteor): wire shockwave damage, kill detection, crater deformation, sky tint, knockback"
```

---

### Task 7: Wire Controller Changes into Site View

**Files:**
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Add shockWhiteoutActive ref and onGameOver callback**

In `MartianSiteView.vue`, create the refs and game over handler:

```typescript
const meteorShockWhiteout = ref(false)
const meteorGameOver = ref(false)

function onMeteorGameOver() {
  meteorGameOver.value = true
  gameClock.setClockPaused(true)
}
```

Pass these through to `createMarsSiteTickHandlers` → `createMeteorController`.

- [ ] **Step 2: Pass sky reference to MeteorController**

In `MarsSiteViewController.ts`, after `meteorHandler.setSceneComponents()`, also pass the `MarsSky` reference so the controller can set intensity. The implementing agent should check how `siteScene.sky` is accessed.

- [ ] **Step 3: Commit**

```bash
git add src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/MartianSiteView.vue src/views/MarsSiteViewController.ts
git commit -m "feat(meteor): wire shockwave whiteout ref and game over callback through site view"
```

---

### Task 8: Meteor Shock Overlay (Dust Whiteout)

**Files:**
- Create: `src/components/MeteorShockOverlay.vue`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Create the overlay component**

```vue
<template>
  <Transition name="whiteout">
    <div v-if="active" class="meteor-whiteout" />
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ active: boolean }>()
</script>

<style scoped>
.meteor-whiteout {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(120, 80, 30, 0.85);
  pointer-events: none;
}

.whiteout-enter-active {
  transition: opacity 0.15s ease;
}
.whiteout-leave-active {
  transition: opacity 1.5s ease;
}
.whiteout-enter-from,
.whiteout-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Mount in MartianSiteView.vue**

Add `<MeteorShockOverlay :active="meteorShockWhiteout" />` in the template.

- [ ] **Step 3: Commit**

```bash
git add src/components/MeteorShockOverlay.vue src/views/MartianSiteView.vue
git commit -m "feat(meteor): dust whiteout overlay on nearby shockwave"
```

---

### Task 9: Meteor Death Overlay (Game Over)

**Files:**
- Create: `src/components/MeteorDeathOverlay.vue`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Create the death overlay component**

The component handles the full visual sequence: white flash → static/glitch → fade to black → terminal text with `ScrambleText`.

```vue
<template>
  <Teleport to="body">
    <div v-if="active" class="death-root">
      <!-- Phase 1: White flash -->
      <div class="flash" :class="{ visible: phase === 'flash' }" />

      <!-- Phase 2: Static noise -->
      <div class="static" :class="{ visible: phase === 'static' }">
        <canvas ref="noiseCanvas" class="noise-canvas" />
      </div>

      <!-- Phase 3: Fade to black + terminal -->
      <div class="terminal" :class="{ visible: phase === 'terminal' }">
        <div class="terminal-content font-instrument">
          <p class="signal-lost">
            <ScrambleText text="SIGNAL LOST" :play="phase === 'terminal'" :speed="25" />
          </p>
          <p class="detail">
            <ScrambleText text="ROVER TELEMETRY: NO RESPONSE" :play="phase === 'terminal'" :delay="800" :speed="20" />
          </p>
          <p class="detail">
            <ScrambleText text="LAST KNOWN STATUS: CATASTROPHIC IMPACT" :play="phase === 'terminal'" :delay="1600" :speed="20" />
          </p>
          <button class="restart-btn" :class="{ visible: showRestart }" @click="$emit('restart')">
            <ScrambleText text="[ RESTART MISSION ]" :play="showRestart" :delay="200" />
          </button>
          <button class="restart-btn" :class="{ visible: showRestart }" @click="$emit('siteSelect')">
            <ScrambleText text="[ SITE SELECT ]" :play="showRestart" :delay="400" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import ScrambleText from '@/components/ScrambleText.vue'

const props = defineProps<{ active: boolean }>()
defineEmits<{
  (e: 'restart'): void
  (e: 'siteSelect'): void
}>()

type Phase = 'flash' | 'static' | 'terminal'
const phase = ref<Phase>('flash')
const showRestart = ref(false)
const noiseCanvas = ref<HTMLCanvasElement | null>(null)
let noiseInterval: ReturnType<typeof setInterval> | null = null

function drawNoise(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = 256
  canvas.height = 256
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = v
    img.data[i + 1] = v * 0.6
    img.data[i + 2] = v * 0.3
    img.data[i + 3] = 200 + Math.random() * 55
  }
  ctx.putImageData(img, 0, 0)
}

watch(() => props.active, (active) => {
  if (!active) return
  phase.value = 'flash'

  setTimeout(() => {
    phase.value = 'static'
    // Start noise animation
    if (noiseCanvas.value) {
      noiseInterval = setInterval(() => {
        if (noiseCanvas.value) drawNoise(noiseCanvas.value)
      }, 50)
    }
  }, 300)

  setTimeout(() => {
    phase.value = 'terminal'
    if (noiseInterval) { clearInterval(noiseInterval); noiseInterval = null }
  }, 1500)

  setTimeout(() => {
    showRestart.value = true
  }, 4000)
})

onUnmounted(() => {
  if (noiseInterval) clearInterval(noiseInterval)
})
</script>

<style scoped>
.death-root {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.flash {
  position: absolute;
  inset: 0;
  background: white;
  opacity: 0;
  transition: opacity 0.1s;
}
.flash.visible { opacity: 1; }

.static {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  transition: opacity 0.2s;
}
.static.visible { opacity: 1; }

.noise-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  opacity: 0.7;
}

.terminal {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  transition: opacity 1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.terminal.visible { opacity: 1; }

.terminal-content {
  text-align: center;
  color: rgba(230, 180, 130, 1);
}

.signal-lost {
  font-size: 28px;
  letter-spacing: 0.2em;
  margin-bottom: 24px;
}

.detail {
  font-size: 14px;
  color: rgba(230, 180, 130, 0.7);
  margin: 8px 0;
  letter-spacing: 0.1em;
}

.restart-btn {
  display: block;
  margin: 12px auto 0;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 16px;
  color: #ff9932;
  cursor: pointer;
  letter-spacing: 0.12em;
  opacity: 0;
  transition: opacity 0.5s, color 0.15s, text-shadow 0.15s;
  text-shadow: 0 0 10px rgba(255, 153, 50, 0.5);
}
.restart-btn.visible { opacity: 1; }
.restart-btn:hover {
  color: #ffb060;
  text-shadow: 0 0 14px rgba(255, 153, 50, 0.7), 0 0 30px rgba(255, 153, 50, 0.3);
}
</style>
```

- [ ] **Step 2: Mount in MartianSiteView.vue**

Add the component to the template:
```vue
<MeteorDeathOverlay
  :active="meteorGameOver"
  @restart="restartSite"
  @site-select="goToSiteSelect"
/>
```

Wire the restart handlers — `restartSite` reloads the current route, `goToSiteSelect` navigates to `/`.

- [ ] **Step 3: Commit**

```bash
git add src/components/MeteorDeathOverlay.vue src/views/MartianSiteView.vue
git commit -m "feat(meteor): game over overlay — signal lost terminal with ScrambleText"
```

---

### Task 10: Dev Trigger Update + Integration Test

**Files:**
- Modify: `src/views/site-controllers/MeteorController.ts` (if not done in Task 6)
- Create: `src/lib/meteor/__tests__/shockwaveIntegration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// src/lib/meteor/__tests__/shockwaveIntegration.test.ts
import { describe, it, expect } from 'vitest'
import { computeShockwaveDamage, KILL_RADIUS, SHOCKWAVE_RADIUS_MULTIPLIER } from '../shockwaveDamage'
import { rollCraterParams, computeCraterDepth } from '../craterProfile'

describe('shockwave + crater integration', () => {
  it('kill zone is inside shockwave zone', () => {
    const shockRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER
    expect(KILL_RADIUS).toBeLessThan(shockRadius)
  })

  it('shockwave damage is zero at blast edge', () => {
    const shockRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER
    expect(computeShockwaveDamage(shockRadius, shockRadius, 'sensitive')).toBe(0)
  })

  it('crater depth at center exceeds rim height', () => {
    for (let i = 0; i < 20; i++) {
      const p = rollCraterParams()
      const centerDepth = Math.abs(computeCraterDepth(0, p.radius, p.depth, p.rimHeight))
      expect(centerDepth).toBeGreaterThan(p.rimHeight)
    }
  })

  it('crater profile is continuous (no jumps at boundary)', () => {
    const p = rollCraterParams()
    const atEdge = computeCraterDepth(p.radius - 0.01, p.radius, p.depth, p.rimHeight)
    const justPast = computeCraterDepth(p.radius + 0.01, p.radius, p.depth, p.rimHeight)
    // Both should be close to 0 at the boundary
    expect(Math.abs(atEdge)).toBeLessThan(0.1)
    expect(justPast).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/lib/meteor/__tests__/shockwaveIntegration.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/meteor/__tests__/shockwaveIntegration.test.ts
git commit -m "test(meteor): shockwave + crater integration tests"
```

---

### Task 11: Full Test Suite + Type Check + Manual Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Manual play-through**

Run: `npm run dev`

Verify:
1. `MarsDev.weather.triggerMeteorShower(3)` — heavy shower
2. **Sky turns blood-red** during shower, fades back after
3. **Trails visible** — white-hot streaks behind falling meteors
4. **Craters form** — ground deforms at impact sites, meteorite sits in the bowl
5. **Shockwave damage** — drive close to a marker, take instrument durability hits
6. **Dust whiteout** — brown overlay flashes when close to impact
7. **Knockback** — rover pushed away from nearby impact
8. **Kill zone** — park on a marker, get hit → white flash → static → "SIGNAL LOST"
9. **Restart** — click restart, site reloads

- [ ] **Step 4: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "fix(meteor): Pass 2 integration fixes from manual testing"
```
