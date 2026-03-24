# Instrument Durability & Repair System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instruments degrade over time and use, affecting performance. Players repair with inventory components. Durability stacks as a modifier on top of profile buffs.

**Architecture:** Durability fields and methods live on `InstrumentController` base class (Approach B). A thin Vue composable bridges reactive state for the overlay. Each instrument subclass declares its decay tier, component type, and break threshold. The profile modifier audit (analysisSpeed + instrumentAccuracy wiring) is a prerequisite done first.

**Tech Stack:** Vue 3, Three.js, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-instrument-durability-design.md`

---

## Phase 1: Profile Modifier Audit

Wire `analysisSpeed` and `instrumentAccuracy` to all instruments that are currently hardcoded. This is a prerequisite — durability multiplies these values later.

### Task 1: Wire analysisSpeed to MastCam

**Files:**
- Modify: `src/three/instruments/MastCamController.ts`
- Modify: `src/views/site-controllers/MastCamTickHandler.ts`

- [ ] **Step 1: Add durationMultiplier to MastCamController**

In `src/three/instruments/MastCamController.ts`, add a mutable field:
```ts
durationMultiplier = 1.0
```
Change scan progress (line ~186) from:
```ts
this.scanProgress += delta / SCAN_DURATION
```
to:
```ts
this.scanProgress += delta / (SCAN_DURATION * this.durationMultiplier)
```

- [ ] **Step 2: Set durationMultiplier from analysisSpeed in MastCamTickHandler**

In `src/views/site-controllers/MastCamTickHandler.ts`, the tick handler needs `playerMod` access. Add it to `MastCamTickCallbacks` interface and wire it. In the active-mode branch (where `controller.activeInstrument instanceof MastCamController`), set:
```ts
mc.durationMultiplier = 1 / playerMod('analysisSpeed')
```

- [ ] **Step 3: Pass playerMod to MastCamTickHandler from MarsSiteViewController**

In `src/views/MarsSiteViewController.ts`, the `createMastCamTickHandler` call needs `playerMod` added to its callbacks, sourced from `ctx.callbacks.playerMod` (same pattern as DrillTickHandler).

- [ ] **Step 4: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/three/instruments/MastCamController.ts src/views/site-controllers/MastCamTickHandler.ts src/views/MarsSiteViewController.ts
git commit -m "feat(mastcam): wire analysisSpeed profile modifier to scan duration"
```

---

### Task 2: Wire analysisSpeed to APXS minigame duration

**Files:**
- Modify: `src/views/site-controllers/APXSTickHandler.ts`

- [ ] **Step 1: Add playerMod to APXSTickHandler**

Add `playerMod` to the `APXSTickCallbacks` interface and destructure it in the handler factory. The APXS duration comes from `APXS_THERMAL_DURATION[thermalZone]` (line ~70). Scale it:
```ts
const baseDuration = APXS_THERMAL_DURATION[thermalZone] ?? 25
const duration = baseDuration / playerMod('analysisSpeed')
```

- [ ] **Step 2: Wire playerMod from MarsSiteViewController**

