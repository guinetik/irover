# SAM Experiment System — Design Spec

**Date:** 2026-03-23
**Instrument:** SAM (Sample Analysis at Mars) — Slot 6
**Data model:** [sam-experiments.json](../../../public/data/sam-experiments.json), [samExperiments.ts](../../../src/types/samExperiments.ts)
**GDD reference:** [mars-rovers-sam-gdd-v01.md](../../../inspo/mars-rovers-sam-gdd-v01.md)

---

## Overview

SAM is a nighttime lab. The player feeds it rock samples and trace elements collected during the day, runs analysis through one of three instruments, and produces scientific discoveries worth SP plus refined byproduct materials. The system uses a 3-step wizard UI, an experiment queue with real-time timers, and an async results flow modeled after ChemCam's acknowledge pattern.

Mini-games are stubbed with pass/fail buttons. The contract interface allows real canvas games to be swapped in per-mode later without touching the rest of the system.

---

## 1. User Flow

```text
Press [6] → Camera orbits to SAM intake ports
           → Overlay shows SAM card with ACTIVATE button
                |
           Click ACTIVATE → Covers open (animated ~0.4s)
                           → 75% viewport dialog opens
                |
           STEP 1: Select instrument (Pyrolysis / Wet Chemistry / Isotope)
                |
           STEP 2: Select sample from inventory + review expected outcomes
                |
           STEP 3: Mini-game (stub: pass/fail buttons)
                |
           Mini-game completes → dialog closes
                               → sample consumed from inventory
                               → experiment enters queue with timer
                |
           Queue ticks down via sceneDelta (power drawn while processing)
                |
           Timer hits 0 → toast "SAM analysis complete"
                        → result moves to unacknowledged list
                        → SAM toolbar badge shows count
                |
           Press [6] → "See Results" button in overlay
                     → Results dialog opens
                     → ACKNOWLEDGE → SP + loot + Science Log
```

---

## 2. Component Architecture

### Wizard components (inside SAMDialog)

| Component | Props (in) | Emits (out) | Responsibility |
|-----------|-----------|-------------|----------------|
| `SAMDialog.vue` | `visible`, `inventory`, `totalSP` | `close`, `enqueue` | Shell — header, footer, step routing. Holds `currentStep` ref (1/2/3). Wires data between steps. |
| `SAMStepInstrument.vue` | `modes[]`, `totalSP` | `select(modeId)` | Step 1 — three mode cards with icon, name, description, power, duration, lock state (SP threshold). Locked modes show requirement. Selected mode highlights + shows detail. |
| `SAMStepReagents.vue` | `mode`, `inventory`, `experiments` | `confirm(sampleId)`, `back` | Step 2 — left: inventory filtered to compatible samples (rocks + traces with >0 quantity). Right: selected slot + quantity consumed. Below: expected outcomes panel showing possible discoveries for this mode+sample, color-coded by rarity. Shows ice requirement if wet chemistry. |
| `SAMMiniGameStub.vue` | `modeId`, `sampleId` | `complete(quality)` | Step 3 — placeholder. Shows mode name, two buttons: green COMPLETE (emits quality 85) / red FAIL (emits quality 30). Later replaced per-mode with real canvas games. |

### Results components (separate from wizard)

| Component | Props (in) | Emits (out) | Responsibility |
|-----------|-----------|-------------|----------------|
| `SAMResultDialog.vue` | `result` | `acknowledge`, `close` | Discovery reveal — rarity banner, name, description, SP, side products, quality score. Buttons: ACKNOWLEDGE (active) / TRANSMIT (disabled). |

### Mini-game contract

```typescript
// Props received by any mini-game component
interface SAMMiniGameProps {
  modeId: string      // 'pyrolysis' | 'wet-chemistry' | 'isotope-analysis'
  sampleId: string    // inventory item id being analyzed
}

// Emitted when the mini-game concludes
interface SAMMiniGameEmits {
  complete: [quality: number]  // 0–100
}
```

Any component satisfying this contract can be swapped into the Step 3 slot. The dialog routes to the correct game by `modeId`:

```typescript
const miniGameComponent = computed(() => {
  // Future: switch(modeId) { case 'pyrolysis': return SAMPyrolysis; ... }
  return SAMMiniGameStub  // stub for all modes
})
```

---

## 3. Composables

### `useSamExperiments()`

Loads and parses `sam-experiments.json`. Provides:

```typescript
function useSamExperiments() {
  const data: Ref<SAMExperimentsFile | null>
  const modes: ComputedRef<SAMAnalysisMode[]>
  const discoveries: ComputedRef<SAMDiscovery[]>

  /** Available modes given current SP */
  function unlockedModes(totalSP: number): SAMAnalysisMode[]

  /** Possible discoveries for a mode + sample combo */
  function possibleDiscoveries(modeId: string, sampleId: string): SAMDiscovery[]

  /** Roll a discovery using yield table + quality modifier */
  function rollDiscovery(modeId: string, sampleId: string, quality: number): {
    discovery: SAMDiscovery
    spReward: number       // base SP * quality bonus
    sideProducts: { itemId: string; quantity: number }[]
  }

  /** Get quality bonus multiplier for a given score */
  function qualityMultiplier(quality: number): number
}
```

### `useSamQueue()`

Singleton reactive experiment queue. Manages pending experiments and completed-but-unacknowledged results.

```typescript
interface SamQueueEntry {
  id: string
  modeId: string
  modeName: string
  sampleId: string
  sampleLabel: string
  quality: number
  discoveryId: string
  discoveryName: string
  discoveryRarity: DiscoveryRarity
  discoveryDescription: string
  spReward: number
  sideProducts: { itemId: string; quantity: number }[]
  remainingTimeSec: number
  totalTimeSec: number
  startedAtSol: number
}

function useSamQueue() {
  /** Experiments currently processing (FIFO, one at a time) */
  const queue: Ref<SamQueueEntry[]>

  /** Completed experiments awaiting player acknowledgement */
  const results: Ref<SamQueueEntry[]>

  /** True if any experiment is actively processing */
  const isProcessing: ComputedRef<boolean>

  /** Current experiment being processed (first in queue) */
  const currentExperiment: ComputedRef<SamQueueEntry | null>

  /** Number of unacknowledged results (for toolbar badge) */
  const unacknowledgedCount: ComputedRef<number>

  /** Add a new experiment to the queue */
  function enqueue(entry: Omit<SamQueueEntry, 'id'>): void

  /** Tick the queue timer. Call each frame with sceneDelta. */
  function tick(deltaSec: number): void

  /** Acknowledge the oldest result. Returns it for SP/loot processing. */
  function acknowledgeOldest(): SamQueueEntry | null
}
```

---

## 4. Power Integration

- `SAMController.experimentRunning` is set to `true` when `useSamQueue().isProcessing` is true
- `getInstrumentBusPowerW()` returns the current experiment's mode `powerW` (18-25W) when running, 0 otherwise
- Power is drawn from the bus like any other instrument — competes with heater, DAN, driving
- If sleep mode triggers while experiments are processing: queue **pauses** (timer stops ticking), resumes when rover wakes. No experiment loss.

---

## 5. Overlay Integration

Following ChemCam's exact patterns:

**Progress bar** — when SAM slot is selected and queue is processing:
- Bar in the overlay card (like ChemCam's sequence bar)
- Label: "{MODE NAME} — {remaining}s"
- Fill percentage from `1 - remaining/total`

**See Results button** — when `unacknowledgedCount > 0`:
- Button appears next to ACTIVATE/STANDBY in overlay
- Same styling as ChemCam's "SEE RESULTS" button
- Click opens `SAMResultDialog`

**Toolbar badge** — `unacknowledgedCount` shown on SAM slot (same as ChemCam's badge)

---

## 6. Results Dialog

Opens from "See Results". Shows the **oldest** unacknowledged result.

**Layout:**

```text
┌─────────────────────────────────────────┐
│  ★ UNCOMMON DISCOVERY                   │  ← rarity banner (color-coded)
├─────────────────────────────────────────┤
│                                         │
│  MANGANESE OXIDE                        │  ← discovery name (large)
│                                         │
│  MnO₂ — on Earth, often produced by    │  ← description
│  microbial activity. On Mars... unclear. │
│                                         │
│  ┌─────────┐  ┌────────────────────┐    │
│  │ +50 SP  │  │ 3x Purified Iron   │    │  ← reward + side products
│  └─────────┘  │ 3x trace-Mn        │    │
│               └────────────────────┘    │
│                                         │
│  Quality: 85%    Mode: Wet Chemistry    │  ← metadata
│  Sample: Hematite   Sol 4               │
│                                         │
│  [ ACKNOWLEDGE ]        [ TRANSMIT ]    │  ← buttons (transmit disabled)
└─────────────────────────────────────────┘
```

**ACKNOWLEDGE**:
1. Awards SP (via `useSciencePoints`)
2. Drops side products into inventory (via `useInventory().addComponent`)
3. Archives to Science Log (new `useSamArchive` composable, same pattern as ChemCam/DAN)
4. Removes from unacknowledged list
5. If more results pending: shows next one
6. If no more: closes dialog

**TRANSMIT**: disabled, grayed out, tooltip "Requires antenna downlink" — future feature.

---

## 7. Inventory Consumption

When the mini-game completes and the experiment enqueues:

- **Rock samples**: consume `sampleConsumptionKg` (0.002 kg = 2g) from the selected rock stack
- **Trace elements**: consume 1 unit from the selected trace stack
- **Ice** (wet chemistry only): consume `ingredients[].quantity` (1 unit) from ice stack
- Consumption happens **immediately** when enqueuing (not when results arrive) — the sample is "in the oven"

---

## 8. Science Log Integration

New SAM accordion in `ScienceLogDialog.vue` (third category, after ChemCam and DAN):

- **Archive composable**: `useSamArchive()` — same localStorage pattern as ChemCam/DAN
- **Archive type**: `ArchivedSAMDiscovery` — discoveryId, name, rarity, mode, sampleType, quality, spEarned, sideProducts, sol, lat/lon
- **List items**: "[Rarity] Discovery Name — Sol N"
- **Detail pane**: discovery description, quality, mode used, sample type, SP earned, side products, location

---

## 9. Achievements

Add to `public/data/achievements.json` under `"sam-analysis"`:

| Event | Icon | Title | Description |
|-------|------|-------|-------------|
| `first-analysis` | ⚗ | FIRST ANALYSIS | SAM's first experiment complete. The lab is operational. |
| `first-uncommon` | 🔬 | NOTABLE FINDING | An uncommon discovery — the data is getting interesting. |
| `first-rare` | 💎 | RARE SPECIMEN | A rare discovery. Mission Control will want to see this. |
| `first-legendary` | ⭐ | BREAKTHROUGH | A legendary discovery. This changes everything we know about Mars. |
| `all-modes-one-sample` | 🧬 | TRIPLE ANALYSIS | All three SAM modes run on a single sample. Maximum scientific yield. |

---

## 10. Multi-Mode Bonus

Tracked per sample: when acknowledging a result, check if other modes have been run on the same `sampleId` (rock type). The `multiModeBonus` from the JSON applies:

- 2 modes on same rock type: 1.5x SP on all results from that sample
- 3 modes on same rock type: 3.0x SP

This means the bonus applies retroactively — if you already acknowledged a pyrolysis result and then acknowledge a wet chemistry result on the same rock type, the wet chemistry gets 1.5x. The third mode gets 3.0x applied to its SP.

Implementation: `useSamArchive` tracks `{ sampleType, modesCompleted: Set<string> }` per rock type. When acknowledging, check how many modes have been completed for this rock type and apply the multiplier.

---

## 11. Progression (SP Unlocks)

From `sam-experiments.json`:

| Mode | Unlock SP | Available from |
|------|----------|----------------|
| Pyrolysis | 0 | Start |
| Wet Chemistry | 150 | After ~10-15 ChemCam/drill cycles |
| Isotope Analysis | 500 | Mid-game, after significant science work |

Step 1 shows locked modes with their SP threshold. Once total SP crosses the threshold, the mode card unlocks with a visual flourish.

---

## 12. Files Summary

### New files

| File | Purpose |
|------|---------|
| `src/composables/useSamExperiments.ts` | Load JSON, discovery roll logic, SP calculation |
| `src/composables/useSamQueue.ts` | Experiment queue + unacknowledged results |
| `src/composables/useSamArchive.ts` | localStorage persistence for Science Log |
| `src/types/samArchive.ts` | ArchivedSAMDiscovery interface |
| `src/components/SAMStepInstrument.vue` | Wizard step 1 — mode selection |
| `src/components/SAMStepReagents.vue` | Wizard step 2 — sample selection + outcomes |
| `src/components/SAMMiniGameStub.vue` | Wizard step 3 — pass/fail placeholder |
| `src/components/SAMResultDialog.vue` | Discovery reveal + acknowledge |

### Modified files

| File | Changes |
|------|---------|
| `src/components/SAMDialog.vue` | Rewrite — wizard shell routing 3 step components |
| `src/components/InstrumentOverlay.vue` | SAM progress bar + See Results button |
| `src/components/InstrumentToolbar.vue` | SAM unread badge |
| `src/components/ScienceLogDialog.vue` | SAM accordion section |
| `src/views/MartianSiteView.vue` | Queue tick, power integration, result wiring |
| `src/three/instruments/SAMController.ts` | Wire `experimentRunning` from queue state |
| `public/data/achievements.json` | SAM achievement entries |
