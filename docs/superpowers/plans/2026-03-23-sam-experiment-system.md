# SAM Experiment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the SAM experiment wizard (3-step: instrument select, reagent select, mini-game stub), experiment queue with real-time timers, results dialog with acknowledge flow, and science log + inventory + achievement integration.

**Architecture:** Three composables (`useSamExperiments`, `useSamQueue`, `useSamArchive`) manage data, queue state, and persistence. The SAMDialog shell routes between three step components. MartianSiteView ticks the queue and wires overlay/toolbar integration following ChemCam's exact patterns.

**Tech Stack:** Vue 3, Three.js, TypeScript

**Spec:** [2026-03-23-sam-experiment-system-design.md](../specs/2026-03-23-sam-experiment-system-design.md)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/composables/useSamExperiments.ts` | Load `sam-experiments.json`, provide discovery roll logic, quality multiplier, possible discoveries filter |
| `src/composables/useSamQueue.ts` | Singleton reactive experiment queue (FIFO) + unacknowledged results list |
| `src/composables/useSamArchive.ts` | localStorage persistence for acknowledged SAM discoveries (Science Log) |
| `src/types/samArchive.ts` | `ArchivedSAMDiscovery` interface |
| `src/components/SAMStepInstrument.vue` | Wizard step 1 — mode cards with lock state |
| `src/components/SAMStepReagents.vue` | Wizard step 2 — inventory + expected outcomes |
| `src/components/SAMMiniGameStub.vue` | Wizard step 3 — pass/fail buttons placeholder |
| `src/components/SAMResultDialog.vue` | Discovery reveal + acknowledge/transmit |

### Modified files

| File | Changes |
|------|---------|
| `src/composables/useInventory.ts` | Add `consumeItem(itemId, quantity, weightKg?)` for partial stack removal |
| `src/composables/useSciencePoints.ts` | Add `'sam'` to SPSource, add `awardSAM(discoveryId, sp)` |
| `src/components/SAMDialog.vue` | Rewrite — wizard shell routing 3 step components |
| `src/components/InstrumentOverlay.vue` | SAM progress bar + See Results button for slot 6 |
| `src/components/InstrumentToolbar.vue` | SAM unread badge on slot 6 |
| `src/components/ScienceLogDialog.vue` | SAM accordion section |
| `src/views/MartianSiteView.vue` | Queue tick, power wiring, result flow, achievements |
| `src/three/instruments/SAMController.ts` | Wire `experimentRunning` from queue state |
| `public/data/achievements.json` | SAM achievement entries |

---

## Task 1: useInventory — add consumeItem function

**Files:**
- Modify: `src/composables/useInventory.ts`

The inventory has no way to partially consume items. SAM needs to remove 2g from a 500g rock stack, or 1 unit of ice from a 10-unit stack.

- [ ] **Step 1: Add consumeItem function**

Add after `addComponentsBatch`:

```typescript
/**
 * Consumes quantity units (for components/traces/refined) or weightKg (for rocks) from a stack.
 * Removes the stack entirely when it reaches zero.
 */
function consumeItem(itemId: string, quantity: number, weightKg?: number): { ok: boolean; message?: string } {
  const idx = stacks.value.findIndex(s => s.itemId === itemId)
  if (idx < 0) return { ok: false, message: 'Item not in inventory.' }
  const s = stacks.value[idx]
  const def = INVENTORY_CATALOG[itemId]
  if (!def) return { ok: false, message: 'Unknown item.' }

  const next = [...stacks.value]
  if (def.category === 'rock') {
    // Rocks: consume by weight
    const w = weightKg ?? 0
    if (w <= 0) return { ok: false, message: 'Must specify weight for rock consumption.' }
    if (s.totalWeightKg < w - 1e-9) return { ok: false, message: 'Insufficient sample weight.' }
    const newWeight = Math.round((s.totalWeightKg - w) * 1000) / 1000
    if (newWeight <= 0.001) {
      next.splice(idx, 1)
    } else {
      next[idx] = { ...s, totalWeightKg: newWeight }
    }
  } else {
    // Components/traces/refined: consume by quantity
    if (s.quantity < quantity) return { ok: false, message: 'Insufficient quantity.' }
    const newQty = s.quantity - quantity
    if (newQty <= 0) {
      next.splice(idx, 1)
    } else {
      const unitW = def.weightPerUnit ?? 0
      next[idx] = {
        ...s,
        quantity: newQty,
        totalWeightKg: Math.round(newQty * unitW * 1000) / 1000,
      }
    }
  }
  stacks.value = next
  return { ok: true }
}
```

Add `consumeItem` to the return object.

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/composables/useInventory.ts
git commit -m "feat(sam): add consumeItem to inventory for partial stack removal"
```