In `src/views/MarsSiteViewController.ts`, pass `playerMod` to `createAPXSTickHandler` callbacks (same pattern as drill/chemcam).

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/views/site-controllers/APXSTickHandler.ts src/views/MarsSiteViewController.ts
git commit -m "feat(apxs): wire analysisSpeed profile modifier to minigame duration"
```

---

### Task 3: Wire instrumentAccuracy to MastCam scan range

**Files:**
- Modify: `src/three/instruments/MastCamController.ts`
- Modify: `src/views/site-controllers/MastCamTickHandler.ts`

- [ ] **Step 1: Make SURVEY_RANGE dynamic**

In `MastCamController.ts`, change `SURVEY_RANGE = 40` from a module const to a mutable field:
```ts
surveyRange = 5  // base 5m, scaled by instrumentAccuracy
```
Update the two references (raycaster creation line ~203 and distance check line ~344) to use `this.surveyRange` instead of `SURVEY_RANGE`.

- [ ] **Step 2: Set surveyRange from instrumentAccuracy in MastCamTickHandler**

In the tick function, before the active-mode check, always update survey range on the MastCam instance (it applies even while scanning from instrument view):
```ts
if (mcInst instanceof MastCamController) {
  mcInst.surveyRange = 5 * playerMod('instrumentAccuracy')
  mcInst.updateTagMarkers(simulationTime)
}
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/three/instruments/MastCamController.ts src/views/site-controllers/MastCamTickHandler.ts
git commit -m "feat(mastcam): wire instrumentAccuracy to survey range (base 5m)"
```

---

### Task 4: Wire instrumentAccuracy to Drill trace drops

**Files:**
- Modify: `src/three/instruments/DrillController.ts`
- Modify: `src/views/site-controllers/DrillTickHandler.ts`

- [ ] **Step 1: Add accuracyMod field to DrillController**

```ts
accuracyMod = 1.0  // set from playerMod('instrumentAccuracy') each frame
```

- [ ] **Step 2: Use accuracyMod to boost trace drop count**

In `DrillController.collectSample()` (line ~228), where `dropCount` is computed:
```ts
const dropCount = Math.min(identified.length, 1 + Math.floor(Math.random() * 3 * this.accuracyMod))
```
Same pattern for APXS bonus drops (line ~247):
```ts
const dropCount = Math.min(apxsEls.length, 1 + Math.floor(Math.random() * 2 * this.accuracyMod))
```

- [ ] **Step 3: Set accuracyMod in DrillTickHandler**

In the active drill branch:
```ts
drill.accuracyMod = playerMod('instrumentAccuracy')
```

- [ ] **Step 4: Type-check and commit**

```bash
npx vue-tsc --noEmit
git add src/three/instruments/DrillController.ts src/views/site-controllers/DrillTickHandler.ts
git commit -m "feat(drill): wire instrumentAccuracy to trace element drop chance"
```

---

### Task 5: Wire instrumentAccuracy to ChemCam (trace drops + power)

**Files:**
- Modify: `src/three/instruments/ChemCamController.ts`
- Modify: `src/views/site-controllers/ChemCamTickHandler.ts`

- [ ] **Step 1: Add accuracyMod to ChemCamController**

```ts
accuracyMod = 1.0
```

- [ ] **Step 2: Use accuracyMod for power reduction**

In `getInstrumentBusPowerW()` or the phase-based power getter, scale PULSE_TRAIN and INTEGRATING power:
```ts
case 'PULSE_TRAIN': return PULSE_TRAIN_POWER_W / this.accuracyMod
case 'INTEGRATING': return INTEGRATE_POWER_W / this.accuracyMod
```

- [ ] **Step 3: Set accuracyMod in ChemCamTickHandler**

In the active chemcam branch:
```ts
cc.accuracyMod = playerMod('instrumentAccuracy')
```

- [ ] **Step 4: Type-check and commit**

```bash
npx vue-tsc --noEmit
git add src/three/instruments/ChemCamController.ts src/views/site-controllers/ChemCamTickHandler.ts
git commit -m "feat(chemcam): wire instrumentAccuracy to power draw and trace drops"
```

---

### Task 6: Wire instrumentAccuracy to APXS catch zone

**Files:**
- Modify: `src/components/APXSMinigame.vue`

- [ ] **Step 1: Check how catch zone is defined**

Read `src/components/APXSMinigame.vue` to find the catch zone width / element speed. Add a prop `accuracyMod` (default 1.0).

- [ ] **Step 2: Scale catch zone or slow elements by accuracyMod**

Either widen the detector zone or slow element speed by `accuracyMod`. The specific approach depends on the minigame's implementation — read the file first.

- [ ] **Step 3: Pass accuracyMod from MartianSiteView.vue**

Where the APXS minigame component is rendered, pass `:accuracy-mod="playerMod('instrumentAccuracy')"`.

- [ ] **Step 4: Type-check and commit**

```bash
npx vue-tsc --noEmit
git add src/components/APXSMinigame.vue src/views/MartianSiteView.vue
git commit -m "feat(apxs): wire instrumentAccuracy to minigame catch zone"
```

---

### Task 7: Wire instrumentAccuracy to SAM outcomes

**Files:**
- Modify: `src/views/MartianSiteView.vue` (SAM result processing)

- [ ] **Step 1: Find SAM rarity/outcome logic**

Search for where SAM experiment outcomes are determined (rarity assignment). Scale the rare/legendary chance by `playerMod('instrumentAccuracy')`.

- [ ] **Step 2: Apply modifier**

The specific location depends on the SAM result flow. Look for rarity assignment or outcome quality in the SAM processing code in `MartianSiteView.vue` or its associated composables.

- [ ] **Step 3: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(sam): wire instrumentAccuracy to experiment outcome rarity"
```

