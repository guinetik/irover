# Beat B — DAN Extractor Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players to dock with deployed DAN extractors, accumulate resources over time based on site quality, and extract them into inventory at a power cost.

**Architecture:** A pure charge-accumulation formula drives passive yield. Proximity detection in DanTickHandler triggers magnetic docking (snap + movement lock). A new DANExtractorDialog shows storage, charge rate, and the extract action. All extractor state (storedKg, lastChargedSol) lives in the existing DAN/vent archives and is persisted on sol-change.

**Tech Stack:** Vue 3 + TypeScript, useInventory, useDanArchive, useVentArchive, RTGController, Vitest

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/types/extractorDock.ts` | **Create** | `ExtractorFluidType`, `ExtractorDockTarget`, `ExtractorDockState` |
| `src/types/danArchive.ts` | **Modify** | Add `storedKg?`, `lastChargedSol?` to `ArchivedDANProspect` |
| `src/types/ventArchive.ts` | **Modify** | Add `storedKg?`, `lastChargedSol?` to `ArchivedVent` |
| `src/lib/neutron/danExtractorCharge.ts` | **Create** | Pure charge accumulation formula |
| `src/lib/neutron/__tests__/danExtractorCharge.test.ts` | **Create** | Unit tests for charge formula |
| `src/composables/usePlayerProfile.ts` | **Modify** | Add `danChargeRate`, `danPowerCost`, `danStorageCapacity` |
| `src/composables/useDanArchive.ts` | **Modify** | Add `getWaterExtractorsForSite`, `updateExtractorStorage` |
| `src/composables/useVentArchive.ts` | **Modify** | Add `getExtractorTargetsForSite`, `updateExtractorStorage` |
| `src/three/instruments/RTGController.ts` | **Modify** | Add `deductPower(watts)` |
| `src/components/ProfilePanel.vue` | **Modify** | EXTERNAL INTERFACES section + DAN DOCK toggle + 3 mod labels |
| `src/components/DANExtractorDialog.vue` | **Create** | Docked extractor UI |
| `src/views/site-controllers/DanTickHandler.ts` | **Modify** | New refs/callbacks, docking logic, `onNewSol`, `undockExtractor`, `extractFromDock` |
| `src/views/site-controllers/createMarsSiteHudControllers.ts` | **Modify** | Wire new DAN callbacks |
| `src/views/site-controllers/__tests__/instrumentActionSounds.test.ts` | **Modify** | Add new callback stubs |
| `src/views/MartianSiteView.vue` | **Modify** | New refs, ProfilePanel props, DANExtractorDialog |
| `public/data/inventory-items.json` | **Modify** | Add `co2-gas`, `methane-gas` |

---

### Task 1: Foundation Types

**Files:**
- Create: `src/types/extractorDock.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/extractorDock.ts

export type ExtractorFluidType = 'water' | 'co2' | 'methane'

/**
 * Represents one deployed extractor, normalised from either DAN archive
 * (water) or vent archive (co2/methane). Used for proximity docking checks.
 */
export interface ExtractorDockTarget {
  archiveId: string
  archiveType: 'dan' | 'vent'
  fluidType: ExtractorFluidType
  x: number   // terrain-frame X
  z: number   // terrain-frame Z
  storedKg: number
  lastChargedSol: number
  reservoirQuality: number  // 0–1; drives charge rate
}

/**
 * State held in pendingExtractorDock while rover is docked.
 * storedKg is mutable — updated after each extract action.
 */
export interface ExtractorDockState {
  archiveId: string
  archiveType: 'dan' | 'vent'
  fluidType: ExtractorFluidType
  storedKg: number
  maxStorageKg: number         // 1.0 × danStorageCapacityMod
  chargeRateKgPerSol: number   // reservoirQuality × danChargeRateMod
  extractPowerW: number        // 5.0 × danPowerCostMod
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/extractorDock.ts
git commit -m "feat(dan): add ExtractorDockTarget and ExtractorDockState types"
```

---

### Task 2: Charge Accumulation Formula (TDD)

**Files:**
- Create: `src/lib/neutron/danExtractorCharge.ts`
- Create: `src/lib/neutron/__tests__/danExtractorCharge.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/neutron/__tests__/danExtractorCharge.test.ts
import { describe, expect, test } from 'vitest'
import { calcExtractorCharge } from '../danExtractorCharge'

describe('calcExtractorCharge', () => {
  const base = {
    storedKg: 0,
    lastChargedSol: 0,
    currentSol: 0,
    reservoirQuality: 0.5,
    danChargeRateMod: 1.0,
    danStorageCapMod: 1.0,
  }

  test('zero elapsed sols returns unchanged storage', () => {
    const r = calcExtractorCharge({ ...base, storedKg: 0.3, lastChargedSol: 5, currentSol: 5 })
    expect(r.storedKg).toBe(0.3)
    expect(r.lastChargedSol).toBe(5)
  })

  test('average quality site (0.5) accumulates 0.5 kg/sol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 2 })
    expect(r.storedKg).toBeCloseTo(1.0)
  })

  test('strong site (1.0) accumulates 1.0 kg/sol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 1, reservoirQuality: 1.0 })
    expect(r.storedKg).toBeCloseTo(1.0)
  })

