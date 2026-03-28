# RAD Instrument & Radiation Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the RAD instrument from shell controller into a full gameplay system — radiation field generation, zone detection, hazard integration, HUD overlay, VFX post-processing, and particle-interception decode minigame.

**Architecture:** The radiation field is a scalar `Float32Array` generated alongside terrain, sampled each frame at the rover's position to determine zone tier (safe/intermediate/hazardous). Zone tier feeds into the existing hazard pipeline (`hazardDecay.ts`) for durability/performance penalties and into a new `RadiationAtmospherePass` for green-tinted VFX. The decode minigame is a canvas-overlay QTE timed to a 20-second CMB audio clip. Domain logic lives in `lib/radiation/`, tick orchestration in a `RadTickHandler`, and UI in Vue components.

**Tech Stack:** TypeScript, Vue 3, Three.js (ShaderPass/EffectComposer), GLSL, Vitest, Canvas 2D

**GDD Reference:** `inspo/mars-rovers-rad-gdd-v03.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/radiation/radiationField.ts` | Pure functions: field generation from heightmap + noise, zone classification, rover position sampling |
| Create | `src/lib/radiation/radiationEvents.ts` | Event spawn logic, cosine similarity classification, quality scoring |
| Create | `src/lib/radiation/radiationTypes.ts` | Shared types: `RadiationZone`, `RadiationEvent`, `RadEventId`, `RadParticleType`, field config |
| Create | `src/lib/radiation/index.ts` | Barrel exports |
| Create | `src/lib/radiation/__tests__/radiationField.test.ts` | Field generation, zone thresholds, sampling tests |
| Create | `src/lib/radiation/__tests__/radiationEvents.test.ts` | Event classification, quality scoring, spawn weight tests |
| Modify | `src/types/terrain.ts` | Add `radiationIndex` to `TerrainParams` |
| Modify | `src/views/MarsSiteViewController.ts` | Thread `radiationIndex` into `TerrainParams`, create radiation field after terrain generation, feed radiation `HazardEvent` into decay pipeline, wire `RadiationAtmospherePass` into EffectComposer, create `RadTickHandler` |
| Modify | `src/lib/hazards/hazardDecay.ts` | Add `'radiation'` tier coefficients + `computeRadiationPerformancePenalty()` |
| Modify | `src/lib/hazards/index.ts` | Re-export new function |
| Create | `src/lib/hazards/__tests__/hazardDecay.radiation.test.ts` | Radiation-specific decay/penalty tests |
| Modify | `src/three/instruments/RADController.ts` | Replace fake data with live state: zone, dose rate, event detection, field reference |
| Create | `src/views/site-controllers/RadTickHandler.ts` | Per-frame radiation sampling, zone transitions, event spawning, decode flow, HUD ref sync |
| Modify | `src/views/site-controllers/createMarsSiteTickHandlers.ts` | Wire `RadTickHandler` |
| Modify | `src/views/site-controllers/SiteFrameContext.ts` | Add `radiationLevel` to frame context |
| Create | `src/three/RadiationAtmospherePass.ts` | ShaderPass with `setRadiation(level)` — green VFX |
| Create | `src/three/shaders/radiation-atmosphere.frag.glsl` | Green shadow push, scanlines, hot pixels, chromatic aberration, static bands |
| Create | `src/components/RADHud.vue` | Zone indicator, dose-rate bar, particle ticker, cumulative dose |
| Create | `src/components/RADDecodeOverlay.vue` | Canvas-based particle interception minigame |
| Create | `src/components/RADEventAlert.vue` | DECODE/DISMISS prompt on event detection |
| Create | `src/components/RADResultDisplay.vue` | Post-decode result overlay (event name, catch rate, SP, side products) |
| Modify | `src/components/InstrumentOverlay.vue` | Add radiation lockout overlay when in hazardous zone |
| Modify | `src/views/MartianSiteView.vue` | Mount RAD HUD, decode overlay, event alert, result display components |
| Modify | `src/audio/audioManifest.ts` | Register `ambient.geiger`, `sfx.radEventSting`, `sfx.radDecode` (CMB audio) |

---

## Task 1: Radiation Types

**Files:**
- Create: `src/lib/radiation/radiationTypes.ts`
- Create: `src/lib/radiation/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/radiation/radiationTypes.ts

/** Zone tier at a map position. */
export type RadiationZone = 'safe' | 'intermediate' | 'hazardous'

/** Dose range for a zone tier (mGy/day). */
export interface ZoneDoseRange {
  min: number
  max: number
}

/** Zone tier thresholds and metadata. */
export const ZONE_CONFIG: Record<RadiationZone, { label: string; color: string; doseRange: ZoneDoseRange }> = {
  safe:         { label: 'SAFE',         color: '#44dd88', doseRange: { min: 0.10, max: 0.25 } },
  intermediate: { label: 'INTERMEDIATE', color: '#e8a54b', doseRange: { min: 0.25, max: 0.60 } },
  hazardous:    { label: 'HAZARDOUS',    color: '#ff4444', doseRange: { min: 0.60, max: 1.20 } },
}

/** Normalized radiation scalar (0.0–1.0+) thresholds for zone classification. */
export interface RadiationThresholds {
  safeMax: number
  hazardousMin: number
}

/** Particle species in the RAD detector stack. */
export type RadParticleType = 'proton' | 'neutron' | 'gamma' | 'hze'

/** Radiation event identifiers. */
export type RadEventId = 'gcr-fluctuation' | 'soft-sep' | 'hard-sep' | 'forbush-decrease'

/** Rarity tier for events. */
export type RadEventRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

/** Definition of a radiation event type. */
export interface RadEventDef {
  id: RadEventId
  name: string
  rarity: RadEventRarity
  sp: number
  totalParticles: number
  composition: Record<RadParticleType, number>
  spawnWeight: number
  sideProducts: Array<{ itemId: string; quantity: number }>
  /** Particle rate curve type. */
  rateCurve: 'steady' | 'ramp-up' | 'peak-mid' | 'front-loaded'
  /** Duration of CMB audio in seconds. */
  durationSec: number
}

/** Spawn table configuration. */
export interface RadSpawnConfig {
  baseIntervalSecMin: number
  baseIntervalSecMax: number
  cooldownAfterEventSec: number
}

export const RAD_SPAWN_CONFIG: RadSpawnConfig = {
  baseIntervalSecMin: 120,
  baseIntervalSecMax: 300,
  cooldownAfterEventSec: 60,
}

/** All four event definitions. */
export const RAD_EVENT_DEFS: Record<RadEventId, RadEventDef> = {
  'gcr-fluctuation': {
    id: 'gcr-fluctuation', name: 'GCR Fluctuation', rarity: 'common', sp: 15,
    totalParticles: 18, composition: { proton: 0.30, neutron: 0.30, gamma: 0.25, hze: 0.15 },
    spawnWeight: 50, sideProducts: [], rateCurve: 'steady', durationSec: 20,
  },
  'soft-sep': {
    id: 'soft-sep', name: 'Soft Spectrum SEP', rarity: 'uncommon', sp: 55,
    totalParticles: 28, composition: { proton: 0.05, neutron: 0.60, gamma: 0.30, hze: 0.05 },
    spawnWeight: 25, sideProducts: [{ itemId: 'rad-neutron-profile', quantity: 1 }],
    rateCurve: 'ramp-up', durationSec: 20,
  },
  'hard-sep': {
    id: 'hard-sep', name: 'Hard Spectrum SEP', rarity: 'rare', sp: 140,
    totalParticles: 45, composition: { proton: 0.30, neutron: 0.25, gamma: 0.25, hze: 0.20 },
    spawnWeight: 8, sideProducts: [{ itemId: 'rad-sep-profile', quantity: 1 }, { itemId: 'rad-dose-record', quantity: 1 }],
    rateCurve: 'peak-mid', durationSec: 20,
  },
  'forbush-decrease': {
    id: 'forbush-decrease', name: 'Forbush Decrease', rarity: 'legendary', sp: 350,
    totalParticles: 8, composition: { proton: 0.35, neutron: 0.35, gamma: 0.20, hze: 0.10 },
    spawnWeight: 3, sideProducts: [{ itemId: 'rad-forbush-profile', quantity: 1 }, { itemId: 'rad-cme-data', quantity: 1 }],
    rateCurve: 'front-loaded', durationSec: 20,
  },
}

/** Quality grade thresholds based on catch rate. */
export type RadQualityGrade = 'S' | 'A' | 'B' | 'C' | 'D'

/** Instruments blocked in hazardous zones. RAD and RTG exempt. */
export const RADIATION_BLOCKED_INSTRUMENTS = ['chemcam', 'apxs', 'sam', 'dan', 'dril', 'mastcam', 'rems'] as const

/** Night modulation on GCR baseline. */
export const RAD_NIGHT_DOSE_MULTIPLIER = 1.12
```

- [ ] **Step 2: Create barrel export**

```typescript
// src/lib/radiation/index.ts
export * from './radiationTypes'
export * from './radiationField'
export * from './radiationEvents'
```

Note: the two module imports won't resolve yet — they're created in Tasks 2 and 3.

- [ ] **Step 3: Commit**

```bash
git add src/lib/radiation/radiationTypes.ts src/lib/radiation/index.ts
git commit -m "$(cat <<'EOF'
feat(rad): add radiation type definitions and event catalog

Shared types for radiation zones, particle species, event definitions,
and spawn configuration. No runtime logic yet.
EOF
)"
```

---

## Task 2: Radiation Field Generation (Pure Domain Logic)

**Files:**
- Create: `src/lib/radiation/radiationField.ts`
- Create: `src/lib/radiation/__tests__/radiationField.test.ts`

- [ ] **Step 1: Write failing tests for field generation and sampling**

