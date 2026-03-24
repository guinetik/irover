# Instrument Durability & Repair System

**Date:** 2026-03-24
**Status:** Approved

## Overview

All rover instruments degrade over time and with use. Durability acts as a modifier layer on top of the existing profile modifier system: `base * profileMod * durabilityFactor`. Worn instruments perform worse — slower analysis, reduced range, higher power draw. Players repair instruments using inventory components (welding wire + typed parts). Each repair permanently reduces max durability by 1%. Instruments break permanently at 25% (5% for LGA).

## Prerequisites: Profile Modifier Audit

Before durability plugs in, all instruments must read performance values from `usePlayerProfile` modifiers. No hardcoded durations or efficiency values.

### analysisSpeed Gaps

| Instrument | Current State | Fix |
|---|---|---|
| MastCam | `SCAN_DURATION = 2.0` hardcoded | Add `durationMultiplier`, set from `1 / playerMod('analysisSpeed')` in MastCamTickHandler |
| APXS | Minigame duration from thermal table only | Multiply thermal duration by `1 / playerMod('analysisSpeed')` |
| Drill | Wired via `durationMultiplier` | No change needed |
| ChemCam | Wired via `durationMultiplier` | No change needed |
| SAM | Wired for queue processing time | No change needed |

### instrumentAccuracy — New Wiring

`instrumentAccuracy` exists in `ProfileModifiers` but is never read. Wire it per instrument:

| Instrument | Effect |
|---|---|
| MastCam | Scales scan detection range (base 5m, `5 * accuracyMod`) |
| Drill | Higher chance of rare trace element drops |
| ChemCam | Higher chance of rare trace elements + reduced power draw during firing |
| APXS | More elements caught in minigame (wider catch zone or slower elements) |
| SAM | Better chance at rare/legendary experiment outcomes |
| DAN | Better water spot quality (higher water probability in prospecting) |
| LGA/UHF | Faster transmission speed + reduced power draw |

### Durability Factor Stacking

After profile mods are applied, durability further scales the result:

- Analysis duration: `baseDuration / (analysisSpeedMod * durabilityFactor)` — worn instruments are slower
- Accuracy effects: `baseAccuracy * accuracyMod * durabilityFactor` — worn instruments are less precise
- Antenna transmission: `baseSpeed * accuracyMod * durabilityFactor` — worn antennae transmit slower
- Power draw (where accuracy reduces it): `basePower / (accuracyMod * durabilityFactor)` — worn instruments draw more

## Data Model

Fields added to `InstrumentController` base class:

```ts
// Current state
durabilityPct: number = 100
maxDurability: number = 100

// Per-instrument config (set by subclass)
readonly breakThreshold: number      // 25 for most, 5 for LGA
readonly passiveDecayPerSol: number  // varies by tier
readonly usageDecayChance: number    // 0-1, probability per use event
readonly usageDecayAmount: number    // % lost when decay triggers
readonly repairComponentId: string   // inventory item id for typed component

// Hazard interface (future content)
hazardDecayMultiplier: number = 1.0  // temporarily set by hazard events
```

### Passive Decay Tiers

Per-sol passive durability loss (before `hazardDecayMultiplier`):

| Tier | Instruments | Decay/Sol |
|---|---|---|
| Rugged | Wheels, Heater, RTG | 0.15% |
| Standard | Drill, LGA, UHF | 0.25% |
| Sensitive | MastCam, ChemCam, APXS, SAM, DAN, REMS, RAD | 0.40% |

Passive decay formula: `passiveDecayPerSol * hazardDecayMultiplier * solDelta`

### Usage Decay

Each "use event" (scan complete, drill complete, ChemCam fire, SAM run, APXS analysis, DAN prospect, antenna transmission) rolls against `usageDecayChance`:

- Chance: ~15-25% per use (tuned per instrument)
- Amount: ~0.5-1.5% per triggered decay

### Break Threshold

At `breakThreshold` (25% for most, 5% for LGA), the instrument is permanently broken:
- `operational` returns false
- Cannot activate
- Shows BROKEN status in overlay
- Cannot be repaired

### Durability Factor

```ts
get durabilityFactor(): number
```

Returns a 0-1 multiplier. Linear interpolation from `breakThreshold` to 100%:
- At 100% durability: factor = 1.0
- At break threshold: factor ~= 0.5
- Formula: `(durabilityPct - breakThreshold) / (100 - breakThreshold)`

### Antenna-Specific Behavior

LGA and UHF antennae degrade transmission speed proportionally to durability. As durability drops:
- Transmission takes longer (duration scales by `1 / durabilityFactor`)
- Power draw increases (draw scales by `1 / durabilityFactor`)
- LGA breaks permanently at 5% — cannot transmit at all

## Repair System

### Cost Formula

Repair cost scales with damage depth (`100 - durabilityPct`):

