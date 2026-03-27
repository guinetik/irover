# Instrument Speed Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a speed buff/debuff breakdown for active instruments (Drill, ChemCam, MastCam, APXS) matching the existing wheels display, and refactor wheels to share the same pure function.

**Architecture:** A new pure function `buildSpeedBreakdown()` in `src/lib/instrumentSpeedBreakdown.ts` computes speed % and buff entries from profile sources, thermal zone, and extras. Tick handlers call it each frame and write to a `Ref<SpeedBreakdown | null>`. MartianSiteView passes that ref as a prop to InstrumentOverlay, which renders the speed bar + buff list using generalized CSS classes.

**Tech Stack:** TypeScript, Vue 3, Vitest

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/instrumentSpeedBreakdown.ts` | **New** — `buildSpeedBreakdown()` pure function + `SpeedBreakdown`, `SpeedBuffEntry`, `SpeedBreakdownInput` types |
| `src/lib/__tests__/instrumentSpeedBreakdown.test.ts` | **New** — Unit tests for the builder |
| `src/views/site-controllers/DrillTickHandler.ts` | **Modify** — Add `speedBreakdown` ref, call builder when active |
| `src/views/site-controllers/ChemCamTickHandler.ts` | **Modify** — Add `speedBreakdown` ref, call builder when sequence advancing |
| `src/views/site-controllers/MastCamTickHandler.ts` | **Modify** — Add `speedBreakdown` ref, call builder when active |
| `src/views/site-controllers/APXSTickHandler.ts` | **Modify** — Add `speedBreakdown` ref, call builder when active |
| `src/views/site-controllers/createMarsSiteTickHandlers.ts` | **Modify** — Wire new `speedBreakdown` refs + `profileSources`/`trackModifiers` callbacks |
| `src/views/MarsSiteViewController.ts` | **Modify** — Add `profileSources`/`trackModifiers` to context interface |
| `src/views/MartianSiteView.vue` | **Modify** — Pass profile sources to context; refactor `wheelsOverlayHud` to use builder; compute + pass `instrumentSpeedHud` prop |
| `src/components/InstrumentOverlay.vue` | **Modify** — Add `instrumentSpeedHud` prop; rename CSS classes from `ov-whls-*` to `ov-spd-*`; generalize speed display for both wheels and instruments |

---

### Task 1: Create `buildSpeedBreakdown` pure function with tests

**Files:**
- Create: `src/lib/instrumentSpeedBreakdown.ts`
- Create: `src/lib/__tests__/instrumentSpeedBreakdown.test.ts`

- [ ] **Step 1: Write the test file with all cases**

```ts
// src/lib/__tests__/instrumentSpeedBreakdown.test.ts
import { describe, it, expect } from 'vitest'
import { buildSpeedBreakdown, type SpeedBreakdownInput } from '../instrumentSpeedBreakdown'

const GREEN = '#5dc9a5'
const RED = '#e05030'
const DIM = 'rgba(196,117,58,0.6)'

/** Helper: minimal input with no modifiers */
function baseInput(overrides: Partial<SpeedBreakdownInput> = {}): SpeedBreakdownInput {
  return {
    modifierKey: 'analysisSpeed',
    archetype: null,
    foundation: null,
    patron: null,
    trackModifiers: {},
    ...overrides,
  }
}