  test('weak site (0.3) accumulates 0.3 kg/sol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 1, reservoirQuality: 0.3 })
    expect(r.storedKg).toBeCloseTo(0.3)
  })

  test('caps at base maxStorage (1.0 kg)', () => {
    const r = calcExtractorCharge({ ...base, storedKg: 0.9, currentSol: 10, reservoirQuality: 1.0 })
    expect(r.storedKg).toBe(1.0)
  })

  test('danStorageCapMod buffs max storage', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 10, reservoirQuality: 1.0, danStorageCapMod: 1.5 })
    expect(r.storedKg).toBe(1.5)
  })

  test('danChargeRateMod 0.5 halves the rate', () => {
    // quality 0.5 × rate 0.5 = 0.25 kg/sol; over 4 sols = 1.0 kg
    const r = calcExtractorCharge({ ...base, currentSol: 4, danChargeRateMod: 0.5 })
    expect(r.storedKg).toBeCloseTo(1.0)
  })

  test('negative elapsed sol (time travel guard) treated as zero', () => {
    const r = calcExtractorCharge({ ...base, storedKg: 0.2, lastChargedSol: 10, currentSol: 8 })
    expect(r.storedKg).toBe(0.2)
  })

  test('updates lastChargedSol to currentSol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 7 })
    expect(r.lastChargedSol).toBe(7)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm run test src/lib/neutron/__tests__/danExtractorCharge.test.ts
```

Expected: `Cannot find module '../danExtractorCharge'`

- [ ] **Step 3: Implement the formula**

```typescript
// src/lib/neutron/danExtractorCharge.ts

export interface ChargeResult {
  storedKg: number
  lastChargedSol: number
}

export interface ChargeParams {
  storedKg: number
  lastChargedSol: number
  currentSol: number
  reservoirQuality: number  // 0–1
  danChargeRateMod: number  // 1.0 = no change
  danStorageCapMod: number  // 1.0 = no change
}

/**
 * Calculate accumulated charge since last update.
 * chargeRate = reservoirQuality × danChargeRateMod  kg/sol
 * maxStorage = 1.0 × danStorageCapMod  kg
 * Pure — no side effects.
 */
export function calcExtractorCharge(p: ChargeParams): ChargeResult {
  const chargeRate = p.reservoirQuality * p.danChargeRateMod
  const elapsedSols = Math.max(0, p.currentSol - p.lastChargedSol)
  const maxStorage = 1.0 * p.danStorageCapMod
  return {
    storedKg: Math.min(p.storedKg + chargeRate * elapsedSols, maxStorage),
    lastChargedSol: p.currentSol,
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test src/lib/neutron/__tests__/danExtractorCharge.test.ts
```

Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/neutron/danExtractorCharge.ts src/lib/neutron/__tests__/danExtractorCharge.test.ts
git commit -m "feat(dan): add calcExtractorCharge pure formula with tests"
```

---

### Task 3: Archive Extensions + New Inventory Items

**Files:**
- Modify: `src/types/danArchive.ts`
- Modify: `src/types/ventArchive.ts`
- Modify: `public/data/inventory-items.json`

- [ ] **Step 1: Extend ArchivedDANProspect**

In `src/types/danArchive.ts`, add two optional fields after `transmitted`:

```typescript
  transmitted: boolean
  /** kg of fluid accumulated since deploy. Undefined until first dock. */
  storedKg?: number
  /** Sol at which storedKg was last calculated. Defaults to capturedSol on first dock. */
  lastChargedSol?: number
```

- [ ] **Step 2: Extend ArchivedVent**

In `src/types/ventArchive.ts`, add two optional fields after `z`:

```typescript
  z: number
  /** kg of gas accumulated since deploy. Undefined until first dock. */
  storedKg?: number
  /** Sol at which storedKg was last calculated. Defaults to placedSol on first dock. */
  lastChargedSol?: number
```

- [ ] **Step 3: Add gas inventory items**

In `public/data/inventory-items.json`, add after the `ice` entry (keep gas items together):

```json
{
  "id": "co2-gas",
  "category": "gas",
  "label": "CO₂ Gas",
  "description": "Pressurised carbon dioxide captured from a subsurface CO₂ vent. Stored in the rover's onboard gas compartment.",
  "image": "/inventory/gas-co2.png",
  "weightPerUnit": 0.1,
  "maxStack": 100
},
{
  "id": "methane-gas",
  "category": "gas",
  "label": "Methane Gas",
  "description": "Pressurised methane captured from a subsurface vent. Possible biogenic origin — handle with care.",
  "image": "/inventory/gas-methane.png",
  "weightPerUnit": 0.1,
  "maxStack": 100
}
```

- [ ] **Step 4: Run existing tests to verify no breakage**

```bash
npm run test
```

Expected: all tests pass (type additions are backwards-compatible; JSON additions don't break existing hardcoded lists).

- [ ] **Step 5: Commit**

```bash
git add src/types/danArchive.ts src/types/ventArchive.ts public/data/inventory-items.json
git commit -m "feat(dan): extend archives with storedKg/lastChargedSol; add co2-gas and methane-gas items"
```

---

### Task 4: Archive Query + Update Functions

**Files:**
- Modify: `src/composables/useDanArchive.ts`
- Modify: `src/composables/useVentArchive.ts`

- [ ] **Step 1: Add import to useDanArchive.ts**

At the top of `src/composables/useDanArchive.ts`, add:

```typescript
import type { ExtractorDockTarget } from '@/types/extractorDock'
```

- [ ] **Step 2: Add getWaterExtractorsForSite to useDanArchive**

Inside the `useDanArchive` function body, add before the `return` statement:

```typescript
  /**
   * Returns all water-confirmed, drill-placed prospects for the site
   * shaped as ExtractorDockTarget for proximity docking.
   */
  function getWaterExtractorsForSite(siteId: string): ExtractorDockTarget[] {
    return prospects.value
      .filter(
        (p) =>
          p.siteId === siteId &&
          p.waterConfirmed &&
          p.drillSiteX !== undefined &&
          p.drillSiteZ !== undefined,
      )
      .map((p) => ({
        archiveId: p.archiveId,
        archiveType: 'dan' as const,
        fluidType: 'water' as const,
        x: p.drillSiteX!,
        z: p.drillSiteZ!,
        storedKg: p.storedKg ?? 0,
        lastChargedSol: p.lastChargedSol ?? p.capturedSol,
        reservoirQuality: p.reservoirQuality,
      }))
  }
```

- [ ] **Step 3: Add updateExtractorStorage to useDanArchive**

```typescript
  /**
   * Persist updated storedKg and lastChargedSol for a water extractor entry.
   * Called on dock and on each sol change.
   */
  function updateExtractorStorage(
    archiveId: string,
    storedKg: number,
    lastChargedSol: number,
  ): void {
    const next = prospects.value.map((p) =>
      p.archiveId === archiveId ? { ...p, storedKg, lastChargedSol } : p,
    )
    prospects.value = next
    saveToStorage(next)
  }
```

- [ ] **Step 4: Expose both functions in useDanArchive return**

Add `getWaterExtractorsForSite` and `updateExtractorStorage` to the return object of `useDanArchive`.

- [ ] **Step 5: Add import to useVentArchive.ts**

```typescript
import type { ExtractorDockTarget } from '@/types/extractorDock'
```

- [ ] **Step 6: Add getExtractorTargetsForSite to useVentArchive**

```typescript
  /**
   * Returns all vents for the site shaped as ExtractorDockTarget.
   * Vents do not carry DAN quality data so reservoirQuality defaults to 0.5.
   */
  function getExtractorTargetsForSite(siteId: string): ExtractorDockTarget[] {
    return vents.value
      .filter((v) => v.siteId === siteId)
      .map((v) => ({
        archiveId: v.archiveId,
        archiveType: 'vent' as const,
        fluidType: v.ventType as 'co2' | 'methane',
        x: v.x,
        z: v.z,
        storedKg: v.storedKg ?? 0,
        lastChargedSol: v.lastChargedSol ?? v.placedSol,
        reservoirQuality: 0.5,
      }))
  }
```

- [ ] **Step 7: Add updateExtractorStorage to useVentArchive**

```typescript
  function updateExtractorStorage(
    archiveId: string,
    storedKg: number,
    lastChargedSol: number,
  ): void {
    const next = vents.value.map((v) =>
      v.archiveId === archiveId ? { ...v, storedKg, lastChargedSol } : v,
    )
    vents.value = next
    persist(next)
  }
```

(Note: confirm the localStorage persist function name in `useVentArchive.ts` before adding — it may be `saveToStorage` or `persist`.)

- [ ] **Step 8: Expose both functions in useVentArchive return**

Add `getExtractorTargetsForSite` and `updateExtractorStorage` to the return object.

- [ ] **Step 9: Run tests**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/composables/useDanArchive.ts src/composables/useVentArchive.ts
git commit -m "feat(dan): add extractor query/update functions to DAN and vent archives"
```

---

### Task 5: New ProfileModifiers

**Files:**
- Modify: `src/composables/usePlayerProfile.ts`
- Modify: `src/components/ProfilePanel.vue`

- [ ] **Step 1: Add modifier keys to ProfileModifiers interface**

In `src/composables/usePlayerProfile.ts`, find `ProfileModifiers` and add three new keys:

```typescript
  danChargeRate: number      // multiplier on kg/sol accumulation rate
  danPowerCost: number       // multiplier on 5W base extraction cost
  danStorageCapacity: number // multiplier on 1 kg base storage cap
```

- [ ] **Step 2: Add defaults in resolveModifiers**

In `usePlayerProfile.ts`, find the `DEFAULT_MODIFIERS` object (or wherever zero-offset defaults are defined) and add:

```typescript
  danChargeRate: 0,
  danPowerCost: 0,
  danStorageCapacity: 0,
```

(These are offsets; 0 = no change → final multiplier = 1.0)

- [ ] **Step 3: Add labels to ProfilePanel**

In `src/components/ProfilePanel.vue`, find `MOD_LABELS` and add:

```typescript
  danChargeRate: 'DAN CHARGE RATE',
  danPowerCost: 'DAN PWR COST',
  danStorageCapacity: 'DAN STORAGE',
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```

Expected: all pass (TypeScript will catch any missing keys in existing archetype/patron/foundation definitions).

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePlayerProfile.ts src/components/ProfilePanel.vue
git commit -m "feat(dan): add danChargeRate, danPowerCost, danStorageCapacity profile modifiers"
```

---

### Task 6: RTGController.deductPower

**Files:**
- Modify: `src/three/instruments/RTGController.ts`

- [ ] **Step 1: Add deductPower method**

In `src/three/instruments/RTGController.ts`, add after the existing `activateConservation` method:

```typescript
  /**
   * Instantly deduct `watts` from currentPowerW (one-time extraction cost).
   * Clamps to zero — does not go negative.
   */
  deductPower(watts: number): void {
    this.currentPowerW = Math.max(0, this.currentPowerW - watts)
  }
```

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/RTGController.ts
git commit -m "feat(rtg): add deductPower(watts) for one-time extraction cost"
```

---

### Task 7: ProfilePanel — EXTERNAL INTERFACES

**Files:**
- Modify: `src/components/ProfilePanel.vue`

- [ ] **Step 1: Add props and emit**

In the `<script setup>` of `src/components/ProfilePanel.vue`, update the defineProps to add `danDockEnabled` and add an emit:

```typescript
defineProps<{
  open: boolean
  danDockEnabled: boolean
}>()

const emit = defineEmits<{ 'update:danDockEnabled': [value: boolean] }>()
```

- [ ] **Step 2: Add EXTERNAL INTERFACES section to template**

In the template, add a new section between `.prof-mods` and `.prof-footer`:

```html
<div class="prof-divider" />

<div class="prof-ext-header">EXTERNAL INTERFACES</div>
<div class="prof-ext-section">
  <div class="prof-ext-row">
    <span class="prof-ext-label">DAN DOCK</span>
    <button
      type="button"
      class="prof-ext-toggle"
      :class="danDockEnabled ? 'prof-ext-toggle--on' : 'prof-ext-toggle--off'"
      @click="emit('update:danDockEnabled', !danDockEnabled)"
    >
      {{ danDockEnabled ? 'ON' : 'OFF' }}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Add styles**

In the `<style scoped>` block, add:

```css
.prof-ext-header {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: rgba(196, 117, 58, 0.4);
  padding: 4px 4px 2px;
}

.prof-ext-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prof-ext-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 4px;
}

.prof-ext-label {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.5);
  letter-spacing: 0.08em;
}

.prof-ext-toggle {
  background: none;
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 10px;
  font-family: var(--font-ui);
  letter-spacing: 0.1em;
  cursor: pointer;
}

.prof-ext-toggle--on {
  color: #5dc9a5;
  border-color: rgba(93, 201, 165, 0.5);
}

.prof-ext-toggle--off {
  color: rgba(196, 117, 58, 0.4);
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```

Expected: all pass (ProfilePanel has no unit tests; TypeScript enforces the new prop).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProfilePanel.vue
git commit -m "feat(profile): add EXTERNAL INTERFACES section with DAN DOCK toggle"
```

---

### Task 8: DANExtractorDialog.vue

**Files:**
- Create: `src/components/DANExtractorDialog.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- src/components/DANExtractorDialog.vue -->
<template>
  <Teleport to="body">
    <Transition name="ext-slide">
      <div v-if="visible" class="ext-dialog">
        <div class="ext-header">
          <span class="ext-icon">&#x25C6;</span>
          <span class="ext-title">DAN EXTRACTOR — {{ fluidLabel }}</span>
        </div>

        <div class="ext-body">
          <div class="ext-stat">
            <div class="ext-stat-label">STORED</div>
            <div class="ext-stat-bar-track">
              <div class="ext-stat-bar-fill" :style="{ width: storagePct + '%' }" />
            </div>
            <div class="ext-stat-value">{{ storedKg.toFixed(2) }} / {{ maxStorageKg.toFixed(1) }} kg</div>
          </div>

          <div class="ext-stat">
            <div class="ext-stat-label">CHARGE RATE</div>
            <div class="ext-stat-bar-track">
              <div class="ext-stat-bar-fill ext-stat-bar-fill--rate" :style="{ width: chargeRatePct + '%' }" />
            </div>
            <div class="ext-stat-value">{{ chargeRateKgPerSol.toFixed(2) }} kg/sol</div>
          </div>
        </div>

        <div class="ext-footer">
          <button
            type="button"
            class="ext-btn ext-btn--extract"
            :disabled="storedKg <= 0"
            @click="emitExtract"
          >
            EXTRACT (up to 1 kg)
            <span class="ext-power-cost">{{ extractPowerW.toFixed(1) }}W</span>
          </button>
          <button type="button" class="ext-btn ext-btn--undock" @click="emitUndock">UNDOCK</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ExtractorFluidType } from '@/types/extractorDock'
import { useUiSound } from '@/composables/useUiSound'

const props = defineProps<{
  visible: boolean
  fluidType: ExtractorFluidType
  storedKg: number
  maxStorageKg: number
  chargeRateKgPerSol: number
  extractPowerW: number
}>()

const emit = defineEmits<{ extract: []; undock: [] }>()

const { playUiCue } = useUiSound()

function emitExtract(): void {
  playUiCue('ui.confirm')
  emit('extract')
}

function emitUndock(): void {
  playUiCue('ui.confirm')
  emit('undock')
}

const FLUID_LABELS: Record<ExtractorFluidType, string> = {
  water: 'WATER ICE',
  co2: 'CO₂ GAS',
  methane: 'METHANE GAS',
}

const fluidLabel = computed(() => FLUID_LABELS[props.fluidType])

const storagePct = computed(() =>
  props.maxStorageKg > 0 ? Math.round((props.storedKg / props.maxStorageKg) * 100) : 0,
)

// chargeRate at quality 1.0 = 1.0 kg/sol; use that as 100% bar
const chargeRatePct = computed(() => Math.min(100, Math.round(props.chargeRateKgPerSol * 100)))
</script>

<style scoped>
.ext-dialog {
  position: fixed;
  top: 50%;
  right: 320px;
  transform: translateY(-50%);
  width: 420px;
  background: rgba(5, 10, 25, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(93, 201, 165, 0.3);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 50;
  font-family: var(--font-ui);
  overflow: hidden;
}

.ext-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(93, 201, 165, 0.15);
}

.ext-icon { font-size: 12px; color: #5dc9a5; }
.ext-title { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: rgba(93, 201, 165, 0.9); }

.ext-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ext-stat { display: flex; flex-direction: column; gap: 4px; }
.ext-stat-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; color: rgba(93, 201, 165, 0.5); }
.ext-stat-value { font-size: 12px; color: rgba(200, 220, 240, 0.9); }
.ext-stat-bar-track { height: 4px; background: rgba(93, 201, 165, 0.1); border-radius: 2px; overflow: hidden; }
.ext-stat-bar-fill { height: 100%; background: #5dc9a5; border-radius: 2px; transition: width 0.3s ease; }
.ext-stat-bar-fill--rate { background: #44aaff; }

.ext-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(93, 201, 165, 0.1);
}

.ext-btn {
  background: none;
  border: 1px solid rgba(93, 201, 165, 0.3);
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 10px;
  font-family: var(--font-ui);
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.ext-btn--extract {
  color: #5dc9a5;
  border-color: rgba(93, 201, 165, 0.5);
  display: flex;
  align-items: center;
  gap: 8px;
}

.ext-btn--extract:hover:not(:disabled) { background: rgba(93, 201, 165, 0.1); border-color: #5dc9a5; }
.ext-btn--extract:disabled { opacity: 0.35; cursor: not-allowed; }

.ext-power-cost { font-size: 9px; color: rgba(255, 180, 60, 0.7); }

.ext-btn--undock { color: rgba(255, 255, 255, 0.35); margin-left: auto; }
.ext-btn--undock:hover { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.3); }

.ext-slide-enter-active, .ext-slide-leave-active { transition: all 0.25s ease; }
.ext-slide-enter-from { opacity: 0; transform: translateY(-50%) translateX(20px); }
.ext-slide-leave-to { opacity: 0; transform: translateY(-50%) translateX(20px); }
</style>
```

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: all pass (Vue components are not unit-tested in this project at that level).

- [ ] **Step 3: Commit**

```bash
git add src/components/DANExtractorDialog.vue
git commit -m "feat(dan): add DANExtractorDialog component"
```

---

### Task 9: DanTickHandler — Interface Updates

**Files:**
- Modify: `src/views/site-controllers/DanTickHandler.ts`
- Modify: `src/views/site-controllers/__tests__/instrumentActionSounds.test.ts`

- [ ] **Step 1: Add new imports to DanTickHandler.ts**

At the top of `src/views/site-controllers/DanTickHandler.ts`, add:

```typescript
import { calcExtractorCharge } from '@/lib/neutron/danExtractorCharge'
import type { ExtractorDockTarget, ExtractorDockState } from '@/types/extractorDock'
```

- [ ] **Step 2: Add danDockEnabled and pendingExtractorDock to DanTickRefs**

In the `DanTickRefs` interface, add after `pendingWaterDeploy`:

```typescript
  danDockEnabled: Ref<boolean>
  pendingExtractorDock: Ref<ExtractorDockState | null>
```

- [ ] **Step 3: Add new callbacks to DanTickCallbacks**

In the `DanTickCallbacks` interface, add after `updateDanProspectDrillSite`:

```typescript
  /** Returns all deployed extractors (water + gas) for this site, shaped for proximity checks. */
  getAllExtractorsForSite: (siteId: string) => ExtractorDockTarget[]
  /** Persists updated storedKg/lastChargedSol to the appropriate archive. */
  updateExtractorStorage: (
    archiveId: string,
    archiveType: 'dan' | 'vent',
    storedKg: number,
    lastChargedSol: number,
  ) => void
  /** Deducts watts from RTG currentPowerW (one-time flat cost). */
  deductRTGPower: (watts: number) => void
  /** Adds the extracted fluid item to rover inventory. */
  addInventoryItem: (itemId: string, quantity: number) => void
  /** Plays magnetic docking sound effect. */
  playDockSound: () => void
  /** Sets the DAN Dock toggle in ProfilePanel (called on undock to prevent re-dock). */
  setDanDockEnabled: (enabled: boolean) => void
  /** Returns current mission sol for charge accumulation. */
  getCurrentSol: () => number
```

- [ ] **Step 4: Add new methods to DanTickHandler interface**

In the `DanTickHandler` interface, add:

```typescript
  /** Extract fluid from currently docked extractor into inventory. */
  extractFromDock(): void
  /** Release rover from docked extractor and disable DAN Dock toggle. */
  undockExtractor(fctx: SiteFrameContext): void
  /** Called by MartianSiteView on each new sol to accumulate charge and persist. */
  onNewSol(sol: number): void
```

- [ ] **Step 5: Add callback stubs to instrumentActionSounds.test.ts**

Find the two DAN callback objects in `src/views/site-controllers/__tests__/instrumentActionSounds.test.ts` (both contain `consumeDanExtractor: () => false`). In each one, add after `updateDanProspectDrillSite: () => {}`:

```typescript
        getAllExtractorsForSite: () => [],
        updateExtractorStorage: () => {},
        deductRTGPower: () => {},
        addInventoryItem: () => {},
        playDockSound: () => {},
        setDanDockEnabled: () => {},
        getCurrentSol: () => 1,
```

Also add the new refs to both DAN refs objects (after `pendingWaterDeploy: ref(null)`):

```typescript
        danDockEnabled: ref(false),
        pendingExtractorDock: ref(null),
```

- [ ] **Step 6: Run tests**

```bash
npm run test
```

Expected: all pass. TypeScript will fail if the interface additions break existing callers.

- [ ] **Step 7: Commit**

```bash
git add src/views/site-controllers/DanTickHandler.ts src/views/site-controllers/__tests__/instrumentActionSounds.test.ts
git commit -m "feat(dan): add docking refs, callbacks, and method signatures to DanTickHandler"
```

---

### Task 10: DanTickHandler — Docking Logic

**Files:**
- Modify: `src/views/site-controllers/DanTickHandler.ts`

The DAN_DOCK_RADIUS constant and three new methods: proximity check in `tick()`, `extractFromDock`, `undockExtractor`, `onNewSol`.

- [ ] **Step 1: Add the constant**

Near the top of the file (with other constants), add:

```typescript
const DAN_DOCK_RADIUS = 1.0 // metres — must drive over the extractor to dock
```

- [ ] **Step 2: Add FLUID_ITEM_ID map**

```typescript
const FLUID_ITEM_ID: Record<'water' | 'co2' | 'methane', string> = {
  water: 'ice',
  co2: 'co2-gas',
  methane: 'methane-gas',
}
```

- [ ] **Step 3: Add destructuring for new callbacks**

In `createDanTickHandler`, destructure the new callbacks alongside the existing ones:

```typescript
    getAllExtractorsForSite,
    updateExtractorStorage,
    deductRTGPower,
    addInventoryItem,
    playDockSound,
    setDanDockEnabled,
    getCurrentSol,
```

- [ ] **Step 4: Add destructuring for new refs**

```typescript
    danDockEnabled,
    pendingExtractorDock,
```

- [ ] **Step 5: Add proximity check at the end of the tick function**

At the end of `tick(fctx)`, add a docking proximity check. Place it after all existing instrument logic:

```typescript
    // ── DAN dock proximity ──────────────────────────────────────────────
    if (danDockEnabled.value && pendingExtractorDock.value === null) {
      const targets = getAllExtractorsForSite(siteId)
      let nearest: ExtractorDockTarget | null = null
      let nearestDist = Infinity
      for (const t of targets) {
        const dx = roverWorldX.value - t.x
        const dz = roverWorldZ.value - t.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < nearestDist) {
          nearestDist = dist
          nearest = t
        }
      }
      if (nearest !== null && nearestDist <= DAN_DOCK_RADIUS) {
        _initiateDock(nearest, fctx)
      }
    }
```

- [ ] **Step 6: Implement _initiateDock (private helper)**

Add this private function inside `createDanTickHandler` (before the `return` statement):

```typescript
  function _initiateDock(target: ExtractorDockTarget, fctx: SiteFrameContext): void {
    const currentSol = getCurrentSol()
    // Accumulate charge since last update
    const charged = calcExtractorCharge({
      storedKg: target.storedKg,
      lastChargedSol: target.lastChargedSol,
      currentSol,
      reservoirQuality: target.reservoirQuality,
      danChargeRateMod: playerMod('danChargeRate'),
      danStorageCapMod: playerMod('danStorageCapacity'),
    })
    // Persist updated values
    updateExtractorStorage(target.archiveId, target.archiveType, charged.storedKg, charged.lastChargedSol)

    // Snap rover to extractor center and lock movement
    const rover = fctx.siteScene?.rover
    if (rover) {
      rover.position.x = target.x
      rover.position.z = target.z
    }
    fctx.controls?.lockMovement?.()

    playDockSound()

    pendingExtractorDock.value = {
      archiveId: target.archiveId,
      archiveType: target.archiveType,
      fluidType: target.fluidType,
      storedKg: charged.storedKg,
      maxStorageKg: 1.0 * playerMod('danStorageCapacity'),
      chargeRateKgPerSol: target.reservoirQuality * playerMod('danChargeRate'),
      extractPowerW: 5.0 * playerMod('danPowerCost'),
    }
  }
```

Note: `lockMovement` is the mechanism used to immobilise the rover. Verify the exact API against the new instruments system — it may be `fctx.controls?.disableMovement()` or similar. Adjust accordingly.

- [ ] **Step 7: Implement extractFromDock**

```typescript
  function extractFromDock(): void {
    const dock = pendingExtractorDock.value
    if (!dock || dock.storedKg <= 0) return

    const itemId = FLUID_ITEM_ID[dock.fluidType]
    const weightPerUnit = 0.1  // kg — matches ice, co2-gas, methane-gas in inventory-items.json
    const transferKg = Math.min(dock.storedKg, 1.0)
    const units = Math.round(transferKg / weightPerUnit)

    addInventoryItem(itemId, units)
    deductRTGPower(dock.extractPowerW)

    const newStoredKg = dock.storedKg - transferKg
    pendingExtractorDock.value = { ...dock, storedKg: newStoredKg }
    updateExtractorStorage(dock.archiveId, dock.archiveType, newStoredKg, getCurrentSol())
  }
```

- [ ] **Step 8: Implement undockExtractor**

```typescript
  function undockExtractor(fctx: SiteFrameContext): void {
    pendingExtractorDock.value = null
    fctx.controls?.unlockMovement?.()  // verify API name against instruments system
    setDanDockEnabled(false)
  }
```

- [ ] **Step 9: Implement onNewSol**

```typescript
  function onNewSol(sol: number): void {
    const targets = getAllExtractorsForSite(siteId)
    for (const t of targets) {
      const charged = calcExtractorCharge({
        storedKg: t.storedKg,
        lastChargedSol: t.lastChargedSol,
        currentSol: sol,
        reservoirQuality: t.reservoirQuality,
        danChargeRateMod: playerMod('danChargeRate'),
        danStorageCapMod: playerMod('danStorageCapacity'),
      })
      updateExtractorStorage(t.archiveId, t.archiveType, charged.storedKg, charged.lastChargedSol)
    }
  }
```

- [ ] **Step 10: Expose new methods in the returned handler object**

Add to the returned object of `createDanTickHandler`:

```typescript
    extractFromDock,
    undockExtractor,
    onNewSol,
```

- [ ] **Step 11: Run tests**

```bash
npm run test
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/views/site-controllers/DanTickHandler.ts
git commit -m "feat(dan): implement docking proximity, extractFromDock, undockExtractor, onNewSol"
```

---

### Task 11: Wiring — createMarsSiteHudControllers

**Files:**
- Modify: `src/views/site-controllers/createMarsSiteHudControllers.ts`

**Note:** The instruments API was recently reworked. Before this task, verify:
1. Does `DanTickHandler` still live in `DanTickHandler.ts` or has it been renamed/merged into `createDanHudController`?
2. Where is `deductRTGPower` accessible from — via `ctx.instruments.rtg` or via `ctx.getRTGController()`?
3. How does `lockMovement` / `unlockMovement` work — check `fctx.controls` shape.

Adjust the wiring below to match what you find.

- [ ] **Step 1: Add new refs to the refs destructure**

In `createMarsSiteHudControllers`, destructure the new refs from `ctx.refs`:

```typescript
    danDockEnabled,
    pendingExtractorDock,
```

- [ ] **Step 2: Wire new DAN callbacks**

Find where existing DAN callbacks are assembled (the object passed to `createDanTickHandler` or `createDanHudController`). Add:

```typescript
      getAllExtractorsForSite: (sid) => {
        const danTargets = useDanArchive().getWaterExtractorsForSite(sid)
        const ventTargets = useVentArchive().getExtractorTargetsForSite(sid)
        return [...danTargets, ...ventTargets]
      },
      updateExtractorStorage: (archiveId, archiveType, storedKg, lastChargedSol) => {
        if (archiveType === 'dan') {
          useDanArchive().updateExtractorStorage(archiveId, storedKg, lastChargedSol)
        } else {
          useVentArchive().updateExtractorStorage(archiveId, storedKg, lastChargedSol)
        }
      },
      deductRTGPower: (watts) => {
        // Verify access path to RTGController against new instruments API
        ctx.instruments?.rtg?.deductPower(watts)
      },
      addInventoryItem: (itemId, qty) => useInventory().addComponent(itemId, qty),
      playDockSound: () => ctx.playUiCue?.('sfx.danDock'),
      setDanDockEnabled: (v) => { danDockEnabled.value = v },
      getCurrentSol: () => ctx.marsSol?.value ?? 0,
```

- [ ] **Step 3: Run tests**

```bash
npm run test
```

Expected: all pass. Fix any TypeScript errors from wrong import paths.

- [ ] **Step 4: Commit**

```bash
git add src/views/site-controllers/createMarsSiteHudControllers.ts
git commit -m "feat(dan): wire extractor docking callbacks in HUD controllers"
```

---

### Task 12: MartianSiteView Wiring

**Files:**
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Add new refs**

In the `<script setup>` section, near the existing DAN refs (`pendingWaterDeploy`, etc.), add:

```typescript
const danDockEnabled = ref(false)
const pendingExtractorDock = ref<ExtractorDockState | null>(null)
```

Add the import:

```typescript
import type { ExtractorDockState } from '@/types/extractorDock'
```

- [ ] **Step 2: Add refs to the refs object**

Find the refs object passed to `createMarsSiteHudControllers` (or wherever `pendingWaterDeploy` is passed). Add:

```typescript
      danDockEnabled,
      pendingExtractorDock,
```

- [ ] **Step 3: Update ProfilePanel binding**

Find `<ProfilePanel :open="profileOpen" />` and update:

```html
<ProfilePanel
  :open="profileOpen"
  :dan-dock-enabled="danDockEnabled"
  @update:dan-dock-enabled="danDockEnabled = $event"
/>
```

- [ ] **Step 4: Add DANExtractorDialog**

Import the component:

```typescript
import DANExtractorDialog from '@/components/DANExtractorDialog.vue'
```

In the template, add after `<DANDialog .../>`:

```html
<DANExtractorDialog
  :visible="pendingExtractorDock !== null"
  :fluid-type="pendingExtractorDock?.fluidType ?? 'water'"
  :stored-kg="pendingExtractorDock?.storedKg ?? 0"
  :max-storage-kg="pendingExtractorDock?.maxStorageKg ?? 1"
  :charge-rate-kg-per-sol="pendingExtractorDock?.chargeRateKgPerSol ?? 0"
  :extract-power-w="pendingExtractorDock?.extractPowerW ?? 5"
  @extract="siteHandle?.danHandler?.extractFromDock()"
  @undock="siteHandle?.danHandler?.undockExtractor(currentFctx)"
/>
```

Note: verify the exact path to `danHandler.extractFromDock` and `undockExtractor` through `siteHandle`. It depends on how `createMarsSiteHudControllers` exposes the DAN handler. Also `currentFctx` is whatever the current `SiteFrameContext` reference is in the view. Check existing uses of `siteHandle?.danHandler?.` to confirm the path.

- [ ] **Step 5: Hook onNewSol**

Find the `watch(marsSol, ...)` watcher and add a call to `onNewSol`:

```typescript
watch(marsSol, (sol) => {
  const id = route.params.siteId as string
  if (id) setMissionSolForSite(id, sol)
  siteHandle?.danHandler?.onNewSol(sol)  // accumulate extractor charge on each new sol
})
```

- [ ] **Step 6: Run full test suite and dev server**

```bash
npm run test
npm run dev
```

Expected: tests pass. In the browser, verify:
- ProfilePanel shows EXTERNAL INTERFACES with DAN DOCK toggle
- Driving over a deployed water extractor with DAN DOCK ON triggers docking (rover snaps, dialog opens)
- EXTRACT transfers ice to inventory and deducts from stored amount
- UNDOCK releases movement and sets toggle to OFF

- [ ] **Step 7: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(dan): wire DANExtractorDialog and docking refs in MartianSiteView"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| New gas inventory items | Task 3 |
| New ProfileModifiers (danChargeRate, danPowerCost, danStorageCapacity) | Task 5 |
| Archive extensions (storedKg, lastChargedSol) | Task 3 |
| useDanArchive: getWaterExtractorsForSite, updateExtractorStorage | Task 4 |
| useVentArchive: getExtractorTargetsForSite, updateExtractorStorage | Task 4 |
| ExtractorDockTarget / ExtractorDockState types | Task 1 |
| Charge accumulation formula | Task 2 |
| RTGController.deductPower | Task 6 |
| ProfilePanel EXTERNAL INTERFACES + DAN DOCK toggle | Task 7 |
| DANExtractorDialog.vue | Task 8 |
| DanTickHandler: new refs/callbacks/methods | Task 9 |
| Docking proximity check + snap | Task 10 |
| extractFromDock | Task 10 |
| undockExtractor | Task 10 |
| onNewSol per-sol charge accumulation | Task 10 |
| createMarsSiteHudControllers wiring | Task 11 |
| MartianSiteView wiring + sol hook | Task 12 |

All spec requirements accounted for.

**Open items flagged in spec:**
- `deductRTGPower` injection path: Task 11 notes this explicitly — verify against new instruments API
- `lockMovement` / `unlockMovement` API: Task 10 Step 6 notes this — verify against new instruments API
- `playDockSound` SFX key `sfx.danDock`: needs to be registered in the audio manifest before it will play
- Gas item images (`/inventory/gas-co2.png`, `/inventory/gas-methane.png`): need asset creation; items work without them (broken img) but should be added before ship
