# Instrument Integration — Plan B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Plan A instrument data model into live gameplay — centralized performance resolution, data-driven stat display, controller chain bonuses, and InstrumentOverlay declarative refactor.

**Architecture:** `resolveInstrumentPerformance` is a pure function that computes composite `speedFactor` and `accuracyFactor` from environment + tier + profile + durability. Tick handlers consume it instead of computing hazard penalties inline. `resolveInstrumentStats` drives the overlay's stat bars from `InstrumentDef.stats[]`. `InstrumentDef.tier` becomes the single source of truth for instrument hazard vulnerability. Controllers still own how they apply these factors to their mechanics.

**Tech Stack:** Vue 3, TypeScript strict, Vitest, existing `buildSpeedBreakdown`, `computeStormPerformancePenalty`, `computeRadiationPerformancePenalty`, `usePlayerProfile`, `useRewardTrack`, `useInstrumentProvider` composables.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/instruments.ts` | Modify | Add `tier: InstrumentTier` to `InstrumentDef` |
| `public/data/instruments.json` | Modify | Add `"tier"` field to all 14 instruments |
| `src/three/instruments/InstrumentController.ts` | Modify | Drop `readonly` from `tier` |
| `src/three/instruments/*.ts` (10 subclasses) | Modify | Remove `override readonly tier` lines |
| `src/instruments/InstrumentFactory.ts` | Modify | Add `TickHandler` interface, typed tuple, set `controller.tier = def.tier`, resolve tick handler |
| `src/instruments/InstrumentTickController.ts` | Modify | Remove `any` casts |
| `src/instruments/InstrumentRegistry.ts` | Modify | Typed `TICK_HANDLER_REGISTRY`, register DrillTickHandler |
| `src/lib/instrumentPerformance.ts` | Create | `InstrumentEnvironment`, `InstrumentPerformanceContext`, `resolveInstrumentPerformance()` |
| `src/lib/__tests__/instrumentPerformance.test.ts` | Create | Unit tests for performance resolution |
| `src/lib/instrumentSpeedBreakdown.ts` | Modify | Add `radiationLevel` input + `"RADIATION"` buff entry |
| `src/composables/useResolvedInstrumentStats.ts` | Create | Stat resolution composable |
| `src/composables/__tests__/useResolvedInstrumentStats.test.ts` | Create | Unit tests for stat resolution |
| `src/instruments/tickHandlers/drillTickHandler.ts` | Create | Sets `accuracyMod` each frame |
| `src/three/instruments/DrillController.ts` | Modify | Import `mod`, parameterize chain bonuses |
| `src/components/InstrumentStatBar.vue` | Create | Generic stat bar + buff breakdown |
| `src/components/InstrumentOverlay.vue` | Modify | Remove hardcoded stat blocks, add generic loop, swap props |
| `src/views/site-controllers/SiteFrameContext.ts` | Modify | Add `env: InstrumentEnvironment` |
| `src/views/MarsSiteViewController.ts` | Modify | Build `env` on frame context |
| `src/views/MartianSiteView.vue` | Modify | Remove dead speed breakdown code, update overlay bindings, simplify SAM/APXS processing |
| `src/views/site-controllers/createMarsSiteTickHandlers.ts` | Modify | Remove `getSpeedBreakdownBase`, remove speed breakdown refs |
| `src/views/site-controllers/DrillTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove boilerplate |
| `src/views/site-controllers/MastCamTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove boilerplate |
| `src/views/site-controllers/ChemCamTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove boilerplate |
| `src/views/site-controllers/APXSTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, keep custom thermal logic |
| `src/views/site-controllers/DanTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove boilerplate |

---

## Task 1: Add `tier` to InstrumentDef and instruments.json

**Files:**
- Modify: `src/types/instruments.ts`
- Modify: `public/data/instruments.json`

- [ ] **Step 1: Add `tier` field to `InstrumentDef` interface**

In `src/types/instruments.ts`, add the import and field. After the existing `import type { ProfileModifiers }` line, add the hazards import. Then add `tier` to the interface:

```typescript
// src/types/instruments.ts — add to imports
import type { InstrumentTier } from '@/lib/hazards'
```

Add after the `power` field (line 84) in `InstrumentDef`:

```typescript
  /** Hazard vulnerability tier — determines storm/radiation penalty severity. */
  tier: InstrumentTier
```

- [ ] **Step 2: Add `"tier"` to every instrument in instruments.json**

Add a `"tier"` field to each of the 14 instrument objects in `public/data/instruments.json`. Place it after the `"power"` field in each entry:

```
mastcam:  "tier": "sensitive"
chemcam:  "tier": "sensitive"
drill:    "tier": "standard"
apxs:     "tier": "sensitive"
dan:      "tier": "sensitive"
sam:      "tier": "sensitive"
rtg:      "tier": "rugged"
rems:     "tier": "sensitive"
rad:      "tier": "sensitive"
heater:   "tier": "rugged"
lga:      "tier": "standard"
uhf:      "tier": "standard"
wheels:   "tier": "rugged"
mic:      "tier": "standard"
```

- [ ] **Step 3: Verify existing tests pass**

Run: `npx vitest run src/types --reporter=verbose`
Expected: All `instrumentsData.test.ts` tests pass (the data validation test should accept the new field).

- [ ] **Step 4: Commit**

```bash
git add src/types/instruments.ts public/data/instruments.json
git commit -m "feat(instruments): add tier field to InstrumentDef and instruments.json"
```

---

## Task 2: Make tier single source of truth — controller + factory

**Files:**
- Modify: `src/three/instruments/InstrumentController.ts:83`
- Modify: 10 controller subclasses (remove `override readonly tier` lines)
- Modify: `src/instruments/InstrumentFactory.ts`

- [ ] **Step 1: Drop `readonly` from base class tier property**

In `src/three/instruments/InstrumentController.ts` line 83, change:

```typescript
  readonly tier: InstrumentTier = 'standard'
```

to:

```typescript
  tier: InstrumentTier = 'standard'
```

- [ ] **Step 2: Remove tier overrides from all 10 controller subclasses**

Remove the `override readonly tier` line from each of these files:

| File | Line | Remove |
|------|------|--------|
| `src/three/instruments/DANController.ts` | 31 | `override readonly tier: InstrumentTier = 'sensitive'` |
| `src/three/instruments/APXSController.ts` | 36 | `override readonly tier: InstrumentTier = 'sensitive'` |
| `src/three/instruments/ChemCamController.ts` | 89 | `override readonly tier: InstrumentTier = 'sensitive'` |
| `src/three/instruments/HeaterController.ts` | 26 | `override readonly tier: InstrumentTier = 'rugged'` |
| `src/three/instruments/MastCamController.ts` | 31 | `override readonly tier: InstrumentTier = 'sensitive'` |
| `src/three/instruments/RADController.ts` | 13 | `override readonly tier: InstrumentTier = 'sensitive'` |
| `src/three/instruments/REMSController.ts` | 19 | `override readonly tier: InstrumentTier = 'sensitive'` |
| `src/three/instruments/RoverWheelsController.ts` | 44 | `override readonly tier: InstrumentTier = 'rugged'` |
| `src/three/instruments/RTGController.ts` | 25 | `override readonly tier: InstrumentTier = 'rugged'` |
| `src/three/instruments/SAMController.ts` | 19 | `override readonly tier: InstrumentTier = 'sensitive'` |

Also remove the now-unused `InstrumentTier` import from each file if `tier` was the only thing using it. Check each file — some may import `InstrumentTier` for other purposes.

- [ ] **Step 3: Set `controller.tier = def.tier` in factory**

In `src/instruments/InstrumentFactory.ts`, after `const controller = new Ctor()`, add:

```typescript
  controller.tier = def.tier
