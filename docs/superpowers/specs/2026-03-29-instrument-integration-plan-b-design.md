# Instrument Integration — Plan B Design
**Date:** 2026-03-29
**Scope:** Wire the Plan A data model into live gameplay. Four subsystems: centralized performance resolution, computed stat display, controller chain bonus parameterization, and InstrumentOverlay declarative refactor.

---

## Background

Plan A built the data model foundation:
- `InstrumentDef.stats[]` — each instrument declares which `ProfileModifiers` keys apply to it, in display order
- `InstrumentDef.provides[]` — passive bonuses emitted when an instrument is active (REMS: `spYield +5%`)
- `InstrumentDef.chainBonuses[]` — effects applied to rock targets when the instrument is used (MastCam drill bonus, ChemCam loot weight, APXS trace elements)
- `chainDrillBonus` and `chainLootBonus` added to `ProfileModifiers` — declared, not yet wired
- `DrillController.accuracyMod = 1.0` — instance field exists, no setter
- `InstrumentTuple.tickHandler = null` — placeholder for Plan B

Plan B wires all of it together and centralizes the scattered hazard-to-instrument performance pipeline. Zero new modifier keys. Zero new gameplay mechanics.

---

## Out of Scope

- Any new `ProfileModifiers` keys
- Reward track UI changes
- ChemCam/SAM/APXS sequence progress bars — controller state, not modifier stats
- Meteor damage system (separate hazard path)
- Removing `createMarsSiteTickHandlers.ts` (existing tick handlers stay, they just get simpler)

---

## Design Boundary: Data vs Controller

**Data model + resolver responsibility:**
- What modifier keys exist, what labels they have, what tier each instrument has
- What the environment state is (storm, thermal, radiation)
- What the composite performance factors are — a single `speedFactor` and `accuracyFactor` computed from `{tier, durability, environment, profile}`
- Display: per-stat buff/debuff breakdowns for the overlay