describe('buildSpeedBreakdown', () => {
  it('returns baseline 100% when no modifiers are present', () => {
    const result = buildSpeedBreakdown(baseInput())
    expect(result.speedPct).toBeCloseTo(100)
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0]).toEqual({ label: 'BASELINE', value: '100%', color: DIM })
  })

  it('shows archetype modifier with correct label and color', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
    }))
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0]).toEqual({ label: 'MANAGER', value: '+5%', color: GREEN })
    expect(result.speedPct).toBeCloseTo(105)
  })

  it('shows negative modifier in red', () => {
    const result = buildSpeedBreakdown(baseInput({
      patron: { id: 'trc', name: 'Technocrats', modifiers: { analysisSpeed: -0.10 } },
    }))
    expect(result.buffs[0]).toEqual({ label: 'TECHNOCRATS', value: '-10%', color: RED })
    expect(result.speedPct).toBeCloseTo(90)
  })

  it('stacks archetype + foundation + patron + reward track additively', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
      foundation: { id: 'phd', name: 'PhD', modifiers: { analysisSpeed: 0.10 } },
      patron: { id: 'isf', name: 'Academics', modifiers: { analysisSpeed: 0.30 } },
      trackModifiers: { analysisSpeed: 0.05 },
    }))
    // 4 entries: archetype, foundation, patron, reward track
    expect(result.buffs).toHaveLength(4)
    expect(result.buffs[3]).toEqual({ label: 'REWARD TRACK', value: '+5%', color: GREEN })
    // Profile mult = 1 + 0.05 + 0.10 + 0.30 + 0.05 = 1.50 → 150%
    expect(result.speedPct).toBeCloseTo(150)
  })

  it('skips sources that have no modifier for the requested key', () => {
    const result = buildSpeedBreakdown(baseInput({
      modifierKey: 'analysisSpeed',
      archetype: { id: 'maker', name: 'Maker', modifiers: { movementSpeed: 0.05 } },
    }))
    // Maker has movementSpeed, not analysisSpeed — should produce baseline
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0].label).toBe('BASELINE')
    expect(result.speedPct).toBeCloseTo(100)
  })

  it('adds thermal COLD entry (speed boost)', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'COLD' }))
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0].label).toBe('COLD')
    expect(result.buffs[0].color).toBe(GREEN)
    // 1/0.85 ≈ 1.176 → 118%
    expect(result.speedPct).toBeCloseTo(117.6, 0)
  })

  it('adds thermal FRIGID entry (speed penalty)', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'FRIGID' }))
    expect(result.buffs[0].label).toBe('FRIGID')
    expect(result.buffs[0].color).toBe(RED)
    // 1/1.25 = 0.8 → 80%
    expect(result.speedPct).toBeCloseTo(80)
  })

  it('adds thermal CRITICAL entry (half speed)', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'CRITICAL' }))
    expect(result.buffs[0].label).toBe('CRITICAL')
    expect(result.buffs[0].color).toBe(RED)
    expect(result.speedPct).toBeCloseTo(50)
  })

  it('OPTIMAL thermal zone adds no entry', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'OPTIMAL' }))
    expect(result.buffs[0].label).toBe('BASELINE')
  })

  it('appends extras after standard entries', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
      extras: [{ label: 'MASTCAM SCAN', value: '+40%', color: GREEN }],
    }))
    expect(result.buffs).toHaveLength(2)
    expect(result.buffs[0].label).toBe('MANAGER')
    expect(result.buffs[1].label).toBe('MASTCAM SCAN')
  })

  it('uses speedPctOverride when provided', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
      extras: [{ label: 'NIGHT', value: '-25%', color: RED }],
      speedPctOverride: 78.75,
    }))
    expect(result.speedPct).toBeCloseTo(78.75)
  })

  it('works with movementSpeed key for wheels', () => {
    const result = buildSpeedBreakdown(baseInput({
      modifierKey: 'movementSpeed',
      archetype: { id: 'maker', name: 'Maker', modifiers: { movementSpeed: 0.05 } },
    }))
    expect(result.buffs[0]).toEqual({ label: 'MAKER', value: '+5%', color: GREEN })
    expect(result.speedPct).toBeCloseTo(105)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/instrumentSpeedBreakdown.test.ts`
Expected: FAIL — module `../instrumentSpeedBreakdown` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/instrumentSpeedBreakdown.ts
import type { ProfileModifiers } from '@/composables/usePlayerProfile'

export interface SpeedBuffEntry {
  label: string
  value: string
  color: string
}

export interface SpeedBreakdown {
  /** Effective speed as percentage of baseline (100 = no buffs). */
  speedPct: number
  /** Contributing buff / debuff entries. */
  buffs: SpeedBuffEntry[]
}

/** Source definition for one profile layer (archetype, foundation, or patron). */
export interface ProfileSource {
  id: string
  name: string
  modifiers: Partial<ProfileModifiers>
}

export interface SpeedBreakdownInput {
  modifierKey: keyof ProfileModifiers
  archetype: ProfileSource | null
  foundation: ProfileSource | null
  patron: ProfileSource | null
  trackModifiers: Partial<ProfileModifiers>
  thermalZone?: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  extras?: SpeedBuffEntry[]
  speedPctOverride?: number
}

const GREEN = '#5dc9a5'
const RED = '#e05030'
const DIM = 'rgba(196,117,58,0.6)'

/** Duration multiplier per thermal zone (higher = slower). */
const THERMAL_DURATION_MULT: Record<string, number> = {
  OPTIMAL: 1.0,
  COLD: 0.85,
  FRIGID: 1.25,
  CRITICAL: 2.0,
}

function fmtBuff(v: number): string {
  const pct = Math.round(v * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

export function buildSpeedBreakdown(input: SpeedBreakdownInput): SpeedBreakdown {
  const buffs: SpeedBuffEntry[] = []
  let profileSum = 0

  // Profile sources: archetype, foundation, patron
  for (const source of [input.archetype, input.foundation, input.patron]) {
    if (!source) continue
    const mod = source.modifiers[input.modifierKey]
    if (mod) {
      buffs.push({ label: source.name.toUpperCase(), value: fmtBuff(mod), color: mod > 0 ? GREEN : RED })
      profileSum += mod
    }
  }

  // Reward track
  const trackMod = input.trackModifiers[input.modifierKey]
  if (trackMod) {
    buffs.push({ label: 'REWARD TRACK', value: fmtBuff(trackMod), color: trackMod > 0 ? GREEN : RED })
    profileSum += trackMod
  }

  // Thermal zone
  let thermalSpeedFactor = 1
  if (input.thermalZone && input.thermalZone !== 'OPTIMAL') {
    const durMult = THERMAL_DURATION_MULT[input.thermalZone] ?? 1
    thermalSpeedFactor = 1 / durMult
    const pctDelta = thermalSpeedFactor - 1
    buffs.push({
      label: input.thermalZone,
      value: fmtBuff(pctDelta),
      color: pctDelta > 0 ? GREEN : RED,
    })
  }

  // Extras (display-only)
  if (input.extras) {
    for (const extra of input.extras) {
      buffs.push(extra)
    }
  }

  // Compute speedPct
  const profileMult = 1 + profileSum
  let speedPct = profileMult * thermalSpeedFactor * 100
  if (input.speedPctOverride !== undefined) {
    speedPct = input.speedPctOverride
  }

  // Baseline fallback
  if (buffs.length === 0) {
    buffs.push({ label: 'BASELINE', value: '100%', color: DIM })
  }

  return { speedPct, buffs }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/instrumentSpeedBreakdown.test.ts`
Expected: All 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instrumentSpeedBreakdown.ts src/lib/__tests__/instrumentSpeedBreakdown.test.ts
git commit -m "feat: add buildSpeedBreakdown pure function with tests"
```

---

### Task 2: Add profile sources to MarsSiteViewContext

The tick handlers need access to the player's archetype/foundation/patron definitions (for labels) and reward track modifiers. Add these to the view context so `createMarsSiteTickHandlers` can pass them through.

**Files:**
- Modify: `src/views/MarsSiteViewController.ts` (MarsSiteViewContext interface)
- Modify: `src/views/MartianSiteView.vue` (pass profile sources when building context)

- [ ] **Step 1: Add fields to `MarsSiteViewContext`**

In `src/views/MarsSiteViewController.ts`, add these fields to the `MarsSiteViewContext` interface after the existing `playerMod` field (around line 338):

```ts
  /** Profile source definitions for speed breakdown display. */
  profileSources: {
    archetype: import('@/lib/instrumentSpeedBreakdown').ProfileSource | null
    foundation: import('@/lib/instrumentSpeedBreakdown').ProfileSource | null
    patron: import('@/lib/instrumentSpeedBreakdown').ProfileSource | null
  }
  /** Accumulated reward track modifiers for speed breakdown display. */
  trackModifiers: Ref<Partial<ProfileModifiers>>
```

Add the `Ref` import if not already present (it is — check for `import type { Ref } from 'vue'`).

- [ ] **Step 2: Supply profile sources in MartianSiteView.vue**

In `src/views/MartianSiteView.vue`, find where the `MarsSiteViewContext` object is constructed and passed to `createMarsSiteViewController`. It's around line 1460-1490 where `playerMod` is passed. Add:

```ts
    profileSources: {
      archetype: playerProfile.archetype ? ARCHETYPES[playerProfile.archetype] : null,
      foundation: playerProfile.foundation ? FOUNDATIONS[playerProfile.foundation] : null,
      patron: playerProfile.patron ? PATRONS[playerProfile.patron] : null,
    },
    trackModifiers,
```

Note: `ARCHETYPES`, `FOUNDATIONS`, `PATRONS` are already destructured from `usePlayerProfile()` at line 1066. `trackModifiers` is already available from `useRewardTrack()` at line 1068.

- [ ] **Step 3: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors (the new fields are added but not consumed yet).

- [ ] **Step 4: Commit**

```bash
git add src/views/MarsSiteViewController.ts src/views/MartianSiteView.vue
git commit -m "feat: add profileSources and trackModifiers to MarsSiteViewContext"
```

---

### Task 3: Wire speed breakdown refs through tick handler infrastructure

Add `speedBreakdown` refs to the four tick handler interfaces and wire them in `createMarsSiteTickHandlers`. Also pass `profileSources` and `trackModifiers` through callbacks.

**Files:**
- Modify: `src/views/site-controllers/DrillTickHandler.ts` (add to `DrillTickRefs` and `DrillTickCallbacks`)
- Modify: `src/views/site-controllers/ChemCamTickHandler.ts` (add to `ChemCamTickRefs` and `ChemCamTickCallbacks`)
- Modify: `src/views/site-controllers/MastCamTickHandler.ts` (add to `MastCamTickRefs` and `MastCamTickCallbacks`)
- Modify: `src/views/site-controllers/APXSTickHandler.ts` (add to `APXSTickRefs` and `APXSTickCallbacks`)
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts` (wire new refs and callbacks)
- Modify: `src/views/MarsSiteViewController.ts` (add speedBreakdown refs to `MarsSiteViewRefs`)

- [ ] **Step 1: Add `speedBreakdown` ref + `SpeedBreakdownInput` callback to DrillTickHandler**

In `src/views/site-controllers/DrillTickHandler.ts`:

Add import at top:
```ts
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'
```

Add to `DrillTickRefs`:
```ts
  speedBreakdown: Ref<SpeedBreakdown | null>
```

Add to `DrillTickCallbacks`:
```ts
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
```

- [ ] **Step 2: Add `speedBreakdown` ref + callback to ChemCamTickHandler**

In `src/views/site-controllers/ChemCamTickHandler.ts`:

Add import at top:
```ts
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'
```

Add to `ChemCamTickRefs`:
```ts
  speedBreakdown: Ref<SpeedBreakdown | null>
```

Add to `ChemCamTickCallbacks`:
```ts
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
```

- [ ] **Step 3: Add `speedBreakdown` ref + callback to MastCamTickHandler**

In `src/views/site-controllers/MastCamTickHandler.ts`:

Add import at top:
```ts
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'
```

Add to `MastCamTickRefs`:
```ts
  speedBreakdown: Ref<SpeedBreakdown | null>
```

Add to `MastCamTickCallbacks`:
```ts
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
```

- [ ] **Step 4: Add `speedBreakdown` ref + callback to APXSTickHandler**

In `src/views/site-controllers/APXSTickHandler.ts`:

Add import at top:
```ts
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'
```

Add to `APXSTickRefs`:
```ts
  speedBreakdown: Ref<SpeedBreakdown | null>
```

Add to `APXSTickCallbacks`:
```ts
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
```

- [ ] **Step 5: Add speedBreakdown refs to `MarsSiteViewRefs`**

In `src/views/MarsSiteViewController.ts`, add these refs to the `MarsSiteViewRefs` interface:

```ts
  drillSpeedBreakdown: Ref<SpeedBreakdown | null>
  chemCamSpeedBreakdown: Ref<SpeedBreakdown | null>
  mastCamSpeedBreakdown: Ref<SpeedBreakdown | null>
  apxsSpeedBreakdown: Ref<SpeedBreakdown | null>
```

Add the import:
```ts
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

- [ ] **Step 6: Wire refs and callbacks in `createMarsSiteTickHandlers`**

In `src/views/site-controllers/createMarsSiteTickHandlers.ts`, add the import:
```ts
import type { SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'
```

Build the shared callback after destructuring `refs` (around line 40):

```ts
  const getSpeedBreakdownBase = (): Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'> => ({
    modifierKey: 'analysisSpeed',
    archetype: ctx.profileSources.archetype,
    foundation: ctx.profileSources.foundation,
    patron: ctx.profileSources.patron,
    trackModifiers: ctx.trackModifiers.value,
  })
```

Then pass `speedBreakdown` ref and `getSpeedBreakdownBase` callback to each of the four handler constructors:

For `drillHandler` (line ~104), add to refs:
```ts
      speedBreakdown: refs.drillSpeedBreakdown,
```
Add to callbacks:
```ts
      getSpeedBreakdownBase,
```

For `mastCamHandler` (line ~122), add to refs:
```ts
      speedBreakdown: refs.mastCamSpeedBreakdown,
```
Add to callbacks:
```ts
      getSpeedBreakdownBase,
```

For `chemCamHandler` (line ~147), add to refs:
```ts
      speedBreakdown: refs.chemCamSpeedBreakdown,
```
Add to callbacks:
```ts
      getSpeedBreakdownBase,
```

For `apxsHandler` (line ~178), add to refs:
```ts
      speedBreakdown: refs.apxsSpeedBreakdown,
```
Add to callbacks:
```ts
      getSpeedBreakdownBase,
```

- [ ] **Step 7: Add ref declarations in MartianSiteView.vue**

In `src/views/MartianSiteView.vue`, near the other instrument refs (around line 770), add:

```ts
const drillSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const chemCamSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const mastCamSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const apxsSpeedBreakdown = ref<SpeedBreakdown | null>(null)
```

Add the import near the top:
```ts
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

Pass these refs in the `refs` object that feeds `MarsSiteViewRefs` (where all other refs are passed):
```ts
      drillSpeedBreakdown,
      chemCamSpeedBreakdown,
      mastCamSpeedBreakdown,
      apxsSpeedBreakdown,
```

- [ ] **Step 8: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors. The refs exist but aren't written to yet (that's Task 4).