```typescript
// src/lib/radiation/__tests__/radiationField.test.ts
import { describe, it, expect } from 'vitest'
import {
  generateRadiationField,
  sampleRadiationAt,
  classifyZone,
  computeZoneThresholds,
} from '../radiationField'
import type { RadiationZone } from '../radiationTypes'

describe('classifyZone', () => {
  const thresholds = { safeMax: 0.25, hazardousMin: 0.60 }

  it('returns safe for values below safeMax', () => {
    expect(classifyZone(0.10, thresholds)).toBe('safe')
    expect(classifyZone(0.24, thresholds)).toBe('safe')
  })

  it('returns intermediate for values between thresholds', () => {
    expect(classifyZone(0.30, thresholds)).toBe('intermediate')
    expect(classifyZone(0.59, thresholds)).toBe('intermediate')
  })

  it('returns hazardous for values at or above hazardousMin', () => {
    expect(classifyZone(0.60, thresholds)).toBe('hazardous')
    expect(classifyZone(1.0, thresholds)).toBe('hazardous')
  })

  it('boundary: safeMax is intermediate', () => {
    expect(classifyZone(0.25, thresholds)).toBe('intermediate')
  })
})

describe('computeZoneThresholds', () => {
  it('produces wider safe band for low radiationIndex', () => {
    const low = computeZoneThresholds(0.10)
    const high = computeZoneThresholds(0.80)
    expect(low.safeMax).toBeGreaterThan(high.safeMax)
  })

  it('safeMax < hazardousMin always', () => {
    for (const ri of [0.10, 0.25, 0.50, 0.80, 0.90]) {
      const t = computeZoneThresholds(ri)
      expect(t.safeMax).toBeLessThan(t.hazardousMin)
    }
  })
})

describe('generateRadiationField', () => {
  const gridSize = 32
  const heightmap = new Float32Array(gridSize * gridSize)
  // Simulate elevation: left half low (0), right half high (1)
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      heightmap[z * gridSize + x] = x < gridSize / 2 ? 0.0 : 1.0
    }
  }

  it('returns Float32Array of correct size', () => {
    const field = generateRadiationField(heightmap, gridSize, 0.25, 42)
    expect(field).toBeInstanceOf(Float32Array)
    expect(field.length).toBe(gridSize * gridSize)
  })

  it('values are clamped between 0.05 and 1.20', () => {
    const field = generateRadiationField(heightmap, gridSize, 0.80, 42)
    for (let i = 0; i < field.length; i++) {
      expect(field[i]).toBeGreaterThanOrEqual(0.05)
      expect(field[i]).toBeLessThanOrEqual(1.20)
    }
  })

  it('low elevation areas tend to have lower radiation', () => {
    const field = generateRadiationField(heightmap, gridSize, 0.25, 42)
    let lowSum = 0, highSum = 0
    const half = gridSize / 2
    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        const v = field[z * gridSize + x]
        if (x < half) lowSum += v
        else highSum += v
      }
    }
    expect(lowSum / (half * gridSize)).toBeLessThan(highSum / (half * gridSize))
  })
})

describe('sampleRadiationAt', () => {
  const gridSize = 4
  const field = new Float32Array(gridSize * gridSize)
  // Gradient: row 0 = 0.1, row 3 = 0.7
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      field[z * gridSize + x] = 0.1 + (z / (gridSize - 1)) * 0.6
    }
  }
  const scale = 100

  it('returns interpolated value at center', () => {
    const v = sampleRadiationAt(field, gridSize, scale, 0, 0)
    expect(v).toBeGreaterThan(0.05)
    expect(v).toBeLessThan(1.0)
  })

  it('returns edge-clamped value outside bounds', () => {
    const v = sampleRadiationAt(field, gridSize, scale, 999, 999)
    expect(v).toBeGreaterThanOrEqual(0.05)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/radiation/__tests__/radiationField.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement radiation field generation**

```typescript
// src/lib/radiation/radiationField.ts
import type { RadiationZone, RadiationThresholds } from './radiationTypes'

// --- Simplex noise (reuse existing project utility) ---
import { createNoise2D } from '@/lib/math/simplexNoise'

/**
 * Classify a radiation scalar into a zone tier.
 */
export function classifyZone(value: number, thresholds: RadiationThresholds): RadiationZone {
  if (value < thresholds.safeMax) return 'safe'
  if (value >= thresholds.hazardousMin) return 'hazardous'
  return 'intermediate'
}

/**
 * Compute zone thresholds from a site's radiationIndex (0–1).
 * Low radiationIndex = generous safe threshold. High = tight.
 */
export function computeZoneThresholds(radiationIndex: number): RadiationThresholds {
  // Lerp safeMax from 0.45 (easy) down to 0.12 (extreme)
  const safeMax = 0.45 - radiationIndex * 0.37
  // Lerp hazardousMin from 0.75 (easy) down to 0.30 (extreme)
  const hazardousMin = 0.75 - radiationIndex * 0.50
  return {
    safeMax: Math.max(0.10, safeMax),
    hazardousMin: Math.max(safeMax + 0.10, hazardousMin),
  }
}

/**
 * Generate a radiation scalar field over the terrain heightmap.
 *
 * Three layers:
 * 1. Elevation baseline — lower = less radiation
 * 2. Perlin noise pockets — localized hot/cold spots
 * 3. Clamped to [0.05, 1.20]
 *
 * @param heightmap  Normalized elevation values (0–1) from terrain generator
 * @param gridSize   Side length of the square grid
 * @param radiationIndex  Site radiation intensity (0–1) from landmarks.json
 * @param seed       Deterministic RNG seed
 */
export function generateRadiationField(
  heightmap: Float32Array,
  gridSize: number,
  radiationIndex: number,
  seed: number,
): Float32Array {
  const field = new Float32Array(gridSize * gridSize)
  const noise2D = createNoise2D(seed)

  // Noise amplitude scales with radiationIndex — harder sites have more variance
  const noiseScale = 0.08
  const noiseAmplitude = 0.10 + radiationIndex * 0.10

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = z * gridSize + x
      const elev = heightmap[idx]

      // 1. Elevation baseline: low = 0.10, high = 0.90
      const base = 0.10 + elev * 0.80

      // 2. Noise pockets
      const noiseFactor = noise2D(x * noiseScale, z * noiseScale) * noiseAmplitude

      // 3. Clamp
      field[idx] = Math.max(0.05, Math.min(1.20, base + noiseFactor))
    }
  }

  return field
}

/**
 * Bilinear-interpolated radiation value at a world-space (x, z) position.
 * Mirrors the heightAt pattern from terrain generators.
 */
export function sampleRadiationAt(
  field: Float32Array,
  gridSize: number,
  terrainScale: number,
  worldX: number,
  worldZ: number,
): number {
  // Map world coords to grid coords (same transform as ElevationTerrainGenerator)
  const gx = (worldX / terrainScale + 0.5) * (gridSize - 1)
  const gz = (worldZ / terrainScale + 0.5) * (gridSize - 1)

  const x0 = Math.max(0, Math.min(gridSize - 2, Math.floor(gx)))
  const z0 = Math.max(0, Math.min(gridSize - 2, Math.floor(gz)))
  const x1 = x0 + 1
  const z1 = z0 + 1
  const fx = gx - x0
  const fz = gz - z0

  const v00 = field[z0 * gridSize + x0]
  const v10 = field[z0 * gridSize + x1]
  const v01 = field[z1 * gridSize + x0]
  const v11 = field[z1 * gridSize + x1]

  const top = v00 + (v10 - v00) * fx
  const bot = v01 + (v11 - v01) * fx
  return top + (bot - top) * fz
}

/**
 * Convert a raw radiation field scalar to dose rate in mGy/day.
 * Linear mapping: 0.0 → 0.05 mGy/day, 1.0 → 1.0 mGy/day.
 */
export function radiationToDoseRate(fieldValue: number): number {
  return 0.05 + fieldValue * 0.95
}
```

- [ ] **Step 4: Verify the simplexNoise import works**

Check that `createNoise2D` exists in `src/lib/math/simplexNoise.ts`. If the export name differs, update the import.

Run: `npx vitest run src/lib/radiation/__tests__/radiationField.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radiation/radiationField.ts src/lib/radiation/__tests__/radiationField.test.ts
git commit -m "$(cat <<'EOF'
feat(rad): radiation field generation and zone classification

Pure functions for generating a radiation scalar field from heightmap
elevation + Perlin noise, sampling at world positions, and classifying
into safe/intermediate/hazardous zones.
EOF
)"
```

---

## Task 3: Radiation Event Logic (Pure Domain Logic)

**Files:**
- Create: `src/lib/radiation/radiationEvents.ts`
- Create: `src/lib/radiation/__tests__/radiationEvents.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/radiation/__tests__/radiationEvents.test.ts
import { describe, it, expect } from 'vitest'
import {
  pickWeightedEvent,
  classifyByComposition,
  computeQualityGrade,
  computeSPReward,
} from '../radiationEvents'
import { RAD_EVENT_DEFS } from '../radiationTypes'
import type { RadParticleType, RadQualityGrade } from '../radiationTypes'

describe('pickWeightedEvent', () => {
  it('always returns a valid event id', () => {
    for (let i = 0; i < 50; i++) {
      const id = pickWeightedEvent()
      expect(Object.keys(RAD_EVENT_DEFS)).toContain(id)
    }
  })
})

describe('classifyByComposition', () => {
  it('correctly identifies a perfect GCR catch', () => {
    const caught: Record<RadParticleType, number> = { proton: 6, neutron: 6, gamma: 4, hze: 2 }
    const result = classifyByComposition(caught)
    expect(result.eventId).toBe('gcr-fluctuation')
    expect(result.confidence).toBeGreaterThan(0.90)
  })

  it('correctly identifies a neutron-heavy soft SEP', () => {
    const caught: Record<RadParticleType, number> = { proton: 1, neutron: 17, gamma: 8, hze: 1 }
    const result = classifyByComposition(caught)
    expect(result.eventId).toBe('soft-sep')
    expect(result.confidence).toBeGreaterThan(0.80)
  })

  it('returns UNRESOLVED when catch is too sparse', () => {
    const caught: Record<RadParticleType, number> = { proton: 1, neutron: 0, gamma: 0, hze: 0 }
    const result = classifyByComposition(caught)
    // With only 1 particle, confidence may be below threshold
    // or it matches GCR poorly
    expect(result.confidence).toBeLessThan(1.0)
  })
})

