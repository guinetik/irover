# Instrument Integration — Plan B Design
**Date:** 2026-03-29
**Scope:** Wire the Plan A data model into live gameplay. Three subsystems: computed stat resolution, controller chain bonus parameterization, and InstrumentOverlay declarative refactor.

---

## Background

Plan A built the data model foundation:
- `InstrumentDef.stats[]` — each instrument declares which `ProfileModifiers` keys apply to it, in display order
- `InstrumentDef.provides[]` — passive bonuses emitted when an instrument is active (REMS: `spYield +5%`)
- `InstrumentDef.chainBonuses[]` — effects applied to rock targets when the instrument is used (MastCam drill bonus, ChemCam loot weight, APXS trace elements)
- `chainDrillBonus` and `chainLootBonus` added to `ProfileModifiers` — declared, not yet wired
- `DrillController.accuracyMod = 1.0` — instance field exists, no setter
- `InstrumentTuple.tickHandler = null` — placeholder for Plan B

Plan B wires all of it together. Zero new modifier keys. Zero new gameplay mechanics.

---

## Out of Scope

- `InstrumentController` subclasses other than DrillController chain bonus wiring
- Any new `ProfileModifiers` keys
- Reward track UI changes
- `buildSpeedBreakdown()` changes
- ChemCam/SAM/APXS sequence progress bars — controller state, not modifier stats

---

## Subsystem 1 — Computed Layer: `useResolvedInstrumentStats`

**File:** `src/composables/useResolvedInstrumentStats.ts` (new)

A composable that, given an active slot and profile sources, returns fully resolved stats for the overlay to render. Keeps the overlay a pure renderer and makes stat resolution independently testable.

### Types

```ts
export interface ResolvedStat {
  stat: InstrumentStatDef        // label + key from InstrumentDef.stats[]
  breakdown: SpeedBreakdown      // { speedPct: number, buffs: SpeedBuffEntry[] }
}

export type ResolvedInstrumentStats = ResolvedStat[]
```

### Resolution Algorithm

1. **Get definition** — `def = defBySlot(activeSlot)` via `useInstrumentProvider`
2. **Collect passive bonuses** — iterate all currently active instruments, gather `provides[]` entries; build a map `passiveExtras: Map<keyof ProfileModifiers, SpeedBuffEntry[]>` (e.g. REMS active → `spYield` gets `{ label: "REMS ACTIVE", pct: 5 }`)
3. **Resolve each stat** — for each `stat` in `def.stats`, call:
   ```ts
   buildSpeedBreakdown({
     modifierKey: stat.key,
     archetype, foundation, patron,
     trackModifiers,
     thermalZone,
     stormLevel,
     extras: passiveExtras.get(stat.key) ?? [],
   })
   ```
4. **Return** `ResolvedInstrumentStats` — one `ResolvedStat` per declared stat, in `def.stats[]` order

### Inputs

```ts
export interface ResolvedInstrumentStatsInput {
  activeSlot: number
  activeInstrumentSlots: number[]   // which instruments are currently on/active (for provides stacking)
  archetype: ProfileSource | null
  foundation: ProfileSource | null
  patron: ProfileSource | null
  trackModifiers: Partial<ProfileModifiers>
  thermalZone?: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  stormLevel?: number
}
```

The composable exports a single function:
```ts
export function resolveInstrumentStats(input: ResolvedInstrumentStatsInput): ResolvedInstrumentStats
```

### Testing

Unit tests in `src/composables/__tests__/useResolvedInstrumentStats.test.ts`:
- Active slot with no stats → returns `[]`
- REMS active → `spYield` stat for an instrument that declares it includes `"REMS ACTIVE"` buff entry
- Single stat, no buffs → `speedPct = 100`, `buffs = []`
- Reward track modifier → appears in `buffs[]` with correct label and pct

---

## Subsystem 2 — Controller Wiring

### 2A — `accuracyMod` tick handler

`DrillController.accuracyMod` is already declared (`= 1.0`). The tick handler, populated via `InstrumentTuple.tickHandler` in Plan B, calls this each frame:

```ts
controller.accuracyMod = mod('instrumentAccuracy')
```

`mod` is imported from `usePlayerProfile`. The tick handler file is `src/instruments/tickHandlers/drillTickHandler.ts` (new, registered in `TICK_HANDLER_REGISTRY` as `"drill"`).

This makes APXS trace element drop count (`1 + floor(random * 2 * this.accuracyMod)`) and ChemCam's accuracy-scaled drops live-reactive to the profile modifier. No changes needed to the drop formulas themselves.

### 2B — Chain bonus parameterization in `DrillController`

Currently hardcoded in `DrillController.ts`:

| Location | Current | Plan B |
|----------|---------|--------|
| `LaserDrill.scanSpeedMult` (drill start) | `scanned ? 0.6 : 1.0` | `scanned ? (1 - 0.4 * mod('chainDrillBonus')) : 1.0` |
| `weightMult` (sample collection) | `+= 0.3` | `+= 0.3 * mod('chainLootBonus')` |