- [ ] **Step 9: Commit**

```bash
git add src/views/site-controllers/DrillTickHandler.ts src/views/site-controllers/ChemCamTickHandler.ts src/views/site-controllers/MastCamTickHandler.ts src/views/site-controllers/APXSTickHandler.ts src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/MarsSiteViewController.ts src/views/MartianSiteView.vue
git commit -m "feat: wire speedBreakdown refs and profile source callbacks through tick handlers"
```

---

### Task 4: Call `buildSpeedBreakdown` in tick handlers

Each tick handler now calls the builder and writes the result to its `speedBreakdown` ref.

**Files:**
- Modify: `src/views/site-controllers/DrillTickHandler.ts`
- Modify: `src/views/site-controllers/ChemCamTickHandler.ts`
- Modify: `src/views/site-controllers/MastCamTickHandler.ts`
- Modify: `src/views/site-controllers/APXSTickHandler.ts`

- [ ] **Step 1: Call builder in DrillTickHandler**

In `src/views/site-controllers/DrillTickHandler.ts`, add import:
```ts
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

Destructure the new ref and callback:
```ts
  const { crosshairVisible, crosshairColor, crosshairX, crosshairY, drillProgress, isDrilling, speedBreakdown } = refs
  const { sampleToastRef, playerMod, awardSP, startHeldActionSound, startHeldMovementSound, getSpeedBreakdownBase } = callbacks