**Controller responsibility:**
- How it uses `speedFactor` (Drill → `durationMultiplier = 1/speedFactor`; MastCam → same but also `surveyRange = 5 * accuracyFactor`)
- Whether to block operation (APXS checks thermal zone itself and refuses at CRITICAL — that's APXS-specific behavior, not a data rule)
- Any instrument-specific formulas

The resolver says "your speed is 73% of baseline." The controller decides what that means mechanically.

---

## Subsystem 1 — `tier` in `InstrumentDef`

### Data change

Add `tier: InstrumentTier` to `InstrumentDef` in `src/types/instruments.ts`. Populate in `instruments.json`:

| Instrument | Tier | Source |
|---|---|---|
| MastCam | `sensitive` | MastCamController.ts |
| ChemCam | `sensitive` | ChemCamController.ts |
| Drill | `standard` | default |
| APXS | `sensitive` | APXSController.ts |
| DAN | `sensitive` | DANController.ts |
| SAM | `sensitive` | SAMController.ts |
| RTG | `rugged` | RTGController.ts |
| REMS | `sensitive` | REMSController.ts |
| RAD | `sensitive` | RADController.ts |
| Heater | `rugged` | HeaterController.ts |
| LGA | `standard` | default |
| UHF | `standard` | default |
| Wheels | `rugged` | RoverWheelsController.ts |
| Mic | `standard` | default |

### Single source of truth

Remove `readonly tier` overrides from all 14 controller subclasses. Change the base class `InstrumentController.tier` from `readonly` to a settable property (keep `'standard'` default). `InstrumentFactory.createInstrumentTuple()` sets `controller.tier = def.tier` after construction.

`MarsSiteViewController` durability decay still reads `inst.tier` — but now it comes from the JSON via the factory, not hardcoded in the subclass.

Edit JSON → behavior changes everywhere. One source of truth.

---

## Subsystem 2 — Centralized Performance Resolution

**File:** `src/lib/instrumentPerformance.ts` (new)

### Types

```ts
import type { InstrumentTier } from '@/lib/hazards'

export interface InstrumentEnvironment {
  thermalZone: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  stormLevel: number       // 0 = no storm, 1-5
  radiationLevel: number   // 0-1, safe below 0.25
}

export interface InstrumentPerformanceContext {
  /** Composite speed: profileSpeed * durability / (thermal * storm * radiation). >1 = faster. */
  speedFactor: number
  /** Composite accuracy: profileAccuracy * durability / (storm * radiation). */
  accuracyFactor: number
  /** Raw hazard values — exposed for controllers with custom behavior. */
  thermalZone: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  thermalMult: number
  stormPenalty: number
  radiationPenalty: number
}
```

### Resolution function

```ts
export function resolveInstrumentPerformance(
  tier: InstrumentTier,
  durabilityFactor: number,
  env: InstrumentEnvironment,
  profileSpeedMod: number,    // mod('analysisSpeed')
  profileAccuracyMod: number, // mod('instrumentAccuracy')
): InstrumentPerformanceContext
```

Internally calls existing `computeStormPerformancePenalty(env.stormLevel, tier)` and `computeRadiationPerformancePenalty(env.radiationLevel, tier)`. Uses `THERMAL_DURATION_MULT` for the standard thermal penalty. Composes:

```
thermalMult = THERMAL_DURATION_MULT[env.thermalZone]
stormPenalty = computeStormPerformancePenalty(env.stormLevel, tier)
radiationPenalty = computeRadiationPerformancePenalty(env.radiationLevel, tier)
durability = max(0.1, durabilityFactor)

speedFactor = profileSpeedMod * durability / (thermalMult * stormPenalty * radiationPenalty)
accuracyFactor = profileAccuracyMod * durability / (stormPenalty * radiationPenalty)
```

Notes:
- Radiation performance penalty is currently orphaned (exists with tests, never applied to instruments). This wires it in for free.
- Thermal is NOT applied to accuracy — only speed. Matches current behavior.
- Controllers that need special thermal handling (APXS `CRITICAL` block, APXS custom duration table) read `perf.thermalZone` and override as needed. That's controller behavior.

### `InstrumentEnvironment` in the frame context

`MarsSiteViewController` builds `InstrumentEnvironment` once per frame and adds it to `SiteFrameContext` as `env: InstrumentEnvironment`. Built from existing fields:

```ts
env: {
  thermalZone,
  stormLevel: dustStormPhase === 'active' ? (dustStormLevel ?? 0) : 0,
  radiationLevel,
}
```

This replaces the `dustStormPhase === 'active' ? computeStormPerformancePenalty(...)` ternary repeated in every tick handler.

### Tick handler simplification

Each tick handler goes from ~15 lines of penalty boilerplate to:

```ts
const perf = resolveInstrumentPerformance(
  def.tier, inst.durabilityFactor, fctx.env,
  mod('analysisSpeed'), mod('instrumentAccuracy'),
)
inst.durationMultiplier = 1 / perf.speedFactor
inst.accuracyMod = perf.accuracyFactor
```

Controllers with custom behavior still have access to raw values:
- APXS reads `perf.thermalZone` for the CRITICAL block and its custom duration table
- MastCam uses `perf.accuracyFactor` to compute `surveyRange`
- DAN uses `perf.speedFactor` for crater scan duration

### Testing

Unit tests in `src/lib/__tests__/instrumentPerformance.test.ts`:
- No hazards, neutral profile → `speedFactor = 1.0`, `accuracyFactor = 1.0`
- Storm level 3, sensitive tier → `stormPenalty > 1`, `speedFactor < 1`
- FRIGID thermal zone → `thermalMult = 1.25`, `speedFactor` reduced
- Radiation level 0.5, standard tier → `radiationPenalty > 1`
- Durability at 50% → factors scaled proportionally
- Profile speed boost +10% → `speedFactor > 1` when no hazards
- Combined: storm + thermal + radiation stack multiplicatively

---

## Subsystem 3 — Computed Display Layer: `useResolvedInstrumentStats`

**File:** `src/composables/useResolvedInstrumentStats.ts` (new)

A pure function that resolves `InstrumentDef.stats[]` into display-ready breakdowns for the overlay. Keeps the overlay a pure renderer and makes stat resolution independently testable.

### Types

```ts
export interface ResolvedStat {
  stat: InstrumentStatDef
  breakdown: SpeedBreakdown
}

export type ResolvedInstrumentStats = ResolvedStat[]
```

### Resolution algorithm

1. **Get definition** — `def = defBySlot(activeSlot)` via `useInstrumentProvider`
2. **Collect passive bonuses** — iterate all currently active instruments, gather `provides[]` entries; build display extras per `ProfileModifiers` key (e.g. REMS active → `spYield` gets `{ label: "REMS ACTIVE", value: "+5%", color: green }`)
3. **Resolve each stat** — for each `stat` in `def.stats`, call `buildSpeedBreakdown` with profile sources, thermal zone, storm level, radiation level, and `instrumentTier: def.tier`
4. **Return** `ResolvedInstrumentStats` — one `ResolvedStat` per declared stat, in `def.stats[]` order

### Inputs

```ts
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
```

### `buildSpeedBreakdown` radiation entry

Add `radiationLevel` and `instrumentTier` handling to `buildSpeedBreakdown` (in `src/lib/instrumentSpeedBreakdown.ts`). When both are provided and `radiationLevel > 0.25`, compute `computeRadiationPerformancePenalty` and add a `"RADIATION"` buff entry — same pattern as the existing storm entry:

```ts
// After existing storm penalty block:
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

And include `radiationSpeedFactor` in the final `speedPct` computation.

### Testing

Unit tests in `src/composables/__tests__/useResolvedInstrumentStats.test.ts`:
- Active slot with no stats → returns `[]`
- REMS active → `spYield` stat includes `"REMS ACTIVE"` buff entry
- Single stat, no buffs → `speedPct = 100`, `buffs = [BASELINE]`
- Reward track modifier → appears in `buffs[]` with correct label and pct
- Storm + tier → `"DUST STORM (L3)"` entry appears with tier-scaled penalty
- Radiation above 0.25 → `"RADIATION"` entry appears
- Preserves stat order from `def.stats[]`

---

## Subsystem 4 — Controller Wiring

### 4A — `TickHandler` interface

Add to `src/instruments/InstrumentFactory.ts`:

```ts
export interface TickHandler {
  tick(delta: number): void
  dispose(): void
}
```

Update `InstrumentTuple.tickHandler` from `null` to `TickHandler | null`. Update `InstrumentTickController` to use typed optional chaining instead of `any` casts.

### 4B — `drillTickHandler`

**File:** `src/instruments/tickHandlers/drillTickHandler.ts` (new)

Sets `DrillController.accuracyMod` from `mod('instrumentAccuracy')` each frame. Registered as `"DrillTickHandler"` in `TICK_HANDLER_REGISTRY`.

```ts
export function createDrillTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const drill = controller as DrillController
  return {
    tick() { drill.accuracyMod = mod('instrumentAccuracy') },
    dispose() {},
  }
}
```

### 4C — Chain bonus parameterization in `DrillController`

Import `mod` from `usePlayerProfile`. Replace hardcoded values:

| Location | Current | Plan B |
|----------|---------|--------|
| `LaserDrill.scanSpeedMult` | `scanned ? 0.6 : 1.0` | `scanned ? (1 - 0.4 * mod('chainDrillBonus')) : 1.0` |
| `weightMult` | `+= 0.3` | `+= 0.3 * mod('chainLootBonus')` |

At `NEUTRAL_MODIFIERS` (all keys = 1): behavior is identical to today.

### 4D — Factory resolves tick handlers

`createInstrumentTuple` looks up `def.tickHandlerType` in `TICK_HANDLER_REGISTRY`. If found, calls the factory function. If not found, returns `null`. No error — most instruments don't have tick handlers yet.

### 4E — Factory sets `controller.tier` from `def.tier`

After constructing the controller, `controller.tier = def.tier`. This is the single source of truth change from Subsystem 1.

---

## Subsystem 5 — InstrumentOverlay Refactor

**File:** `src/components/InstrumentOverlay.vue` (modify)

### What's removed

- `instrumentSpeedHud` and `instrumentAccuracyHud` props
- `ANALYSIS_INSTRUMENT_SLOTS` constant
- `instrumentSpeedLabel`, `instrumentSpeedStr`, `instrumentSpeedColor`, `instrumentSpeedBarPct` computeds
- `accuracyStr`, `accuracyColor`, `accuracyBarPct` computeds
- The hardcoded speed indicator block (lines 131-150) and accuracy indicator block (lines 152-171)

### What's added

- Props: `activeInstrumentSlots: number[]`, `stormLevel: number`, `radiationLevel: number`
- Imports: `usePlayerProfile`, `useRewardTrack`, `resolveInstrumentStats`
- Computed `resolvedStats` that calls `resolveInstrumentStats` with profile + environment data
- Generic stat loop:

```html
<InstrumentStatBar
  v-for="resolved in resolvedStats"
  :key="resolved.stat.key"
  :label="resolved.stat.label"
  :breakdown="resolved.breakdown"