---

## Task 2: useSciencePoints — add SAM source

**Files:**
- Modify: `src/composables/useSciencePoints.ts`

- [ ] **Step 1: Add SAM SP award function**

Update `SPSource`:
```typescript
export type SPSource = 'mastcam' | 'chemcam' | 'drill' | 'chemcam-ack' | 'dan' | 'sam'
```

Add after `awardDAN`:
```typescript
const samScored = new Set<string>()

function awardSAM(discoveryId: string, baseSp: number, label: string): SPGain | null {
  if (samScored.has(discoveryId)) return null
  samScored.add(discoveryId)
  const spYieldMult = mod('spYield')
  const amount = Math.round(baseSp * spYieldMult)
  totalSP.value += amount
  sessionSP.value += amount
  const gain: SPGain = { amount, source: 'sam', rockLabel: label, bonus: 1.0 }
  lastGain.value = gain
  return gain
}
```

Add `awardSAM` to the return object.

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/composables/useSciencePoints.ts
git commit -m "feat(sam): add SAM source type and awardSAM function"
```

---

## Task 3: SAM archive type and composable

**Files:**
- Create: `src/types/samArchive.ts`
- Create: `src/composables/useSamArchive.ts`

- [ ] **Step 1: Create archive type**

```typescript
// src/types/samArchive.ts
import type { DiscoveryRarity } from './samExperiments'

export interface ArchivedSAMDiscovery {
  archiveId: string
  discoveryId: string
  discoveryName: string
  rarity: DiscoveryRarity
  modeId: string
  modeName: string
  sampleId: string
  sampleLabel: string
  quality: number
  spEarned: number
  sideProducts: { itemId: string; quantity: number }[]
  capturedSol: number
  capturedAtMs: number
  siteId: string
  latitudeDeg: number
  longitudeDeg: number
  description: string
  transmitted: boolean
}
```

- [ ] **Step 2: Create archive composable**

Follow the exact pattern from `src/composables/useDanArchive.ts`: localStorage key `'mars-sam-archive-v1'`, load/save/migrate, `archiveDiscovery(params)`, `markTransmitted(id)`. Use `approximateLatLonFromTangentOffset` for coordinates.

- [ ] **Step 3: Verify compilation and commit**

```bash
git add src/types/samArchive.ts src/composables/useSamArchive.ts
git commit -m "feat(sam): add SAM archive type and composable for Science Log"
```

---

## Task 4: useSamExperiments composable

**Files:**
- Create: `src/composables/useSamExperiments.ts`

Loads `sam-experiments.json` and provides discovery logic.

- [ ] **Step 1: Create the composable**

```typescript
import { ref, computed } from 'vue'
import type { SAMExperimentsFile, SAMAnalysisMode, SAMDiscovery, DiscoveryRarity } from '@/types/samExperiments'

const data = ref<SAMExperimentsFile | null>(null)
let loaded = false

async function ensureLoaded(): Promise<SAMExperimentsFile> {
  if (data.value) return data.value
  if (!loaded) {
    loaded = true
    const res = await fetch('/data/sam-experiments.json')
    data.value = await res.json()
  }
  return data.value!
}