**How `mod` enters DrillController:**
Import `usePlayerProfile` and destructure `mod` at the top of the file. `DrillController` currently has no import from `usePlayerProfile` — this is the one new import.

**Behavior at default profile** (`NEUTRAL_MODIFIERS` → all keys = 1):
- `chainDrillBonus = 1` → `scanSpeedMult = 1 - 0.4 * 1 = 0.6` → same as today
- `chainLootBonus = 1` → `weightMult += 0.3 * 1 = 0.3` → same as today

Zero regression at baseline. Reward track perks that buff `chainDrillBonus` above 1 make tagged rocks drill even faster; nerfs make it less effective.

### 2C — Tick handler registration

`InstrumentTuple.tickHandler` is currently `null`. Plan B:
1. Creates `drillTickHandler.ts` implementing the tick handler interface
2. Registers it in `TICK_HANDLER_REGISTRY` under key `"drill"` (matching `instruments.json` `tickHandlerType: "drill"` for the drill instrument)
3. `InstrumentFactory.createInstrumentTuple()` resolves `tickHandler` from the registry instead of hardcoding `null`

---

## Subsystem 3 — InstrumentOverlay Refactor

**File:** `src/components/InstrumentOverlay.vue` (modify)

### What's currently hardcoded (to be removed)

Lines 132–171 contain slot-based conditionals that render speed and accuracy stat bars:
- `v-if="[1,2,3,4].includes(activeSlot)"` blocks with different speed labels per slot
- A separate accuracy percentage section with buff breakdown

These are replaced by a single generic loop driven by `useResolvedInstrumentStats`.

### What stays

- **REMS environmental panel** (lines 48–94) — live sensor readings (pressure, humidity, wind, UV). Not modifier stats.
- **Heater panel** (lines 26–47) — live temperature zones.
- **Sequence progress bars** for ChemCam/SAM/APXS (lines 196–234) — controller state.
- **Default panel** (lines 95–108) — `POWER`, `STATUS`, `HEALTH` shown for all instruments.

### New generic stat section

Replace the hardcoded speed/accuracy blocks with:

```html
<template v-for="resolved in resolvedStats" :key="resolved.stat.key">
  <InstrumentStatBar
    :label="resolved.stat.label"
    :breakdown="resolved.breakdown"
  />
</template>
```

`resolvedStats` is computed internally via `resolveInstrumentStats(...)` — the overlay calls the composable directly with the active slot and profile context. The existing `instrumentSpeedHud` and `instrumentAccuracyHud` props are removed (they were the manual pre-computed versions of exactly this).

### `InstrumentStatBar` component

**File:** `src/components/InstrumentStatBar.vue` (new, small)

Props: `label: string`, `breakdown: SpeedBreakdown`

Renders:
- Heading: `label` (e.g. "DRILL SPEED", "ACCURACY", "SCAN RADIUS")
- Percentage bar at `breakdown.speedPct`
- Buff breakdown list: `breakdown.buffs[]` (label + pct per entry)

This is the exact pattern already used for the Wheels speed bar — extract it into a reusable component.

---

## Data Flow

```
instruments.json (InstrumentDef.stats[])
        ↓
useInstrumentProvider.defBySlot(activeSlot)
        ↓
useResolvedInstrumentStats
  + usePlayerProfile (archetype/foundation/patron/track)
  + provides[] from active instruments (passive bonuses)
  + buildSpeedBreakdown() per stat
        ↓
ResolvedInstrumentStats[]
        ↓
InstrumentOverlay.vue
  → v-for → InstrumentStatBar (label + SpeedBreakdown)
```

```
usePlayerProfile.mod('instrumentAccuracy')
        ↓
drillTickHandler (each frame)
        ↓
DrillController.accuracyMod
        ↓
APXS trace drop count, ChemCam drop count (existing formulas)

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
| `src/composables/useResolvedInstrumentStats.ts` | Create | Stat resolution composable |
| `src/composables/__tests__/useResolvedInstrumentStats.test.ts` | Create | Unit tests for resolution logic |
| `src/components/InstrumentStatBar.vue` | Create | Generic stat bar + buff breakdown |
| `src/components/InstrumentOverlay.vue` | Modify | Remove hardcoded stat blocks, add generic loop, remove `instrumentSpeedHud`/`instrumentAccuracyHud` props |
| `src/three/instruments/DrillController.ts` | Modify | Import `mod`, parameterize chain bonuses |
| `src/instruments/tickHandlers/drillTickHandler.ts` | Create | Sets `accuracyMod` each frame |
| `src/instruments/InstrumentRegistry.ts` | Modify | Register `"drill"` in `TICK_HANDLER_REGISTRY` |
| `src/instruments/InstrumentFactory.ts` | Modify | Resolve `tickHandler` from registry instead of `null` |

---

## Correctness Invariants

- At `NEUTRAL_MODIFIERS` (all keys = 1): chain bonus behavior is identical to today's hardcoded values
- Instruments with empty `stats[]` (LGA, UHF, Mic): generic loop renders nothing — no visible change
- `provides[]` bonuses only stack when the source instrument is in `activeInstrumentSlots` — REMS off = no buff
- `InstrumentStatBar` is purely presentational — no state, no side effects
