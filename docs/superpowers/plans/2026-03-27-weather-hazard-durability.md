# Weather Hazard → Instrument Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dust storms accelerate instrument durability decay via a hazard event system, with tier-based vulnerability and a storm floor preventing permanent breakage.

**Architecture:** New pure `src/lib/hazards/` module defines `HazardEvent` type and `computeDecayMultiplier()`. Each `InstrumentController` subclass gains a `tier` field. The frame loop in `MarsSiteViewController.ts` builds hazard events from weather state, computes per-instrument multipliers, and sets `hazardDecayMultiplier` before the existing `applyPassiveDecay()` call. `applyPassiveDecay()` is updated to enforce a storm floor (breakThreshold + 10) when the multiplier exceeds 1.0.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-weather-hazard-durability-design.md`

---

### Task 1: Hazard Types Module

**Files:**
- Create: `src/lib/hazards/hazardTypes.ts`

- [ ] **Step 1: Create `hazardTypes.ts`**

```typescript
/** A hazard source currently affecting the rover. */
export interface HazardEvent {
  source: string
  active: boolean
  level: number
}

/** Instrument durability tier — determines vulnerability to hazards. */
export type InstrumentTier = 'rugged' | 'standard' | 'sensitive'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hazards/hazardTypes.ts
git commit -m "feat(hazards): add HazardEvent and InstrumentTier types"
```

---

### Task 2: `computeDecayMultiplier` — Tests First

**Files:**
- Create: `src/lib/hazards/__tests__/hazardDecay.test.ts`
- Create: `src/lib/hazards/hazardDecay.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { computeDecayMultiplier } from '../hazardDecay'
import type { HazardEvent } from '../hazardTypes'