```

In the `tick` function, inside the `if (controller?.mode === 'active' && controller.activeInstrument instanceof DrillController)` block (line 69), after the `drill.drillDurationMultiplier` assignment (line 73), add:

```ts
      // Speed breakdown for HUD
      const scanBuff = drill.drill?.scanSpeedMult !== undefined && drill.drill.scanSpeedMult < 1
      const extras = scanBuff
        ? [{ label: 'MASTCAM SCAN', value: '+40%', color: '#5dc9a5' }]
        : undefined
      speedBreakdown.value = buildSpeedBreakdown({
        ...getSpeedBreakdownBase(),
        thermalZone: z as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL',
        extras,
      })
```

In the `else` branch (when drill is not active, around line 128), add:
```ts
      speedBreakdown.value = null
```

- [ ] **Step 2: Call builder in ChemCamTickHandler**

In `src/views/site-controllers/ChemCamTickHandler.ts`, add import:
```ts
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

Destructure the new ref and callback in the handler factory:
Add `speedBreakdown` to the refs destructure, and `getSpeedBreakdownBase` to the callbacks destructure.

Inside `tick`, after the `ccInst.durationMultiplier = ...` assignment (line 117), add:

```ts
        speedBreakdown.value = buildSpeedBreakdown({
          ...getSpeedBreakdownBase(),
          thermalZone: z as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL',
        })
```