export function useSamExperiments() {
  const modes = computed(() => data.value?.modes ?? [])
  const discoveries = computed(() => data.value?.discoveries ?? [])

  function unlockedModes(totalSP: number): SAMAnalysisMode[] {
    return modes.value.filter(m => totalSP >= m.unlockSP)
  }

  function possibleDiscoveries(modeId: string, sampleId: string): SAMDiscovery[] {
    return discoveries.value.filter(d =>
      d.mode === modeId && d.rockTypes.includes(sampleId),
    )
  }

  function qualityMultiplier(quality: number): number {
    const table = data.value?.qualityBonuses ?? {}
    const thresholds = Object.keys(table).map(Number).sort((a, b) => b - a)
    for (const t of thresholds) {
      if (quality >= t) return table[String(t)]
    }
    return 0.5
  }

  function multiModeMultiplier(modesCompleted: number): number {
    const table = data.value?.multiModeBonus ?? {}
    return table[String(modesCompleted)] ?? 1.0
  }

  function rollDiscovery(modeId: string, sampleId: string, quality: number): {
    discovery: SAMDiscovery
    spReward: number
    sideProducts: { itemId: string; quantity: number }[]
  } | null {
    const yieldTable = data.value?.yieldTable
    if (!yieldTable) return null
    const weights = yieldTable[sampleId]?.[modeId]
    if (!weights) return null

    // Roll rarity
    const roll = Math.random() * 100
    let rarity: DiscoveryRarity = 'common'
    let cumulative = 0
    for (const r of ['legendary', 'rare', 'uncommon', 'common'] as DiscoveryRarity[]) {
      cumulative += weights[r]
      if (roll < cumulative) { rarity = r; break }
    }

    // Quality can upgrade rarity by one tier (95%+ = 15% chance)
    if (quality >= 95 && Math.random() < 0.15) {
      const upgrade: Record<string, DiscoveryRarity> = { common: 'uncommon', uncommon: 'rare', rare: 'legendary' }
      rarity = upgrade[rarity] ?? rarity
    }

    // Find matching discoveries
    const candidates = discoveries.value.filter(d =>
      d.mode === modeId && d.rockTypes.includes(sampleId) && d.rarity === rarity,
    )
    if (candidates.length === 0) {
      // Fallback to any discovery of this rarity for this mode
      const fallback = discoveries.value.filter(d => d.mode === modeId && d.rarity === rarity)
      if (fallback.length === 0) return null
      const pick = fallback[Math.floor(Math.random() * fallback.length)]
      return { discovery: pick, spReward: Math.round(pick.sp * qualityMultiplier(quality)), sideProducts: pick.sideProducts }
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    return { discovery: pick, spReward: Math.round(pick.sp * qualityMultiplier(quality)), sideProducts: pick.sideProducts }
  }

  return {
    data,
    modes,
    discoveries,
    ensureLoaded,
    unlockedModes,
    possibleDiscoveries,
    qualityMultiplier,
    multiModeMultiplier,
    rollDiscovery,
  }
}
```

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/composables/useSamExperiments.ts
git commit -m "feat(sam): add useSamExperiments composable — data loading, discovery roll, quality bonuses"
```

---

## Task 5: useSamQueue composable

**Files:**
- Create: `src/composables/useSamQueue.ts`

- [ ] **Step 1: Create the queue composable**

```typescript
import { ref, computed } from 'vue'
import type { DiscoveryRarity } from '@/types/samExperiments'

export interface SamQueueEntry {
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
  powerW: number
}

const queue = ref<SamQueueEntry[]>([])
const results = ref<SamQueueEntry[]>([])

function newId(): string {
  return `sam-q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function useSamQueue() {
  const isProcessing = computed(() => queue.value.length > 0)
  const currentExperiment = computed(() => queue.value[0] ?? null)
  const unacknowledgedCount = computed(() => results.value.length)

  function enqueue(entry: Omit<SamQueueEntry, 'id'>): void {
    queue.value = [...queue.value, { ...entry, id: newId() }]
  }

  function tick(deltaSec: number): SamQueueEntry | null {
    if (queue.value.length === 0) return null
    const next = [...queue.value]
    const current = { ...next[0] }
    current.remainingTimeSec = Math.max(0, current.remainingTimeSec - deltaSec)
    if (current.remainingTimeSec <= 0) {
      next.shift()
      queue.value = next
      results.value = [...results.value, current]
      return current // just completed
    }
    next[0] = current
    queue.value = next
    return null
  }

  function acknowledgeOldest(): SamQueueEntry | null {
    if (results.value.length === 0) return null
    const [oldest, ...rest] = results.value
    results.value = rest
    return oldest
  }

  return {
    queue,
    results,
    isProcessing,
    currentExperiment,
    unacknowledgedCount,
    enqueue,
    tick,
    acknowledgeOldest,
  }
}
```

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/composables/useSamQueue.ts
git commit -m "feat(sam): add useSamQueue composable — FIFO experiment queue with timer"
```

---

## Task 6: SAMStepInstrument component

**Files:**
- Create: `src/components/SAMStepInstrument.vue`

Step 1 of the wizard — three mode cards. Locked modes show SP requirement.

- [ ] **Step 1: Create the component**

Props: `modes: SAMAnalysisMode[]`, `totalSP: number`
Emits: `select(modeId: string)`

Layout: three cards side by side. Each shows icon, name, instrument subtitle, power draw, duration, affinity hints. Locked card is grayed with lock icon and "Requires X SP" overlay. Selected card has amber border highlight. Clicking an unlocked card emits `select`.

Style: follow the project's Mars HUD aesthetic — dark backgrounds, amber/orange accents, `var(--font-ui)`, `var(--font-instrument)` for numbers.

- [ ] **Step 2: Verify compilation and commit**

```bash
git add -f src/components/SAMStepInstrument.vue
git commit -m "feat(sam): create SAMStepInstrument — mode selection cards with lock state"
```

---

## Task 7: SAMStepReagents component

**Files:**
- Create: `src/components/SAMStepReagents.vue`

Step 2 of the wizard — sample selection + expected outcomes.

- [ ] **Step 1: Create the component**

Props: `mode: SAMAnalysisMode`, `stacks: InventoryStack[]`, `possibleDiscoveriesFn: (modeId, sampleId) => SAMDiscovery[]`, `sampleConsumptionKg: number`
Emits: `confirm(sampleId: string)`, `back`

Layout:
- Left panel: inventory list filtered to items with quantity > 0, showing rocks, traces, ice. Each row: label, quantity/weight, affinity tag for this mode (excellent/good/moderate/poor from mode.affinities).
- Right panel: selected sample slot (empty until clicked). Below: "Expected outcomes" showing `possibleDiscoveriesFn(mode.id, selectedSampleId)` grouped by rarity, color-coded.
- Shows ingredient requirements (e.g. "Requires: 1x Ice" if mode has ingredients).
- NEXT button disabled if no sample selected or missing ingredients.
- BACK button to return to step 1.

- [ ] **Step 2: Verify compilation and commit**

```bash
git add -f src/components/SAMStepReagents.vue
git commit -m "feat(sam): create SAMStepReagents — sample selection with expected outcomes"
```

---

## Task 8: SAMMiniGameStub component

**Files:**
- Create: `src/components/SAMMiniGameStub.vue`

Step 3 placeholder — pass/fail buttons.

- [ ] **Step 1: Create the component**

Props: `modeId: string`, `sampleId: string`
Emits: `complete(quality: number)`

Layout: centered panel showing mode name, sample name, and two large buttons:
- Green "ANALYSIS SUCCESSFUL" → emits `complete(85)`
- Red "ANALYSIS FAILED" → emits `complete(30)`

Style: the buttons should be prominent, centered, spaced. Follow the Mars lab aesthetic.

- [ ] **Step 2: Verify compilation and commit**

```bash
git add -f src/components/SAMMiniGameStub.vue
git commit -m "feat(sam): create SAMMiniGameStub — pass/fail placeholder for mini-games"
```

---

## Task 9: SAMResultDialog component

**Files:**
- Create: `src/components/SAMResultDialog.vue`

Discovery reveal dialog with acknowledge flow.

- [ ] **Step 1: Create the component**

Props: `result: SamQueueEntry | null`
Emits: `acknowledge`, `close`

Layout (see spec Section 6):
- Rarity banner at top (color-coded: gray common, green uncommon, gold rare, purple legendary)
- Discovery name large
- Description text
- SP reward + side products (item icons + quantities)
- Quality score + mode + sample + sol metadata
- Two buttons: ACKNOWLEDGE (active, amber) / TRANSMIT (disabled, grayed)

Teleported to body, centered modal with dark backdrop.

- [ ] **Step 2: Verify compilation and commit**

```bash
git add -f src/components/SAMResultDialog.vue
git commit -m "feat(sam): create SAMResultDialog — discovery reveal with acknowledge"
```

---

## Task 10: SAMDialog rewrite — wizard shell

**Files:**
- Modify: `src/components/SAMDialog.vue`

Rewrite as wizard shell routing between step components.

- [ ] **Step 1: Rewrite SAMDialog**

The dialog keeps its 75vw/75vh shell. Internally:
- `currentStep` ref: 1, 2, or 3
- `selectedModeId` ref
- `selectedSampleId` ref

Props: `visible`, `stacks` (inventory), `totalSP`, `sampleConsumptionKg`
Emits: `close`, `enqueue(entry)`

Template routes:
```html
<SAMStepInstrument v-if="currentStep === 1" ... @select="onModeSelect" />
<SAMStepReagents v-else-if="currentStep === 2" ... @confirm="onSampleConfirm" @back="currentStep = 1" />
<component :is="miniGameComponent" v-else-if="currentStep === 3" ... @complete="onMiniGameComplete" />
```

`onMiniGameComplete(quality)`: emits `enqueue` with all the data (mode, sample, quality, rolled discovery), resets wizard to step 1 or closes dialog.

The header shows step indicator (1 · 2 · 3) and footer shows power/status.

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/components/SAMDialog.vue
git commit -m "feat(sam): rewrite SAMDialog as wizard shell with 3 step components"
```

---

## Task 11: InstrumentOverlay — SAM progress bar + See Results

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

Follow ChemCam's exact pattern for slot 6.

- [ ] **Step 1: Add SAM props**

```typescript
samProcessing?: boolean
samProgressPct?: number
samProgressLabel?: string
samUnread?: number
```

Add emit: `samSeeResults: []`

- [ ] **Step 2: Add SAM block in template**

After the ChemCam block (`v-if="activeSlot === 2"`), add for slot 6:

```html
<div v-if="activeSlot === 6" class="ov-sam-block">
  <div v-if="samProcessing" class="ov-cc-sequence">
    <div class="ov-cc-seq-label">{{ samProgressLabel }}</div>
    <div class="ov-cc-seq-track">
      <div class="ov-cc-seq-fill integrate" :style="{ width: samProgressPct + '%' }" />
    </div>
  </div>
  <div v-if="(samUnread ?? 0) > 0" class="ov-chemcam-status">
    <button class="ov-btn-see-results" @click="$emit('samSeeResults')">
      SEE RESULTS <span class="ov-results-badge font-instrument">{{ samUnread }}</span>
    </button>
  </div>
</div>
```

Reuses ChemCam's CSS classes (`.ov-cc-sequence`, `.ov-cc-seq-track`, etc.) — they're generic enough.

- [ ] **Step 3: Verify compilation and commit**

```bash
git add src/components/InstrumentOverlay.vue
git commit -m "feat(sam): add progress bar and See Results button to overlay for slot 6"
```

---

## Task 12: InstrumentToolbar — SAM badge

**Files:**
- Modify: `src/components/InstrumentToolbar.vue`

- [ ] **Step 1: Add prop and badge**

Add prop: `samUnread?: number`

Add badge after the DAN badge line:
```html
<span v-if="inst.slot === 6 && (samUnread ?? 0) > 0" class="badge-dot font-instrument">{{ samUnread }}</span>
```

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/components/InstrumentToolbar.vue
git commit -m "feat(sam): add unread results badge on toolbar slot 6"
```

---

## Task 13: ScienceLogDialog — SAM accordion

**Files:**
- Modify: `src/components/ScienceLogDialog.vue`

Follow the DAN accordion pattern exactly.

- [ ] **Step 1: Add SAM section**

Add prop: `samResults: ArchivedSAMDiscovery[]`
Add state: `samExpanded`, `selectedSamId`, update `detailMode` to include `'sam'`
Add SAM accordion in left nav (amber-themed, after DAN)
Add SAM detail template with: rarity badge, discovery name, description, mode, sample, quality, SP, side products, location, sol

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/components/ScienceLogDialog.vue
git commit -m "feat(sam): add SAM accordion to Science Log dialog"
```

---

## Task 14: Achievements — SAM entries

**Files:**
- Modify: `public/data/achievements.json`

- [ ] **Step 1: Add SAM achievements**

Add `"sam-analysis"` category:
```json
"sam-analysis": [
  { "id": "sam-first-analysis", "event": "first-analysis", "icon": "⚗", "title": "FIRST ANALYSIS", "description": "SAM's first experiment complete. The lab is operational.", "type": "SAM ANALYSIS" },
  { "id": "sam-first-uncommon", "event": "first-uncommon", "icon": "🔬", "title": "NOTABLE FINDING", "description": "An uncommon discovery — the data is getting interesting.", "type": "SAM ANALYSIS" },
  { "id": "sam-first-rare", "event": "first-rare", "icon": "💎", "title": "RARE SPECIMEN", "description": "A rare discovery. Mission Control will want to see this.", "type": "SAM ANALYSIS" },
  { "id": "sam-first-legendary", "event": "first-legendary", "icon": "⭐", "title": "BREAKTHROUGH", "description": "A legendary discovery. This changes everything we know about Mars.", "type": "SAM ANALYSIS" },
  { "id": "sam-triple-mode", "event": "triple-mode", "icon": "🧬", "title": "TRIPLE ANALYSIS", "description": "All three SAM modes run on a single rock type. Maximum scientific yield.", "type": "SAM ANALYSIS" }
]
```

- [ ] **Step 2: Commit**

```bash
git add public/data/achievements.json
git commit -m "feat(sam): add SAM analysis achievements"
```

---

## Task 15: MartianSiteView — full SAM integration

**Files:**
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/three/instruments/SAMController.ts`

This is the orchestration task. Wire up: composable imports, queue ticking, power integration, inventory consumption on enqueue, SP + loot on acknowledge, results dialog, overlay/toolbar props, achievements.

- [ ] **Step 1: Add imports and state**

```typescript
import { useSamExperiments } from '@/composables/useSamExperiments'
import { useSamQueue } from '@/composables/useSamQueue'
import { useSamArchive } from '@/composables/useSamArchive'
import SAMResultDialog from '@/components/SAMResultDialog.vue'
import type { SamQueueEntry } from '@/composables/useSamQueue'
```

Destructure composables:
```typescript
const samExperiments = useSamExperiments()
const { queue: samQueue, results: samResults, isProcessing: samIsProcessing, currentExperiment: samCurrentExperiment, unacknowledgedCount: samUnread, enqueue: samEnqueue, tick: samTick, acknowledgeOldest: samAcknowledgeOldest } = useSamQueue()
const { archiveDiscovery: archiveSamDiscovery, discoveries: samArchivedDiscoveries } = useSamArchive()
```

Add state:
```typescript
const samResultDialogEntry = ref<SamQueueEntry | null>(null)
```

Load experiments data:
```typescript
samExperiments.ensureLoaded()
```

- [ ] **Step 2: Add queue tick in animation loop**

After the DAN block, add:
```typescript
// --- SAM queue tick ---
const samCtl = controller?.instruments.find(i => i.id === 'sam') as SAMController | undefined
if (samCtl) {
  samCtl.experimentRunning = samIsProcessing.value
  const completed = samTick(sceneDelta)
  if (completed) {
    sampleToastRef.value?.showDAN(`SAM: ${completed.modeName} complete`)
  }
}
```

- [ ] **Step 3: Add enqueue handler**

Called when SAMDialog emits `enqueue`:
```typescript
function handleSamEnqueue(entry: Omit<SamQueueEntry, 'id'>): void {
  // Consume sample
  const { consumeItem } = useInventory()
  const sampleConsumptionKg = samExperiments.data.value?.sampleConsumptionKg ?? 0.002
  const def = INVENTORY_CATALOG[entry.sampleId]
  if (def?.category === 'rock') {
    consumeItem(entry.sampleId, 1, sampleConsumptionKg)
  } else {
    consumeItem(entry.sampleId, 1)
  }
  // Consume ingredients (ice for wet chemistry)
  const mode = samExperiments.modes.value.find(m => m.id === entry.modeId)
  if (mode?.ingredients) {
    for (const ing of mode.ingredients) {
      consumeItem(ing.itemId, ing.quantity)
    }
  }
  samEnqueue(entry)
  samDialogVisible.value = false
  triggerSamAchievement('first-analysis')
}
```

- [ ] **Step 4: Add acknowledge handler**

```typescript
function handleSamAcknowledge(): void {
  const entry = samAcknowledgeOldest()
  if (!entry) return

  // Award SP
  const { awardSAM } = useSciencePoints()
  const gain = awardSAM(entry.id, entry.spReward, entry.discoveryName)
  if (gain) sampleToastRef.value?.showSP(gain.amount, 'SAM', gain.bonus)

  // Drop side products into inventory
  const { addComponent } = useInventory()
  for (const sp of entry.sideProducts) {
    addComponent(sp.itemId, sp.quantity)
  }

  // Archive to science log
  archiveSamDiscovery({
    discoveryId: entry.discoveryId,
    discoveryName: entry.discoveryName,
    rarity: entry.discoveryRarity,
    modeId: entry.modeId,
    modeName: entry.modeName,
    sampleId: entry.sampleId,
    sampleLabel: entry.sampleLabel,
    quality: entry.quality,
    spEarned: entry.spReward,
    sideProducts: entry.sideProducts,
    capturedSol: marsSol.value,
    siteId,
    siteLatDeg: siteLat.value,
    siteLonDeg: siteLon.value,
    roverWorldX: roverWorldX.value,
    roverWorldZ: roverWorldZ.value,
    roverSpawnX: roverSpawnXZ.value.x,
    roverSpawnZ: roverSpawnXZ.value.z,
  })

  // Trigger rarity achievements
  if (entry.discoveryRarity === 'uncommon') triggerSamAchievement('first-uncommon')
  if (entry.discoveryRarity === 'rare') triggerSamAchievement('first-rare')
  if (entry.discoveryRarity === 'legendary') triggerSamAchievement('first-legendary')

  // Show next result or close
  if (samUnread.value > 0) {
    samResultDialogEntry.value = samResults.value[0] ?? null
  } else {
    samResultDialogEntry.value = null
  }
}
```

- [ ] **Step 5: Add template bindings**

SAMDialog — pass inventory and experiments data:
```html
<SAMDialog
  :visible="samDialogVisible"
  :stacks="inventoryStacks"
  :total-s-p="totalSP"
  :sample-consumption-kg="samExperiments.data.value?.sampleConsumptionKg ?? 0.002"
  @close="samDialogVisible = false"
  @enqueue="handleSamEnqueue"
/>
```

SAMResultDialog:
```html
<SAMResultDialog
  :result="samResultDialogEntry"
  @acknowledge="handleSamAcknowledge"
  @close="samResultDialogEntry = null"
/>
```

InstrumentOverlay props for SAM:
```html
:sam-processing="samIsProcessing"
:sam-progress-pct="samCurrentExperiment ? ((1 - samCurrentExperiment.remainingTimeSec / samCurrentExperiment.totalTimeSec) * 100) : 0"
:sam-progress-label="samCurrentExperiment ? samCurrentExperiment.modeName + ' — ' + Math.ceil(samCurrentExperiment.remainingTimeSec) + 's' : ''"
:sam-unread="samUnread"
@sam-see-results="samResultDialogEntry = samResults[0] ?? null"
```

InstrumentToolbar:
```html
:sam-unread="samUnread"
```

ScienceLogDialog:
```html
:sam-results="samArchivedDiscoveries"
```

- [ ] **Step 6: Add SAM achievements loading and trigger function**

In the achievements fetch block, add `sam-analysis` alongside the existing categories. Add `triggerSamAchievement(event)` following the same pattern as `triggerDanAchievement`.

- [ ] **Step 7: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -40`

- [ ] **Step 8: Commit**

```bash
git add src/views/MartianSiteView.vue src/three/instruments/SAMController.ts
git commit -m "feat(sam): integrate SAM experiment system — queue tick, power, results, achievements"
```

---

## Task 16: Build verification

- [ ] **Step 1:** `npx vue-tsc --noEmit` — no errors
- [ ] **Step 2:** `npm run build` — build succeeds
- [ ] **Step 3:** `npm run test` — all existing tests pass
- [ ] **Step 4: Final commit if needed**

```bash
git add -A && git commit -m "chore: SAM experiment system build verification"
```