/>
```

### `InstrumentStatBar` component

**File:** `src/components/InstrumentStatBar.vue` (new)

Props: `label: string`, `breakdown: SpeedBreakdown`

Renders:
- Label + percentage value (color: green >105%, yellow >=95%, red below)
- Bar at `breakdown.speedPct / 1.5` width
- Buff breakdown list: `breakdown.buffs[]` entries

Extracted from the existing speed/accuracy bar pattern in InstrumentOverlay.

### What stays

- REMS environmental panel (live sensor readings)
- Heater panel (live temperature zones)
- Sequence progress bars for ChemCam/SAM/APXS (controller state)
- Default panel (POWER, STATUS, HEALTH)
- Wheels speed display (separate pattern, not modifier-driven)

---

## Subsystem 6 — MartianSiteView + Tick Handler Cleanup

### MartianSiteView.vue

- Remove `:instrument-speed-hud` and `:instrument-accuracy-hud` overlay bindings
- Add `:active-instrument-slots`, `:storm-level`, `:radiation-level` bindings
- Remove dead refs: `drillSpeedBreakdown`, `chemCamSpeedBreakdown`, `mastCamSpeedBreakdown`, `apxsSpeedBreakdown`
- Remove `instrumentSpeedHudForSlot` computed
- Remove `ACCURACY_SLOTS` set and `instrumentAccuracyHud` computed
- Remove the four speed breakdown refs from the `createMarsSiteTickHandlers` call

### SiteFrameContext

Add `env: InstrumentEnvironment` field, built once per frame in `MarsSiteViewController`.

### Tick handler simplification

In each of `DrillTickHandler.ts`, `MastCamTickHandler.ts`, `ChemCamTickHandler.ts`, `APXSTickHandler.ts`, `DanTickHandler.ts`:

1. Remove `speedBreakdown` ref from handler interface
2. Remove `getSpeedBreakdownBase` callback
3. Remove `buildSpeedBreakdown` and `computeStormPerformancePenalty` imports
4. Remove the inline thermal ternary chain and storm penalty computation
5. Replace with `resolveInstrumentPerformance(def.tier, inst.durabilityFactor, fctx.env, mod('analysisSpeed'), mod('instrumentAccuracy'))`
6. Use `perf.speedFactor` and `perf.accuracyFactor` to set controller properties

APXS handler retains its custom thermal duration table and CRITICAL block — reads `perf.thermalZone` for that decision.

In `createMarsSiteTickHandlers.ts`:
- Remove `getSpeedBreakdownBase` function
- Remove speed breakdown refs from destructured `refs` param
- Each handler gets `def: InstrumentDef` passed in (for `def.tier`) — obtained from `useInstrumentProvider().defBySlot()`

### SAM/APXS processing in MartianSiteView

Replace the inline storm penalty computation for SAM queue and APXS minigame timing with `resolveInstrumentPerformance` calls. These are the two remaining callsites in MartianSiteView that manually compute `computeStormPerformancePenalty`.

---

## Data Flow

```
instruments.json (InstrumentDef: stats[], tier, provides[], chainBonuses[])
        |
        ├─── Display path ──────────────────────────────────
        |    useInstrumentProvider.defBySlot(activeSlot)
        |            ↓
        |    resolveInstrumentStats
        |      + usePlayerProfile (archetype/foundation/patron/track)
        |      + provides[] from active instruments (passive bonuses)
        |      + buildSpeedBreakdown() per stat (with tier → storm + radiation entries)
        |            ↓
        |    ResolvedInstrumentStats[]
        |            ↓
        |    InstrumentOverlay → v-for → InstrumentStatBar
        |
        └─── Gameplay path ─────────────────────────────────
             SiteFrameContext.env (built once per frame)
                     ↓
             resolveInstrumentPerformance(def.tier, durability, env, speedMod, accuracyMod)
                     ↓
             InstrumentPerformanceContext { speedFactor, accuracyFactor, thermalZone, ... }
                     ↓
             Tick handlers: set controller.durationMultiplier, controller.accuracyMod, etc.
             Controllers: instrument-specific formulas (surveyRange, APXS block, etc.)