The speed breakdown should show whenever the ChemCam card is selected (slot 2), not only during sequences. So set it unconditionally inside the `if (ccInst instanceof ChemCamController)` block, just after the `isSequenceAdvancing` block (after line 131):

```ts
      // Speed breakdown — show whenever ChemCam card is visible
      const z = thermalZone
      speedBreakdown.value = buildSpeedBreakdown({
        ...getSpeedBreakdownBase(),
        thermalZone: z as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL',
      })
```

Note: the thermal mult variables are already computed inside the `isSequenceAdvancing` guard, so we re-read `thermalZone` from `fctx` directly (it's already destructured at line 84). The builder computes its own thermal factor.

In the `} else {` branch (line 132):
```ts
      speedBreakdown.value = null
```

- [ ] **Step 3: Call builder in MastCamTickHandler**

In `src/views/site-controllers/MastCamTickHandler.ts`, add import:
```ts
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

Destructure `speedBreakdown` from refs and `getSpeedBreakdownBase` from callbacks.

Inside `tick`, after the `mc.durationMultiplier = ...` line (line 112), add:

```ts
      speedBreakdown.value = buildSpeedBreakdown({
        ...getSpeedBreakdownBase(),
        // MastCam does not use thermal zone for its duration
      })
```

In the `else` block (when MastCam is not active, line 117):
```ts
      speedBreakdown.value = null
```

- [ ] **Step 4: Call builder in APXSTickHandler**

In `src/views/site-controllers/APXSTickHandler.ts`, add import:
```ts
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

Destructure `speedBreakdown` from refs and `getSpeedBreakdownBase` from callbacks.

Inside `tick`, after the `duration` computation (line 86), add:

```ts
      speedBreakdown.value = buildSpeedBreakdown({
        ...getSpeedBreakdownBase(),
        thermalZone: thermalZone as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL',
      })
```

In the `else` block (when APXS is not active, line 117):
```ts
      speedBreakdown.value = null
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass (no behavioral changes).

- [ ] **Step 6: Commit**

```bash
git add src/views/site-controllers/DrillTickHandler.ts src/views/site-controllers/ChemCamTickHandler.ts src/views/site-controllers/MastCamTickHandler.ts src/views/site-controllers/APXSTickHandler.ts
git commit -m "feat: call buildSpeedBreakdown in instrument tick handlers"
```

---

### Task 5: Refactor wheels speed breakdown to use `buildSpeedBreakdown`

Replace the ~40-line inline buff-building block in `wheelsOverlayHud` computed with a call to the shared builder.

**Files:**
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Add import**

In `src/views/MartianSiteView.vue`, add near other imports:
```ts
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

- [ ] **Step 2: Replace the inline buff-building block**

In the `wheelsOverlayHud` computed (around lines 791-852), replace the buff-building section (lines 801-850) with:

```ts
  // Night penalty extra
  const nf = currentNightFactor.value
  const nightExtras: { label: string; value: string; color: string }[] = []
  if (nf > 0.01) {
    const penaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
    const nightPenalty = -(nf * penaltyFactor)
    const pct = Math.round(nightPenalty * 100)
    nightExtras.push({
      label: hasPerk('night-vision') ? 'NIGHT (NV)' : 'NIGHT',
      value: pct >= 0 ? `+${pct}%` : `${pct}%`,
      color: '#e05030',
    })
  }

  // RTG overdrive extra
  const rtg = siteRover.value?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
  const rtgBoost = rtg?.speedMultiplier ?? 1.0
  if (rtgBoost > 1) {
    const pct = Math.round((rtgBoost - 1) * 100)
    nightExtras.push({ label: 'RTG OVERDRIVE', value: `+${pct}%`, color: '#5dc9a5' })
  }

  // Final speed % (profile * night * rtg)
  const profileMult = playerMod('movementSpeed')
  const nightPenaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
  const nightPenalty = 1.0 - nf * nightPenaltyFactor
  const speedPct = profileMult * nightPenalty * rtgBoost * 100

  const { buffs: speedBuffs } = buildSpeedBreakdown({
    modifierKey: 'movementSpeed',
    archetype: playerProfile.archetype ? ARCHETYPES[playerProfile.archetype] : null,
    foundation: playerProfile.foundation ? FOUNDATIONS[playerProfile.foundation] : null,
    patron: playerProfile.patron ? PATRONS[playerProfile.patron] : null,
    trackModifiers: trackModifiers.value,
    extras: nightExtras.length > 0 ? nightExtras : undefined,
    speedPctOverride: speedPct,
  })
```

Then update the return statement to use the new `speedBuffs` and `speedPct`:

```ts
  return { powerStr, statusStr, healthPct: w.durabilityPct, speedPct, speedBuffs }
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "refactor: wheels speed breakdown now uses shared buildSpeedBreakdown"
```

---

### Task 6: Add `instrumentSpeedHud` prop to InstrumentOverlay and render

Generalize the speed display section so it works for both wheels and instruments, add the new prop, and rename CSS classes.

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`
- Modify: `src/views/MartianSiteView.vue` (pass the new prop)

- [ ] **Step 1: Add `instrumentSpeedHud` prop to InstrumentOverlay**

In `src/components/InstrumentOverlay.vue`, add the import at the top of the `<script>` block:
```ts
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
```

Add the new prop to the `defineProps` (around line 474):
```ts
    /** Speed breakdown for active analysis instruments (Drill, ChemCam, MastCam, APXS). */
    instrumentSpeedHud?: SpeedBreakdown | null
```

- [ ] **Step 2: Add speed label computed**

Add a computed for the per-instrument speed label, near the other computed values (around line 690):

```ts
const ANALYSIS_INSTRUMENT_SLOTS = new Set([1, 2, 3, 4])  // MastCam, ChemCam, Drill, APXS

const instrumentSpeedLabel = computed(() => {
  switch (props.activeSlot) {
    case 3: return 'DRILL SPD'
    case 2: return 'SCAN SPD'
    case 1: return 'SURVEY SPD'
    case 4: return 'ANALYSIS SPD'
    default: return 'SPD'
  }
})

const instrumentSpeedStr = computed(() => {
  const pct = props.instrumentSpeedHud?.speedPct ?? 100
  return `${Math.round(pct)}%`
})

const instrumentSpeedColor = computed(() => {
  const pct = props.instrumentSpeedHud?.speedPct ?? 100
  if (pct > 105) return '#5dc9a5'
  if (pct >= 95) return '#ef9f27'
  return '#e05030'
})

const instrumentSpeedBarPct = computed(() => {
  const pct = props.instrumentSpeedHud?.speedPct ?? 100
  return Math.min(100, Math.max(0, pct / 1.5))
})
```

- [ ] **Step 3: Rename CSS classes from `ov-whls-*` to `ov-spd-*`**

In the `<style>` section, rename all CSS class names:
- `.ov-whls-speed` → `.ov-spd-speed`
- `.ov-whls-speed-row` → `.ov-spd-speed-row`
- `.ov-whls-speed-label` → `.ov-spd-speed-label`
- `.ov-whls-speed-value` → `.ov-spd-speed-value`
- `.ov-whls-speed-bar-track` → `.ov-spd-speed-bar-track`
- `.ov-whls-speed-bar-fill` → `.ov-spd-speed-bar-fill`
- `.ov-whls-buffs` → `.ov-spd-buffs`
- `.ov-whls-buff` → `.ov-spd-buff`
- `.ov-whls-buff-label` → `.ov-spd-buff-label`
- `.ov-whls-buff-value` → `.ov-spd-buff-value`

Also update the template class names in the existing wheels section to match.

- [ ] **Step 4: Update wheels template to use new class names**

In the template (around line 103-122), update the wheels speed section to use the renamed classes:

```vue
        <!-- WHLS: movement speed indicator -->
        <div v-if="activeSlot === WHLS_SLOT && wheelsHud" class="ov-spd-speed">
          <div class="ov-spd-speed-row">
            <span class="ov-spd-speed-label">MOVE SPD</span>
            <span class="ov-spd-speed-value" :style="{ color: wheelsSpeedColor }">{{ wheelsSpeedStr }}</span>
          </div>
          <div class="ov-spd-speed-bar-track">
            <div class="ov-spd-speed-bar-fill" :style="{ width: wheelsSpeedBarPct + '%', background: wheelsSpeedColor }" />
          </div>
          <div class="ov-spd-buffs">
            <div
              v-for="buff in wheelsHud.speedBuffs"
              :key="buff.label"
              class="ov-spd-buff"
            >
              <span class="ov-spd-buff-label">{{ buff.label }}</span>
              <span class="ov-spd-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
            </div>
          </div>
        </div>
```

- [ ] **Step 5: Add instrument speed section to template**

After the wheels speed section and before the durability bar (line ~124), add:

```vue
        <!-- Instrument analysis speed indicator -->
        <div v-if="instrumentSpeedHud && ANALYSIS_INSTRUMENT_SLOTS.has(activeSlot ?? -1)" class="ov-spd-speed">
          <div class="ov-spd-speed-row">
            <span class="ov-spd-speed-label">{{ instrumentSpeedLabel }}</span>
            <span class="ov-spd-speed-value" :style="{ color: instrumentSpeedColor }">{{ instrumentSpeedStr }}</span>
          </div>
          <div class="ov-spd-speed-bar-track">
            <div class="ov-spd-speed-bar-fill" :style="{ width: instrumentSpeedBarPct + '%', background: instrumentSpeedColor }" />
          </div>
          <div class="ov-spd-buffs">
            <div
              v-for="buff in instrumentSpeedHud.buffs"
              :key="buff.label"
              class="ov-spd-buff"
            >
              <span class="ov-spd-buff-label">{{ buff.label }}</span>
              <span class="ov-spd-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
            </div>
          </div>
        </div>
```

- [ ] **Step 6: Pass `instrumentSpeedHud` prop from MartianSiteView**

In `src/views/MartianSiteView.vue`, in the `<InstrumentOverlay>` component usage (around line 107), add the new prop after the `:wheels-hud` prop:

```vue
      :instrument-speed-hud="instrumentSpeedHudForSlot"
```

Add a computed that picks the right breakdown ref based on the active slot:

```ts
const instrumentSpeedHudForSlot = computed(() => {
  switch (activeInstrumentSlot.value) {
    case 3: return drillSpeedBreakdown.value
    case 2: return chemCamSpeedBreakdown.value
    case 1: return mastCamSpeedBreakdown.value
    case 4: return apxsSpeedBreakdown.value
    default: return null
  }
})
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Verify build compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/InstrumentOverlay.vue src/views/MartianSiteView.vue
git commit -m "feat: show analysis speed breakdown for Drill, ChemCam, MastCam, APXS instruments"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start dev server and verify**

Run: `npm run dev`

Verify in browser:
1. Select Drill (slot 3) — should show "DRILL SPD" with buff breakdown
2. Select ChemCam (slot 2) — should show "SCAN SPD" with buff breakdown
3. Select MastCam (slot 1) — should show "SURVEY SPD" with buff breakdown
4. Select APXS (slot 4) — should show "ANALYSIS SPD" with buff breakdown
5. Select Wheels (slot 13) — should still show "MOVE SPD" with existing buff breakdown (now using renamed CSS classes)
6. Verify that with ISF patron (+30% analysisSpeed), instrument speed shows green +30% entry
7. Verify that in COLD thermal zone, instruments show green COLD entry
8. Verify that in FRIGID zone, instruments show red FRIGID entry
9. Verify drill shows "MASTCAM SCAN +40%" when drilling a tagged rock

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Run type check**

Run: `npm run build`
Expected: Build succeeds.