```

The full function becomes:

```typescript
export function createInstrumentTuple(def: InstrumentDef): InstrumentTuple {
  const Ctor = CONTROLLER_REGISTRY[def.controllerType]
  if (!Ctor) {
    throw new Error(
      `[InstrumentFactory] Unknown controllerType "${def.controllerType}" for instrument "${def.id}". ` +
      `Register it in CONTROLLER_REGISTRY.`
    )
  }
  const controller = new Ctor()
  controller.tier = def.tier
  return { def, controller, tickHandler: null }
}
```

- [ ] **Step 4: Verify all tests pass**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass. Controllers now get their tier from the factory (from JSON data) instead of hardcoded overrides.

- [ ] **Step 5: Commit**

```bash
git add src/three/instruments/InstrumentController.ts src/three/instruments/DANController.ts src/three/instruments/APXSController.ts src/three/instruments/ChemCamController.ts src/three/instruments/HeaterController.ts src/three/instruments/MastCamController.ts src/three/instruments/RADController.ts src/three/instruments/REMSController.ts src/three/instruments/RoverWheelsController.ts src/three/instruments/RTGController.ts src/three/instruments/SAMController.ts src/instruments/InstrumentFactory.ts
git commit -m "refactor(instruments): tier is now single source of truth from instruments.json"
```

---

## Task 3: TickHandler interface + typed InstrumentTuple

**Files:**
- Modify: `src/instruments/InstrumentFactory.ts`
- Modify: `src/instruments/InstrumentRegistry.ts`
- Modify: `src/instruments/InstrumentTickController.ts`

- [ ] **Step 1: Add TickHandler interface and update InstrumentTuple**

Replace the full contents of `src/instruments/InstrumentFactory.ts`:

```typescript
// src/instruments/InstrumentFactory.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import { CONTROLLER_REGISTRY, TICK_HANDLER_REGISTRY } from './InstrumentRegistry'

export interface TickHandler {
  tick(delta: number): void
  dispose(): void
}

export interface InstrumentTuple {
  def: InstrumentDef
  controller: InstrumentController
  tickHandler: TickHandler | null
}

/**
 * Creates an InstrumentTuple from a definition.
 * Resolves controllerType from CONTROLLER_REGISTRY (required — throws if missing).
 * Resolves tickHandlerType from TICK_HANDLER_REGISTRY (optional — null if missing).
 * Sets controller.tier from def.tier (single source of truth).
 */
export function createInstrumentTuple(def: InstrumentDef): InstrumentTuple {
  const Ctor = CONTROLLER_REGISTRY[def.controllerType]
  if (!Ctor) {
    throw new Error(
      `[InstrumentFactory] Unknown controllerType "${def.controllerType}" for instrument "${def.id}". ` +
      `Register it in CONTROLLER_REGISTRY.`
    )
  }
  const controller = new Ctor()
  controller.tier = def.tier

  const handlerFactory = TICK_HANDLER_REGISTRY[def.tickHandlerType]
  const tickHandler = handlerFactory ? handlerFactory(controller) : null

  return { def, controller, tickHandler }
}
```

- [ ] **Step 2: Update TICK_HANDLER_REGISTRY type in InstrumentRegistry.ts**

In `src/instruments/InstrumentRegistry.ts`, add the import and change the registry type. After the existing imports, add:

```typescript
import type { TickHandler } from './InstrumentFactory'

export type TickHandlerFactory = (controller: InstrumentController) => TickHandler
```

Then change the registry from:

```typescript
export const TICK_HANDLER_REGISTRY: Record<string, unknown> = {}
```

to:

```typescript
export const TICK_HANDLER_REGISTRY: Record<string, TickHandlerFactory> = {}
```

- [ ] **Step 3: Remove `any` casts in InstrumentTickController.ts**

Replace the full contents of `src/instruments/InstrumentTickController.ts`:

```typescript
// src/instruments/InstrumentTickController.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentTuple } from './InstrumentFactory'

export class InstrumentTickController {
  private readonly tuples: InstrumentTuple[]

  constructor(tuples: InstrumentTuple[]) {
    this.tuples = tuples
  }

  tick(delta: number): void {
    for (const tuple of this.tuples) {
      tuple.tickHandler?.tick(delta)
    }
  }

  getControllerById(id: string): InstrumentController | undefined {
    return this.tuples.find(t => t.def.id === id)?.controller
  }

