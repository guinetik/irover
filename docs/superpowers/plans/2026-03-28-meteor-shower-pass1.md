# Meteor Shower Pass 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement meteor shower events that spawn iron-meteorite rocks the player can interact with using all existing instruments, plus MastCam meteor tagging for a new science log category.

**Architecture:** Domain logic in `lib/meteor/` (pure functions for shower probability, fall math). `MeteorTickHandler` drives the shower FSM per frame. `MeteorFallRenderer` handles Three.js visuals (markers, falling mesh, impact VFX). `MeteorController` coordinates between tick handler, renderer, and rock factory. MastCam gets a new observation archive type.

**Tech Stack:** Vue 3, Three.js, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-meteor-shower-pass1-design.md`

---

### Task 1: Domain Types (`lib/meteor/meteorTypes.ts`)

**Files:**
- Create: `src/lib/meteor/meteorTypes.ts`

- [ ] **Step 1: Create the shared interfaces**

```typescript
// src/lib/meteor/meteorTypes.ts

export type ShowerSeverity = 'light' | 'moderate' | 'heavy'

export interface MeteorShower {
  id: string
  severity: ShowerSeverity
  meteorCount: number
  startSol: number
  /** When during the sol the shower triggers (0.2–0.8) */
  triggerAtSolFraction: number
}

export type MeteorFallPhase = 'marker' | 'falling' | 'impacted'

