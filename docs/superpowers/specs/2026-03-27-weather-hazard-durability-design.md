# Weather Hazard → Instrument Durability Design

**Date:** 2026-03-27
**Status:** Draft

## Summary

Dust storms accelerate instrument durability decay via a general-purpose hazard event system. During the `active` storm phase, each instrument's `hazardDecayMultiplier` is increased based on storm level and instrument tier. No tick damage, no direct damage — just a multiplier on the existing passive decay. The system is designed to accommodate future hazard sources (RAD radiation, thermal extremes) without structural changes.

## Goals

- Bad weather (dust storms) should cause instruments to wear faster
- Damage should be gradual pressure over many sols/storms, not a single-event crisis
- Sensitive instruments degrade faster than rugged ones during storms
- Storms alone cannot permanently break an instrument (storm floor above break threshold)
- Architecture supports future hazard sources (radiation, thermal) plugging in cleanly

## Non-Goals

- No direct/tick damage from storms
- No UI changes (existing durability bar reflects accelerated wear naturally)
- No new composable layer
- No changes to repair costs or upgrade system

---

## Architecture

### New Module: `src/lib/hazards/`

#### `hazardTypes.ts` — Shared Types

```typescript
/** A hazard source currently affecting the rover. */
export interface HazardEvent {
  source: string        // 'dust-storm', future: 'radiation', 'thermal', etc.
  active: boolean       // is this hazard currently happening?
  level: number         // severity (1-5 for storms, TBD for others)
}

/** Instrument durability tier — determines vulnerability to hazards. */
export type InstrumentTier = 'rugged' | 'standard' | 'sensitive'
```

#### `hazardDecay.ts` — Pure Decay Multiplier Computation

```typescript
/**
 * Compute the combined hazardDecayMultiplier for an instrument
 * given all active hazard events and the instrument's tier.
 *
 * Returns 1.0 when no hazards are active (no change to baseline decay).
 */
export function computeDecayMultiplier(
  events: HazardEvent[],
  tier: InstrumentTier,
): number
```

**Dust-storm multiplier formula:**

| Tier | Formula | Level 1 | Level 3 | Level 5 |
|------|---------|---------|---------|---------|
| Rugged | `1.0 + level × 0.15` | 1.15× | 1.45× | 1.75× |
| Standard | `1.0 + level × 0.25` | 1.25× | 1.75× | 2.25× |
| Sensitive | `1.0 + level × 0.35` | 1.35× | 2.05× | 2.75× |

**Multiple hazard stacking (future):** Bonuses are additive across sources. If a dust storm adds +0.75 and radiation adds +0.50, total multiplier = 1.0 + 0.75 + 0.50 = 2.25×. This keeps values bounded and predictable.

**Per-source multiplier coefficients** are defined as a lookup table keyed by `source` string, making it trivial to add new sources:

```typescript
const TIER_COEFFICIENTS: Record<string, Record<InstrumentTier, number>> = {
  'dust-storm': { rugged: 0.15, standard: 0.25, sensitive: 0.35 },
  // future:
  // 'radiation': { rugged: 0.10, standard: 0.20, sensitive: 0.40 },
}
```

Unknown sources are ignored (coefficient 0).

---

## Instrument Tier Assignment

Each `InstrumentController` subclass gains an explicit `readonly tier: InstrumentTier` field:

| Tier | Instruments | Passive Decay/Sol |
|------|-------------|-------------------|
| Rugged | Wheels, Heater, RTG | 0.15% |
| Standard | Drill, LGA, UHF, Mic | 0.25% |
| Sensitive | MastCam, ChemCam, APXS, SAM, DAN, REMS, RAD | 0.40% |

This aligns with the existing implicit tier structure defined by `passiveDecayPerSol`.

---

## Storm Floor

Storm-driven decay must not permanently break instruments. When `hazardDecayMultiplier > 1.0`, the effective floor for `applyPassiveDecay` is raised:

```
stormFloor = breakThreshold + 10
```

| Instrument | Break Threshold | Storm Floor |
|------------|----------------|-------------|
| Most | 25% | 35% |
| LGA | 5% | 15% |

If `durabilityPct` is already at or below the storm floor and `hazardDecayMultiplier > 1.0`, no further decay is applied. Normal decay (multiplier = 1.0) still decays to the regular `breakThreshold` as before.

Implementation: modify `applyPassiveDecay` to use the higher floor when the multiplier exceeds 1.0.

---

## Integration: Frame Loop

In `MarsSiteViewController.ts`, after the weather tick and before the existing `applyPassiveDecay` loop:

```typescript
// 1. Build hazard event from weather state
const dustStormEvent: HazardEvent = {
  source: 'dust-storm',
  active: siteWeather.value.dustStormPhase === 'active',
  level: siteWeather.value.dustStormLevel ?? 0,
}

// 2. Update each instrument's hazardDecayMultiplier
const events = [dustStormEvent]  // future: add radiation, thermal events
for (const inst of controller.instruments) {
  inst.hazardDecayMultiplier = computeDecayMultiplier(events, inst.tier)
}

// 3. Existing applyPassiveDecay(solDelta) already uses hazardDecayMultiplier
```

When the storm ends (`active: false`), `computeDecayMultiplier` returns `1.0`, and decay returns to baseline automatically.

---

## Damage Budget (Sanity Check)

To verify the system feels like "gradual pressure" rather than crisis:

**Sensitive instrument (0.40%/sol) in a Level 3 storm (2.05× multiplier):**
- Normal decay over 48s active phase: `0.40% × (48 / SOL_DURATION)` — tiny fraction of a percent
- Storm decay: same × 2.05 — still a tiny fraction, but ~2× faster
- Over 10 storms across many sols: cumulative effect becomes noticeable, motivates repairs

**Rugged instrument (0.15%/sol) in a Level 5 storm (1.75×):**
- Even less impact. Rugged gear shrugs off storms.

The multiplier values are tuned so that storms are a background pressure, not an emergency. Players notice over time, not in real-time.

---

## Testing

### Unit Tests (`src/lib/hazards/__tests__/hazardDecay.test.ts`)

- `computeDecayMultiplier` returns 1.0 with no events
- `computeDecayMultiplier` returns 1.0 with inactive events
- Correct multiplier per tier per storm level (spot-check levels 1, 3, 5)
- Multiple events stack additively
- Unknown source names are ignored

### Integration Test Updates (`src/three/instruments/__tests__/instrumentDurability.test.ts`)

- `applyPassiveDecay` respects storm floor when `hazardDecayMultiplier > 1.0`
- `applyPassiveDecay` uses normal `breakThreshold` floor when multiplier = 1.0

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/hazards/hazardTypes.ts` | New — `HazardEvent`, `InstrumentTier` types |
| `src/lib/hazards/hazardDecay.ts` | New — `computeDecayMultiplier` pure function |
| `src/lib/hazards/index.ts` | New — barrel export |
| `src/three/instruments/InstrumentController.ts` | Add `tier` field, update `applyPassiveDecay` storm floor logic |
| `src/three/instruments/*.ts` | Add `tier` override to each subclass |
| `src/views/MarsSiteViewController.ts` | Build hazard events from weather, set multipliers in frame loop |
| `src/lib/hazards/__tests__/hazardDecay.test.ts` | New — unit tests for multiplier computation |
| `src/three/instruments/__tests__/instrumentDurability.test.ts` | Add storm floor tests |

---

## Future Extensibility

Adding a new hazard source (e.g. RAD radiation) requires:

1. Add coefficients to `TIER_COEFFICIENTS['radiation']` in `hazardDecay.ts`
2. Build a `HazardEvent` from the RAD sensor data in the frame loop
3. Push it into the `events` array alongside the dust storm event

No structural changes needed. The `computeDecayMultiplier` function handles any number of sources.