describe('computeQualityGrade', () => {
  it('returns S for 95%+ catch rate', () => {
    expect(computeQualityGrade(18, 18)).toBe('S')
    expect(computeQualityGrade(44, 45)).toBe('S')
  })

  it('returns A for 80-94%', () => {
    expect(computeQualityGrade(37, 45)).toBe('A')
  })

  it('returns B for 70-79%', () => {
    expect(computeQualityGrade(32, 45)).toBe('B')
  })

  it('returns C for 50-69%', () => {
    expect(computeQualityGrade(25, 45)).toBe('C')
  })

  it('returns D for below 50%', () => {
    expect(computeQualityGrade(10, 45)).toBe('D')
  })
})

describe('computeSPReward', () => {
  it('applies 1.4x bonus for S grade', () => {
    expect(computeSPReward(100, 'S')).toBe(140)
  })

  it('applies 0.5x penalty for D grade', () => {
    expect(computeSPReward(100, 'D')).toBe(50)
  })

  it('halves SP for unresolved classification', () => {
    expect(computeSPReward(100, 'B', false)).toBe(Math.round(100 * 1.0 * 0.5))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/radiation/__tests__/radiationEvents.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement event logic**

```typescript
// src/lib/radiation/radiationEvents.ts
import type { RadEventId, RadParticleType, RadQualityGrade } from './radiationTypes'
import { RAD_EVENT_DEFS } from './radiationTypes'

/**
 * Pick a random event from the weighted spawn table.
 */
export function pickWeightedEvent(): RadEventId {
  const entries = Object.values(RAD_EVENT_DEFS)
  const totalWeight = entries.reduce((s, e) => s + e.spawnWeight, 0)
  let roll = Math.random() * totalWeight
  for (const entry of entries) {
    roll -= entry.spawnWeight
    if (roll <= 0) return entry.id
  }
  return entries[entries.length - 1].id
}

/**
 * Cosine similarity between two composition vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

const PARTICLE_KEYS: RadParticleType[] = ['proton', 'neutron', 'gamma', 'hze']

/**
 * Auto-classify a decoded event by comparing caught particle composition
 * against each event's expected composition using cosine similarity.
 */
export function classifyByComposition(
  caught: Record<RadParticleType, number>,
): { eventId: RadEventId; confidence: number } {
  const total = PARTICLE_KEYS.reduce((s, k) => s + caught[k], 0)
  if (total === 0) return { eventId: 'gcr-fluctuation', confidence: 0 }

  const caughtVec = PARTICLE_KEYS.map(k => caught[k] / total)

  let bestId: RadEventId = 'gcr-fluctuation'
  let bestSim = -1

  for (const def of Object.values(RAD_EVENT_DEFS)) {
    const expectedVec = PARTICLE_KEYS.map(k => def.composition[k])
    const sim = cosineSimilarity(caughtVec, expectedVec)
    if (sim > bestSim) {
      bestSim = sim
      bestId = def.id
    }
  }

  return { eventId: bestId, confidence: bestSim }
}

/** Confidence threshold for a resolved classification. */
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.70

/**
 * Quality grade from catch rate (caught / total spawned).
 */
export function computeQualityGrade(caught: number, total: number): RadQualityGrade {
  if (total === 0) return 'D'
  const rate = caught / total
  if (rate >= 0.95) return 'S'
  if (rate >= 0.80) return 'A'
  if (rate >= 0.70) return 'B'
  if (rate >= 0.50) return 'C'
  return 'D'
}

const GRADE_MULTIPLIERS: Record<RadQualityGrade, number> = {
  S: 1.4,
  A: 1.1,
  B: 1.0,
  C: 0.8,
  D: 0.5,
}

/**
 * Compute final SP reward.
 * @param baseSP  Event base SP
 * @param grade   Quality grade from catch rate
 * @param resolved  Whether classification confidence met threshold (default true)
 */
export function computeSPReward(baseSP: number, grade: RadQualityGrade, resolved = true): number {
  const mult = GRADE_MULTIPLIERS[grade]
  const resolveMult = resolved ? 1.0 : 0.5
  return Math.round(baseSP * mult * resolveMult)
}

/**
 * Generate the particle spawn schedule for a given event.
 * Returns an array of { timeSec, particleType } sorted by time.
 */
export function generateParticleSchedule(
  eventId: RadEventId,
  seed: number,
): Array<{ timeSec: number; particleType: RadParticleType }> {
  const def = RAD_EVENT_DEFS[eventId]
  const particles: Array<{ timeSec: number; particleType: RadParticleType }> = []

  // Build pool from composition ratios
  const pool: RadParticleType[] = []
  for (const key of PARTICLE_KEYS) {
    const count = Math.round(def.totalParticles * def.composition[key])
    for (let i = 0; i < count; i++) pool.push(key)
  }
  // Pad or trim to exact total
  while (pool.length < def.totalParticles) pool.push('proton')
  while (pool.length > def.totalParticles) pool.pop()

  // Shuffle pool deterministically
  let rng = seed
  const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0x7fffffff; return rng / 0x7fffffff }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(nextRng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  // Distribute spawn times based on rate curve
  for (let i = 0; i < pool.length; i++) {
    const t = i / Math.max(1, pool.length - 1) // 0..1
    let timeSec: number

    switch (def.rateCurve) {
      case 'steady':
        timeSec = t * def.durationSec
        break
      case 'ramp-up':
        // Quadratic — more particles toward the end
        timeSec = t * t * def.durationSec
        break
      case 'peak-mid':
        // Sinusoidal — dense in the middle
        timeSec = (0.5 - Math.cos(t * Math.PI) * 0.5) * def.durationSec
        break
      case 'front-loaded':
        // Most particles in first 25% of duration
        timeSec = Math.sqrt(t) * 0.25 * def.durationSec + (t > 0.6 ? (t - 0.6) * def.durationSec * 0.5 : 0)
        break
    }

    // Add small jitter
    timeSec += (nextRng() - 0.5) * 0.6
    timeSec = Math.max(0.3, Math.min(def.durationSec - 0.5, timeSec))

    particles.push({ timeSec, particleType: pool[i] })
  }

  particles.sort((a, b) => a.timeSec - b.timeSec)
  return particles
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/radiation/__tests__/radiationEvents.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/radiation/radiationEvents.ts src/lib/radiation/__tests__/radiationEvents.test.ts src/lib/radiation/index.ts
git commit -m "$(cat <<'EOF'
feat(rad): event classification, quality scoring, and particle scheduling

Cosine-similarity auto-classification, weighted event picker,
SP reward calculation with grade multipliers, and deterministic
particle spawn schedule generator for the decode minigame.
EOF
)"
```

---

## Task 4: Hazard System Integration

**Files:**
- Modify: `src/lib/hazards/hazardDecay.ts`
- Modify: `src/lib/hazards/index.ts`
- Create: `src/lib/hazards/__tests__/hazardDecay.radiation.test.ts`

- [ ] **Step 1: Write failing tests for radiation decay**

```typescript
// src/lib/hazards/__tests__/hazardDecay.radiation.test.ts
import { describe, it, expect } from 'vitest'
import { computeDecayMultiplier, computeRadiationPerformancePenalty } from '../hazardDecay'
import type { HazardEvent } from '../hazardTypes'

describe('computeDecayMultiplier with radiation', () => {
  it('applies radiation coefficient for sensitive instruments', () => {
    const events: HazardEvent[] = [{ source: 'radiation', active: true, level: 3 }]
    const mult = computeDecayMultiplier(events, 'sensitive')
    // 1.0 + 3 * 0.60 = 2.80
    expect(mult).toBeCloseTo(2.80)
  })

  it('applies lower coefficient for rugged instruments', () => {
    const events: HazardEvent[] = [{ source: 'radiation', active: true, level: 3 }]
    const mult = computeDecayMultiplier(events, 'rugged')
    // 1.0 + 3 * 0.15 = 1.45
    expect(mult).toBeCloseTo(1.45)
  })

  it('stacks with dust-storm', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: true, level: 2 },
      { source: 'radiation', active: true, level: 3 },
    ]
    const mult = computeDecayMultiplier(events, 'standard')
    // 1.0 + (2 * 0.50) + (3 * 0.35) = 1.0 + 1.0 + 1.05 = 3.05
    expect(mult).toBeCloseTo(3.05)
  })

  it('ignores inactive radiation', () => {
    const events: HazardEvent[] = [{ source: 'radiation', active: false, level: 5 }]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })
})

describe('computeRadiationPerformancePenalty', () => {
  it('returns 1.0 for safe zone (level <= 0.25)', () => {
    expect(computeRadiationPerformancePenalty(0.0, 'sensitive')).toBe(1.0)
    expect(computeRadiationPerformancePenalty(0.25, 'sensitive')).toBe(1.0)
  })

  it('returns > 1.0 for intermediate/hazardous', () => {
    const penalty = computeRadiationPerformancePenalty(0.60, 'sensitive')
    expect(penalty).toBeGreaterThan(1.0)
  })

  it('sensitive tier has higher penalty than rugged', () => {
    const sens = computeRadiationPerformancePenalty(0.80, 'sensitive')
    const rug = computeRadiationPerformancePenalty(0.80, 'rugged')
    expect(sens).toBeGreaterThan(rug)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hazards/__tests__/hazardDecay.radiation.test.ts`
Expected: FAIL — `computeRadiationPerformancePenalty` not found, radiation coefficients missing

- [ ] **Step 3: Add radiation to hazardDecay.ts**

```typescript
// src/lib/hazards/hazardDecay.ts — ADD radiation coefficients and performance penalty

// Modify existing TIER_COEFFICIENTS to add radiation:
const TIER_COEFFICIENTS: Record<string, Record<InstrumentTier, number>> = {
  'dust-storm': { rugged: 0.30, standard: 0.50, sensitive: 0.70 },
  'radiation':  { rugged: 0.15, standard: 0.35, sensitive: 0.60 },
}

// ADD after computeStormPerformancePenalty:

const RADIATION_PERFORMANCE_COEFFICIENTS: Record<InstrumentTier, number> = {
  rugged:    0.01,
  standard:  0.04,
  sensitive: 0.08,
}

/**
 * Duration/accuracy multiplier from radiation level (>1 = slower/worse).
 * No penalty in safe zones (radiationLevel <= 0.25).
 */
export function computeRadiationPerformancePenalty(
  radiationLevel: number,
  tier: InstrumentTier,
): number {
  if (radiationLevel <= 0.25) return 1.0
  const effectiveLevel = (radiationLevel - 0.25) / 0.75
  return 1.0 + effectiveLevel * 5 * RADIATION_PERFORMANCE_COEFFICIENTS[tier]
}
```

- [ ] **Step 4: Update barrel export**

Add `computeRadiationPerformancePenalty` to `src/lib/hazards/index.ts`:

```typescript
export { computeDecayMultiplier, computeStormPerformancePenalty, computeRadiationPerformancePenalty } from './hazardDecay'
export type { HazardEvent, InstrumentTier } from './hazardTypes'
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/hazards/__tests__/hazardDecay.radiation.test.ts`
Expected: All PASS

- [ ] **Step 6: Run all existing hazard tests to ensure no regressions**

Run: `npx vitest run src/lib/hazards/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/hazards/hazardDecay.ts src/lib/hazards/index.ts src/lib/hazards/__tests__/hazardDecay.radiation.test.ts
git commit -m "$(cat <<'EOF'
feat(rad): integrate radiation into hazard decay pipeline

Add radiation tier coefficients to TIER_COEFFICIENTS and new
computeRadiationPerformancePenalty for instrument degradation
in intermediate/hazardous zones.
EOF
)"
```

---

## Task 5: Thread radiationIndex into TerrainParams

**Files:**
- Modify: `src/types/terrain.ts`
- Modify: `src/views/MarsSiteViewController.ts`

- [ ] **Step 1: Add radiationIndex to TerrainParams**

In `src/types/terrain.ts`, add after `lonDeg`:

```typescript
  /** Site radiation intensity (0–1) from landmarks.json. */
  radiationIndex?: number
```

- [ ] **Step 2: Thread radiationIndex in getTerrainParamsForSite**

In `src/views/MarsSiteViewController.ts`, in the `getTerrainParamsForSite` function's return object (around line 169), add:

```typescript
    radiationIndex: site.radiationIndex ?? 0.25,
```

And in the fallback return (around line 159), add:

```typescript
      radiationIndex: 0.25,
```

- [ ] **Step 3: Run build to verify no type errors**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Commit**

```bash
git add src/types/terrain.ts src/views/MarsSiteViewController.ts
git commit -m "$(cat <<'EOF'
feat(rad): thread radiationIndex through TerrainParams

Sites now carry their radiationIndex from landmarks.json into
the terrain parameter pipeline for radiation field generation.
EOF
)"
```

---

## Task 6: RADController — Live State

**Files:**
- Modify: `src/three/instruments/RADController.ts`

- [ ] **Step 1: Replace fake data with live state properties**

```typescript
// src/three/instruments/RADController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import type { InstrumentTier } from '@/lib/hazards'
import type { RadiationZone, RadEventId } from '@/lib/radiation'

export class RADController extends InstrumentController {
  readonly id = 'rad'
  readonly name = 'RAD'
  readonly slot = 9
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.40
  override readonly repairComponentId = 'science-components'
  override readonly tier: InstrumentTier = 'sensitive'
  override readonly usageDecayChance = 0.10
  override readonly usageDecayAmount = 0.5
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Start STANDBY until the player ACTIVATEs. */
  override passiveSubsystemEnabled = false
  readonly focusNodeName = 'RAD'
  readonly focusOffset = new THREE.Vector3(0.2, 0.15, 0.2)
  readonly viewAngle = 0.45
  readonly viewPitch = 1.0
  override readonly selectionIdlePowerW = 2

  // --- Live radiation state (synced by RadTickHandler each frame) ---

  /** Current radiation scalar at rover position (0.0–1.2). */
  radiationLevel = 0.0

  /** Current zone classification. */
  zone: RadiationZone = 'safe'

  /** Current dose rate in mGy/day. */
  doseRate = 0.0

  /** Cumulative dose this sol (mGy). Resets each sol. */
  cumulativeDoseSol = 0.0

  /** Particle count rate (counts per minute), derived from radiation level. */
  particleRate = 0

  /** Active radiation event being decoded, or null. */
  activeEvent: RadEventId | null = null

  /** Whether an event alert is pending player response. */
  eventAlertPending = false

  /** Whether decode minigame is active. */
  decoding = false

  /** Last sol number for cumulative dose reset. */
  private lastSol = -1

  /**
   * Update dose accumulation. Called each frame by RadTickHandler.
   */
  accumulateDose(doseRateMGy: number, deltaSec: number, currentSol: number): void {
    // Reset cumulative dose at sol boundary
    if (currentSol !== this.lastSol) {
      this.cumulativeDoseSol = 0
      this.lastSol = currentSol
    }
    // doseRate is mGy/day; convert delta to fraction of day
    // Mars sol ≈ 88775 seconds
    const dayFraction = deltaSec / 88775
    this.cumulativeDoseSol += doseRateMGy * dayFraction
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/instruments/RADController.ts
git commit -m "$(cat <<'EOF'
feat(rad): replace fake data with live radiation state properties

RADController now exposes radiationLevel, zone, doseRate,
cumulativeDoseSol, particleRate, and event state — all synced
per-frame by RadTickHandler.
EOF
)"
```

---

## Task 7: RadTickHandler — Core Game Loop

**Files:**
- Create: `src/views/site-controllers/RadTickHandler.ts`
- Modify: `src/views/site-controllers/SiteFrameContext.ts`
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts`

- [ ] **Step 1: Add radiationLevel to SiteFrameContext**

In `src/views/site-controllers/SiteFrameContext.ts`, add to the `SiteFrameContext` interface:

```typescript
  /** Radiation scalar at rover position (0.0–1.2), 0 when RAD not yet initialized. */
  radiationLevel: number
```

- [ ] **Step 2: Create RadTickHandler**

```typescript
// src/views/site-controllers/RadTickHandler.ts
import type { Ref } from 'vue'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import type { RoverController } from '@/three/RoverController'
import type { RADController } from '@/three/instruments/RADController'
import type { RadiationZone } from '@/lib/radiation'
import {
  sampleRadiationAt,
  classifyZone,
  computeZoneThresholds,
  radiationToDoseRate,
  RAD_NIGHT_DOSE_MULTIPLIER,
} from '@/lib/radiation'
import type { RadiationThresholds } from '@/lib/radiation'
import {
  pickWeightedEvent,
  RAD_SPAWN_CONFIG,
} from '@/lib/radiation'

export interface RadTickRefs {
  /** Current zone tier for HUD. */
  radZone: Ref<RadiationZone>
  /** Radiation level 0–1.2 for HUD bar. */
  radLevel: Ref<number>
  /** Dose rate mGy/day. */
  radDoseRate: Ref<number>
  /** Cumulative dose this sol. */
  radCumulativeDose: Ref<number>
  /** Particle count rate. */
  radParticleRate: Ref<number>
  /** Whether RAD passive subsystem is enabled. */
  radEnabled: Ref<boolean>
  /** Event alert pending. */
  radEventAlertPending: Ref<boolean>
  /** Active event id during decode. */
  radActiveEventId: Ref<string | null>
  /** Decode active. */
  radDecoding: Ref<boolean>
}

export interface RadTickCallbacks {
  radiationIndex: number
  sampleToastRef: Ref<{ showComm?: (msg: string) => void } | null>
}

export function createRadTickHandler(
  refs: RadTickRefs,
  callbacks: RadTickCallbacks,
): SiteTickHandler {
  // Radiation field state (set after terrain generates)
  let radiationField: Float32Array | null = null
  let fieldGridSize = 0
  let terrainScale = 0
  let thresholds: RadiationThresholds = computeZoneThresholds(callbacks.radiationIndex)

  // Event spawn timer
  let eventCooldownSec = 0
  let nextEventTimerSec = randomInterval()
  let previousZone: RadiationZone = 'safe'

  function randomInterval(): number {
    const { baseIntervalSecMin, baseIntervalSecMax } = RAD_SPAWN_CONFIG
    return baseIntervalSecMin + Math.random() * (baseIntervalSecMax - baseIntervalSecMin)
  }

  /** Called by MarsSiteViewController after terrain generates. */
  function setField(field: Float32Array, gridSize: number, scale: number): void {
    radiationField = field
    fieldGridSize = gridSize
    terrainScale = scale
  }

  function tick(fctx: SiteFrameContext): void {
    const rover = fctx.rover
    if (!rover || !fctx.roverReady) return

    const radInst = findRAD(rover)
    if (!radInst) return

    // Sync enabled state
    refs.radEnabled.value = radInst.passiveSubsystemEnabled

    if (!radInst.passiveSubsystemEnabled || !radiationField) {
      refs.radLevel.value = 0
      refs.radZone.value = 'safe'
      return
    }

    // --- Sample radiation at rover position ---
    const roverPos = rover.rover.position
    const rawLevel = sampleRadiationAt(
      radiationField, fieldGridSize, terrainScale,
      roverPos.x, roverPos.z,
    )

    // Night modulation
    const nightMult = fctx.nightFactor > 0.5 ? RAD_NIGHT_DOSE_MULTIPLIER : 1.0
    const level = rawLevel * nightMult

    // Zone classification
    const zone = classifyZone(level, thresholds)
    const doseRate = radiationToDoseRate(level)

    // Particle rate: baseline ~5 cpm in safe, scaling up
    const particleRate = Math.round(5 + level * 80)

    // Update controller
    radInst.radiationLevel = level
    radInst.zone = zone
    radInst.doseRate = doseRate
    radInst.particleRate = particleRate
    radInst.accumulateDose(doseRate, fctx.sceneDelta, Math.floor(fctx.marsSol))

    // Update Vue refs
    refs.radLevel.value = level
    refs.radZone.value = zone
    refs.radDoseRate.value = doseRate
    refs.radCumulativeDose.value = radInst.cumulativeDoseSol
    refs.radParticleRate.value = particleRate

    // --- Zone transition alert ---
    if (zone !== previousZone) {
      if (zone === 'hazardous') {
        callbacks.sampleToastRef.value?.showComm?.('WARNING: HAZARDOUS RADIATION')
      } else if (zone === 'intermediate' && previousZone === 'safe') {
        callbacks.sampleToastRef.value?.showComm?.('ENTERING INTERMEDIATE ZONE')
      } else if (zone === 'safe' && previousZone !== 'safe') {
        callbacks.sampleToastRef.value?.showComm?.('SAFE ZONE')
      }
      previousZone = zone
    }

    // --- Event spawn logic ---
    if (radInst.decoding || radInst.eventAlertPending) return

    if (eventCooldownSec > 0) {
      eventCooldownSec -= fctx.sceneDelta
      return
    }

    nextEventTimerSec -= fctx.sceneDelta
    if (nextEventTimerSec <= 0) {
      // Spawn event
      const eventId = pickWeightedEvent()
      radInst.activeEvent = eventId
      radInst.eventAlertPending = true
      refs.radEventAlertPending.value = true
      refs.radActiveEventId.value = eventId
      nextEventTimerSec = randomInterval()
    }
  }

  /** Called when player dismisses event alert. */
  function dismissEvent(): void {
    refs.radEventAlertPending.value = false
    refs.radActiveEventId.value = null
    refs.radDecoding.value = false
    eventCooldownSec = RAD_SPAWN_CONFIG.cooldownAfterEventSec
  }

  /** Called when player starts decode. */
  function startDecode(): void {
    refs.radEventAlertPending.value = false
    refs.radDecoding.value = true
  }

  /** Called when decode minigame completes. */
  function endDecode(): void {
    refs.radDecoding.value = false
    refs.radActiveEventId.value = null
    eventCooldownSec = RAD_SPAWN_CONFIG.cooldownAfterEventSec
  }

  function dispose(): void {
    radiationField = null
  }

  function findRAD(rover: RoverController): RADController | null {
    // RoverController holds instruments via the scene controller
    // We access it via the site scene's instrument array
    return null // Placeholder — wired in createMarsSiteTickHandlers via closure
  }

  return {
    tick,
    dispose,
    // Exposed for wiring
    setField,
    dismissEvent,
    startDecode,
    endDecode,
  } as SiteTickHandler & {
    setField: typeof setField
    dismissEvent: typeof dismissEvent
    startDecode: typeof startDecode
    endDecode: typeof endDecode
  }
}
```

**Important note for implementer:** The `findRAD` function is a placeholder. The actual RAD controller reference must be resolved from the instrument array. The pattern to follow is how `DanTickHandler` accesses DAN — it receives the controller reference via the `SiteFrameContext.siteScene` or from a closure over the view context's controller. Look at how `DanTickHandler` does `const danInst = controller?.instruments.find(i => i.id === 'dan')` and replicate for RAD. The tick handler will need access to the `InstrumentController[]` array — either through `fctx.siteScene` or passed as a callback.

- [ ] **Step 3: Wire RadTickHandler into createMarsSiteTickHandlers**

In `src/views/site-controllers/createMarsSiteTickHandlers.ts`:

Add import:
```typescript
import { createRadTickHandler } from './RadTickHandler'
```

Add to `MarsSiteTickHandlers` interface:
```typescript
  radHandler: ReturnType<typeof createRadTickHandler>
```

Add handler creation after the passive systems handler (around line 282):
```typescript
  const radHandler = createRadTickHandler(
    {
      radZone: refs.radZone,
      radLevel: refs.radLevel,
      radDoseRate: refs.radDoseRate,
      radCumulativeDose: refs.radCumulativeDose,
      radParticleRate: refs.radParticleRate,
      radEnabled: refs.radEnabled,
      radEventAlertPending: refs.radEventAlertPending,
      radActiveEventId: refs.radActiveEventId,
      radDecoding: refs.radDecoding,
    },
    {
      radiationIndex: ctx.radiationIndex ?? 0.25,
      sampleToastRef: ctx.sampleToastRef,
    },
  )
```

Add `radHandler` to `disposeAll()` and the return object.

**Note for implementer:** The Vue refs (`refs.radZone`, `refs.radLevel`, etc.) don't exist yet on the `MarsSiteViewContext`. You need to add them to the refs interface in `MarsSiteViewController.ts`. Follow the pattern of `danTotalSamples`, `danHitAvailable`, etc. — they are declared as `Ref<T>` in the view context and initialized alongside the other refs. Add:

```typescript
const radZone = ref<RadiationZone>('safe')
const radLevel = ref(0)
const radDoseRate = ref(0)
const radCumulativeDose = ref(0)
const radParticleRate = ref(0)
const radEnabled = ref(false)
const radEventAlertPending = ref(false)
const radActiveEventId = ref<string | null>(null)
const radDecoding = ref(false)
```

Also update the `SiteFrameContext` construction in the animation loop to include `radiationLevel: radLevel.value`.

- [ ] **Step 4: Wire radiation field generation after terrain init**

In `MarsSiteViewController.ts`, after the terrain generates (around line 572 where `await siteScene.init(terrainParams, ...)` completes), add:

```typescript
// Generate radiation field from terrain heightmap
import { generateRadiationField } from '@/lib/radiation'

const terrain = siteScene.terrain
if (terrain && terrainParams.radiationIndex != null) {
  // Access the heightmap from the terrain generator
  // The generator exposes heightmap as a property (check the specific generator type)
  const gridSize = 256 // Match terrain grid size
  const scale = terrain.scale

  // Build a normalized elevation array by sampling the terrain
  const elevationMap = new Float32Array(gridSize * gridSize)
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const wx = (x / (gridSize - 1) - 0.5) * scale
      const wz = (z / (gridSize - 1) - 0.5) * scale
      const h = terrain.terrainHeightAt(wx, wz)
      elevationMap[z * gridSize + x] = h
    }
  }
  // Normalize to 0–1
  let minH = Infinity, maxH = -Infinity
  for (let i = 0; i < elevationMap.length; i++) {
    if (elevationMap[i] < minH) minH = elevationMap[i]
    if (elevationMap[i] > maxH) maxH = elevationMap[i]
  }
  const range = maxH - minH || 1
  for (let i = 0; i < elevationMap.length; i++) {
    elevationMap[i] = (elevationMap[i] - minH) / range
  }

  const radField = generateRadiationField(
    elevationMap, gridSize, terrainParams.radiationIndex, terrainParams.seed,
  )
  handlers.radHandler.setField(radField, gridSize, scale)
}
```

- [ ] **Step 5: Wire radiation HazardEvent into the decay loop**

In `MarsSiteViewController.ts`, in the animation loop where `hazardEvents` is constructed (around line 783), add after `dustStormEvent`:

```typescript
const radiationEvent: HazardEvent = {
  source: 'radiation',
  active: radLevel.value > 0.25,
  level: Math.ceil(radLevel.value * 5),
}
const hazardEvents = [dustStormEvent, radiationEvent]
```

- [ ] **Step 6: Verify build compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -30`
Expected: Compiles (may have pre-existing warnings, no new errors)

- [ ] **Step 7: Commit**

```bash
git add src/views/site-controllers/RadTickHandler.ts src/views/site-controllers/SiteFrameContext.ts src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/MarsSiteViewController.ts
git commit -m "$(cat <<'EOF'
feat(rad): RadTickHandler with field sampling, zone detection, and event spawning

Per-frame radiation sampling at rover position, zone transition alerts,
event spawn timer, and radiation HazardEvent fed into the decay pipeline.
EOF
)"
```

---

## Task 8: Radiation VFX Post-Processing Pass

**Files:**
- Create: `src/three/shaders/radiation-atmosphere.frag.glsl`
- Create: `src/three/RadiationAtmospherePass.ts`
- Modify: `src/views/MarsSiteViewController.ts`

- [ ] **Step 1: Create the GLSL fragment shader**

```glsl
// src/three/shaders/radiation-atmosphere.frag.glsl
uniform sampler2D tDiffuse;
uniform float uRadiationLevel;   // 0.0 = safe, 1.0 = max hazardous
uniform float uTime;
uniform vec2 uResolution;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);

  // No effect in safe zone
  if (uRadiationLevel < 0.25) {
    gl_FragColor = color;
    return;
  }

  float radStrength = smoothstep(0.25, 1.0, uRadiationLevel);

  // --- 1. Green shadow push ---
  vec3 radTint = vec3(0.1, 0.6, 0.3);
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float shadowMask = 1.0 - smoothstep(0.2, 0.6, lum);
  float greenPush = radStrength * 0.18;
  color.rgb = mix(color.rgb, mix(color.rgb, radTint * lum * 2.0, shadowMask), greenPush);

  // --- 2. Scanlines (thin, fast, scrolling up) ---
  float scanSpeed = 4.0 + radStrength * 8.0;
  float scanFreq = uResolution.y * 0.8;
  float scanline = sin((vUv.y * scanFreq + uTime * scanSpeed)) * 0.5 + 0.5;
  scanline = pow(scanline, 8.0); // Sharp lines
  float scanOpacity = radStrength * 0.12;
  color.rgb -= vec3(0.0, scanline * scanOpacity, 0.0); // Subtract = dark green lines

  // --- 3. Hot pixel clusters ---
  float hotPixelChance = radStrength * 0.008;
  float hotSeed = hash3(vec3(floor(vUv * uResolution), floor(uTime * 30.0)));
  if (hotSeed < hotPixelChance) {
    // Bright green dot
    float intensity = 0.3 + hotSeed * 3.0;
    color.rgb += vec3(0.05, intensity, 0.1);
  }

  // --- 4. Static snow bands (hazardous only) ---
  if (radStrength > 0.5) {
    float bandY = fract(uTime * 0.3) * 1.4 - 0.2;
    float bandDist = abs(vUv.y - bandY);
    float bandMask = smoothstep(0.04, 0.0, bandDist) * (radStrength - 0.5) * 0.3;
    float noise = hash(vUv * uResolution + uTime * 100.0);
    color.rgb += vec3(0.05, noise * bandMask, 0.02);
  }

  // --- 5. Reversed chromatic aberration (green outward) ---
  if (radStrength > 0.4) {
    float caAmount = (radStrength - 0.4) * 0.004;
    vec2 dir = normalize(vUv - 0.5) * caAmount;
    float gShifted = texture2D(tDiffuse, vUv + dir).g;
    color.g = mix(color.g, gShifted, 0.5);
  }

  // --- 6. Full-frame green flash at extreme levels ---
  if (uRadiationLevel > 0.85) {
    float flashSeed = hash(vec2(floor(uTime * 30.0), 42.0));
    if (flashSeed > 0.97) {
      color.rgb += vec3(0.02, 0.08, 0.03) * (uRadiationLevel - 0.85) * 8.0;
    }
  }

  // --- 7. Subtle vignette tightening ---
  float vignette = 1.0 - radStrength * 0.08 * length(vUv - 0.5);
  color.rgb *= vignette;

  gl_FragColor = color;
}
```

- [ ] **Step 2: Create the RadiationAtmospherePass TypeScript wrapper**

```typescript
// src/three/RadiationAtmospherePass.ts
import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import fullscreenPassVert from '@/three/shaders/fullscreen-pass.vert.glsl?raw'
import radiationAtmosphereFrag from '@/three/shaders/radiation-atmosphere.frag.glsl?raw'

export interface RadiationAtmospherePass extends ShaderPass {
  /** Set radiation level (0.0 = safe, 1.0 = max hazardous). */
  setRadiation(level: number): void
}

export function createRadiationAtmospherePass(): RadiationAtmospherePass {
  const shader = {
    uniforms: {
      tDiffuse:         { value: null },
      uRadiationLevel:  { value: 0.0 },
      uTime:            { value: 0.0 },
      uResolution:      { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: fullscreenPassVert,
    fragmentShader: radiationAtmosphereFrag,
  }

  const pass = new ShaderPass(shader) as RadiationAtmospherePass

  pass.setRadiation = (level: number) => {
    pass.uniforms.uRadiationLevel.value = level
  }

  return pass
}
```

- [ ] **Step 3: Wire into EffectComposer in MarsSiteViewController**

In `MarsSiteViewController.ts`, where the EffectComposer is set up (around line 684–688):

Add import:
```typescript
import { createRadiationAtmospherePass } from '@/three/RadiationAtmospherePass'
```

After `composer.addPass(dustPass)`, add:
```typescript
let radPass: ReturnType<typeof createRadiationAtmospherePass> | null = null
if (isSitePostProcessingEnabled()) {
  radPass = createRadiationAtmospherePass()
  composer.addPass(radPass)
}
```

In the animation loop, after the dust pass uniform updates:
```typescript
if (radPass) {
  radPass.uniforms.uTime.value = simulationTime
  radPass.setRadiation(radLevel.value)
}
```

On canvas resize, add:
```typescript
if (radPass) {
  radPass.uniforms.uResolution.value.set(canvas.clientWidth, canvas.clientHeight)
}
```

- [ ] **Step 4: Verify visually in dev server**

Run: `npm run dev`
Navigate to a site, activate RAD (key 9, then E). Drive around and observe green tint in intermediate/hazardous areas.

- [ ] **Step 5: Commit**

```bash
git add src/three/shaders/radiation-atmosphere.frag.glsl src/three/RadiationAtmospherePass.ts src/views/MarsSiteViewController.ts
git commit -m "$(cat <<'EOF'
feat(rad): green radiation VFX post-processing pass

RadiationAtmospherePass composites after DustAtmospherePass in the
EffectComposer. Green shadow push, scanlines, hot pixels, static
bands, reversed chromatic aberration, and flash at extreme levels.
EOF
)"
```

---

## Task 9: RAD HUD Overlay Component

**Files:**
- Create: `src/components/RADHud.vue`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Create RADHud.vue**

```vue
<!-- src/components/RADHud.vue -->
<template>
  <Transition name="rad-fade">
    <div v-if="enabled" class="rad-hud">
      <!-- Zone indicator -->
      <div class="rad-zone" :style="{ color: zoneColor }">
        <span class="rad-zone-dot" :style="{ background: zoneColor }" />
        <span class="rad-zone-label">{{ zoneLabel }}</span>
      </div>

      <!-- Dose rate bar -->
      <div class="rad-dose-bar">
        <div class="rad-dose-label">DOSE RATE</div>
        <div class="rad-dose-track">
          <div class="rad-dose-fill" :style="{ width: doseFillPct + '%', background: zoneColor }" />
        </div>
        <div class="rad-dose-value font-instrument">{{ doseRateFormatted }} mGy/d</div>
      </div>

      <!-- Cumulative dose -->
      <div class="rad-cumulative">
        <span class="rad-cum-label">SOL DOSE</span>
        <span class="rad-cum-value font-instrument">{{ cumulativeFormatted }} mGy</span>
      </div>

      <!-- Particle ticker -->
      <div class="rad-ticker">
        <span class="rad-ticker-label">CPM</span>
        <span class="rad-ticker-value font-instrument" :style="{ color: zoneColor }">{{ particleRate }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RadiationZone } from '@/lib/radiation'
import { ZONE_CONFIG } from '@/lib/radiation'

const props = defineProps<{
  enabled: boolean
  zone: RadiationZone
  level: number
  doseRate: number
  cumulativeDose: number
  particleRate: number
}>()

const zoneColor = computed(() => ZONE_CONFIG[props.zone].color)
const zoneLabel = computed(() => ZONE_CONFIG[props.zone].label)
const doseFillPct = computed(() => Math.min(100, (props.level / 1.0) * 100))
const doseRateFormatted = computed(() => props.doseRate.toFixed(2))
const cumulativeFormatted = computed(() => props.cumulativeDose.toFixed(3))
</script>

<style scoped>
.rad-hud {
  position: fixed;
  top: 80px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(68, 221, 136, 0.25);
  border-radius: 6px;
  padding: 10px 14px;
  min-width: 160px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #b8c4b0;
  pointer-events: none;
  z-index: 50;
}

.rad-zone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.12em;
}

.rad-zone-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.rad-dose-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rad-dose-label {
  font-size: 9px;
  opacity: 0.6;
  min-width: 52px;
}

.rad-dose-track {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.rad-dose-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.rad-dose-value {
  font-size: 10px;
  min-width: 60px;
  text-align: right;
}

.rad-cumulative {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}

.rad-cum-label { opacity: 0.6; font-size: 9px; }

.rad-ticker {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}

.rad-ticker-label { opacity: 0.6; font-size: 9px; }

.rad-fade-enter-active,
.rad-fade-leave-active { transition: opacity 0.3s ease; }
.rad-fade-enter-from,
.rad-fade-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 2: Mount in MartianSiteView.vue**

Add the component alongside other HUD elements. Import `RADHud` and add it to the template, passing the RAD refs from the view controller.

```vue
<RADHud
  :enabled="radEnabled"
  :zone="radZone"
  :level="radLevel"
  :dose-rate="radDoseRate"
  :cumulative-dose="radCumulativeDose"
  :particle-rate="radParticleRate"
/>
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Activate RAD, observe HUD appearing with zone indicator, dose bar, and particle rate.

- [ ] **Step 4: Commit**

```bash
git add src/components/RADHud.vue src/views/MartianSiteView.vue
git commit -m "$(cat <<'EOF'
feat(rad): RAD HUD overlay with zone indicator, dose bar, and particle ticker

Persistent HUD when RAD is active showing current radiation zone,
dose rate bar, cumulative sol dose, and counts-per-minute.
EOF
)"
```

---

## Task 10: Instrument Blocking in Hazardous Zones

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`
- Modify: `src/views/MarsSiteViewController.ts` (instrument gating)

- [ ] **Step 1: Add radiation lockout overlay to InstrumentOverlay.vue**

Add a new overlay section that appears when the player tries to activate a blocked instrument in a hazardous zone. Insert after the existing overlay content:

```vue
<!-- Radiation lockout overlay -->
<div v-if="isRadiationBlocked" class="ov-rad-lockout">
  <div class="ov-rad-icon">&#x2622;</div>
  <div class="ov-rad-title">RADIATION ENVIRONMENT UNSAFE</div>
  <div class="ov-rad-body">
    Ambient dose rate: {{ radDoseRate.toFixed(2) }} mGy/day<br>
    Instrument readings unreliable at this level.<br>
    Relocate to safe zone to resume operations.
  </div>
  <div v-if="nearestSafeDir" class="ov-rad-safe">
    Nearest safe zone: {{ nearestSafeDir }}
  </div>
  <div v-else class="ov-rad-safe" style="opacity: 0.5">
    Enable RAD to locate safe zones.
  </div>
</div>
```

Styles:
```css
.ov-rad-lockout {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  z-index: 10;
}
.ov-rad-icon {
  font-size: 48px;
  color: #44dd88;
  text-shadow: 0 0 20px rgba(68, 221, 136, 0.5);
  animation: rad-pulse 2s ease-in-out infinite;
}
@keyframes rad-pulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}
.ov-rad-title { color: #ff6644; font-size: 14px; letter-spacing: 0.15em; margin-top: 8px; }
.ov-rad-body { color: #b8a888; font-size: 11px; text-align: center; margin-top: 8px; line-height: 1.6; }
.ov-rad-safe { color: #44dd88; font-size: 11px; margin-top: 12px; }
```

Add props/computed for `isRadiationBlocked`, `radDoseRate`, `nearestSafeDir`.

- [ ] **Step 2: Gate instrument activation in MarsSiteViewController**

In the animation loop where instrument gating is applied (around line 1068), add radiation blocking:

```typescript
import { RADIATION_BLOCKED_INSTRUMENTS } from '@/lib/radiation'

// After the ALWAYS_ALLOWED instrument gating:
if (radLevel.value > 0 && classifyZone(radLevel.value, computeZoneThresholds(terrainParams.radiationIndex ?? 0.25)).zone === 'hazardous') {
  // Block science instruments in hazardous zones
  for (const inst of controller.instruments) {
    if (RADIATION_BLOCKED_INSTRUMENTS.includes(inst.id as any)) {
      // Prevent activation — the overlay will show the lockout
    }
  }
}
```

**Note for implementer:** The exact gating mechanism depends on how the existing `allowedInstrumentIds` set works. The simplest approach is to remove blocked instrument IDs from the allowed set when in a hazardous zone. Check how `ALWAYS_ALLOWED` and `missions.unlockedInstruments` interact at line 1068.

- [ ] **Step 3: Commit**

```bash
git add src/components/InstrumentOverlay.vue src/views/MarsSiteViewController.ts
git commit -m "$(cat <<'EOF'
feat(rad): instrument blocking in hazardous radiation zones

Science instruments blocked with lockout overlay when rover is
in a hazardous zone. RAD, RTG, and driving remain operational.
EOF
)"
```

---

## Task 11: RAD Event Alert Component

**Files:**
- Create: `src/components/RADEventAlert.vue`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Create RADEventAlert.vue**

```vue
<!-- src/components/RADEventAlert.vue -->
<template>
  <Transition name="rad-alert">
    <div v-if="visible" class="rad-alert">
      <div class="rad-alert-icon">&#x2622;</div>
      <div class="rad-alert-title">RADIATION EVENT DETECTED</div>
      <div class="rad-alert-buttons">
        <button class="rad-btn rad-btn-decode" @click="emit('decode')">DECODE</button>
        <button class="rad-btn rad-btn-dismiss" @click="emit('dismiss')">DISMISS</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean }>()
const emit = defineEmits<{ decode: []; dismiss: [] }>()
</script>

<style scoped>
.rad-alert {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(68, 221, 136, 0.4);
  border-radius: 8px;
  padding: 24px 32px;
  text-align: center;
  z-index: 200;
  pointer-events: auto;
}

.rad-alert-icon {
  font-size: 36px;
  color: #44dd88;
  text-shadow: 0 0 16px rgba(68, 221, 136, 0.5);
}

.rad-alert-title {
  color: #e8c870;
  font-size: 14px;
  letter-spacing: 0.15em;
  margin-top: 8px;
}

.rad-alert-buttons {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  justify-content: center;
}

.rad-btn {
  padding: 8px 24px;
  font-size: 12px;
  letter-spacing: 0.12em;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  transition: background 0.2s;
}

.rad-btn-decode {
  color: #44dd88;
  border-color: #44dd88;
}
.rad-btn-decode:hover { background: rgba(68, 221, 136, 0.15); }

.rad-btn-dismiss {
  color: #888;
  border-color: #555;
}
.rad-btn-dismiss:hover { background: rgba(255, 255, 255, 0.05); }

.rad-alert-enter-active { transition: opacity 0.2s, transform 0.2s; }
.rad-alert-leave-active { transition: opacity 0.15s; }
.rad-alert-enter-from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
.rad-alert-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 2: Mount in MartianSiteView.vue**

```vue
<RADEventAlert
  :visible="radEventAlertPending"
  @decode="onRadDecode"
  @dismiss="onRadDismiss"
/>
```

Wire `onRadDecode` and `onRadDismiss` to call `radHandler.startDecode()` and `radHandler.dismissEvent()` respectively.

- [ ] **Step 3: Commit**

```bash
git add src/components/RADEventAlert.vue src/views/MartianSiteView.vue
git commit -m "$(cat <<'EOF'
feat(rad): radiation event alert with DECODE/DISMISS prompt

Center-screen alert when RAD detects a radiation event.
Player can start the decode minigame or dismiss.
EOF
)"
```

---

## Task 12: Decode Minigame — Particle Interception QTE

**Files:**
- Create: `src/components/RADDecodeOverlay.vue`
- Create: `src/components/RADResultDisplay.vue`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Create RADDecodeOverlay.vue**

This is the core minigame — a canvas overlay where particles rain down and the player clicks to intercept them. It's the largest single component in this plan.

```vue
<!-- src/components/RADDecodeOverlay.vue -->
<template>
  <Transition name="rad-decode">
    <div v-if="active" class="rad-decode-overlay" @click.self="handleClick">
      <canvas
        ref="canvasRef"
        class="rad-decode-canvas"
        @pointerdown="handleClick"
      />
      <!-- Detector indicator -->
      <div class="rad-detector">
        <span class="rad-detector-icon" :style="{ color: detectorPulseColor }">&#x2622;</span>
        <span class="rad-detector-label">RAD</span>
      </div>
      <!-- Catch counter -->
      <div class="rad-catch-counter font-instrument">
        {{ caught }} / {{ totalSpawned }}
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { RadEventId, RadParticleType } from '@/lib/radiation'
import { RAD_EVENT_DEFS } from '@/lib/radiation'
import { generateParticleSchedule, classifyByComposition, computeQualityGrade, computeSPReward, CLASSIFICATION_CONFIDENCE_THRESHOLD } from '@/lib/radiation'

const props = defineProps<{
  active: boolean
  eventId: RadEventId
}>()

const emit = defineEmits<{
  complete: [{
    eventId: RadEventId
    classifiedAs: RadEventId
    confidence: number
    resolved: boolean
    caught: number
    total: number
    grade: string
    sp: number
    sideProducts: Array<{ itemId: string; quantity: number }>
  }]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const caught = ref(0)
const totalSpawned = ref(0)
const detectorPulseColor = ref('#44dd88')

// Particle visual config
const PARTICLE_VISUAL: Record<RadParticleType, { color: string; label: string; radius: number; speed: number; onScreenSec: number }> = {
  proton:  { color: '#ff7733', label: 'p+',  radius: 5,  speed: 1.0,  onScreenSec: 1.5 },
  neutron: { color: '#6699cc', label: 'n',   radius: 7,  speed: 0.75, onScreenSec: 2.0 },
  gamma:   { color: '#ffffff', label: 'γ',   radius: 3,  speed: 1.5,  onScreenSec: 1.0 },
  hze:     { color: '#cc55ff', label: 'HZE', radius: 10, speed: 0.5,  onScreenSec: 2.5 },
}

interface LiveParticle {
  type: RadParticleType
  x: number; y: number
  vx: number; vy: number
  alive: boolean
  caught: boolean
  age: number
  maxAge: number
  // Intercept animation
  intercepting: boolean
  interceptProgress: number
  interceptStartX: number; interceptStartY: number
}

let particles: LiveParticle[] = []
let schedule: Array<{ timeSec: number; particleType: RadParticleType }> = []
let scheduleIdx = 0
let elapsedSec = 0
let animFrame = 0
let caughtComposition: Record<RadParticleType, number> = { proton: 0, neutron: 0, gamma: 0, hze: 0 }

// Detector position (bottom-left)
const DETECTOR_X_PCT = 0.12
const DETECTOR_Y_PCT = 0.88

function handleClick(e: PointerEvent | MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top

  // Find nearest alive, non-intercepting particle within click radius
  let bestDist = 30 // click radius in pixels
  let bestIdx = -1
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    if (!p.alive || p.caught || p.intercepting) continue
    const dx = cx - p.x
    const dy = cy - p.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const hitRadius = PARTICLE_VISUAL[p.type].radius + 15
    if (dist < hitRadius && dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  if (bestIdx >= 0) {
    const p = particles[bestIdx]
    p.intercepting = true
    p.interceptProgress = 0
    p.interceptStartX = p.x
    p.interceptStartY = p.y
    p.caught = true
    caught.value++
    caughtComposition[p.type]++
    detectorPulseColor.value = PARTICLE_VISUAL[p.type].color
    setTimeout(() => { detectorPulseColor.value = '#44dd88' }, 200)
  }
}

function startGame() {
  const def = RAD_EVENT_DEFS[props.eventId]
  particles = []
  schedule = generateParticleSchedule(props.eventId, Date.now())
  scheduleIdx = 0
  elapsedSec = 0
  caught.value = 0
  totalSpawned.value = def.totalParticles
  caughtComposition = { proton: 0, neutron: 0, gamma: 0, hze: 0 }

  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth * window.devicePixelRatio
  canvas.height = canvas.clientHeight * window.devicePixelRatio

  loop()
}

function loop() {
  if (!props.active) return

  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const dt = 1 / 60

  elapsedSec += dt

  // Spawn scheduled particles
  while (scheduleIdx < schedule.length && schedule[scheduleIdx].timeSec <= elapsedSec) {
    const entry = schedule[scheduleIdx]
    const vis = PARTICLE_VISUAL[entry.particleType]
    const spawnX = w * (0.3 + Math.random() * 0.4)
    const spawnY = -10
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.6
    const speed = (h / vis.onScreenSec) * vis.speed * 0.7

    particles.push({
      type: entry.particleType,
      x: spawnX, y: spawnY,
      vx: Math.cos(angle) * speed * 0.3,
      vy: Math.sin(angle) * speed,
      alive: true, caught: false,
      age: 0, maxAge: vis.onScreenSec + 0.5,
      intercepting: false, interceptProgress: 0,
      interceptStartX: 0, interceptStartY: 0,
    })
    scheduleIdx++
  }

  // Update particles
  const detX = w * DETECTOR_X_PCT
  const detY = h * DETECTOR_Y_PCT

  for (const p of particles) {
    if (!p.alive) continue
    p.age += dt

    if (p.intercepting) {
      p.interceptProgress += dt * 2.5 // ~0.4 sec arc
      const t = Math.min(1, p.interceptProgress)
      // Bezier to detector
      const midX = (p.interceptStartX + detX) / 2
      const midY = Math.min(p.interceptStartY, detY) - 40
      const u = 1 - t
      p.x = u * u * p.interceptStartX + 2 * u * t * midX + t * t * detX
      p.y = u * u * p.interceptStartY + 2 * u * t * midY + t * t * detY
      if (t >= 1) p.alive = false
    } else {
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.y > h + 20 || p.age > p.maxAge) p.alive = false
    }
  }

  // Draw
  ctx.clearRect(0, 0, w, h)

  for (const p of particles) {
    if (!p.alive) continue
    const vis = PARTICLE_VISUAL[p.type]
    const r = vis.radius * window.devicePixelRatio

    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = vis.color
    ctx.globalAlpha = p.intercepting ? 1.0 - p.interceptProgress * 0.5 : 0.9
    ctx.fill()

    // Glow
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 2)
    grad.addColorStop(0, vis.color + '40')
    grad.addColorStop(1, vis.color + '00')
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.6
    ctx.fill()

    // Label
    ctx.globalAlpha = 0.7
    ctx.fillStyle = vis.color
    ctx.font = `${10 * window.devicePixelRatio}px monospace`
    ctx.fillText(vis.label, p.x + r + 2, p.y + 3)
    ctx.globalAlpha = 1.0
  }

  // Check completion (all particles spawned and resolved)
  const def = RAD_EVENT_DEFS[props.eventId]
  if (elapsedSec >= def.durationSec + 1.0) {
    finishGame()
    return
  }

  animFrame = requestAnimationFrame(loop)
}

function finishGame() {
  const def = RAD_EVENT_DEFS[props.eventId]
  const classification = classifyByComposition(caughtComposition)
  const resolved = classification.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD
  const grade = computeQualityGrade(caught.value, def.totalParticles)
  const classifiedDef = RAD_EVENT_DEFS[classification.eventId]
  const sp = computeSPReward(classifiedDef.sp, grade, resolved)

  emit('complete', {
    eventId: props.eventId,
    classifiedAs: classification.eventId,
    confidence: classification.confidence,
    resolved,
    caught: caught.value,
    total: def.totalParticles,
    grade,
    sp,
    sideProducts: resolved ? classifiedDef.sideProducts : [],
  })
}

watch(() => props.active, (val) => {
  if (val) {
    requestAnimationFrame(startGame)
  } else {
    cancelAnimationFrame(animFrame)
  }
})

onUnmounted(() => {
  cancelAnimationFrame(animFrame)
})
</script>

<style scoped>
.rad-decode-overlay {
  position: fixed;
  inset: 0;
  z-index: 180;
  pointer-events: auto;
  cursor: crosshair;
}

.rad-decode-canvas {
  width: 100%;
  height: 100%;
}

.rad-detector {
  position: fixed;
  bottom: 12%;
  left: 12%;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.rad-detector-icon {
  font-size: 32px;
  transition: color 0.15s;
  text-shadow: 0 0 12px currentColor;
}

.rad-detector-label {
  font-size: 10px;
  color: #888;
  letter-spacing: 0.15em;
  margin-top: 2px;
}

.rad-catch-counter {
  position: fixed;
  top: 16px;
  right: 16px;
  color: #44dd88;
  font-size: 14px;
  letter-spacing: 0.1em;
  pointer-events: none;
}

.rad-decode-enter-active { transition: opacity 0.3s; }
.rad-decode-leave-active { transition: opacity 0.2s; }
.rad-decode-enter-from,
.rad-decode-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 2: Create RADResultDisplay.vue**

```vue
<!-- src/components/RADResultDisplay.vue -->
<template>
  <Transition name="rad-result">
    <div v-if="visible" class="rad-result">
      <div class="rad-result-icon">&#x2622;</div>
      <div class="rad-result-name" :style="{ color: rarityColor }">
        {{ eventName }} — {{ rarity }}
      </div>
      <div class="rad-result-catch font-instrument">
        Catch: {{ caught }}/{{ total }} ({{ catchPct }}%) — Grade {{ grade }}
      </div>
      <div class="rad-result-sp font-instrument">
        +{{ sp }} SP
        <span v-for="prod in sideProducts" :key="prod.itemId" class="rad-result-prod">
          &middot; +{{ prod.quantity }} {{ prod.itemId }}
        </span>
      </div>
      <div v-if="!resolved" class="rad-result-unresolved">UNRESOLVED — 50% SP</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RadEventId, RadEventRarity } from '@/lib/radiation'
import { RAD_EVENT_DEFS } from '@/lib/radiation'

const props = defineProps<{
  visible: boolean
  eventId: RadEventId
  classifiedAs: RadEventId
  resolved: boolean
  caught: number
  total: number
  grade: string
  sp: number
  sideProducts: Array<{ itemId: string; quantity: number }>
}>()

const def = computed(() => RAD_EVENT_DEFS[props.classifiedAs])
const eventName = computed(() => def.value.name)
const rarity = computed(() => def.value.rarity.toUpperCase())
const catchPct = computed(() => props.total > 0 ? Math.round(props.caught / props.total * 100) : 0)

const RARITY_COLORS: Record<RadEventRarity, string> = {
  common: '#aabbaa', uncommon: '#44aaff', rare: '#cc55ff', legendary: '#ffcc44',
}
const rarityColor = computed(() => RARITY_COLORS[def.value.rarity])
</script>

<style scoped>
.rad-result {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(68, 221, 136, 0.4);
  border-radius: 8px;
  padding: 20px 28px;
  text-align: center;
  z-index: 200;
  pointer-events: none;
}

.rad-result-icon { font-size: 28px; color: #44dd88; }
.rad-result-name { font-size: 14px; letter-spacing: 0.12em; margin-top: 6px; font-weight: 700; }
.rad-result-catch { color: #b8c4b0; font-size: 12px; margin-top: 8px; }
.rad-result-sp { color: #44dd88; font-size: 13px; margin-top: 6px; }
.rad-result-prod { color: #e8a54b; margin-left: 4px; }
.rad-result-unresolved { color: #ff6644; font-size: 11px; margin-top: 6px; }

.rad-result-enter-active { transition: opacity 0.3s, transform 0.3s; }
.rad-result-leave-active { transition: opacity 0.5s; }
.rad-result-enter-from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
.rad-result-leave-to { opacity: 0; }
</style>
```

- [ ] **Step 3: Mount both in MartianSiteView.vue and wire events**

```vue
<RADDecodeOverlay
  :active="radDecoding"
  :event-id="radActiveEventId"
  @complete="onRadDecodeComplete"
/>

<RADResultDisplay
  :visible="radResultVisible"
  :event-id="radResultData.eventId"
  :classified-as="radResultData.classifiedAs"
  :resolved="radResultData.resolved"
  :caught="radResultData.caught"
  :total="radResultData.total"
  :grade="radResultData.grade"
  :sp="radResultData.sp"
  :side-products="radResultData.sideProducts"
/>
```

Wire `onRadDecodeComplete` to:
1. Call `radHandler.endDecode()`
2. Award SP via `awardSP(result.sp, 'RAD decode')`
3. Show result display for 3 seconds then hide
4. Add side products to inventory

- [ ] **Step 4: Verify the full decode flow in dev server**

Run: `npm run dev`
1. Activate RAD
2. Wait for event alert (or temporarily reduce spawn timer)
3. Click DECODE
4. Click particles in the overlay
5. See result display

- [ ] **Step 5: Commit**

```bash
git add src/components/RADDecodeOverlay.vue src/components/RADResultDisplay.vue src/views/MartianSiteView.vue
git commit -m "$(cat <<'EOF'
feat(rad): particle interception decode minigame and result display

Canvas-overlay QTE where particles rain down and player clicks to
intercept. Auto-classifies by cosine similarity. Shows result with
grade, SP, and side products.
EOF
)"
```

---

## Task 13: Audio Integration

**Files:**
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/views/site-controllers/PassiveSystemsAudioTickHandler.ts`

- [ ] **Step 1: Register RAD audio in manifest**

Add to `AUDIO_SOUND_IDS` array in `audioManifest.ts`:

```typescript
'ambient.geiger',
'sfx.radEventSting',
```

Add manifest entries:

```typescript
'ambient.geiger': {
  src: '/audio/geiger.mp3',
  category: 'ambient',
  volume: 0.25,
  loop: true,
  mode: 'single-instance',
},
'sfx.radEventSting': {
  src: '/audio/rad-event-sting.mp3',
  category: 'sfx',
  volume: 0.6,
  mode: 'restart',
},
```

**Note:** The actual audio files (`geiger.mp3`, `rad-event-sting.mp3`) need to be sourced/created and placed in `public/audio/`. The CMB audio (`cmb.mp3`) is referenced in the GDD and should also be placed there. For initial development, use placeholder silent files.

- [ ] **Step 2: Add Geiger counter to PassiveSystemsAudioTickHandler**

Follow the REMS pattern. Add a `radSurveying` ref input and a `geigerLayer`:

```typescript
// In the refs interface:
radSurveying: Ref<boolean>

// In the handler:
const geigerLayer: PassiveLayer = { id: 'ambient.geiger', handle: null, currentVol: 0 }

// In tick():
// Geiger volume scales with radiation level (louder in hotter zones)
const geigerVol = radSurveying.value ? Math.min(0.5, 0.1 + fctx.radiationLevel * 0.4) : 0
syncLayer(geigerLayer, radSurveying.value, geigerVol, fctx.sceneDelta)
```

- [ ] **Step 3: Play event sting on alert**

In `RadTickHandler.ts`, when spawning an event, play the sting:

```typescript
// In the event spawn block:
callbacks.playEventSting?.()
```

Add `playEventSting` to `RadTickCallbacks` and wire in `createMarsSiteTickHandlers.ts`:

```typescript
playEventSting: () => ctx.playInstrumentActionSound('sfx.radEventSting'),
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/audioManifest.ts src/views/site-controllers/PassiveSystemsAudioTickHandler.ts src/views/site-controllers/RadTickHandler.ts src/views/site-controllers/createMarsSiteTickHandlers.ts
git commit -m "$(cat <<'EOF'
feat(rad): Geiger counter ambient audio and event sting

Geiger counter loop scales with radiation level. Event detection
plays an alert sting.
EOF
)"
```

---

## Task 14: Final Integration & Smoke Test

**Files:**
- All modified files from previous tasks

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new radiation tests)

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run dev server smoke test**

Run: `npm run dev`

Test checklist:
1. Navigate to a site with low radiationIndex (e.g., Hellas Planitia, 0.10)
2. Activate RAD (key 9, then E to toggle from STANDBY)
3. Verify HUD appears with green zone indicator
4. Drive around — observe zone transitions and toast alerts
5. In intermediate zone — verify amber tint in VFX, instruments degraded
6. Wait for event alert — click DECODE
7. Catch particles in the minigame
8. See result display with SP award
9. Navigate to a high-radiation site (e.g., Olympus Mons, 0.80)
10. Verify hazardous zones block science instruments
11. Verify Geiger counter audio scales with zone

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(rad): complete RAD instrument and radiation environment system

Radiation field generation, zone detection (safe/intermediate/hazardous),
hazard pipeline integration, green VFX post-processing, HUD overlay,
particle interception decode minigame, event spawning, instrument
blocking in hazardous zones, and Geiger counter audio.
EOF
)"
```

---

## Deferred (Not In This Plan)

These are documented in the GDD as future hooks and not included in scope:

- **Minimap radiation overlay** — requires minimap system (not yet built)
- **Solar storm expansion** — Hard SEPs temporarily expanding hazardous zones
- **Cumulative dose rover degradation** — long-term exposure effects
- **Radiation tolerance perk** — perk tree unlock
- **Shielded workspace buildable** — colony-phase feature
- **Instrument camera VFX (Layer 2)** — MastCam/ChemCam first-person radiation artifacts (could be a fast follow-up)
- **Comms integrity risk in intermediate zones** — requires UHF transmission pipeline changes
- **Forbush transmission bonus** — overrides zone penalty during event