---

### Task 8: Wire instrumentAccuracy to DAN prospecting

**Files:**
- Modify: `src/views/site-controllers/DanTickHandler.ts` or `src/three/instruments/DANController.ts`

- [ ] **Step 1: Find water probability logic**

Search for where DAN prospect quality / water probability is determined. Scale it by `playerMod('instrumentAccuracy')`.

- [ ] **Step 2: Apply modifier and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(dan): wire instrumentAccuracy to water spot quality"
```

---

### Task 9: Wire instrumentAccuracy to antenna transmission

**Files:**
- Modify: `src/views/site-controllers/AntennaTickHandler.ts`

- [ ] **Step 1: Scale transmission bandwidth by accuracy**

In `tickUHF`, where `currentTxItem.bandwidthSec` is used for progress (line ~159):
```ts
const effectiveBandwidth = currentTxItem.bandwidthSec / playerMod('instrumentAccuracy')
uhfCtrl.transmissionProgress = Math.min(1, currentTxElapsed / effectiveBandwidth)
```
Also use `effectiveBandwidth` for the completion check.

- [ ] **Step 2: Scale antenna power draw by accuracy**

In `AntennaUHFController` and `AntennaLGController`, if they have `selectionIdlePowerW`, add an `accuracyMod` field and scale: `return this.selectionIdlePowerW / this.accuracyMod`.

- [ ] **Step 3: Pass playerMod to AntennaTickHandler**

Wire `playerMod` into the antenna tick handler callbacks from `MarsSiteViewController.ts`.

- [ ] **Step 4: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(antenna): wire instrumentAccuracy to transmission speed and power"
```

---

## Phase 2: Durability Core

### Task 10: Add durability fields and methods to InstrumentController base class

**Files:**
- Modify: `src/three/instruments/InstrumentController.ts`
- Create: `src/three/instruments/__tests__/instrumentDurability.test.ts`

- [ ] **Step 1: Write tests for durability logic**