export interface MeteorFall {
  id: string
  showerId: string
  /** GLB mesh variant: 'Lp01'–'Lp10' */
  variant: string
  targetX: number
  targetZ: number
  groundY: number
  /** Seconds the marker is visible before the fall begins (10–20) */
  markerDuration: number
  /** Entry angle in radians (30–70 degrees from horizontal) */
  entryAngle: number
  /** Azimuth in radians (0–2pi) — direction the meteor comes from */
  azimuth: number
  phase: MeteorFallPhase
  /** Time accumulated in the current phase (seconds) */
  elapsed: number
  /** Stagger offset in seconds — delays this fall's marker relative to shower start */
  staggerOffset: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/meteor/meteorTypes.ts
git commit -m "feat(meteor): add shared domain types for shower and fall"
```

---

### Task 2: Shower Probability Functions (`lib/meteor/meteorShower.ts`)

**Files:**
- Create: `src/lib/meteor/meteorShower.ts`
- Create: `src/lib/meteor/__tests__/meteorShower.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/meteor/__tests__/meteorShower.test.ts
import { describe, it, expect } from 'vitest'
import {
  getShowerChancePerSol,
  rollShowerSeverity,
  rollMeteorCount,
  rollTriggerFraction,
  pickMeteoriteVariant,
} from '../meteorShower'

describe('getShowerChancePerSol', () => {
  it('returns ~0.05 for low meteorRisk (0.10)', () => {
    const chance = getShowerChancePerSol(0.10)
    expect(chance).toBeGreaterThan(0.03)
    expect(chance).toBeLessThan(0.08)
  })

  it('returns ~0.50 for high meteorRisk (0.65)', () => {
    const chance = getShowerChancePerSol(0.65)
    expect(chance).toBeGreaterThan(0.25)
    expect(chance).toBeLessThan(0.55)
  })

  it('returns base 0.03 for meteorRisk 0', () => {
    expect(getShowerChancePerSol(0)).toBeCloseTo(0.03, 2)
  })
})

describe('rollShowerSeverity', () => {
  it('returns a valid severity string', () => {
    for (let i = 0; i < 50; i++) {
      const sev = rollShowerSeverity(0.3)
      expect(['light', 'moderate', 'heavy']).toContain(sev)
    }
  })
})

describe('rollMeteorCount', () => {
  it('returns 1-2 for light', () => {
    for (let i = 0; i < 50; i++) {
      const n = rollMeteorCount('light')
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(2)
    }
  })

  it('returns 3-5 for moderate', () => {
    for (let i = 0; i < 50; i++) {
      const n = rollMeteorCount('moderate')
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(5)
    }
  })

  it('returns 6-10 for heavy', () => {
    for (let i = 0; i < 50; i++) {
      const n = rollMeteorCount('heavy')
      expect(n).toBeGreaterThanOrEqual(6)
      expect(n).toBeLessThanOrEqual(10)
    }
  })
})

describe('rollTriggerFraction', () => {
  it('returns values between 0.2 and 0.8', () => {
    for (let i = 0; i < 100; i++) {
      const f = rollTriggerFraction()
      expect(f).toBeGreaterThanOrEqual(0.2)
      expect(f).toBeLessThanOrEqual(0.8)
    }
  })
})

describe('pickMeteoriteVariant', () => {
  it('returns Lp01 through Lp10', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(pickMeteoriteVariant())
    }
    expect(seen.size).toBe(10)
    for (let i = 1; i <= 10; i++) {
      expect(seen).toContain(`Lp${String(i).padStart(2, '0')}`)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/meteor/__tests__/meteorShower.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/meteor/meteorShower.ts
import type { ShowerSeverity } from './meteorTypes'

const METEOR_COUNTS: Record<ShowerSeverity, [number, number]> = {
  light:    [1, 2],
  moderate: [3, 5],
  heavy:    [6, 10],
}

/**
 * Per-sol shower probability. Maps meteorRisk to a daily chance
 * such that the expected interval matches the GDD design table.
 *
 *   meteorRisk 0.10 → ~0.05/sol  → mean interval ~20 sols
 *   meteorRisk 0.30 → ~0.17/sol  → mean interval ~6 sols
 *   meteorRisk 0.65 → ~0.50/sol  → mean interval ~2 sols
 */
export function getShowerChancePerSol(meteorRisk: number): number {
  return 0.03 + 0.47 * Math.pow(meteorRisk, 1.4)
}

export function rollShowerThisSol(meteorRisk: number): boolean {
  return Math.random() < getShowerChancePerSol(meteorRisk)
}

export function rollShowerSeverity(meteorRisk: number): ShowerSeverity {
  const roll = Math.random()
  if (meteorRisk >= 0.55) return roll < 0.7 ? 'heavy' : 'moderate'
  if (meteorRisk >= 0.30) return roll < 0.5 ? 'moderate' : roll < 0.85 ? 'heavy' : 'light'
  if (meteorRisk >= 0.15) return roll < 0.6 ? 'light' : 'moderate'
  return 'light'
}

export function rollMeteorCount(severity: ShowerSeverity): number {
  const [min, max] = METEOR_COUNTS[severity]
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Random trigger fraction within the sol (0.2–0.8) */
export function rollTriggerFraction(): number {
  return 0.2 + Math.random() * 0.6
}

/** Pick a random meteorite GLB variant: 'Lp01' through 'Lp10' */
export function pickMeteoriteVariant(): string {
  const index = Math.floor(Math.random() * 10) + 1
  return `Lp${String(index).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/meteor/__tests__/meteorShower.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/meteor/meteorShower.ts src/lib/meteor/__tests__/meteorShower.test.ts
git commit -m "feat(meteor): shower probability and severity roll functions with tests"
```

---

### Task 3: Fall Geometry Functions (`lib/meteor/meteorFall.ts`)

**Files:**
- Create: `src/lib/meteor/meteorFall.ts`
- Create: `src/lib/meteor/__tests__/meteorFall.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/meteor/__tests__/meteorFall.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeSkyOrigin,
  rollMarkerDuration,
  rollEntryAngle,
  rollAzimuth,
  computeSoundDelay,
  FALL_DURATION,
} from '../meteorFall'

describe('computeSkyOrigin', () => {
  it('returns a point above the target', () => {
    const origin = computeSkyOrigin(10, 20, 0, Math.PI / 4, 0)
    expect(origin.y).toBeGreaterThan(80)
    expect(origin.y).toBeLessThan(120)
  })

  it('offsets horizontally from the target', () => {
    const origin = computeSkyOrigin(0, 0, 0, Math.PI / 4, 0)
    // At 45 degrees, horizontal offset ≈ height
    expect(Math.abs(origin.x)).toBeGreaterThan(10)
  })
})

describe('rollMarkerDuration', () => {
  it('returns values between 10 and 20', () => {
    for (let i = 0; i < 100; i++) {
      const d = rollMarkerDuration()
      expect(d).toBeGreaterThanOrEqual(10)
      expect(d).toBeLessThanOrEqual(20)
    }
  })
})

describe('rollEntryAngle', () => {
  it('returns radians between 30 and 70 degrees', () => {
    const minRad = 30 * (Math.PI / 180)
    const maxRad = 70 * (Math.PI / 180)
    for (let i = 0; i < 100; i++) {
      const a = rollEntryAngle()
      expect(a).toBeGreaterThanOrEqual(minRad - 0.001)
      expect(a).toBeLessThanOrEqual(maxRad + 0.001)
    }
  })
})

describe('rollAzimuth', () => {
  it('returns values between 0 and 2pi', () => {
    for (let i = 0; i < 100; i++) {
      const a = rollAzimuth()
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(Math.PI * 2)
    }
  })
})

describe('computeSoundDelay', () => {
  it('computes delay based on Mars speed of sound (240 m/s)', () => {
    expect(computeSoundDelay(240)).toBeCloseTo(1.0)
    expect(computeSoundDelay(480)).toBeCloseTo(2.0)
    expect(computeSoundDelay(0)).toBe(0)
  })
})

describe('FALL_DURATION', () => {
  it('is approximately 8 seconds', () => {
    expect(FALL_DURATION).toBe(8)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/meteor/__tests__/meteorFall.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/meteor/meteorFall.ts

/** Duration of the fall animation in seconds (matched to meteor-fall.mp3). */
export const FALL_DURATION = 8

/** Speed of sound on Mars in m/s. */
const MARS_SPEED_OF_SOUND = 240

export function computeSkyOrigin(
  targetX: number,
  targetZ: number,
  groundY: number,
  entryAngle: number,
  azimuth: number,
): { x: number; y: number; z: number } {
  const height = 80 + Math.random() * 40 // 80–120m above ground
  const horizontalOffset = height / Math.tan(entryAngle)
  return {
    x: targetX + Math.cos(azimuth) * horizontalOffset,
    y: groundY + height,
    z: targetZ + Math.sin(azimuth) * horizontalOffset,
  }
}

/** Random marker warning duration: 10–20 seconds. */
export function rollMarkerDuration(): number {
  return 10 + Math.random() * 10
}

/** Random entry angle: 30–70 degrees from horizontal, returned in radians. */
export function rollEntryAngle(): number {
  const deg = 30 + Math.random() * 40
  return deg * (Math.PI / 180)
}

/** Random azimuth: 0–2pi radians. */
export function rollAzimuth(): number {
  return Math.random() * Math.PI * 2
}

/** Delay in seconds for impact sound to reach the player at the given distance. */
export function computeSoundDelay(distanceM: number): number {
  return distanceM / MARS_SPEED_OF_SOUND
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/meteor/__tests__/meteorFall.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Create barrel export**

```typescript
// src/lib/meteor/index.ts
export * from './meteorTypes'
export * from './meteorShower'
export * from './meteorFall'
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/meteor/meteorFall.ts src/lib/meteor/__tests__/meteorFall.test.ts src/lib/meteor/index.ts
git commit -m "feat(meteor): fall geometry math functions with tests"
```

---

### Task 4: Audio Manifest — Register Meteor Sounds

**Files:**
- Modify: `src/audio/audioManifest.ts`

- [ ] **Step 1: Add sound IDs to the AUDIO_SOUND_IDS array**

In `src/audio/audioManifest.ts`, add to the `AUDIO_SOUND_IDS` array (after `'sfx.radEventSting'`):

```typescript
  'sfx.meteorFall',
  'sfx.meteorImpact',
```

- [ ] **Step 2: Add to INSTRUMENT_ACTION_SOUND_IDS array**

After `'sfx.radEventSting'` in the `INSTRUMENT_ACTION_SOUND_IDS` array:

```typescript
  'sfx.meteorFall',
  'sfx.meteorImpact',
```

- [ ] **Step 3: Add manifest entries**

Add to the `manifestById` object (before the closing `}`):

```typescript
  'sfx.meteorFall': {
    id: 'sfx.meteorFall',
    src: '/sound/meteor-fall.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.meteorImpact': {
    id: 'sfx.meteorImpact',
    src: '/sound/meteor-impact.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.75,
    effect: 'none',
  },
```

Note: `playback: 'overlap'` allows multiple simultaneous instances for heavy showers.

- [ ] **Step 4: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors (ManifestById enforces every AUDIO_SOUND_IDS entry has a definition)

- [ ] **Step 5: Commit**

```bash
git add src/audio/audioManifest.ts
git commit -m "feat(meteor): register meteor-fall and meteor-impact sounds in audio manifest"
```

---

### Task 5: Waypoint Marker Color Parameter

**Files:**
- Modify: `src/three/WaypointMarkers.ts`

- [ ] **Step 1: Add color parameter to `addWaypointMarker`**

Change the `addWaypointMarker` function signature and `createMarkerMesh` to accept an optional color:

```typescript
function createMarkerMesh(color: number = MARKER_COLOR): THREE.Group {
  const group = new THREE.Group()

  // Vertical beam
  const beamGeo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 8)
  const beamMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.position.y = BEAM_HEIGHT / 2
  group.add(beam)

  // Base ring
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.1
  group.add(ring)

  // Top diamond
  const diamondGeo = new THREE.OctahedronGeometry(0.4, 0)
  const diamondMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })
  const diamond = new THREE.Mesh(diamondGeo, diamondMat)
  diamond.position.y = BEAM_HEIGHT + 0.6
  group.add(diamond)

  return group
}

export function addWaypointMarker(
  id: string,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
  color?: number,
): void {
  if (markers.find((m) => m.id === id)) return

  const group = createMarkerMesh(color)
  group.position.set(x, groundY, z)
  scene.add(group)
  markers.push({ id, group })
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors — existing callers pass no color arg, default applies.

- [ ] **Step 3: Commit**

```bash
git add src/three/WaypointMarkers.ts
git commit -m "feat(waypoints): add optional color parameter to addWaypointMarker"
```

---

### Task 6: RockFactory Extension — Meteorite Rock Creation

**Files:**
- Modify: `src/three/terrain/RockFactory.ts`

- [ ] **Step 1: Add meteorites.glb loading alongside rocks.glb**

Add new private fields after the existing `glbRockReady` field (around line 53):

```typescript
  /** Meteorite mesh templates from meteorites.glb, keyed by variant name (Lp01–Lp10). */
  private meteoriteGeos = new Map<string, THREE.BufferGeometry>()
  private meteoriteBottomY = new Map<string, number>()
  private meteoriteReady: Promise<void>
```

Add meteorites.glb loading at the end of the constructor (after the `rocks.glb` loading block, around line 131):

```typescript
    // Load meteorites.glb — 10 meteorite variants (Lp01–Lp10).
    this.meteoriteReady = new GLTFLoader().loadAsync('/meteorites.glb').then((gltf) => {
      gltf.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const name = child.name // e.g. 'Lp01', 'Lp02', ...
        if (!name.startsWith('Lp')) return
        const geo = child.geometry as THREE.BufferGeometry

        geo.computeBoundingBox()
        const box = geo.boundingBox!
        const size = new THREE.Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const center = new THREE.Vector3()
        box.getCenter(center)
        geo.translate(-center.x, -center.y, -center.z)
        geo.scale(1 / maxDim, 1 / maxDim, 1 / maxDim)

        if (!geo.attributes.normal) {
          geo.computeVertexNormals()
        }

        geo.computeBoundingBox()
        this.meteoriteBottomY.set(name, geo.boundingBox!.min.y)
        this.meteoriteGeos.set(name, geo)
      })
    }).catch(() => {
      // meteorites.glb not found — meteor showers won't spawn visual meshes
    })
```

- [ ] **Step 2: Update the `ready()` method to also await meteorites**

```typescript
  async ready(): Promise<void> {
    await Promise.all([this.glbRockReady, this.meteoriteReady])
  }
```

- [ ] **Step 3: Add `createMeteoriteRock` method**

Add after the `getSmallRocks()` method:

```typescript
  /**
   * Creates an iron-meteorite rock mesh using a specific variant from meteorites.glb.
   * The returned mesh has standard rock userData but is flagged as `fromShower: true`.
   * Caller is responsible for positioning and adding to scene/group.
   *
   * @param variant GLB variant name: 'Lp01' through 'Lp10'
   * @param showerId Shower ID for tracking
   * @returns The rock mesh, or null if the variant is not loaded
   */
  createMeteoriteRock(variant: string, showerId: string): THREE.Mesh | null {
    const geo = this.meteoriteGeos.get(variant)
    if (!geo) return null

    const mat = this.glbMatMap.get('iron-meteorite')
    if (!mat) return null

    const rock = new THREE.Mesh(geo, mat)
    rock.userData.rockType = 'iron-meteorite'
    rock.userData.fromShower = true
    rock.userData.showerId = showerId
    rock.userData.meteoriteVariant = variant
    rock.castShadow = true

    // Scale to a reasonable meteorite size (0.5–1.5m diameter)
    const sc = 0.5 + Math.random() * 1.0
    rock.scale.set(sc, sc * 0.75, sc)

    return rock
  }

  /**
   * Registers a meteorite rock in the collision and interaction systems.
   * Call after positioning the rock at its final ground location.
   */
  registerMeteoriteRock(rock: THREE.Mesh, group: THREE.Group): void {
    group.add(rock)
    this.rocks.push(rock)
    const sc = rock.scale.x
    this.colliders.push({
      x: rock.position.x,
      z: rock.position.z,
      radius: sc * 0.5,
      height: sc * rock.scale.y,
    })
    this.gridInsert(this.colliders.length - 1)
  }

  /**
   * Removes a meteorite rock from the collision and interaction systems.
   */
  unregisterMeteoriteRock(rock: THREE.Mesh, group: THREE.Group): void {
    group.remove(rock)
    const idx = this.rocks.indexOf(rock)
    if (idx !== -1) this.rocks.splice(idx, 1)
    // Note: collider removal from grid is expensive and not critical for storm cleanup.
    // The collider will be orphaned but harmless (no mesh to collide with).
  }
```

- [ ] **Step 4: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/three/terrain/RockFactory.ts
git commit -m "feat(meteor): extend RockFactory to load meteorites.glb and create meteorite rocks"
```

---

### Task 7: REMS Meteor Weather Refs

**Files:**
- Modify: `src/composables/useSiteRemsWeather.ts`

- [ ] **Step 1: Add meteor text refs**

After the existing `remsStormActiveText` ref (line 78), add:

```typescript
  const remsMeteorIncomingText = ref<string | null>(null)
  const remsMeteorActiveText = ref<string | null>(null)
```

- [ ] **Step 2: Expose in the return object**

Add to the return object (around line 172):

```typescript
    remsMeteorIncomingText,
    remsMeteorActiveText,
```

- [ ] **Step 3: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/composables/useSiteRemsWeather.ts
git commit -m "feat(meteor): add REMS meteor incoming/active text refs"
```

---

### Task 8: Meteor Fall Renderer (`three/MeteorFallRenderer.ts`)

**Files:**
- Create: `src/three/MeteorFallRenderer.ts`

This is the Three.js visual layer. It manages waypoint markers, falling meshes with burn effects, impact flash, dust plume particles, camera shake, and audio.

- [ ] **Step 1: Create the renderer**

```typescript
// src/three/MeteorFallRenderer.ts
import * as THREE from 'three'
import {
  addWaypointMarker,
  removeWaypointMarker,
  updateWaypointMarkers,
} from './WaypointMarkers'
import { computeSkyOrigin, FALL_DURATION, computeSoundDelay } from '@/lib/meteor'
import type { MeteorFall } from '@/lib/meteor'
import type { AudioManager } from '@/audio/AudioManager'
import type { AudioSoundId } from '@/audio/audioManifest'

const METEOR_MARKER_COLOR = 0xff6633

/** Burn material applied during the falling phase. */
function createBurnMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff8844,
    emissive: 0xff6622,
    emissiveIntensity: 2.5,
    roughness: 0.3,
    metalness: 0.5,
  })
}

interface ActiveFallVisual {
  fall: MeteorFall
  mesh: THREE.Mesh
  originMaterial: THREE.Material | THREE.Material[]
  burnMaterial: THREE.MeshStandardMaterial
  origin: THREE.Vector3
  target: THREE.Vector3
  flash: THREE.PointLight | null
  flashElapsed: number
}

/** Camera shake state */
interface ShakeState {
  intensity: number
  duration: number
  elapsed: number
}

export class MeteorFallRenderer {
  private visuals = new Map<string, ActiveFallVisual>()
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera | null = null
  private audioManager: AudioManager | null = null
  private shake: ShakeState | null = null
  private cameraBasePosition = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager
  }

  /** Show the red-orange waypoint marker for a fall. */
  showMarker(fall: MeteorFall): void {
    const markerId = `meteor-${fall.id}`
    addWaypointMarker(markerId, fall.targetX, fall.targetZ, fall.groundY, this.scene, METEOR_MARKER_COLOR)
  }

  /** Remove the waypoint marker for a fall. */
  removeMarker(fall: MeteorFall): void {
    removeWaypointMarker(`meteor-${fall.id}`, this.scene)
  }

  /** Start the falling phase: attach the mesh to the scene at sky origin, apply burn material. */
  startFall(fall: MeteorFall, mesh: THREE.Mesh): void {
    const origin = computeSkyOrigin(
      fall.targetX, fall.targetZ, fall.groundY,
      fall.entryAngle, fall.azimuth,
    )
    const originVec = new THREE.Vector3(origin.x, origin.y, origin.z)
    const targetVec = new THREE.Vector3(fall.targetX, fall.groundY, fall.targetZ)

    mesh.position.copy(originVec)
    this.scene.add(mesh)

    const burnMat = createBurnMaterial()
    const visual: ActiveFallVisual = {
      fall,
      mesh,
      originMaterial: mesh.material,
      burnMaterial: burnMat,
      origin: originVec,
      target: targetVec,
      flash: null,
      flashElapsed: 0,
    }
    mesh.material = burnMat
    this.visuals.set(fall.id, visual)

    // Play fall sound
    this.audioManager?.play('sfx.meteorFall' as AudioSoundId)
  }

  /** Called each frame to update falling meshes, flashes, and shake. */
  update(delta: number, roverPosition: THREE.Vector3): void {
    for (const [id, visual] of this.visuals) {
      const { fall, mesh, origin, target, burnMaterial } = visual

      if (fall.phase === 'falling') {
        // Lerp with slight ease-in for gravitational feel
        const t = Math.min(fall.elapsed / FALL_DURATION, 1)
        const eased = t * t // quadratic ease-in: accelerates like gravity
        mesh.position.lerpVectors(origin, target, eased)

        // Intensify burn as it descends
        burnMaterial.emissiveIntensity = 2.5 + eased * 3.0

        // Spin the rock during fall
        mesh.rotation.x += delta * 2.0
        mesh.rotation.z += delta * 1.5
      }

      // Flash fade-out
      if (visual.flash) {
        visual.flashElapsed += delta
        const flashDuration = 0.3
        if (visual.flashElapsed >= flashDuration) {
          this.scene.remove(visual.flash)
          visual.flash.dispose()
          visual.flash = null
        } else {
          visual.flash.intensity = 8 * (1 - visual.flashElapsed / flashDuration)
        }
      }
    }

    // Camera shake
    if (this.shake && this.camera) {
      this.shake.elapsed += delta
      if (this.shake.elapsed >= this.shake.duration) {
        this.shake = null
      } else {
        const decay = 1 - this.shake.elapsed / this.shake.duration
        const magnitude = this.shake.intensity * decay
        this.camera.position.x += (Math.random() - 0.5) * magnitude
        this.camera.position.y += (Math.random() - 0.5) * magnitude * 0.5
        this.camera.position.z += (Math.random() - 0.5) * magnitude
      }
    }

    // Always update waypoint marker animations
    // (handled by the global updateWaypointMarkers in the render loop)
  }

  /** Finalize impact: strip burn, flash, shake, play impact sound. */
  onImpact(fall: MeteorFall, roverPosition: THREE.Vector3): void {
    const visual = this.visuals.get(fall.id)
    if (!visual) return

    const { mesh, originMaterial, target } = visual

    // Strip burn material, restore iron-meteorite material
    mesh.material = originMaterial
    // Ensure mesh is exactly at ground target
    mesh.position.copy(target)
    // Reset rotation to a settled orientation
    mesh.rotation.set(
      Math.random() * 0.3,
      Math.random() * Math.PI * 2,
      Math.random() * 0.3,
    )

    // Impact flash
    const flash = new THREE.PointLight(0xffaa44, 8, 50)
    flash.position.copy(target)
    flash.position.y += 1
    this.scene.add(flash)
    visual.flash = flash
    visual.flashElapsed = 0

    // Camera shake based on distance
    const distance = roverPosition.distanceTo(target)
    let shakeIntensity = 0
    let shakeDuration = 0
    if (distance < 30) {
      shakeIntensity = 0.4
      shakeDuration = 1.2
    } else if (distance < 100) {
      shakeIntensity = 0.2
      shakeDuration = 0.8
    } else if (distance < 300) {
      shakeIntensity = 0.08
      shakeDuration = 0.4
    }
    if (shakeIntensity > 0) {
      this.shake = { intensity: shakeIntensity, duration: shakeDuration, elapsed: 0 }
    }

    // Impact sound with Mars speed-of-sound delay
    const soundDelay = computeSoundDelay(distance)
    if (soundDelay < 0.05) {
      this.audioManager?.play('sfx.meteorImpact' as AudioSoundId)
    } else {
      setTimeout(() => {
        this.audioManager?.play('sfx.meteorImpact' as AudioSoundId)
      }, soundDelay * 1000)
    }

    // Remove marker
    this.removeMarker(fall)
  }

  /** Clean up a completed fall's visual tracking (call after impact is fully processed). */
  completeFall(fallId: string): void {
    const visual = this.visuals.get(fallId)
    if (!visual) return
    if (visual.flash) {
      this.scene.remove(visual.flash)
      visual.flash.dispose()
    }
    visual.burnMaterial.dispose()
    this.visuals.delete(fallId)
  }

  dispose(): void {
    for (const [id, visual] of this.visuals) {
      this.removeMarker(visual.fall)
      if (visual.flash) {
        this.scene.remove(visual.flash)
        visual.flash.dispose()
      }
      visual.burnMaterial.dispose()
    }
    this.visuals.clear()
    this.shake = null
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/MeteorFallRenderer.ts
git commit -m "feat(meteor): MeteorFallRenderer — markers, falling meshes, impact VFX, camera shake"
```

---

### Task 9: Meteor Tick Handler (`site-controllers/MeteorTickHandler.ts`)

**Files:**
- Create: `src/views/site-controllers/MeteorTickHandler.ts`

The tick handler drives the shower FSM: schedules showers per sol, staggers falls, advances each fall through marker → falling → impacted phases.

- [ ] **Step 1: Create the tick handler**

```typescript
// src/views/site-controllers/MeteorTickHandler.ts
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import type { MeteorFall, MeteorShower } from '@/lib/meteor'
import {
  rollShowerThisSol,
  rollShowerSeverity,
  rollMeteorCount,
  rollTriggerFraction,
  pickMeteoriteVariant,
} from '@/lib/meteor'
import {
  rollMarkerDuration,
  rollEntryAngle,
  rollAzimuth,
  FALL_DURATION,
} from '@/lib/meteor'
import { TERRAIN_SCALE } from '@/three/terrain/terrainConstants'

/** Seconds before the shower trigger that REMS fires the incoming warning. */
const REMS_WARNING_LEAD_SEC = 15

/** Maximum stagger spread in seconds between first and last marker. */
const STAGGER_SPREAD_SEC = 6

export interface MeteorTickCallbacks {
  meteorRisk: number
  heightAt: (x: number, z: number) => number
  onShowerScheduled: (shower: MeteorShower) => void
  onFallMarkerShow: (fall: MeteorFall) => void
  onFallStart: (fall: MeteorFall) => void
  onFallImpact: (fall: MeteorFall) => void
  onShowerComplete: () => void
}

export function createMeteorTickHandler(
  callbacks: MeteorTickCallbacks,
): SiteTickHandler {
  const { meteorRisk, heightAt } = callbacks

  let lastSol = -1
  let scheduledShower: (MeteorShower & { triggered: boolean; warningFired: boolean }) | null = null
  const activeFalls: MeteorFall[] = []
  /** Falls waiting for their stagger offset before showing marker. */
  let pendingFalls: MeteorFall[] = []
  let showerElapsed = 0
  let allFallsCompleted = false

  function scheduleShowerForSol(sol: number): void {
    if (!rollShowerThisSol(meteorRisk)) return

    const severity = rollShowerSeverity(meteorRisk)
    const meteorCount = rollMeteorCount(severity)
    const triggerFraction = rollTriggerFraction()
    const half = TERRAIN_SCALE / 2

    const shower: MeteorShower = {
      id: `shower-${sol}-${Date.now()}`,
      severity,
      meteorCount,
      startSol: sol,
      triggerAtSolFraction: triggerFraction,
    }

    // Pre-generate all falls with staggered offsets
    const falls: MeteorFall[] = []
    for (let i = 0; i < meteorCount; i++) {
      const targetX = (Math.random() - 0.5) * half * 1.6
      const targetZ = (Math.random() - 0.5) * half * 1.6
      const groundY = heightAt(targetX, targetZ)
      if (Number.isNaN(groundY)) continue

      falls.push({
        id: `${shower.id}-fall-${i}`,
        showerId: shower.id,
        variant: pickMeteoriteVariant(),
        targetX,
        targetZ,
        groundY,
        markerDuration: rollMarkerDuration(),
        entryAngle: rollEntryAngle(),
        azimuth: rollAzimuth(),
        phase: 'marker',
        elapsed: 0,
        staggerOffset: (i / Math.max(1, meteorCount - 1)) * STAGGER_SPREAD_SEC,
      })
    }

    pendingFalls = falls
    scheduledShower = { ...shower, triggered: false, warningFired: false }
    callbacks.onShowerScheduled(shower)
  }

  function tick(fctx: SiteFrameContext): void {
    const { sceneDelta, marsSol, marsTimeOfDay } = fctx

    // New sol: roll for a shower
    if (marsSol !== lastSol) {
      lastSol = marsSol
      if (!scheduledShower) {
        scheduleShowerForSol(marsSol)
      }
    }

    if (!scheduledShower) return

    // Current sol fraction (marsTimeOfDay is 0–1 within the sol)
    const solFraction = marsTimeOfDay

    // REMS warning (fires once, before trigger)
    if (
      !scheduledShower.warningFired
      && !scheduledShower.triggered
    ) {
      // Check if we're within the warning window
      // Convert REMS_WARNING_LEAD_SEC to sol fraction
      // A sol is ~88775 seconds (real Mars sol), but in-game it's compressed.
      // We use the simulationTime progression instead — check elapsed time.
      // Simpler: fire warning when sol fraction is within lead time of trigger.
      const warningFraction = scheduledShower.triggerAtSolFraction - 0.03
      if (solFraction >= warningFraction) {
        scheduledShower.warningFired = true
      }
    }

    // Trigger the shower
    if (!scheduledShower.triggered && solFraction >= scheduledShower.triggerAtSolFraction) {
      scheduledShower.triggered = true
      showerElapsed = 0
      allFallsCompleted = false
    }

    if (!scheduledShower.triggered) return

    // Advance shower elapsed time
    showerElapsed += sceneDelta

    // Release pending falls based on stagger offset
    for (let i = pendingFalls.length - 1; i >= 0; i--) {
      const fall = pendingFalls[i]
      if (showerElapsed >= fall.staggerOffset) {
        activeFalls.push(fall)
        pendingFalls.splice(i, 1)
        callbacks.onFallMarkerShow(fall)
      }
    }

    // Advance each active fall
    for (let i = activeFalls.length - 1; i >= 0; i--) {
      const fall = activeFalls[i]
      fall.elapsed += sceneDelta

      if (fall.phase === 'marker') {
        if (fall.elapsed >= fall.markerDuration) {
          fall.phase = 'falling'
          fall.elapsed = 0
          callbacks.onFallStart(fall)
        }
      } else if (fall.phase === 'falling') {
        if (fall.elapsed >= FALL_DURATION) {
          fall.phase = 'impacted'
          callbacks.onFallImpact(fall)
          activeFalls.splice(i, 1)
        }
      }
    }

    // Check if shower is complete
    if (
      scheduledShower.triggered
      && pendingFalls.length === 0
      && activeFalls.length === 0
      && !allFallsCompleted
    ) {
      allFallsCompleted = true
      callbacks.onShowerComplete()
      scheduledShower = null
    }
  }

  function dispose(): void {
    activeFalls.length = 0
    pendingFalls = []
    scheduledShower = null
  }

  return { tick, dispose }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/views/site-controllers/MeteorTickHandler.ts
git commit -m "feat(meteor): MeteorTickHandler — shower FSM, fall phase advancement, staggered spawns"
```

---

### Task 10: Meteor Controller (`site-controllers/MeteorController.ts`)

**Files:**
- Create: `src/views/site-controllers/MeteorController.ts`

The coordinator. Wires tick handler + renderer + rock factory + REMS.

- [ ] **Step 1: Create the controller**

```typescript
// src/views/site-controllers/MeteorController.ts
import * as THREE from 'three'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import { createMeteorTickHandler } from './MeteorTickHandler'
import { MeteorFallRenderer } from '@/three/MeteorFallRenderer'
import type { RockFactory } from '@/three/terrain/RockFactory'
import type { MeteorFall, MeteorShower, ShowerSeverity } from '@/lib/meteor'
import type { AudioManager } from '@/audio/AudioManager'
import type { Ref } from 'vue'

const SEVERITY_LABELS: Record<ShowerSeverity, string> = {
  light: 'Light',
  moderate: 'Moderate',
  heavy: 'Heavy',
}

export interface MeteorControllerOptions {
  meteorRisk: number
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rockFactory: RockFactory
  terrainGroup: THREE.Group
  heightAt: (x: number, z: number) => number
  audioManager: AudioManager | null
  remsMeteorIncomingText: Ref<string | null>
  remsMeteorActiveText: Ref<string | null>
}

export function createMeteorController(
  options: MeteorControllerOptions,
): SiteTickHandler & {
  onStormActive: () => void
  getActiveMeteoriteRocks: () => THREE.Mesh[]
} {
  const {
    meteorRisk,
    scene,
    camera,
    rockFactory,
    terrainGroup,
    heightAt,
    audioManager,
    remsMeteorIncomingText,
    remsMeteorActiveText,
  } = options

  const renderer = new MeteorFallRenderer(scene)
  renderer.setCamera(camera)
  if (audioManager) renderer.setAudioManager(audioManager)

  /** Meteorite rocks currently on the ground (for storm cleanup and MastCam tagging). */
  const meteoriteRocks: THREE.Mesh[] = []

  /** Meshes currently in flight, keyed by fall ID. */
  const fallingMeshes = new Map<string, THREE.Mesh>()

  const tickHandler = createMeteorTickHandler({
    meteorRisk,
    heightAt,

    onShowerScheduled(shower: MeteorShower) {
      const label = SEVERITY_LABELS[shower.severity]
      remsMeteorIncomingText.value =
        `REMS: Meteor shower incoming — elevated bolide activity detected. Expect ${label}.`
    },

    onFallMarkerShow(fall: MeteorFall) {
      renderer.showMarker(fall)
      if (!remsMeteorActiveText.value) {
        remsMeteorActiveText.value = `REMS: Meteor shower active.`
        remsMeteorIncomingText.value = null
      }
    },

    onFallStart(fall: MeteorFall) {
      // Create the rock from the factory — this IS the interactable rock
      const mesh = rockFactory.createMeteoriteRock(fall.variant, fall.showerId)
      if (!mesh) return
      fallingMeshes.set(fall.id, mesh)
      renderer.startFall(fall, mesh)
    },

    onFallImpact(fall: MeteorFall) {
      const mesh = fallingMeshes.get(fall.id)
      if (!mesh) return
      fallingMeshes.delete(fall.id)

      const roverPos = scene.getObjectByName('RoverGroup')?.position ?? new THREE.Vector3()
      renderer.onImpact(fall, roverPos)

      // Register the rock in the rock system — it's now interactable
      rockFactory.registerMeteoriteRock(mesh, terrainGroup)
      meteoriteRocks.push(mesh)

      renderer.completeFall(fall.id)
    },

    onShowerComplete() {
      remsMeteorIncomingText.value = null
      remsMeteorActiveText.value = null
    },
  })

  function tick(fctx: SiteFrameContext): void {
    tickHandler.tick(fctx)

    const roverPos = fctx.siteScene.rover?.position ?? new THREE.Vector3()
    renderer.update(fctx.sceneDelta, roverPos)
  }

  /** Called when a dust storm becomes active — removes all meteorite rocks. */
  function onStormActive(): void {
    for (const rock of meteoriteRocks) {
      rockFactory.unregisterMeteoriteRock(rock, terrainGroup)
    }
    meteoriteRocks.length = 0
  }

  function getActiveMeteoriteRocks(): THREE.Mesh[] {
    return meteoriteRocks
  }

  function dispose(): void {
    tickHandler.dispose()
    renderer.dispose()
    onStormActive() // Clean up any remaining rocks
  }

  return { tick, dispose, onStormActive, getActiveMeteoriteRocks }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/views/site-controllers/MeteorController.ts
git commit -m "feat(meteor): MeteorController — wires tick handler, renderer, rock factory, REMS"
```

---

### Task 11: Wire Meteor Controller Into Site View

**Files:**
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts`

- [ ] **Step 1: Import and create the meteor controller**

Add import at top:

```typescript
import { createMeteorController } from './MeteorController'
```

Add to `MarsSiteTickHandlers` interface:

```typescript
  meteorHandler: ReturnType<typeof createMeteorController>
```

- [ ] **Step 2: Create the handler in `createMarsSiteTickHandlers`**

After the `radHandler` creation (around line 289), add:

```typescript
  const meteorHandler = createMeteorController({
    meteorRisk: useMarsData().landmarks.value.find(l => l.id === ctx.siteId)?.meteorRisk ?? 0.18,
    scene: ctx.siteScene.scene,
    camera: ctx.camera,
    rockFactory: ctx.siteScene.terrain.rockSpawner,
    terrainGroup: ctx.siteScene.terrain.group,
    heightAt: (x, z) => ctx.siteScene.terrain.heightAt(x, z),
    audioManager: ctx.audioManager ?? null,
    remsMeteorIncomingText: ctx.remsWeather.remsMeteorIncomingText,
    remsMeteorActiveText: ctx.remsWeather.remsMeteorActiveText,
  })
```

Note: The exact property names on `ctx` depend on what `MarsSiteViewContext` exposes. The implementing agent should verify `ctx.siteScene`, `ctx.camera`, `ctx.audioManager`, and `ctx.remsWeather` exist and adjust paths as needed. The terrain generator exposes `rockSpawner` as a public field — verify by reading the `ITerrainGenerator` interface.

- [ ] **Step 3: Add to disposeAll and return**

Add `meteorHandler.dispose()` to the `disposeAll` function, and add `meteorHandler` to the return object.

- [ ] **Step 4: Wire storm cleanup**

Find where dust storm active phase is detected. This may be in the animation loop or in useSiteRemsWeather. The meteor controller's `onStormActive()` needs to be called when `dustStormPhase` transitions to `'active'`. This could be done:

a. In the tick handler itself by watching `fctx.dustStormPhase`, or
b. By adding a watch in the site view controller on the storm phase ref.

The simplest approach: add storm phase tracking to the meteor controller's `tick` method. In `MeteorController.ts`, add a `lastStormPhase` tracker:

```typescript
  let lastStormPhase: string = 'none'

  function tick(fctx: SiteFrameContext): void {
    // Storm cleanup: when dust storm transitions to 'active', remove meteorite rocks
    if (fctx.dustStormPhase === 'active' && lastStormPhase !== 'active') {
      onStormActive()
    }
    lastStormPhase = fctx.dustStormPhase

    tickHandler.tick(fctx)
    const roverPos = fctx.siteScene.rover?.position ?? new THREE.Vector3()
    renderer.update(fctx.sceneDelta, roverPos)
  }
```

- [ ] **Step 5: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors (may require adjusting property names on `ctx` — see note in step 2)

- [ ] **Step 6: Commit**

```bash
git add src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/site-controllers/MeteorController.ts
git commit -m "feat(meteor): wire MeteorController into site tick handlers with storm cleanup"
```

---

### Task 12: Meteor Archive Type and Composable

**Files:**
- Create: `src/types/meteorArchive.ts`
- Create: `src/composables/useMeteorArchive.ts`

- [ ] **Step 1: Create the archive interface**

```typescript
// src/types/meteorArchive.ts

export interface ArchivedMeteorObservation {
  archiveId: string
  capturedSol: number
  capturedAtMs: number
  siteId: string
  roverWorldX: number
  roverWorldZ: number
  subject: 'meteorite'
  showerId: string
  meteoriteVariant: string
  distanceM: number
  sp: number
  queuedForTransmission: boolean
  transmitted: boolean
}
```

- [ ] **Step 2: Create the archive composable**

```typescript
// src/composables/useMeteorArchive.ts
import { ref } from 'vue'
import type { ArchivedMeteorObservation } from '@/types/meteorArchive'

const STORAGE_KEY = 'mars-meteor-archive-v1'

function loadFromStorage(): ArchivedMeteorObservation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(observations: ArchivedMeteorObservation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(observations))
}

const observations = ref<ArchivedMeteorObservation[]>(loadFromStorage())

export function useMeteorArchive() {
  function archiveObservation(params: {
    siteId: string
    capturedSol: number
    roverWorldX: number
    roverWorldZ: number
    showerId: string
    meteoriteVariant: string
    distanceM: number
    sp: number
  }): ArchivedMeteorObservation {
    const obs: ArchivedMeteorObservation = {
      archiveId: `meteor-obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturedAtMs: Date.now(),
      subject: 'meteorite',
      queuedForTransmission: false,
      transmitted: false,
      ...params,
    }
    observations.value = [...observations.value, obs]
    persist(observations.value)
    return obs
  }

  function queueForTransmission(archiveId: string): void {
    observations.value = observations.value.map((o) =>
      o.archiveId === archiveId ? { ...o, queuedForTransmission: true } : o,
    )
    persist(observations.value)
  }

  function dequeueFromTransmission(archiveId: string): void {
    observations.value = observations.value.map((o) =>
      o.archiveId === archiveId ? { ...o, queuedForTransmission: false } : o,
    )
    persist(observations.value)
  }

  function markTransmitted(archiveId: string): void {
    observations.value = observations.value.map((o) =>
      o.archiveId === archiveId ? { ...o, transmitted: true, queuedForTransmission: false } : o,
    )
    persist(observations.value)
  }

  return {
    observations,
    archiveObservation,
    queueForTransmission,
    dequeueFromTransmission,
    markTransmitted,
  }
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types/meteorArchive.ts src/composables/useMeteorArchive.ts
git commit -m "feat(meteor): ArchivedMeteorObservation type and archive composable with localStorage"
```

---

### Task 13: MastCam Meteor Tagging Integration

**Files:**
- Modify: `src/views/site-controllers/MastCamTickHandler.ts`

The existing `onScanComplete` callback in MastCamTickHandler fires when MastCam photographs any rock. We need to detect when the scanned rock is a shower meteorite (`fromShower: true`) and create a meteor observation archive entry.

- [ ] **Step 1: Add meteor archive callback to MastCamTickCallbacks**

Add to `MastCamTickCallbacks` interface:

```typescript
  onMeteoriteTagged?: (rock: THREE.Mesh, rockType: string) => void
```

- [ ] **Step 2: Call it in the onScanComplete wiring**

In the `initIfReady` function, modify the `mc.onScanComplete` callback (around line 85):

```typescript
      mc.onScanComplete = (rock, rockType) => {
        const label = ROCK_TYPES[rockType]?.label ?? 'Unknown'
        const gain = awardSP('mastcam', rock.uuid, label)
        if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        recordMastCamTag(rockType)

        // Meteor observation: if this rock came from a shower, fire the callback
        if (rock.userData.fromShower && callbacks.onMeteoriteTagged) {
          callbacks.onMeteoriteTagged(rock, rockType)
        }
      }
```

- [ ] **Step 3: Wire the callback in `createMarsSiteTickHandlers`**

In the mastCamHandler creation, add the `onMeteoriteTagged` callback that creates an archive entry. This requires importing `useMeteorArchive` and wiring it:

```typescript
    onMeteoriteTagged: (rock, _rockType) => {
      const { archiveObservation } = useMeteorArchive()
      archiveObservation({
        siteId: ctx.siteId,
        capturedSol: /* current sol from refs */ refs.marsSol?.value ?? 0,
        roverWorldX: roverWorldX.value,
        roverWorldZ: roverWorldZ.value,
        showerId: rock.userData.showerId ?? '',
        meteoriteVariant: rock.userData.meteoriteVariant ?? '',
        distanceM: 0, // Will be computed from rover to rock position
        sp: 20,
      })
    },
```

Note: The implementing agent should check which refs are available in `createMarsSiteTickHandlers` for the current sol value and compute the distance from rover position to rock position.

- [ ] **Step 4: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/views/site-controllers/MastCamTickHandler.ts src/views/site-controllers/createMarsSiteTickHandlers.ts
git commit -m "feat(meteor): MastCam meteor tagging — creates archive observation on shower rock scan"
```

---

### Task 14: Science Log — METEOR SCIENCE Accordion

**Files:**
- Modify: `src/components/ScienceLogDialog.vue`

- [ ] **Step 1: Add meteor observations to the Science Log**

Import the meteor archive composable at the top of the `<script setup>`:

```typescript
import { useMeteorArchive } from '@/composables/useMeteorArchive'
const { observations: meteorObservations } = useMeteorArchive()
```

- [ ] **Step 2: Add the METEOR SCIENCE accordion**

Follow the existing accordion pattern (same structure as ChemCam/DAN/SAM/APXS/RAD accordions). Add after the last existing accordion. The accordion should:

- Show only when `meteorObservations.value.length > 0`
- Header: "METEOR SCIENCE" with badge count
- List items: show meteorite variant and capture sol
- Detail pane: show observation metadata (variant, shower ID, distance, SP, transmission status)
- Queue/transmit buttons following existing pattern

The exact template depends on the current accordion markup structure. The implementing agent should read the full `ScienceLogDialog.vue` and replicate the pattern used by the other accordions, substituting `meteorObservations` data.

- [ ] **Step 3: Verify it renders**

Run: `npm run dev`
Manual check: Open science log. If any meteor observations exist in localStorage, the METEOR SCIENCE accordion should appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/ScienceLogDialog.vue
git commit -m "feat(meteor): add METEOR SCIENCE accordion to Science Log dialog"
```

---

### Task 15: Integration Test — End-to-End Smoke Test

**Files:**
- Create: `src/lib/meteor/__tests__/meteorIntegration.test.ts`

- [ ] **Step 1: Write integration test for the domain logic flow**

```typescript
// src/lib/meteor/__tests__/meteorIntegration.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  getShowerChancePerSol,
  rollShowerSeverity,
  rollMeteorCount,
  rollTriggerFraction,
  pickMeteoriteVariant,
} from '../meteorShower'
import {
  computeSkyOrigin,
  rollMarkerDuration,
  rollEntryAngle,
  rollAzimuth,
  computeSoundDelay,
  FALL_DURATION,
} from '../meteorFall'
import type { MeteorFall, MeteorShower } from '../meteorTypes'

describe('meteor shower → fall integration', () => {
  it('generates a complete shower with valid falls', () => {
    const meteorRisk = 0.3
    const severity = rollShowerSeverity(meteorRisk)
    const count = rollMeteorCount(severity)
    const triggerFraction = rollTriggerFraction()

    const shower: MeteorShower = {
      id: 'test-shower',
      severity,
      meteorCount: count,
      startSol: 5,
      triggerAtSolFraction: triggerFraction,
    }

    expect(shower.meteorCount).toBeGreaterThanOrEqual(1)
    expect(shower.triggerAtSolFraction).toBeGreaterThanOrEqual(0.2)
    expect(shower.triggerAtSolFraction).toBeLessThanOrEqual(0.8)

    // Generate falls
    const falls: MeteorFall[] = []
    for (let i = 0; i < shower.meteorCount; i++) {
      const targetX = (Math.random() - 0.5) * 400
      const targetZ = (Math.random() - 0.5) * 400
      const groundY = 0

      const fall: MeteorFall = {
        id: `${shower.id}-fall-${i}`,
        showerId: shower.id,
        variant: pickMeteoriteVariant(),
        targetX,
        targetZ,
        groundY,
        markerDuration: rollMarkerDuration(),
        entryAngle: rollEntryAngle(),
        azimuth: rollAzimuth(),
        phase: 'marker',
        elapsed: 0,
        staggerOffset: i * 2,
      }
      falls.push(fall)
    }

    expect(falls.length).toBe(shower.meteorCount)

    // Each fall has valid sky origin
    for (const fall of falls) {
      const origin = computeSkyOrigin(
        fall.targetX, fall.targetZ, fall.groundY,
        fall.entryAngle, fall.azimuth,
      )
      expect(origin.y).toBeGreaterThan(fall.groundY + 50)

      // Variant is valid
      expect(fall.variant).toMatch(/^Lp\d{2}$/)
      const num = parseInt(fall.variant.slice(2))
      expect(num).toBeGreaterThanOrEqual(1)
      expect(num).toBeLessThanOrEqual(10)
    }
  })

  it('sound delay is proportional to distance', () => {
    const near = computeSoundDelay(30)
    const far = computeSoundDelay(500)
    expect(far).toBeGreaterThan(near)
    expect(near).toBeLessThan(0.2)
    expect(far).toBeGreaterThan(1.5)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/lib/meteor/__tests__/meteorIntegration.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/meteor/__tests__/meteorIntegration.test.ts
git commit -m "test(meteor): integration smoke test for shower-to-fall domain logic"
```

---

### Task 16: Manual Verification and Cleanup

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All existing tests pass, new meteor tests pass.

- [ ] **Step 2: Run type check**

Run: `npm run build`
Expected: No type errors, build succeeds.

- [ ] **Step 3: Manual play-through**

Run: `npm run dev`

Verify:
1. Navigate to a site with `meteorRisk > 0.15`
2. Wait for a sol to advance — REMS should announce an incoming shower (may take several sols depending on meteorRisk)
3. Red-orange waypoint markers should appear at impact locations
4. After marker duration, meteorite meshes should fall from the sky with orange glow
5. On impact: flash, camera shake (if close), the rock sits on the ground
6. Walk to the rock — it should be interactable as `iron-meteorite`
7. Use MastCam on it — should create a METEOR SCIENCE observation in the Science Log
8. Trigger a dust storm (or wait) — meteorite rocks should be cleaned up
9. Sound effects play (if audio files exist in `public/sound/`)

- [ ] **Step 4: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "fix(meteor): integration fixes from manual testing"
```