describe('computeDecayMultiplier', () => {
  it('returns 1.0 with no events', () => {
    expect(computeDecayMultiplier([], 'rugged')).toBe(1.0)
    expect(computeDecayMultiplier([], 'standard')).toBe(1.0)
    expect(computeDecayMultiplier([], 'sensitive')).toBe(1.0)
  })

  it('returns 1.0 with inactive events', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: false, level: 5 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })

  it('returns correct multiplier for rugged tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.15)

    event.level = 3
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.45)

    event.level = 5
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.75)
  })

  it('returns correct multiplier for standard tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(1.25)

    event.level = 3
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(1.75)

    event.level = 5
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(2.25)
  })

  it('returns correct multiplier for sensitive tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(1.35)

    event.level = 3
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(2.05)

    event.level = 5
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(2.75)
  })

  it('stacks multiple active hazards additively', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: true, level: 5 },
      { source: 'dust-storm', active: true, level: 3 },
    ]
    // rugged: 1.0 + 5*0.15 + 3*0.15 = 1.0 + 0.75 + 0.45 = 2.20
    expect(computeDecayMultiplier(events, 'rugged')).toBeCloseTo(2.2)
  })

  it('ignores unknown source names', () => {
    const events: HazardEvent[] = [
      { source: 'alien-mind-control', active: true, level: 5 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hazards/__tests__/hazardDecay.test.ts`
Expected: FAIL — module `../hazardDecay` does not exist

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/hazards/hazardDecay.ts`:

```typescript
import type { HazardEvent, InstrumentTier } from './hazardTypes'

const TIER_COEFFICIENTS: Record<string, Record<InstrumentTier, number>> = {
  'dust-storm': { rugged: 0.15, standard: 0.25, sensitive: 0.35 },
}

export function computeDecayMultiplier(
  events: HazardEvent[],
  tier: InstrumentTier,
): number {
  let bonus = 0
  for (const e of events) {
    if (!e.active) continue
    const coeffs = TIER_COEFFICIENTS[e.source]
    if (!coeffs) continue
    bonus += e.level * coeffs[tier]
  }
  return 1.0 + bonus
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hazards/__tests__/hazardDecay.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hazards/hazardDecay.ts src/lib/hazards/__tests__/hazardDecay.test.ts
git commit -m "feat(hazards): add computeDecayMultiplier with TDD tests"
```

---

### Task 3: Barrel Export

**Files:**
- Create: `src/lib/hazards/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
export { computeDecayMultiplier } from './hazardDecay'
export type { HazardEvent, InstrumentTier } from './hazardTypes'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hazards/index.ts
git commit -m "feat(hazards): add barrel export"
```

---

### Task 4: Add `tier` Field to `InstrumentController` and Subclasses

**Files:**
- Modify: `src/three/instruments/InstrumentController.ts:1-5` (import type) and `:74-82` (add tier field)
- Modify: `src/three/instruments/RoverWheelsController.ts` (add `tier = 'rugged'`)
- Modify: `src/three/instruments/HeaterController.ts` (add `tier = 'rugged'`)
- Modify: `src/three/instruments/RTGController.ts` (add `tier = 'rugged'`)
- Modify: `src/three/instruments/DrillController.ts` (add `tier = 'standard'`)
- Modify: `src/three/instruments/AntennaLGController.ts` (add `tier = 'standard'`)
- Modify: `src/three/instruments/AntennaUHFController.ts` (add `tier = 'standard'`)
- Modify: `src/three/instruments/MicController.ts` (add `tier = 'standard'`)
- Modify: `src/three/instruments/MastCamController.ts` (add `tier = 'sensitive'`)
- Modify: `src/three/instruments/ChemCamController.ts` (add `tier = 'sensitive'`)
- Modify: `src/three/instruments/APXSController.ts` (add `tier = 'sensitive'`)
- Modify: `src/three/instruments/SAMController.ts` (add `tier = 'sensitive'`)
- Modify: `src/three/instruments/DANController.ts` (add `tier = 'sensitive'`)
- Modify: `src/three/instruments/REMSController.ts` (add `tier = 'sensitive'`)
- Modify: `src/three/instruments/RADController.ts` (add `tier = 'sensitive'`)

- [ ] **Step 1: Add import and default `tier` to base class**

In `src/three/instruments/InstrumentController.ts`, add the import at the top:

```typescript
import type { InstrumentTier } from '@/lib/hazards'
```

Then add the `tier` field in the durability system section (after line 81, before `hazardDecayMultiplier`):

```typescript
  readonly tier: InstrumentTier = 'standard'
```

- [ ] **Step 2: Add `tier` override to each Rugged subclass**

In each of these files, add the override line alongside the other durability overrides (next to `passiveDecayPerSol`):

**`RoverWheelsController.ts`:**
```typescript
  override readonly tier: InstrumentTier = 'rugged'
```

Also add import at top:
```typescript
import type { InstrumentTier } from '@/lib/hazards'
```

**`HeaterController.ts`:**
```typescript
  override readonly tier: InstrumentTier = 'rugged'
```

Also add import at top:
```typescript
import type { InstrumentTier } from '@/lib/hazards'
```

**`RTGController.ts`:**
```typescript
  override readonly tier: InstrumentTier = 'rugged'
```

Also add import at top:
```typescript
import type { InstrumentTier } from '@/lib/hazards'
```

- [ ] **Step 3: Add `tier` override to each Standard subclass**

Standard is the base class default, so `DrillController`, `AntennaLGController`, `AntennaUHFController`, and `MicController` do not need an explicit override — they inherit `'standard'` from the base class. No changes needed for these files.

- [ ] **Step 4: Add `tier` override to each Sensitive subclass**

In each of these files, add the override line alongside the other durability overrides:

**`MastCamController.ts`:**
```typescript
  override readonly tier: InstrumentTier = 'sensitive'
```

Also add import at top:
```typescript
import type { InstrumentTier } from '@/lib/hazards'
```

Repeat the same pattern for: `ChemCamController.ts`, `APXSController.ts`, `SAMController.ts`, `DANController.ts`, `REMSController.ts`, `RADController.ts` — each gets:

```typescript
import type { InstrumentTier } from '@/lib/hazards'
```

And inside the class body:

```typescript
  override readonly tier: InstrumentTier = 'sensitive'
```

- [ ] **Step 5: Verify the project compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/three/instruments/InstrumentController.ts src/three/instruments/RoverWheelsController.ts src/three/instruments/HeaterController.ts src/three/instruments/RTGController.ts src/three/instruments/MastCamController.ts src/three/instruments/ChemCamController.ts src/three/instruments/APXSController.ts src/three/instruments/SAMController.ts src/three/instruments/DANController.ts src/three/instruments/REMSController.ts src/three/instruments/RADController.ts
git commit -m "feat(hazards): add tier field to InstrumentController and all subclasses"
```

---

### Task 5: Storm Floor in `applyPassiveDecay` — Tests First

**Files:**
- Modify: `src/three/instruments/__tests__/instrumentDurability.test.ts`
- Modify: `src/three/instruments/InstrumentController.ts:113-119`

- [ ] **Step 1: Add storm floor tests**

Append these tests inside the existing `describe('InstrumentController durability', ...)` block in `src/three/instruments/__tests__/instrumentDurability.test.ts`:

```typescript
  it('applyPassiveDecay uses storm floor when hazardDecayMultiplier > 1.0', () => {
    const inst = new TestInstrument()
    // breakThreshold = 25, so storm floor = 35
    inst.durabilityPct = 36
    inst.hazardDecayMultiplier = 2.0
    inst.applyPassiveDecay(100) // large solDelta to force floor
    expect(inst.durabilityPct).toBe(35) // stops at storm floor, not breakThreshold
  })

  it('applyPassiveDecay uses normal breakThreshold floor when hazardDecayMultiplier = 1.0', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = 30
    inst.hazardDecayMultiplier = 1.0
    inst.applyPassiveDecay(100)
    expect(inst.durabilityPct).toBe(25) // normal breakThreshold floor
  })

  it('applyPassiveDecay storm floor does not raise durability if already below floor', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = 30 // below storm floor of 35, above breakThreshold of 25
    inst.hazardDecayMultiplier = 2.0
    inst.applyPassiveDecay(0.001) // tiny delta
    // Should not decay further since already below storm floor with active hazard
    expect(inst.durabilityPct).toBe(30)
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/three/instruments/__tests__/instrumentDurability.test.ts`
Expected: The first new test FAILS (decays to 25 instead of stopping at 35). The third test may also fail.

- [ ] **Step 3: Update `applyPassiveDecay` to enforce storm floor**

In `src/three/instruments/InstrumentController.ts`, replace the existing `applyPassiveDecay` method (lines 113-119):

```typescript
  applyPassiveDecay(solDelta: number): void {
    if (this.durabilityPct <= this.breakThreshold) return
    const stormFloor = this.hazardDecayMultiplier > 1.0
      ? this.breakThreshold + 10
      : this.breakThreshold
    if (this.durabilityPct <= stormFloor) return
    this.durabilityPct = Math.max(
      stormFloor,
      this.durabilityPct - this.passiveDecayPerSol * this.hazardDecayMultiplier * solDelta,
    )
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/three/instruments/__tests__/instrumentDurability.test.ts`
Expected: All tests PASS (including existing ones — the storm floor logic only activates when `hazardDecayMultiplier > 1.0`, so existing tests with default multiplier 1.0 are unaffected)

- [ ] **Step 5: Commit**

```bash
git add src/three/instruments/InstrumentController.ts src/three/instruments/__tests__/instrumentDurability.test.ts
git commit -m "feat(hazards): enforce storm floor in applyPassiveDecay (breakThreshold + 10)"
```

---

### Task 6: Wire Hazard Events in Frame Loop

**Files:**
- Modify: `src/views/MarsSiteViewController.ts:765-773`

- [ ] **Step 1: Add import at top of file**

Add to the imports in `src/views/MarsSiteViewController.ts`:

```typescript
import { computeDecayMultiplier } from '@/lib/hazards'
import type { HazardEvent } from '@/lib/hazards'
```

- [ ] **Step 2: Wire hazard multiplier before `applyPassiveDecay` loop**

Replace the block at lines 770-773:

```typescript
      if (controller) {
        for (const inst of controller.instruments) {
          inst.applyPassiveDecay(solDelta)
        }
      }
```

With:

```typescript
      if (controller) {
        const sw = siteWeather.value
        const dustStormEvent: HazardEvent = {
          source: 'dust-storm',
          active: sw.dustStormPhase === 'active',
          level: sw.dustStormLevel ?? 0,
        }
        const hazardEvents = [dustStormEvent]
        for (const inst of controller.instruments) {
          inst.hazardDecayMultiplier = computeDecayMultiplier(hazardEvents, inst.tier)
          inst.applyPassiveDecay(solDelta)
        }
      }
```

- [ ] **Step 3: Verify the project compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/MarsSiteViewController.ts
git commit -m "feat(hazards): wire dust storm hazard events into frame loop decay"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run dev server and manually verify**

Run: `npm run dev`

Manual check:
1. Navigate to any Mars site
2. Wait for a dust storm (or use browser console: find the REMS composable and call `triggerStorm(3)`)
3. Observe that sensitive instruments (ChemCam, APXS, etc.) show faster durability decay during the active storm phase
4. Observe that rugged instruments (Wheels, RTG) show less accelerated decay
5. Observe that durability does not drop below 35% due to storm-accelerated decay
6. Observe that once the storm ends, decay returns to normal rate

- [ ] **Step 4: Commit any fixes if needed**