```ts
import { describe, it, expect } from 'vitest'
// Test: durabilityFactor at 100% = 1.0
// Test: durabilityFactor at breakThreshold (25%) ~= 0.0 (edge)
// Test: durabilityFactor at 62.5% (midpoint for threshold=25) = 0.5
// Test: applyPassiveDecay reduces durabilityPct
// Test: applyPassiveDecay respects breakThreshold floor
// Test: rollUsageDecay with chance=1.0 always decays
// Test: rollUsageDecay with chance=0.0 never decays
// Test: repair() restores to maxDurability and decrements maxDurability by 1
// Test: repair() does nothing below breakThreshold
// Test: applyHazardDamage reduces durability, floors at breakThreshold
// Test: getRepairCost returns correct tiers
// Test: selectionHighlightColor returns correct hex per tier
// Test: operational returns false below breakThreshold
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/three/instruments/__tests__/instrumentDurability.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement durability on InstrumentController**

Add to `InstrumentController` base class:

Fields (with defaults for subclass override):
```ts
durabilityPct = 100
maxDurability = 100
readonly breakThreshold = 25
readonly passiveDecayPerSol = 0.25
readonly usageDecayChance = 0.20
readonly usageDecayAmount = 1.0
readonly repairComponentId = 'engineering-components'
hazardDecayMultiplier = 1.0
```

Methods:
```ts
get durabilityFactor(): number
get operational(): boolean
get selectionHighlightColor(): number  // replaces readonly field
applyPassiveDecay(solDelta: number): void
rollUsageDecay(): void
applyHazardDamage(amount: number): void
getRepairCost(): { weldingWire: number; componentId: string; componentQty: number }
repair(): void
```

Remove the static `INSTRUMENT_SELECTION_GLOW_HEX` export (or keep as default). Change `selectionHighlightColor` from `readonly` field to a getter.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/three/instruments/__tests__/instrumentDurability.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: clean (existing subclasses inherit defaults)

- [ ] **Step 6: Commit**

```bash
git add src/three/instruments/InstrumentController.ts src/three/instruments/__tests__/instrumentDurability.test.ts
git commit -m "feat(durability): add durability fields and methods to InstrumentController base class"
```

---

### Task 11: Configure per-instrument decay values

**Files:**
- Modify: `src/three/instruments/MastCamController.ts`
- Modify: `src/three/instruments/ChemCamController.ts`
- Modify: `src/three/instruments/DrillController.ts`
- Modify: `src/three/instruments/APXSController.ts`
- Modify: `src/three/instruments/SAMController.ts`
- Modify: `src/three/instruments/DANController.ts`
- Modify: `src/three/instruments/REMSController.ts`
- Modify: `src/three/instruments/RADController.ts`
- Modify: `src/three/instruments/RoverWheelsController.ts`
- Modify: `src/three/instruments/HeaterController.ts`
- Modify: `src/three/instruments/RTGController.ts`
- Modify: `src/three/instruments/AntennaLGController.ts`
- Modify: `src/three/instruments/AntennaUHFController.ts`

- [ ] **Step 1: Set overrides on each subclass**

Each subclass overrides the relevant `readonly` fields. Use the tier table from the spec:

**Sensitive (0.40%/sol) — science-components:**
- MastCamController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'engineering-components'`, `usageDecayChance = 0.15`, `usageDecayAmount = 0.8`
- ChemCamController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'science-components'`, `usageDecayChance = 0.25`, `usageDecayAmount = 1.2`
- APXSController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'science-components'`, `usageDecayChance = 0.20`, `usageDecayAmount = 1.0`
- SAMController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'science-components'`, `usageDecayChance = 0.20`, `usageDecayAmount = 1.5`
- DANController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'science-components'`, `usageDecayChance = 0.15`, `usageDecayAmount = 0.8`
- REMSController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'science-components'`, `usageDecayChance = 0.10`, `usageDecayAmount = 0.5`
- RADController: `passiveDecayPerSol = 0.40`, `repairComponentId = 'science-components'`, `usageDecayChance = 0.10`, `usageDecayAmount = 0.5`

**Standard (0.25%/sol):**
- DrillController: `passiveDecayPerSol = 0.25`, `repairComponentId = 'engineering-components'`, `usageDecayChance = 0.25`, `usageDecayAmount = 1.5`
- AntennaLGController: `passiveDecayPerSol = 0.25`, `repairComponentId = 'digital-components'`, `breakThreshold = 5`, `usageDecayChance = 0.10`, `usageDecayAmount = 0.5`
- AntennaUHFController: `passiveDecayPerSol = 0.25`, `repairComponentId = 'digital-components'`, `usageDecayChance = 0.15`, `usageDecayAmount = 0.8`

**Rugged (0.15%/sol) — mechatronics-components:**
- RoverWheelsController: `passiveDecayPerSol = 0.15`, `repairComponentId = 'mechatronics-components'`, `usageDecayChance = 0.15`, `usageDecayAmount = 0.5` — migrate existing `durabilityPct` / `repair()` to use base class (remove local overrides)
- HeaterController: `passiveDecayPerSol = 0.15`, `repairComponentId = 'mechatronics-components'`, `usageDecayChance = 0.10`, `usageDecayAmount = 0.5`
- RTGController: `passiveDecayPerSol = 0.15`, `repairComponentId = 'mechatronics-components'`, `usageDecayChance = 0.15`, `usageDecayAmount = 1.0`

- [ ] **Step 2: Migrate RoverWheelsController durability to base class**

Remove the local `durabilityPct`, `repair()`, `operational`, and `powerEfficiency` fields/methods from `RoverWheelsController`. They now come from the base class. `powerEfficiency` should use `this.durabilityFactor` instead of its local calculation.

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: clean

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: all pass (reward track tests + new durability tests + existing inventory tests)

- [ ] **Step 5: Commit**

```bash
git add src/three/instruments/
git commit -m "feat(durability): configure per-instrument decay tiers and component types"
```

---

### Task 12: Wire passive decay into the frame loop

**Files:**
- Modify: `src/views/MarsSiteViewController.ts`

- [ ] **Step 1: Compute solDelta each frame**

In the render loop (near the sleep/speed control section), compute `solDelta` from `sceneDelta`:
```ts
const solDelta = sceneDelta / secondsPerSol()
```
Import `secondsPerSol` from `@/lib/missionTime`.

- [ ] **Step 2: Call applyPassiveDecay on all instruments**

After the core rover update:
```ts
if (controller) {
  for (const inst of controller.instruments) {
    inst.applyPassiveDecay(solDelta)
  }
}
```

- [ ] **Step 3: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(durability): tick passive decay for all instruments each frame"
```