  getControllerBySlot(slot: number): InstrumentController | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.controller
  }

  getDefBySlot(slot: number): InstrumentDef | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.def
  }

  getDefs(): InstrumentDef[] {
    return [...this.tuples].sort((a, b) => a.def.slot - b.def.slot).map(t => t.def)
  }

  dispose(): void {
    for (const tuple of this.tuples) {
      tuple.controller.dispose()
      tuple.tickHandler?.dispose()
    }
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/instruments --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/instruments/InstrumentFactory.ts src/instruments/InstrumentRegistry.ts src/instruments/InstrumentTickController.ts
git commit -m "refactor(instruments): add TickHandler interface and typed tick handler resolution"
```

---

## Task 4: `resolveInstrumentPerformance` — tests + implementation

**Files:**
- Create: `src/lib/instrumentPerformance.ts`
- Create: `src/lib/__tests__/instrumentPerformance.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/lib/__tests__/instrumentPerformance.test.ts
import { describe, it, expect } from 'vitest'
import {
  resolveInstrumentPerformance,
  type InstrumentEnvironment,
} from '../instrumentPerformance'

const CALM_ENV: InstrumentEnvironment = {
  thermalZone: 'OPTIMAL',
  stormLevel: 0,
  radiationLevel: 0,
}

describe('resolveInstrumentPerformance', () => {
  it('returns baseline factors with neutral inputs', () => {
    const ctx = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.0, 1.0)
    expect(ctx.speedFactor).toBeCloseTo(1.0)
    expect(ctx.accuracyFactor).toBeCloseTo(1.0)
    expect(ctx.thermalMult).toBe(1.0)
    expect(ctx.stormPenalty).toBe(1.0)
    expect(ctx.radiationPenalty).toBe(1.0)
  })

  it('applies profile speed boost', () => {
    const ctx = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.15, 1.0)
    expect(ctx.speedFactor).toBeCloseTo(1.15)
    expect(ctx.accuracyFactor).toBeCloseTo(1.0)
  })

  it('applies profile accuracy boost', () => {
    const ctx = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.0, 1.10)
    expect(ctx.speedFactor).toBeCloseTo(1.0)
    expect(ctx.accuracyFactor).toBeCloseTo(1.10)
  })

  it('applies FRIGID thermal penalty to speed only', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, thermalZone: 'FRIGID' }
    const ctx = resolveInstrumentPerformance('standard', 1.0, env, 1.0, 1.0)
    // FRIGID thermalMult = 1.25, speedFactor = 1 / 1.25 = 0.8
    expect(ctx.thermalMult).toBe(1.25)
    expect(ctx.speedFactor).toBeCloseTo(0.8)
    // Accuracy NOT affected by thermal
    expect(ctx.accuracyFactor).toBeCloseTo(1.0)
  })

  it('applies COLD thermal bonus to speed', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, thermalZone: 'COLD' }
    const ctx = resolveInstrumentPerformance('standard', 1.0, env, 1.0, 1.0)
    // COLD thermalMult = 0.85, speedFactor = 1 / 0.85 ≈ 1.176
    expect(ctx.thermalMult).toBe(0.85)
    expect(ctx.speedFactor).toBeCloseTo(1 / 0.85)
  })

  it('applies storm penalty scaled by tier', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, stormLevel: 3 }
    const sensitive = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    const rugged = resolveInstrumentPerformance('rugged', 1.0, env, 1.0, 1.0)
    // Sensitive gets more penalty than rugged
    expect(sensitive.stormPenalty).toBeGreaterThan(rugged.stormPenalty)
    expect(sensitive.speedFactor).toBeLessThan(rugged.speedFactor)
    expect(sensitive.accuracyFactor).toBeLessThan(rugged.accuracyFactor)
  })

  it('applies radiation penalty above safe threshold', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, radiationLevel: 0.75 }
    const ctx = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    expect(ctx.radiationPenalty).toBeGreaterThan(1.0)
    expect(ctx.speedFactor).toBeLessThan(1.0)
    expect(ctx.accuracyFactor).toBeLessThan(1.0)
  })

  it('no radiation penalty in safe zone (≤ 0.25)', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, radiationLevel: 0.20 }
    const ctx = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    expect(ctx.radiationPenalty).toBe(1.0)
  })

  it('scales with durability factor', () => {
    const full = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.0, 1.0)
    const half = resolveInstrumentPerformance('standard', 0.5, CALM_ENV, 1.0, 1.0)
    expect(half.speedFactor).toBeCloseTo(full.speedFactor * 0.5)
    expect(half.accuracyFactor).toBeCloseTo(full.accuracyFactor * 0.5)
  })

  it('clamps durability to min 0.1', () => {
    const ctx = resolveInstrumentPerformance('standard', 0.0, CALM_ENV, 1.0, 1.0)
    expect(ctx.speedFactor).toBeCloseTo(0.1)
    expect(ctx.accuracyFactor).toBeCloseTo(0.1)
  })

  it('stacks storm + thermal + radiation multiplicatively', () => {
    const env: InstrumentEnvironment = { thermalZone: 'FRIGID', stormLevel: 2, radiationLevel: 0.5 }
    const ctx = resolveInstrumentPerformance('standard', 1.0, env, 1.0, 1.0)
    // All penalties stack: speed should be well below 1
    expect(ctx.speedFactor).toBeLessThan(0.8)
    // Verify compound: speedFactor = 1.0 * 1.0 / (thermalMult * stormPenalty * radiationPenalty)
    const expected = 1.0 / (ctx.thermalMult * ctx.stormPenalty * ctx.radiationPenalty)
    expect(ctx.speedFactor).toBeCloseTo(expected)
  })

  it('exposes thermalZone for controller decisions', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, thermalZone: 'CRITICAL' }
    const ctx = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    expect(ctx.thermalZone).toBe('CRITICAL')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/__tests__/instrumentPerformance.test.ts --reporter=verbose`
Expected: FAIL — module `../instrumentPerformance` does not exist.

- [ ] **Step 3: Implement the performance resolver**

```typescript
// src/lib/instrumentPerformance.ts
import type { InstrumentTier } from '@/lib/hazards'
import { computeStormPerformancePenalty, computeRadiationPerformancePenalty } from '@/lib/hazards'

export interface InstrumentEnvironment {
  thermalZone: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  stormLevel: number
  radiationLevel: number
}

export interface InstrumentPerformanceContext {
  /** Composite speed: profileSpeed * durability / (thermal * storm * radiation). >1 = faster. */
  speedFactor: number
  /** Composite accuracy: profileAccuracy * durability / (storm * radiation). */
  accuracyFactor: number
  /** Raw thermal zone — exposed for controllers with custom behavior (e.g. APXS CRITICAL block). */
  thermalZone: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  /** Duration multiplier from thermal zone (>1 = slower). */
  thermalMult: number
  /** Duration multiplier from dust storm (>1 = slower). */
  stormPenalty: number
  /** Duration multiplier from radiation (>1 = slower). */
  radiationPenalty: number
}

/** Duration multiplier per thermal zone (higher = slower). */
const THERMAL_DURATION_MULT: Record<string, number> = {
  OPTIMAL: 1.0,
  COLD: 0.85,
  FRIGID: 1.25,
  CRITICAL: 2.0,
}

/**
 * Computes composite performance factors for an instrument given its
 * environment, tier, durability, and profile modifiers.
 *
 * Tick handlers consume this instead of computing hazard penalties inline.
 * Controllers decide how to apply the returned factors to their mechanics.
 */