```

```
usePlayerProfile.mod('chainDrillBonus') / mod('chainLootBonus')
        ↓
DrillController (at drill start / at sample collection)
        ↓
LaserDrill.scanSpeedMult, weightMult
```

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/types/instruments.ts` | Modify | Add `tier: InstrumentTier` to `InstrumentDef` |
| `public/data/instruments.json` | Modify | Add `"tier"` field to all 14 instruments |
| `src/three/instruments/InstrumentController.ts` | Modify | `tier` property: drop `readonly`, keep `'standard'` default |
| `src/three/instruments/*.ts` (13 subclasses) | Modify | Remove `readonly tier = '...'` overrides |
| `src/lib/instrumentPerformance.ts` | Create | `InstrumentEnvironment`, `InstrumentPerformanceContext`, `resolveInstrumentPerformance()` |
| `src/lib/__tests__/instrumentPerformance.test.ts` | Create | Unit tests for performance resolution |
| `src/lib/instrumentSpeedBreakdown.ts` | Modify | Add `radiationLevel` input + `"RADIATION"` buff entry |
| `src/composables/useResolvedInstrumentStats.ts` | Create | Stat resolution composable |
| `src/composables/__tests__/useResolvedInstrumentStats.test.ts` | Create | Unit tests for stat resolution |
| `src/instruments/InstrumentFactory.ts` | Modify | Add `TickHandler` interface, typed tuple, factory sets `controller.tier`, resolves tick handler |
| `src/instruments/InstrumentTickController.ts` | Modify | Remove `any` casts, use typed optional chaining |
| `src/instruments/InstrumentRegistry.ts` | Modify | Typed `TICK_HANDLER_REGISTRY`, register `DrillTickHandler` |
| `src/instruments/tickHandlers/drillTickHandler.ts` | Create | Sets `accuracyMod` each frame |
| `src/three/instruments/DrillController.ts` | Modify | Import `mod`, parameterize chain bonuses |
| `src/components/InstrumentStatBar.vue` | Create | Generic stat bar + buff breakdown |
| `src/components/InstrumentOverlay.vue` | Modify | Remove hardcoded stat blocks, add generic loop, swap props |
| `src/views/MartianSiteView.vue` | Modify | Remove dead speed breakdown code, add new overlay bindings |
| `src/views/MarsSiteViewController.ts` | Modify | Build `InstrumentEnvironment` on `SiteFrameContext` |
| `src/views/site-controllers/createMarsSiteTickHandlers.ts` | Modify | Remove `getSpeedBreakdownBase`, remove speed breakdown refs |
| `src/views/site-controllers/DrillTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove penalty boilerplate |
| `src/views/site-controllers/MastCamTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove penalty boilerplate |
| `src/views/site-controllers/ChemCamTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove penalty boilerplate |
| `src/views/site-controllers/APXSTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, keep custom thermal logic |
| `src/views/site-controllers/DanTickHandler.ts` | Modify | Use `resolveInstrumentPerformance`, remove penalty boilerplate |

---

## Correctness Invariants

- At `NEUTRAL_MODIFIERS` (all keys = 1), no hazards, OPTIMAL thermal: `speedFactor = 1.0`, `accuracyFactor = 1.0` — identical to today
- Chain bonus at baseline: `scanSpeedMult = 0.6`, `weightMult += 0.3` — identical to today
- Instruments with empty `stats[]` (LGA, UHF, Mic): generic loop renders nothing — no visible change
- `provides[]` bonuses only stack when the source instrument is in `activeInstrumentSlots`
- `InstrumentStatBar` is purely presentational — no state, no side effects
- Editing `tier` in `instruments.json` changes performance, display, AND durability decay — single source of truth
- APXS CRITICAL thermal block still works — controller reads `perf.thermalZone` and decides
- Radiation performance penalty (previously orphaned) now active in both gameplay and display