---

### Task 13: Wire usage decay to use events

**Files:**
- Modify: `src/views/site-controllers/MastCamTickHandler.ts` (on scan complete)
- Modify: `src/views/site-controllers/ChemCamTickHandler.ts` (on fire complete)
- Modify: `src/views/site-controllers/DrillTickHandler.ts` (on collection)
- Modify: `src/views/site-controllers/APXSTickHandler.ts` (on analysis launch)
- Modify: `src/views/site-controllers/DanTickHandler.ts` (on prospect)
- Modify: `src/views/site-controllers/AntennaTickHandler.ts` (on transmission complete)

- [ ] **Step 1: Add rollUsageDecay calls**

At each instrument's "use event" completion point, call `instrument.rollUsageDecay()`:

- **MastCam**: after `scanProgress >= 1` (scan complete)
- **ChemCam**: after integration completes (spectrum recorded)
- **Drill**: after `lastCollected` is set (sample collected)
- **APXS**: when `apxsState` transitions to `'launching'`
- **DAN**: after prospect completes
- **Antenna UHF**: after a transmission item completes

- [ ] **Step 2: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(durability): wire usage decay to instrument use events"
```

---

### Task 14: Wire durabilityFactor into instrument performance

**Files:**
- Modify: `src/views/site-controllers/DrillTickHandler.ts`
- Modify: `src/views/site-controllers/ChemCamTickHandler.ts`
- Modify: `src/views/site-controllers/MastCamTickHandler.ts`
- Modify: `src/views/site-controllers/APXSTickHandler.ts`
- Modify: `src/views/site-controllers/AntennaTickHandler.ts`
- Modify: `src/views/MarsSiteViewController.ts` (movement speed)

- [ ] **Step 1: Scale analysis durations by durabilityFactor**

Wherever `durationMultiplier` or analysis time is set, multiply by `1 / inst.durabilityFactor`:

- **Drill**: `drill.drillDurationMultiplier = thermalMult / (playerMod('analysisSpeed') * drill.durabilityFactor)`
- **ChemCam**: `ccInst.durationMultiplier = thermalMult / (playerMod('analysisSpeed') * ccInst.durabilityFactor)`
- **MastCam**: `mc.durationMultiplier = 1 / (playerMod('analysisSpeed') * mc.durabilityFactor)`
- **APXS**: `duration = baseDuration / (playerMod('analysisSpeed') * apxs.durabilityFactor)`

- [ ] **Step 2: Scale accuracy effects by durabilityFactor**

- **MastCam range**: `mcInst.surveyRange = 5 * playerMod('instrumentAccuracy') * mcInst.durabilityFactor`
- **Drill trace drops**: `drill.accuracyMod = playerMod('instrumentAccuracy') * drill.durabilityFactor`
- **ChemCam accuracy+power**: `cc.accuracyMod = playerMod('instrumentAccuracy') * cc.durabilityFactor`
- **Antenna bandwidth**: scale by `/ (playerMod('instrumentAccuracy') * uhfCtrl.durabilityFactor)`

- [ ] **Step 3: Scale movement speed by wheels durabilityFactor**

In `MarsSiteViewController.ts` speed section:
```ts
const wheelsDurability = wheelsCtrl?.durabilityFactor ?? 1.0
controller.config.moveSpeed = 1.5 * nightPenalty * rtgBoost * speedMult * wheelsDurability
controller.config.turnSpeed = 0.75 * nightPenalty * rtgBoost * speedMult * wheelsDurability
```

- [ ] **Step 4: Block activation of broken instruments**

In `RoverController.activateInstrument()` and `enterActiveMode()`, check `instrument.operational`:
```ts
if (!instrument.operational) return  // broken, can't use
```

- [ ] **Step 5: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(durability): wire durabilityFactor into all instrument performance"
```