| Durability Range | Welding Wire | Typed Component |
|---|---|---|
| 90-100% (light wear) | 1 | 0 |
| 70-89% | 2 | 1 |
| 50-69% | 3 | 2 |
| 25-49% | 4 | 3 |

### Component Type Per Instrument

| Component | Instruments |
|---|---|
| engineering-components | MastCam, Drill |
| science-components | ChemCam, APXS, DAN, SAM, REMS, RAD |
| mechatronics-components | Wheels, Heater, RTG |
| digital-components | LGA, UHF |

### Repair Behavior

1. Click REPAIR — overlay shows cost (welding wire + component icons with quantities)
2. If player has materials, second click confirms
3. Short progress bar (~2s)
4. Durability restores to `maxDurability` (not 100%)
5. `maxDurability` drops by 1% (permanent wear per repair)
6. Cannot repair below break threshold — instrument is permanently broken
7. Cannot repair while instrument is in active use

## Selection Glow

The static `INSTRUMENT_SELECTION_GLOW_HEX` (cyan) becomes a per-instrument getter based on durability:

| Durability | Color | Hex |
|---|---|---|
| 85-100% | Cyan | `0x40c8f0` |
| 60-84% | Green | `0x40f080` |
| 40-59% | Yellow | `0xf0e040` |
| 25-39% | Orange | `0xf0a030` |
| Broken (<25%) | Dim brown | `0x804020` |

`selectionHighlightColor` changes from a static readonly to a getter that reads `durabilityPct`. `RoverVfxTickHandler` already reads this per instrument per frame — no structural change needed.

Red is reserved for RTG overdrive.

## Overlay Changes

The instrument overlay (slot 13 WHLS already has a prototype) gets durability display for all instruments:

- Durability bar below the POWER/STATUS/HEALTH stats row
- Color matches the glow tiers (cyan/green/yellow/orange/dim)
- REPAIR button shows cost preview inline (icon + quantity for welding wire and component)
- BROKEN state replaces all controls with a "PERMANENTLY DAMAGED" label

## Hazard Interface (Hooks Only — No Implementation)

Two mechanisms for future hazard content:

### 1. Passive Decay Multiplier

```ts
hazardDecayMultiplier: number = 1.0
```

Hazards temporarily increase this. Example: radiation sets science instruments to 1.25 for its duration.

### 2. Direct Damage

```ts
applyHazardDamage(amount: number): void
```

Instantly reduces `durabilityPct` by `amount`, respects break threshold.

### Category Targeting

The composable bridge exposes:

```ts
applyHazardToCategory(
  category: 'engineering' | 'science' | 'mechatronics' | 'digital',
  effect: { decayMult?: number; directDamage?: number }
): void
```

Maps to instruments via the same `repairComponentId` grouping.

## Architecture

### Approach B: Durability on InstrumentController + Thin Composable Bridge

Durability fields and methods live on `InstrumentController` (base class). Matches the existing `RoverWheelsController` pattern which already has `durabilityPct` and `repair()`.

**InstrumentController additions:**
- Durability state fields (listed above)
- `applyPassiveDecay(solDelta: number): void`
- `rollUsageDecay(): void` — called by instrument on use events
- `applyHazardDamage(amount: number): void`
- `get durabilityFactor(): number`
- `get operational(): boolean` — false below break threshold
- `get selectionHighlightColor(): number` — replaces static field, reads durability
- `getRepairCost(): { weldingWire: number; componentId: string; componentQty: number }`
- `repair(): void` — restores to maxDurability, decrements maxDurability by 1%

**Composable bridge (`useInstrumentDurability.ts`):**
- Reads durability state from controllers for Vue reactivity (ref snapshots updated per frame)
- `tryRepair(instrumentId: string): { ok: boolean; message?: string }` — checks inventory, consumes items, calls controller repair
- `applyHazardToCategory(...)` — iterates instruments, applies effects
- Exposes reactive durability data for overlay components

**Tick integration:**
- `MarsSiteViewController` calls `applyPassiveDecay(solDelta)` on all instruments each frame
- Each instrument's tick handler calls `rollUsageDecay()` at the appropriate use event
- Durability factor is read wherever profile modifiers are applied (analysis speed, accuracy, power draw)

### Files Changed

- `src/three/instruments/InstrumentController.ts` — base class gains durability
- `src/three/instruments/*.ts` — each subclass sets decay config + repairComponentId
- `src/three/instruments/RoverWheelsController.ts` — migrate existing durability to base class pattern
- `src/composables/useInstrumentDurability.ts` — new composable bridge
- `src/views/site-controllers/RoverVfxTickHandler.ts` — glow reads dynamic color
- `src/views/site-controllers/*TickHandler.ts` — wire analysisSpeed/accuracy where missing, add usage decay calls
- `src/views/MarsSiteViewController.ts` — passive decay tick, wire composable
- `src/views/MartianSiteView.vue` — repair handler uses composable, overlay gets durability props
- `src/components/InstrumentOverlay.vue` — durability bar, repair cost preview, broken state