export function resolveInstrumentPerformance(
  tier: InstrumentTier,
  durabilityFactor: number,
  env: InstrumentEnvironment,
  profileSpeedMod: number,
  profileAccuracyMod: number,
): InstrumentPerformanceContext {
  const thermalMult = THERMAL_DURATION_MULT[env.thermalZone] ?? 1.0
  const stormPenalty = computeStormPerformancePenalty(env.stormLevel, tier)
  const radiationPenalty = computeRadiationPerformancePenalty(env.radiationLevel, tier)
  const durability = Math.max(0.1, durabilityFactor)

  const speedFactor = profileSpeedMod * durability / (thermalMult * stormPenalty * radiationPenalty)
  const accuracyFactor = profileAccuracyMod * durability / (stormPenalty * radiationPenalty)

  return {
    speedFactor,
    accuracyFactor,
    thermalZone: env.thermalZone,
    thermalMult,
    stormPenalty,
    radiationPenalty,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/lib/__tests__/instrumentPerformance.test.ts --reporter=verbose`
Expected: All 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instrumentPerformance.ts src/lib/__tests__/instrumentPerformance.test.ts
git commit -m "feat(instruments): add resolveInstrumentPerformance centralized performance resolver"
```

---

## Task 5: Add radiation entry to `buildSpeedBreakdown`

**Files:**
- Modify: `src/lib/instrumentSpeedBreakdown.ts`

- [ ] **Step 1: Add `radiationLevel` to `SpeedBreakdownInput`**

In `src/lib/instrumentSpeedBreakdown.ts`, add to the `SpeedBreakdownInput` interface (after the `instrumentTier` field, line 34):

```typescript
  /** Radiation level (0-1) and instrument tier — adds radiation penalty entry. */
  radiationLevel?: number
```

- [ ] **Step 2: Add radiation penalty computation**

After the existing dust storm penalty block (after line 101, before the `// Extras` comment), add:

```typescript
  // Radiation penalty
  let radiationSpeedFactor = 1
  if (input.radiationLevel && input.radiationLevel > 0.25 && input.instrumentTier) {
    const radDurMult = computeRadiationPerformancePenalty(input.radiationLevel, input.instrumentTier)
    radiationSpeedFactor = 1 / radDurMult
    const pctDelta = radiationSpeedFactor - 1
    buffs.push({
      label: 'RADIATION',
      value: fmtBuff(pctDelta),
      color: RED,
    })
  }
```

- [ ] **Step 3: Include radiation in speedPct computation**

Change the `speedPct` computation (line 112) from:

```typescript
  let speedPct = profileMult * thermalSpeedFactor * stormSpeedFactor * 100
```

to:

```typescript
  let speedPct = profileMult * thermalSpeedFactor * stormSpeedFactor * radiationSpeedFactor * 100
```

- [ ] **Step 4: Add the `computeRadiationPerformancePenalty` import**

At the top of the file, change the import from:

```typescript
import { computeStormPerformancePenalty } from '@/lib/hazards'
import type { InstrumentTier } from '@/lib/hazards'
```

to:

```typescript
import { computeStormPerformancePenalty, computeRadiationPerformancePenalty } from '@/lib/hazards'
import type { InstrumentTier } from '@/lib/hazards'
```

- [ ] **Step 5: Verify existing tests pass + manual smoke check**

Run: `npx vitest run src/lib --reporter=verbose`
Expected: All existing `instrumentSpeedBreakdown` tests pass (they don't pass `radiationLevel` so the new path is not triggered).

- [ ] **Step 6: Commit**

```bash
git add src/lib/instrumentSpeedBreakdown.ts
git commit -m "feat(instruments): add radiation penalty entry to buildSpeedBreakdown display"
```

---

## Task 6: `resolveInstrumentStats` — tests + implementation

**Files:**
- Create: `src/composables/useResolvedInstrumentStats.ts`
- Create: `src/composables/__tests__/useResolvedInstrumentStats.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/composables/__tests__/useResolvedInstrumentStats.test.ts
import { describe, it, expect } from 'vitest'
import { resolveInstrumentStats, type ResolvedInstrumentStatsInput } from '../useResolvedInstrumentStats'

function baseInput(activeSlot: number): ResolvedInstrumentStatsInput {
  return {
    activeSlot,
    activeInstrumentSlots: [],
    archetype: null,
    foundation: null,
    patron: null,
    trackModifiers: {},
  }
}

describe('resolveInstrumentStats', () => {
  it('returns empty array for instrument with no stats (LGA slot 11)', () => {
    expect(resolveInstrumentStats(baseInput(11))).toEqual([])
  })

  it('returns empty array for unknown slot', () => {
    expect(resolveInstrumentStats(baseInput(999))).toEqual([])
  })

  it('resolves all declared stats for Drill (slot 3)', () => {
    const result = resolveInstrumentStats(baseInput(3))
    expect(result).toHaveLength(3)
    expect(result[0].stat.key).toBe('analysisSpeed')
    expect(result[0].stat.label).toBe('DRILL SPEED')
    expect(result[1].stat.key).toBe('instrumentAccuracy')
    expect(result[2].stat.key).toBe('powerConsumption')
  })

  it('shows baseline 100% when no buffs apply', () => {
    const result = resolveInstrumentStats(baseInput(3))
    expect(result[0].breakdown.speedPct).toBe(100)
    expect(result[0].breakdown.buffs[0].label).toBe('BASELINE')
  })

  it('includes archetype bonus in breakdown', () => {
    const input = baseInput(1)
    input.archetype = { id: 'maker', name: 'Maker', modifiers: { analysisSpeed: 0.10 } }
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.speedPct).toBeCloseTo(110)
    expect(result[0].breakdown.buffs.some(b => b.label === 'MAKER' && b.value === '+10%')).toBe(true)
  })

  it('stacks archetype + patron bonuses', () => {
    const input = baseInput(3)
    input.archetype = { id: 'maker', name: 'Maker', modifiers: { analysisSpeed: 0.05 } }
    input.patron = { id: 'isf', name: 'ISF', modifiers: { analysisSpeed: 0.10 } }
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.speedPct).toBeCloseTo(115)
  })

  it('includes reward track modifier', () => {
    const input = baseInput(3)
    input.trackModifiers = { analysisSpeed: 0.05 }
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.speedPct).toBeCloseTo(105)
    expect(result[0].breakdown.buffs.some(b => b.label === 'REWARD TRACK')).toBe(true)
  })

  it('includes REMS passive bonus when REMS is active', () => {
    const input = baseInput(8) // REMS overlay
    input.activeInstrumentSlots = [8]
    const result = resolveInstrumentStats(input)
    expect(result).toHaveLength(1)
    expect(result[0].stat.key).toBe('spYield')
    expect(result[0].breakdown.buffs.some(b => b.label === 'REMS ACTIVE')).toBe(true)
  })

  it('excludes REMS passive when REMS is not active', () => {
    const input = baseInput(8)
    input.activeInstrumentSlots = []
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.buffs.every(b => b.label !== 'REMS ACTIVE')).toBe(true)
  })

  it('passes instrumentTier from def for storm display', () => {
    // MastCam is sensitive, storm level 3 should produce a storm penalty entry
    const input = baseInput(1)
    input.stormLevel = 3
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.buffs.some(b => b.label.includes('DUST STORM'))).toBe(true)
  })

  it('passes radiationLevel for radiation display', () => {
    const input = baseInput(1) // MastCam (sensitive)
    input.radiationLevel = 0.75
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.buffs.some(b => b.label === 'RADIATION')).toBe(true)
  })

  it('preserves stat order from instruments.json', () => {
    const result = resolveInstrumentStats(baseInput(2)) // ChemCam
    expect(result.map(r => r.stat.key)).toEqual(['analysisSpeed', 'instrumentAccuracy', 'powerConsumption'])
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run src/composables/__tests__/useResolvedInstrumentStats.test.ts --reporter=verbose`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the composable**

```typescript
// src/composables/useResolvedInstrumentStats.ts
import { useInstrumentProvider } from './useInstrumentProvider'
import {
  buildSpeedBreakdown,
  type SpeedBreakdown,
  type ProfileSource,
  type SpeedBuffEntry,
} from '@/lib/instrumentSpeedBreakdown'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { InstrumentStatDef } from '@/types/instruments'

export interface ResolvedStat {
  stat: InstrumentStatDef
  breakdown: SpeedBreakdown
}

export type ResolvedInstrumentStats = ResolvedStat[]

export interface ResolvedInstrumentStatsInput {
  activeSlot: number
  activeInstrumentSlots: number[]
  archetype: ProfileSource | null
  foundation: ProfileSource | null
  patron: ProfileSource | null
  trackModifiers: Partial<ProfileModifiers>
  thermalZone?: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  stormLevel?: number
  radiationLevel?: number
}

/**
 * Resolves instrument stats from InstrumentDef.stats[] into display-ready breakdowns.
 *
 * 1. Looks up the definition by slot via useInstrumentProvider.
 * 2. Collects passive provides[] bonuses from active instruments as display extras.
 * 3. Calls buildSpeedBreakdown per stat with profile + environment + tier.
 */
export function resolveInstrumentStats(input: ResolvedInstrumentStatsInput): ResolvedInstrumentStats {
  const { defBySlot } = useInstrumentProvider()
  const def = defBySlot(input.activeSlot)
  if (!def || def.stats.length === 0) return []

  // Collect passive bonuses from active instruments
  const passiveExtras = new Map<keyof ProfileModifiers, SpeedBuffEntry[]>()
  for (const slot of input.activeInstrumentSlots) {
    const providerDef = defBySlot(slot)
    if (!providerDef?.provides) continue
    for (const bonus of providerDef.provides) {
      const list = passiveExtras.get(bonus.key) ?? []
      const pct = Math.round(bonus.value * 100)
      list.push({
        label: bonus.label,
        value: pct >= 0 ? `+${pct}%` : `${pct}%`,
        color: bonus.value > 0 ? '#5dc9a5' : '#e05030',
      })
      passiveExtras.set(bonus.key, list)
    }
  }

  return def.stats.map(stat => ({
    stat,
    breakdown: buildSpeedBreakdown({
      modifierKey: stat.key,
      archetype: input.archetype,
      foundation: input.foundation,
      patron: input.patron,
      trackModifiers: input.trackModifiers,
      thermalZone: input.thermalZone,
      stormLevel: input.stormLevel,
      instrumentTier: def.tier,
      radiationLevel: input.radiationLevel,
      extras: passiveExtras.get(stat.key),
    }),
  }))
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run src/composables/__tests__/useResolvedInstrumentStats.test.ts --reporter=verbose`
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useResolvedInstrumentStats.ts src/composables/__tests__/useResolvedInstrumentStats.test.ts
git commit -m "feat(instruments): implement resolveInstrumentStats display composable with tier + radiation"
```

---

## Task 7: InstrumentStatBar component

**Files:**
- Create: `src/components/InstrumentStatBar.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/components/InstrumentStatBar.vue -->
<template>
  <div class="ov-stat-bar">
    <div class="ov-stat-bar-row">
      <span class="ov-stat-bar-label">{{ label }}</span>
      <span class="ov-stat-bar-value" :style="{ color: valueColor }">{{ valueStr }}</span>
    </div>
    <div class="ov-stat-bar-track">
      <div class="ov-stat-bar-fill" :style="{ width: barPct + '%', background: valueColor }" />
    </div>
    <div class="ov-stat-bar-buffs">
      <div
        v-for="buff in breakdown.buffs"
        :key="buff.label"
        class="ov-stat-bar-buff"
      >
        <span class="ov-stat-bar-buff-label">{{ buff.label }}</span>
        <span class="ov-stat-bar-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'

const props = defineProps<{
  label: string
  breakdown: SpeedBreakdown
}>()

const valueStr = computed(() => `${Math.round(props.breakdown.speedPct)}%`)

const valueColor = computed(() => {
  const pct = props.breakdown.speedPct
  if (pct > 105) return '#5dc9a5'
  if (pct >= 95) return '#ef9f27'
  return '#e05030'
})

const barPct = computed(() => {
  const pct = props.breakdown.speedPct
  return Math.min(100, Math.max(0, pct / 1.5))
})
</script>

<style scoped>
.ov-stat-bar {
  margin: 6px 0 4px;
}
.ov-stat-bar-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 3px;
}
.ov-stat-bar-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(196, 117, 58, 0.7);
  text-transform: uppercase;
}
.ov-stat-bar-value {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.05em;
}
.ov-stat-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(196, 117, 58, 0.13);
  border-radius: 2px;
  margin-bottom: 4px;
}
.ov-stat-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.ov-stat-bar-buffs {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ov-stat-bar-buff {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.06em;
}
.ov-stat-bar-buff-label {
  color: rgba(196, 117, 58, 0.5);
}
.ov-stat-bar-buff-value {
  font-weight: bold;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InstrumentStatBar.vue
git commit -m "feat(instruments): add InstrumentStatBar generic stat display component"
```

---

## Task 8: InstrumentOverlay refactor

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

- [ ] **Step 1: Add new imports**

In the `<script setup>` block (after line 365), add:

```typescript
import InstrumentStatBar from '@/components/InstrumentStatBar.vue'
import { usePlayerProfile, ARCHETYPES, FOUNDATIONS, PATRONS } from '@/composables/usePlayerProfile'
import { useRewardTrack } from '@/composables/useRewardTrack'
import { resolveInstrumentStats } from '@/composables/useResolvedInstrumentStats'
```

After the existing `useUiSound()` call, add:

```typescript
const { profile: playerProfile } = usePlayerProfile()
const { trackModifiers } = useRewardTrack()
```

- [ ] **Step 2: Replace speed/accuracy props with new props**

In the `defineProps` interface, remove these two fields:

```typescript
    /** Speed breakdown for active analysis instruments (Drill, ChemCam, MastCam, APXS). */
    instrumentSpeedHud?: SpeedBreakdown | null
    /** Accuracy breakdown for instruments that use instrumentAccuracy. */
    instrumentAccuracyHud?: SpeedBreakdown | null
```

Add these three fields:

```typescript
    /** Slots of instruments whose passive subsystem is active (for provides stacking). */
    activeInstrumentSlots?: number[]
    /** Active dust storm level (0 = none). */
    stormLevel?: number
    /** Radiation level at rover position (0-1). */
    radiationLevel?: number
```

In the defaults block, remove:

```typescript
    instrumentSpeedHud: null,
    instrumentAccuracyHud: null,
```

Add:

```typescript
    activeInstrumentSlots: () => [],
    stormLevel: 0,
    radiationLevel: 0,
```

- [ ] **Step 3: Add `resolvedStats` computed**

After the existing `helpDef` computed, add:

```typescript
const resolvedStats = computed(() => {
  if (!props.activeSlot) return []
  return resolveInstrumentStats({
    activeSlot: props.activeSlot,
    activeInstrumentSlots: props.activeInstrumentSlots ?? [],
    archetype: playerProfile.archetype ? ARCHETYPES[playerProfile.archetype] : null,
    foundation: playerProfile.foundation ? FOUNDATIONS[playerProfile.foundation] : null,
    patron: playerProfile.patron ? PATRONS[playerProfile.patron] : null,
    trackModifiers: trackModifiers.value,
    thermalZone: props.thermal?.zone as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL' | undefined,
    stormLevel: props.stormLevel,
    radiationLevel: props.radiationLevel,
  })
})
```

- [ ] **Step 4: Replace template speed/accuracy blocks with generic stat loop**

Replace the instrument speed indicator block (lines 131–150) and instrument accuracy indicator block (lines 152–171) with:

```html
        <!-- Instrument stats (data-driven from instruments.json stats[]) -->
        <InstrumentStatBar
          v-for="resolved in resolvedStats"
          :key="resolved.stat.key"
          :label="resolved.stat.label"
          :breakdown="resolved.breakdown"
        />
```

- [ ] **Step 5: Remove dead computed properties and constants**

Remove these (around lines 781–825):

- `const ANALYSIS_INSTRUMENT_SLOTS = new Set([1, 2, 3, 4])` (line 781)
- `const instrumentSpeedLabel` computed (lines 783–791)
- `const instrumentSpeedStr` computed (lines 793–796)
- `const instrumentSpeedColor` computed (lines 798–803)
- `const instrumentSpeedBarPct` computed (lines 805–808)
- `const accuracyStr` computed (lines 810–813)
- `const accuracyColor` computed (lines 815–820)
- `const accuracyBarPct` computed (lines 822–825)

Remove the `SpeedBreakdown` type import from `@/lib/instrumentSpeedBreakdown` if no other code in the overlay uses it (the `WheelsHudDisplay` interface uses `SpeedBuffEntry` which is locally defined, so the import may be removable).

- [ ] **Step 6: Verify type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/InstrumentOverlay.vue
git commit -m "refactor(instruments): replace hardcoded speed/accuracy stats with data-driven InstrumentStatBar loop"
```

---

## Task 9: `InstrumentEnvironment` on SiteFrameContext

**Files:**
- Modify: `src/views/site-controllers/SiteFrameContext.ts`
- Modify: `src/views/MarsSiteViewController.ts`

- [ ] **Step 1: Add `env` to SiteFrameContext interface**

In `src/views/site-controllers/SiteFrameContext.ts`, add the import and field:

```typescript
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
```

Add to the `SiteFrameContext` interface after the `radiationLevel` field:

```typescript
  /** Pre-built instrument environment for resolveInstrumentPerformance — built once per frame. */
  env: InstrumentEnvironment
```

- [ ] **Step 2: Build `env` in MarsSiteViewController.ts**

In `src/views/MarsSiteViewController.ts`, add the import:

```typescript
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
```

In the frame context object literal (around line 911), add the `env` field at the end (before the closing brace):

```typescript
        env: {
          thermalZone: thermalZone.value as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL',
          stormLevel: siteWeather.value.dustStormPhase === 'active' ? (siteWeather.value.dustStormLevel ?? 0) : 0,
          radiationLevel: radLevel.value,
        },
```

- [ ] **Step 3: Verify type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/site-controllers/SiteFrameContext.ts src/views/MarsSiteViewController.ts
git commit -m "feat(instruments): add InstrumentEnvironment to SiteFrameContext"
```

---

## Task 10: Simplify tick handlers with `resolveInstrumentPerformance`

**Files:**
- Modify: `src/views/site-controllers/DrillTickHandler.ts`
- Modify: `src/views/site-controllers/MastCamTickHandler.ts`
- Modify: `src/views/site-controllers/ChemCamTickHandler.ts`
- Modify: `src/views/site-controllers/APXSTickHandler.ts`
- Modify: `src/views/site-controllers/DanTickHandler.ts`
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts`
- Modify: `src/views/MarsSiteViewController.ts` (remove speed breakdown ref fields from `MarsSiteViewRefs`)
- Modify: `src/views/MartianSiteView.vue` (remove dead refs and overlay bindings)

This is the largest task — mechanical changes across many files following the same pattern.

- [ ] **Step 1: DrillTickHandler — replace penalty boilerplate**

In `src/views/site-controllers/DrillTickHandler.ts`:

**Change imports:** Replace:
```typescript
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
import { computeStormPerformancePenalty } from '@/lib/hazards'
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'
```
With:
```typescript
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'
import { useInstrumentProvider } from '@/composables/useInstrumentProvider'
```

**Remove from `DrillTickRefs`:** the `speedBreakdown` field:
```typescript
  speedBreakdown: Ref<SpeedBreakdown | null>
```

**Remove from `DrillTickCallbacks`:** the `getSpeedBreakdownBase` field:
```typescript
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
```

**Inside the factory function**, add at the top:
```typescript
  const { defBySlot } = useInstrumentProvider()
```

**Remove from destructured refs:** `speedBreakdown`

**Remove from destructured callbacks:** `getSpeedBreakdownBase`

**Replace lines 76–81** (the thermal ternary, storm penalty, drillDurationMultiplier, accuracyMod):
```typescript
      const z = thermalZone
      const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
      const stormPenalty = fctx.dustStormPhase === 'active' ? computeStormPerformancePenalty(fctx.dustStormLevel ?? 0, drill.tier) : 1
      drill.drillDurationMultiplier = (thermalMult * stormPenalty) / (playerMod('analysisSpeed') * Math.max(0.1, drill.durabilityFactor))

      drill.accuracyMod = playerMod('instrumentAccuracy') * drill.durabilityFactor / stormPenalty
```

With:
```typescript
      const drillDef = defBySlot(drill.slot)
      const perf = resolveInstrumentPerformance(drillDef?.tier ?? drill.tier, drill.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
      drill.drillDurationMultiplier = 1 / perf.speedFactor
      drill.accuracyMod = perf.accuracyFactor
```

**Remove the speed breakdown block** (around lines 147–163 — the `if (drillInst ...)` block that sets `speedBreakdown.value`). Delete the entire block.

- [ ] **Step 2: MastCamTickHandler — replace penalty boilerplate**

In `src/views/site-controllers/MastCamTickHandler.ts`:

**Change imports:** Replace `buildSpeedBreakdown`, `computeStormPerformancePenalty`, and their type imports with:
```typescript
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'
import { useInstrumentProvider } from '@/composables/useInstrumentProvider'
```

**Remove from `MastCamTickRefs`:** the `speedBreakdown` field.

**Remove from `MastCamTickCallbacks`:** the `getSpeedBreakdownBase` field.

**Inside the factory function**, add:
```typescript
  const { defBySlot } = useInstrumentProvider()
```

**Replace line 124–125** (active mode durationMultiplier):
```typescript
      const stormPenalty = dustStormPhase === 'active' ? computeStormPerformancePenalty(dustStormLevel ?? 0, mc.tier) : 1
      mc.durationMultiplier = stormPenalty / (playerMod('analysisSpeed') * Math.max(0.1, mc.durabilityFactor))
```
With:
```typescript
      const mcDef = defBySlot(mc.slot)
      const perf = resolveInstrumentPerformance(mcDef?.tier ?? mc.tier, mc.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
      mc.durationMultiplier = 1 / perf.speedFactor
```

**Replace lines 149–150** (surveyRange):
```typescript
      const mcStormPenalty = dustStormPhase === 'active' ? computeStormPerformancePenalty(dustStormLevel ?? 0, mcInst.tier) : 1
      mcInst.surveyRange = 5 * playerMod('instrumentAccuracy') * Math.max(0.1, mcInst.durabilityFactor) / mcStormPenalty
```
With:
```typescript
      const mcDef2 = defBySlot(mcInst.slot)
      const perfMc = resolveInstrumentPerformance(mcDef2?.tier ?? mcInst.tier, mcInst.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
      mcInst.surveyRange = 5 * perfMc.accuracyFactor
```

**Remove the speed breakdown block** that sets `speedBreakdown.value`.

- [ ] **Step 3: ChemCamTickHandler — replace penalty boilerplate**

In `src/views/site-controllers/ChemCamTickHandler.ts`:

**Change imports** same pattern — replace `buildSpeedBreakdown`, `computeStormPerformancePenalty` with `resolveInstrumentPerformance` + `useInstrumentProvider`.

**Remove from `ChemCamTickRefs`:** the `speedBreakdown` field.

**Remove from `ChemCamTickCallbacks`:** the `getSpeedBreakdownBase` field.

**Add** `const { defBySlot } = useInstrumentProvider()` inside factory.

**Replace lines 122–125** (active mode durationMultiplier):
```typescript
        const z = thermalZone
        const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
        const stormPenalty = dustStormPhase === 'active' ? computeStormPerformancePenalty(dustStormLevel ?? 0, ccInst.tier) : 1
        ccInst.durationMultiplier = (thermalMult * stormPenalty) / (playerMod('analysisSpeed') * Math.max(0.1, ccInst.durabilityFactor))
```
With:
```typescript
        const ccDef = defBySlot(ccInst.slot)
        const perf = resolveInstrumentPerformance(ccDef?.tier ?? ccInst.tier, ccInst.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
        ccInst.durationMultiplier = 1 / perf.speedFactor
```

**Replace lines 158–159** (accuracy in non-active mode):
```typescript
      const ccStormPenalty = dustStormPhase === 'active' ? computeStormPerformancePenalty(dustStormLevel ?? 0, cc.tier) : 1
      cc.accuracyMod = playerMod('instrumentAccuracy') * cc.durabilityFactor / ccStormPenalty
```
With:
```typescript
      const ccDef2 = defBySlot(cc.slot)
      const perfCc = resolveInstrumentPerformance(ccDef2?.tier ?? cc.tier, cc.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
      cc.accuracyMod = perfCc.accuracyFactor
```

**Remove the speed breakdown block** that sets `speedBreakdown.value`.

- [ ] **Step 4: APXSTickHandler — replace penalty boilerplate, keep custom thermal**

In `src/views/site-controllers/APXSTickHandler.ts`:

**Change imports** — replace `buildSpeedBreakdown`, `computeStormPerformancePenalty` with `resolveInstrumentPerformance` + `useInstrumentProvider`.

**Remove from `APXSTickRefs`:** the `speedBreakdown` field.

**Remove from `APXSTickCallbacks`:** the `getSpeedBreakdownBase` field.

**Add** `const { defBySlot } = useInstrumentProvider()` inside factory.

**Keep** `APXS_THERMAL_DURATION` — this is APXS-specific controller behavior.

**Replace lines 91–92** (storm penalty + duration):
```typescript
      const stormPenalty = fctx.dustStormPhase === 'active' ? computeStormPerformancePenalty(fctx.dustStormLevel ?? 0, apxs.tier) : 1
      const duration = (APXS_THERMAL_DURATION[thermalZone] ?? 25) * stormPenalty / (playerMod('analysisSpeed') * Math.max(0.1, apxs.durabilityFactor))
```
With:
```typescript
      const apxsDef = defBySlot(apxs.slot)
      const perf = resolveInstrumentPerformance(apxsDef?.tier ?? apxs.tier, apxs.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
      const duration = (APXS_THERMAL_DURATION[perf.thermalZone] ?? 25) / perf.speedFactor * perf.thermalMult
```

Note: APXS uses its own thermal table (`APXS_THERMAL_DURATION`) instead of the standard thermal mult, so we multiply back by `perf.thermalMult` to cancel the standard thermal already baked into `speedFactor`, then let `APXS_THERMAL_DURATION` handle thermal in its own way. The CRITICAL → 0 block behavior is preserved: `APXS_THERMAL_DURATION['CRITICAL'] = 0` → `duration = 0` → `onBlockedByCold()`.

**Remove the speed breakdown block** that sets `speedBreakdown.value`.

- [ ] **Step 5: DanTickHandler — replace penalty boilerplate**

In `src/views/site-controllers/DanTickHandler.ts`:

**Change imports:** Replace `computeStormPerformancePenalty` import with:
```typescript
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'
import { useInstrumentProvider } from '@/composables/useInstrumentProvider'
```

**Add** `const { defBySlot } = useInstrumentProvider()` inside factory.

**Replace lines 509–511:**
```typescript
    const danStormPenalty = dustStormPhase === 'active' ? computeStormPerformancePenalty(dustStormLevel ?? 0, danInst.tier) : 1
    danInst.accuracyMod = playerMod('instrumentAccuracy') / danStormPenalty
    danInst.analysisSpeedMod = playerMod('analysisSpeed') / danStormPenalty
```
With:
```typescript
    const danDef = defBySlot(danInst.slot)
    const perf = resolveInstrumentPerformance(danDef?.tier ?? danInst.tier, danInst.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
    danInst.accuracyMod = perf.accuracyFactor
    danInst.analysisSpeedMod = perf.speedFactor
```

Also find and replace any other `danStormPenalty` usages in the same file (crater scan duration):
```typescript
    const speedMod = playerMod('analysisSpeed') / danStormPenalty
```
With:
```typescript
    const speedMod = perf.speedFactor
```

(Note: `perf` may need to be recomputed if it's in a different scope. Check the code flow — if the crater scan section is in a separate block, call `resolveInstrumentPerformance` again there.)

- [ ] **Step 6: createMarsSiteTickHandlers — remove speed breakdown refs and getSpeedBreakdownBase**

In `src/views/site-controllers/createMarsSiteTickHandlers.ts`:

**Remove** the `getSpeedBreakdownBase` function (around line 78–84):
```typescript
  const getSpeedBreakdownBase = (): Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'> => ({
    modifierKey: 'analysisSpeed',
    archetype: ctx.profileSources.archetype,
    foundation: ctx.profileSources.foundation,
    patron: ctx.profileSources.patron,
    trackModifiers: ctx.trackModifiers.value,
  })
```

**Remove** `speedBreakdown` from each handler's refs object (in the `createDrillTickHandler`, `createMastCamTickHandler`, `createChemCamTickHandler`, `createAPXSTickHandler` calls):
```typescript
      speedBreakdown: refs.drillSpeedBreakdown,
      // ... etc for each handler
```

**Remove** `getSpeedBreakdownBase` from each handler's callbacks object:
```typescript
      getSpeedBreakdownBase,
```

**Remove** unused imports (`buildSpeedBreakdown`, `SpeedBreakdownInput`, etc.) if they're no longer used.

- [ ] **Step 7: MarsSiteViewRefs — remove speed breakdown fields**

In `src/views/MarsSiteViewController.ts`, remove these four fields from the `MarsSiteViewRefs` interface (lines 327–330):

```typescript
  drillSpeedBreakdown: Ref<SpeedBreakdown | null>
  chemCamSpeedBreakdown: Ref<SpeedBreakdown | null>
  mastCamSpeedBreakdown: Ref<SpeedBreakdown | null>
  apxsSpeedBreakdown: Ref<SpeedBreakdown | null>
```

Also remove any `SpeedBreakdown` import if it's no longer used.

- [ ] **Step 8: MartianSiteView — remove dead code, update overlay bindings**

In `src/views/MartianSiteView.vue`:

**Remove** the four speed breakdown refs (lines 1115–1118):
```typescript
const drillSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const chemCamSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const mastCamSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const apxsSpeedBreakdown = ref<SpeedBreakdown | null>(null)
```

**Remove** the `instrumentSpeedHudForSlot` computed (lines 1120–1128).

**Remove** the `ACCURACY_SLOTS` set and `instrumentAccuracyHud` computed (lines 1130–1145).

**Remove** the four speed breakdown refs from the `createMarsSiteTickHandlers` call (around lines 2280–2283).

**In the template**, remove:
```html
      :instrument-speed-hud="instrumentSpeedHudForSlot"
      :instrument-accuracy-hud="instrumentAccuracyHud"
```

**Add** new overlay bindings:
```html
      :active-instrument-slots="activeInstrumentSlots"
      :storm-level="activeStormLevel"
      :radiation-level="radiationLevelForOverlay"
```

**Add** new computeds:
```typescript
const activeInstrumentSlots = computed(() => {
  const rover = siteRover.value
  if (!rover) return []
  return rover.instruments
    .filter(i => i.passiveEnabled)
    .map(i => i.slot)
})

const activeStormLevel = computed(() => {
  return siteWeather.value.dustStormPhase === 'active'
    ? (siteWeather.value.dustStormLevel ?? 0)
    : 0
})

const radiationLevelForOverlay = computed(() => radLevel.value)
```

(Check that `InstrumentController` has a `passiveEnabled` property. If named differently — e.g., `enabled` — use that name.)

**Simplify SAM storm penalty** (around line 1640). Replace:
```typescript
  const samInst = siteRover.value?.instruments.find(i => i.id === 'sam')
  const samStormPenalty = siteWeather.value.dustStormPhase === 'active' && samInst
    ? computeStormPerformancePenalty(siteWeather.value.dustStormLevel ?? 0, samInst.tier)
    : 1
  const speedMult = playerMod('analysisSpeed')
  const adjustedRemaining = entry.remainingTimeSec * samStormPenalty / speedMult
```
With:
```typescript
  const samInst = siteRover.value?.instruments.find(i => i.id === 'sam')
  const samDef = instrumentProvider.defBySlot(samInst?.slot ?? 6)
  const samPerf = resolveInstrumentPerformance(samDef?.tier ?? 'sensitive', samInst?.durabilityFactor ?? 1.0, currentEnv.value, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
  const adjustedRemaining = entry.remainingTimeSec / samPerf.speedFactor
```

(Add `import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'` and `const instrumentProvider = useInstrumentProvider()` at the top of the script if not already imported. Also add a `currentEnv` computed from the weather/thermal state.)

**Simplify APXS storm penalty** (around line 1725) following the same pattern.

- [ ] **Step 9: Verify type check + all tests pass**

Run: `npx vue-tsc --noEmit && npx vitest run --reporter=verbose`
Expected: No type errors. All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/views/site-controllers/DrillTickHandler.ts src/views/site-controllers/MastCamTickHandler.ts src/views/site-controllers/ChemCamTickHandler.ts src/views/site-controllers/APXSTickHandler.ts src/views/site-controllers/DanTickHandler.ts src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/MarsSiteViewController.ts src/views/MartianSiteView.vue
git commit -m "refactor(instruments): replace scattered hazard penalty boilerplate with resolveInstrumentPerformance"
```

---

## Task 11: drillTickHandler + registry wiring

**Files:**
- Create: `src/instruments/tickHandlers/drillTickHandler.ts`
- Modify: `src/instruments/InstrumentRegistry.ts`

- [ ] **Step 1: Create the tick handler**

```typescript
// src/instruments/tickHandlers/drillTickHandler.ts
import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import { DrillController } from '@/three/instruments/DrillController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'

export function createDrillTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const drill = controller as DrillController

  return {
    tick(_delta: number): void {
      drill.accuracyMod = mod('instrumentAccuracy')
    },
    dispose(): void {},
  }
}
```

- [ ] **Step 2: Register in TICK_HANDLER_REGISTRY**

In `src/instruments/InstrumentRegistry.ts`, add the import and registration:

```typescript
import { createDrillTickHandler } from './tickHandlers/drillTickHandler'
```

Change the registry to:

```typescript
export const TICK_HANDLER_REGISTRY: Record<string, TickHandlerFactory> = {
  DrillTickHandler: createDrillTickHandler,
}
```

- [ ] **Step 3: Verify tests pass**

Run: `npx vitest run src/instruments --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/instruments/tickHandlers/drillTickHandler.ts src/instruments/InstrumentRegistry.ts
git commit -m "feat(instruments): add drillTickHandler and register in tick handler registry"
```

---

## Task 12: DrillController chain bonus parameterization

**Files:**
- Modify: `src/three/instruments/DrillController.ts`

- [ ] **Step 1: Import `mod` from usePlayerProfile**

At the top of `DrillController.ts`, after the existing imports, add:

```typescript
import { usePlayerProfile } from '@/composables/usePlayerProfile'

const { mod } = usePlayerProfile()
```

- [ ] **Step 2: Parameterize MastCam scan drill speed**

In the `update()` method (around line 204–205), replace:

```typescript
        const scanned = this.currentTarget.rock.userData.mastcamScanned === true
        this.drill.scanSpeedMult = scanned ? 0.6 : 1.0
```

With:

```typescript
        const scanned = this.currentTarget.rock.userData.mastcamScanned === true
        this.drill.scanSpeedMult = scanned ? (1 - 0.4 * mod('chainDrillBonus')) : 1.0
```

- [ ] **Step 3: Parameterize ChemCam loot weight bonus**

In the `collectSample()` method (around lines 243–245), replace:

```typescript
    let weightMult = 1.0
    if (chemcamAnalyzed) weightMult += 0.3
    if (apxsAnalyzed) weightMult += 0.2
```

With:

```typescript
    let weightMult = 1.0
    if (chemcamAnalyzed) weightMult += 0.3 * mod('chainLootBonus')
    if (apxsAnalyzed) weightMult += 0.2
```

- [ ] **Step 4: Verify type check + tests pass**

Run: `npx vue-tsc --noEmit && npx vitest run --reporter=verbose`
Expected: No type errors. All tests pass. At baseline modifiers (all = 1), behavior is identical.

- [ ] **Step 5: Commit**

```bash
git add src/three/instruments/DrillController.ts
git commit -m "feat(instruments): parameterize DrillController chain bonuses via mod(chainDrillBonus/chainLootBonus)"
```

---

## Correctness Invariants

After all tasks are complete, verify:

1. **Zero regression at baseline:** `NEUTRAL_MODIFIERS` (all = 1), no hazards, OPTIMAL thermal → `speedFactor = 1.0`, `accuracyFactor = 1.0`, `scanSpeedMult = 0.6`, `weightMult += 0.3` — identical to pre-Plan B
2. **Single source of truth for tier:** Edit `instruments.json` tier → changes performance, display, AND durability decay
3. **Empty stats = no stat bars:** LGA, UHF, Mic render zero `InstrumentStatBar` components
4. **Radiation penalty active:** Both gameplay (`resolveInstrumentPerformance`) and display (`buildSpeedBreakdown`) apply radiation penalty above 0.25
5. **APXS CRITICAL block preserved:** APXS still blocks at CRITICAL thermal via its custom `APXS_THERMAL_DURATION` table
6. **Provides stacking respects activity:** REMS `spYield +5%` only appears when REMS is in `activeInstrumentSlots`
7. **Storm penalty tier-scaled:** Sensitive instruments show larger penalties than rugged in stat bars
8. **No scattered hazard computations remain:** `computeStormPerformancePenalty` is no longer called directly from any tick handler — only from `resolveInstrumentPerformance` and `buildSpeedBreakdown`