---

## Phase 3: Composable Bridge & Repair

### Task 15: Create useInstrumentDurability composable

**Files:**
- Create: `src/composables/useInstrumentDurability.ts`

- [ ] **Step 1: Create the composable**

```ts
// Singleton refs for reactive UI binding
// Updated each frame from MarsSiteViewController
// Exposes: durabilityMap (reactive Map<instrumentId, { pct, max, operational, repairCost }>)
// tryRepair(instrumentId): checks inventory via useInventory().consumeItem, calls controller.repair()
// applyHazardToCategory(category, effect): iterates instruments by repairComponentId match
```

The composable holds a `ref<Map<string, DurabilitySnapshot>>` that gets synced each frame. It imports `useInventory` for `consumeItem`.

- [ ] **Step 2: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(durability): create useInstrumentDurability composable bridge"
```

---

### Task 16: Sync durability state to composable each frame

**Files:**
- Modify: `src/views/MarsSiteViewController.ts`
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Import and call composable sync in the frame loop**

After passive decay tick, snapshot all instrument durability into the composable's reactive map.

- [ ] **Step 2: Wire composable into MartianSiteView**

Import `useInstrumentDurability` and pass its `tryRepair` to the repair handler. Replace the wheels-only `handleInstrumentRepair` with a generic one that works for any instrument.

- [ ] **Step 3: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(durability): sync instrument durability to Vue composable each frame"
```

---

### Task 17: Update InstrumentOverlay with durability bar and repair cost

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

- [ ] **Step 1: Add durability props**

Add to the component props:
```ts
durabilityPct?: number
maxDurability?: number
operational?: boolean
repairCostWire?: number
repairCostComponentId?: string
repairCostComponentQty?: number
repairing?: boolean
repairProgress?: number
```

- [ ] **Step 2: Add durability bar to template**

Below the stats row (for all instruments, not just WHLS), add a durability bar:
- Track with fill, color-coded by tier (same colors as glow)
- Label: `DURABILITY XX%` (or `MAX XX%` showing ceiling)
- If `!operational`: show `PERMANENTLY DAMAGED` replacing all controls

- [ ] **Step 3: Update REPAIR button**

Show cost preview inline (welding wire qty + component icon + qty). Disable if insufficient materials. Show progress bar during repair (~2s). Disable during active mode.

- [ ] **Step 4: Pass durability data from MartianSiteView**

Wire the composable's reactive durability data into the `InstrumentOverlay` props based on `activeInstrumentSlot`.

- [ ] **Step 5: Type-check and commit**

```bash
npx vue-tsc --noEmit
git commit -m "feat(durability): add durability bar and repair cost to instrument overlay"
```

---

### Task 18: Update existing tests

**Files:**
- Modify: `src/lib/__tests__/rewardTrack.test.ts` (if affected)
- Modify: `src/composables/__tests__/useInventory.test.ts` (if affected)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Fix any failures caused by base class changes (e.g., RoverWheelsController migration).

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: update tests for durability base class migration"
```

---

### Task 19: Final integration test

- [ ] **Step 1: Type-check entire project**

Run: `npx vue-tsc --noEmit`
Expected: clean

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 3: Manual smoke test checklist**

- Open each instrument — glow color should be cyan (100% durability)
- Drive for several sols — check durability slowly decreases
- Use MastCam scan — verify usage decay triggers sometimes
- Use drill — verify usage decay triggers sometimes
- Open WHLS overlay — verify durability bar appears
- Click REPAIR on any instrument — verify cost shown
- With welding wire in inventory, repair — verify durability restores and max drops 1%
- Verify MastCam scan range is ~5m (not old 40m)
- Verify analysisSpeed buff makes scans faster across all instruments

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "fix: integration test fixes for instrument durability system"
```
