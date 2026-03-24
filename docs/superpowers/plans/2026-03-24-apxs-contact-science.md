# APXS Contact Science — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full APXS contact science: arm touches rock → countdown → photon-catcher minigame → composition result → science log entry + SP award + achievements.

**Source spec:** [`docs/superpowers/specs/2026-03-24-apxs-contact-science-design.md`](../specs/2026-03-24-apxs-contact-science-design.md)

**Architecture:** Rock contact detection reuses `RockTargeting` (refactored for configurable range). APXS controller manages targeting + countdown state. Minigame is a standalone Vue canvas component (ported from `inspo/apxs-minigame-v2.html`). Results flow through an archive composable into the science log. SP awards follow the SAM pattern (custom function, idempotent).

**Tech stack:** Vue 3, TypeScript, Three.js (rock targeting), HTML5 Canvas (minigame), existing `SAMMiniGameTutorial`/`SAMMiniGameResult` components.

---

## Architecture

### Dependency graph (no cycles)

```
public/data/apxs-compositions.json       ← static data (rock type → element weights)
        ↑
src/lib/apxsComposition.ts               ← pure math: generateComposition + grading
        ↑
src/components/APXSMinigame.vue           ← canvas game (receives composition, emits result)
src/components/APXSResultChart.vue        ← bar chart for science log
        ↑
src/composables/useAPXSArchive.ts         ← stores results for science log
        ↑
src/views/site-controllers/APXSTickHandler.ts  ← crosshair, countdown, dialog trigger
        ↑
src/views/MartianSiteView.vue             ← wires everything together
```

### File map

| File | Action | Role |
|------|--------|------|
| `public/data/apxs-compositions.json` | Create | Rock type → element relative weights |
| `src/lib/apxsComposition.ts` | Create | `generateComposition()`, `computeAccuracy()`, `gradeFromAccuracy()`. Pure, no Vue. |
| `src/lib/__tests__/apxsComposition.test.ts` | Create | Tests for composition generation, accuracy, grading |
| `src/three/instruments/RockTargeting.ts` | Modify | Add optional `maxRange` param to `castFromDrillHead()` |
| `src/three/instruments/APXSController.ts` | Modify | Add `RockTargeting`, contact detection, `apxsAnalyzed` marking |
| `src/components/APXSMinigame.vue` | Create | Photon catcher canvas game |
| `src/components/APXSResultChart.vue` | Create | Elemental bar chart for science log entries |
| `src/views/site-controllers/APXSTickHandler.ts` | Create | Tick handler: crosshair, countdown, game launch |
| `src/composables/useSciencePoints.ts` | Modify | Add `'apxs'` to `SPSource`, add `awardAPXS()` |
| `src/components/SciencePointsDialog.vue` | Modify | Add `'apxs'` to `SOURCE_HEADLINE` |
| `src/composables/useAPXSArchive.ts` | Create | Archive composable (localStorage-backed) |
| `src/components/ScienceLogDialog.vue` | Modify | Add APXS accordion section |
| `public/data/achievements.json` | Modify | Add `apxs-analysis` category (4 achievements) |
| `src/views/MarsSiteViewController.ts` | Modify | Register APXSTickHandler |
| `src/views/MartianSiteView.vue` | Modify | Wire dialog, SP, achievements, archive |

---

## Tasks

### Task 1: Composition data + pure math + tests

**Files:**

- Create: `public/data/apxs-compositions.json`
- Create: `src/lib/apxsComposition.ts`
- Create: `src/lib/__tests__/apxsComposition.test.ts`

- [ ] **Step 1:** Create `public/data/apxs-compositions.json` with the 6 rock type profiles:

```json
{
  "basalt":          { "Fe": 18, "Si": 24, "Ca": 8, "S": 2, "Mg": 6, "Al": 9, "Na": 3, "Mn": 0.3, "P": 0.2, "Ni": 0.05 },
  "hematite":        { "Fe": 42, "Si": 10, "Ca": 3, "S": 1, "Mg": 2, "Al": 5, "Na": 1, "Mn": 1.5, "P": 0.1, "Ni": 0.08 },
  "mudstone":        { "Fe": 14, "Si": 20, "Ca": 6, "S": 5, "Mg": 4, "Al": 8, "Na": 2, "Mn": 0.4, "P": 0.8, "Ni": 0.03 },
  "sulfate":         { "Fe": 8, "Si": 12, "Ca": 14, "S": 18, "Mg": 5, "Al": 4, "Na": 4, "Mn": 0.2, "P": 0.15, "Ni": 0.02 },
  "olivine":         { "Fe": 12, "Si": 18, "Ca": 2, "S": 1, "Mg": 28, "Al": 2, "Na": 1, "Mn": 0.3, "P": 0.1, "Ni": 0.4 },
  "iron-meteorite":  { "Fe": 52, "Si": 2, "Ca": 1, "S": 1, "Mg": 1, "Al": 1, "Na": 0.5, "Mn": 0.2, "P": 0.3, "Ni": 8 }
}
```

- [ ] **Step 2:** Create `src/lib/apxsComposition.ts` with:

```typescript
import type { RockTypeId } from '@/three/terrain/RockTypes'

export const APXS_ELEMENTS = ['Fe', 'Si', 'Ca', 'S', 'Mg', 'Al', 'Na', 'Mn', 'P', 'Ni'] as const
export type APXSElementId = typeof APXS_ELEMENTS[number]

export const ELEMENT_COLORS: Record<APXSElementId, string> = {
  Fe: '#ff7733', Si: '#6699ff', Ca: '#44dd88', S: '#ffdd33', Mg: '#ff66cc',
  Al: '#99ddff', Na: '#ffaa55', Mn: '#cc55ff', P: '#ff4466', Ni: '#55ffaa',
}

export const ELEMENT_KEV: Record<APXSElementId, number> = {
  Fe: 6.40, Si: 1.74, Ca: 3.69, S: 2.31, Mg: 1.25,
  Al: 1.49, Na: 1.04, Mn: 5.90, P: 2.01, Ni: 7.47,
}

export type APXSComposition = Record<APXSElementId, number>

/**
 * Generate a normalized composition (sums to 100) from base weights with random variance.
 * Deterministic per rock type, variable per call (random).
 */
export function generateComposition(
  baseWeights: Record<string, number>,
): APXSComposition {
  const raw: Partial<Record<APXSElementId, number>> = {}
  let sum = 0
  for (const el of APXS_ELEMENTS) {
    const base = baseWeights[el] ?? 0
    const varied = Math.max(0.001, base * (0.6 + Math.random() * 0.8))
    raw[el] = varied
    sum += varied
  }
  const result = {} as APXSComposition
  for (const el of APXS_ELEMENTS) {
    result[el] = ((raw[el] ?? 0) / sum) * 100
  }
  return result
}

/**
 * Cosine similarity between true and measured compositions, scaled to 0-100.
 */
export function computeAccuracy(
  trueComp: APXSComposition,
  measuredComp: APXSComposition,
): number {
  let dot = 0, magT = 0, magM = 0
  for (const el of APXS_ELEMENTS) {
    const t = trueComp[el], m = measuredComp[el]
    dot += t * m
    magT += t * t
    magM += m * m
  }
  if (!magT || !magM) return 0
  return (dot / (Math.sqrt(magT) * Math.sqrt(magM))) * 100
}

export type APXSGrade = 'S' | 'A' | 'B' | 'C' | 'D'

const GRADE_TABLE: { min: number; grade: APXSGrade; baseSp: number }[] = [
  { min: 97, grade: 'S', baseSp: 10 },
  { min: 92, grade: 'A', baseSp: 8 },
  { min: 82, grade: 'B', baseSp: 6 },
  { min: 65, grade: 'C', baseSp: 4 },
  { min: 0,  grade: 'D', baseSp: 2 },
]

export function gradeFromAccuracy(accuracy: number): { grade: APXSGrade; baseSp: number } {
  for (const row of GRADE_TABLE) {
    if (accuracy >= row.min) return { grade: row.grade, baseSp: row.baseSp }
  }
  return { grade: 'D', baseSp: 2 }
}

/**
 * Compute final SP: base from grade + anomaly bonus (only for B/C/D), capped at 10.
 */
export function computeAPXSSp(
  accuracy: number,
  trueComp: APXSComposition,
  caughtElements: Set<APXSElementId>,
): { grade: APXSGrade; sp: number; anomalies: APXSElementId[] } {
  const { grade, baseSp } = gradeFromAccuracy(accuracy)
  const anomalies: APXSElementId[] = []
  for (const el of APXS_ELEMENTS) {
    if (trueComp[el] < 2 && caughtElements.has(el)) anomalies.push(el)
  }
  const anomalyBonus = (grade === 'S' || grade === 'A') ? 0 : anomalies.length * 2
  const sp = Math.min(10, baseSp + anomalyBonus)
  return { grade, sp, anomalies }
}
```

- [ ] **Step 3:** Write tests in `src/lib/__tests__/apxsComposition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  generateComposition, computeAccuracy, gradeFromAccuracy, computeAPXSSp,
  APXS_ELEMENTS, type APXSComposition,
} from '../apxsComposition'

const BASALT_WEIGHTS = { Fe: 18, Si: 24, Ca: 8, S: 2, Mg: 6, Al: 9, Na: 3, Mn: 0.3, P: 0.2, Ni: 0.05 }

describe('generateComposition', () => {
  it('normalizes to 100%', () => {
    const comp = generateComposition(BASALT_WEIGHTS)
    const sum = APXS_ELEMENTS.reduce((s, el) => s + comp[el], 0)
    expect(sum).toBeCloseTo(100, 1)
  })

  it('all elements are positive', () => {
    const comp = generateComposition(BASALT_WEIGHTS)
    for (const el of APXS_ELEMENTS) {
      expect(comp[el]).toBeGreaterThan(0)
    }
  })
})

describe('computeAccuracy', () => {
  it('returns 100 for identical compositions', () => {
    const comp = generateComposition(BASALT_WEIGHTS)
    expect(computeAccuracy(comp, comp)).toBeCloseTo(100, 1)
  })

  it('returns < 100 for different compositions', () => {
    const a = generateComposition(BASALT_WEIGHTS)
    const b = generateComposition({ Fe: 52, Si: 2, Ca: 1, S: 1, Mg: 1, Al: 1, Na: 0.5, Mn: 0.2, P: 0.3, Ni: 8 })
    expect(computeAccuracy(a, b)).toBeLessThan(95)
  })
})

describe('gradeFromAccuracy', () => {
  it('S grade at 97+', () => expect(gradeFromAccuracy(97).grade).toBe('S'))
  it('A grade at 92-96', () => expect(gradeFromAccuracy(92).grade).toBe('A'))
  it('B grade at 82-91', () => expect(gradeFromAccuracy(82).grade).toBe('B'))
  it('C grade at 65-81', () => expect(gradeFromAccuracy(65).grade).toBe('C'))
  it('D grade below 65', () => expect(gradeFromAccuracy(50).grade).toBe('D'))
})

describe('computeAPXSSp', () => {
  const comp: APXSComposition = { Fe: 30, Si: 25, Ca: 10, S: 15, Mg: 8, Al: 5, Na: 3, Mn: 1.5, P: 1.0, Ni: 1.5 }

  it('S grade gives 10 SP, no anomaly bonus', () => {
    const result = computeAPXSSp(98, comp, new Set(['Mn', 'P', 'Ni']))
    expect(result.grade).toBe('S')
    expect(result.sp).toBe(10)
  })

  it('D grade with 3 anomalies gives 2 + 6 = 8 SP', () => {
    const result = computeAPXSSp(50, comp, new Set(['Mn', 'P', 'Ni']))
    expect(result.grade).toBe('D')
    expect(result.sp).toBe(8)
  })

  it('caps at 10 SP', () => {
    const result = computeAPXSSp(83, comp, new Set(['Mn', 'P', 'Ni']))
    expect(result.grade).toBe('B')
    expect(result.sp).toBe(10) // 6 + 6 = 12, capped to 10
  })
})
```

- [ ] **Step 4:** Run `npm run test -- apxsComposition`.

- [ ] **Step 5:** Commit: `feat(apxs): composition data and grading math`

---

### Task 2: RockTargeting configurable range + APXSController contact detection

**Files:**

- Modify: `src/three/instruments/RockTargeting.ts`
- Modify: `src/three/instruments/APXSController.ts`

- [ ] **Step 1:** In `RockTargeting.ts`, add `maxRange` parameter to `castFromDrillHead`:

Change the method signature from:
```typescript
castFromDrillHead(drillHeadPos: THREE.Vector3): TargetResult | null {
```
To:
```typescript
castFromDrillHead(drillHeadPos: THREE.Vector3, maxRange = DRILL_HEAD_RANGE): TargetResult | null {
```

And replace the two references to `DRILL_HEAD_RANGE` inside the method with `maxRange`:
- Line 74: `let bestDist = maxRange`
- Line 99: `this.raycaster.far = maxRange`

- [ ] **Step 2:** In `APXSController.ts`, add rock targeting and contact state. Add imports and properties:

```typescript
import { RockTargeting, type TargetResult } from './RockTargeting'
```

Add to the class:
```typescript
  private static readonly CONTACT_RANGE = 0.3

  targeting: RockTargeting | null = null
  private currentTarget: TargetResult | null = null
  targetWorldPos = new THREE.Vector3()

  get hasTarget(): boolean { return this.currentTarget !== null }
  get canAnalyzeTarget(): boolean {
    return this.currentTarget !== null && this.currentTarget.rock.userData.apxsAnalyzed !== true
  }

  initGameplay(_scene: THREE.Scene, _camera: THREE.PerspectiveCamera, rocks: THREE.Mesh[]): void {
    this.targeting = new RockTargeting()
    this.targeting.setRocks(rocks)
  }

  setRoverPosition(pos: THREE.Vector3): void {
    this.targeting?.setRoverPosition(pos)
  }

  markAnalyzed(rock: THREE.Mesh): void {
    rock.userData.apxsAnalyzed = true
  }
```

In the `update()` method, after existing arm/turret logic, add targeting:
```typescript
    // Contact targeting (only when active)
    if (this.targeting && this.isActive) {
      const apxsPos = this.getAPXSWorldPosition()
      this.currentTarget = this.targeting.castFromDrillHead(apxsPos, APXSController.CONTACT_RANGE)
      // Filter out already-analyzed rocks
      if (this.currentTarget && this.currentTarget.rock.userData.apxsAnalyzed) {
        this.currentTarget = null
      }
      this.targetWorldPos.copy(this.currentTarget?.point ?? apxsPos)
    } else {
      this.currentTarget = null
    }
```

Add the position helper:
```typescript
  private getAPXSWorldPosition(): THREE.Vector3 {
    if (!this.node) return new THREE.Vector3()
    const pos = new THREE.Vector3()
    this.node.getWorldPosition(pos)
    return pos
  }
```

- [ ] **Step 3:** Run `npm run build` to verify no type errors from our changes.

- [ ] **Step 4:** Commit: `feat(apxs): rock contact detection with configurable range`

---

### Task 3: SP award function + SciencePointsDialog update

**Files:**

- Modify: `src/composables/useSciencePoints.ts`
- Modify: `src/components/SciencePointsDialog.vue`

- [ ] **Step 1:** In `useSciencePoints.ts`, add `'apxs'` to the `SPSource` type union:

```typescript
export type SPSource = 'mastcam' | 'chemcam' | 'drill' | 'chemcam-ack' | 'dan' | 'sam' | 'survival' | 'transmission' | 'apxs' | 'dev'
```

- [ ] **Step 2:** Add `awardAPXS` function inside `useSciencePoints()`, after `awardSAM`. Follows the SAM pattern — fixed base SP, idempotent by rock UUID:

```typescript
  const apxsScored = new Set<string>()

  function awardAPXS(rockMeshUuid: string, baseSp: number, label: string): SPGain | null {
    if (apxsScored.has(rockMeshUuid)) return null
    apxsScored.add(rockMeshUuid)
    const spYieldMult = mod('spYield')
    const amount = Math.round(baseSp * spYieldMult)
    totalSP.value += amount
    sessionSP.value += amount
    persistSP()
    const gain: SPGain = { amount, source: 'apxs', rockLabel: label, bonus: 1.0 }
    lastGain.value = gain
    pushLedger(gain)
    return gain
  }
```

Add `awardAPXS` to the return object. Add `apxsScored.clear()` to `resetSciencePointsForTests`.

- [ ] **Step 3:** In `SciencePointsDialog.vue`, add `'apxs'` to `SOURCE_HEADLINE`:

```typescript
const SOURCE_HEADLINE: Record<SPSource, string> = {
  mastcam: 'Mastcam',
  chemcam: 'ChemCam',
  drill: 'Drill',
  'chemcam-ack': 'ChemCam review',
  dan: 'DAN',
  sam: 'SAM',
  survival: 'Mars survival',
  transmission: 'Transmission',
  apxs: 'APXS',
  dev: 'Dev console',
}
```

- [ ] **Step 4:** Run `npm run build` and `npm run test`.

- [ ] **Step 5:** Commit: `feat(apxs): SP award function and ledger support`

---

### Task 4: APXS archive composable

**Files:**

- Create: `src/composables/useAPXSArchive.ts`

- [ ] **Step 1:** Create `src/composables/useAPXSArchive.ts` following the `useSamArchive` pattern:

```typescript
import { ref } from 'vue'
import type { APXSComposition, APXSGrade, APXSElementId } from '@/lib/apxsComposition'
import type { RockTypeId } from '@/three/terrain/RockTypes'

export interface ArchivedAPXSAnalysis {
  archiveId: string
  rockType: RockTypeId
  rockLabel: string
  grade: APXSGrade
  accuracy: number
  trueComposition: APXSComposition
  measuredComposition: APXSComposition
  anomalies: APXSElementId[]
  spEarned: number
  capturedSol: number
  capturedAtMs: number
  siteId: string
}

const STORAGE_KEY = 'mars-apxs-archive-v1'

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `apxs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): ArchivedAPXSAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is ArchivedAPXSAnalysis =>
      r && typeof r === 'object' && typeof r.archiveId === 'string',
    )
  } catch { return [] }
}

function saveToStorage(rows: ArchivedAPXSAnalysis[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)) } catch {}
}

const analyses = ref<ArchivedAPXSAnalysis[]>(loadFromStorage())

export function resetAPXSArchiveForTests(): void {
  analyses.value = []
}

export function useAPXSArchive() {
  function archiveAnalysis(params: Omit<ArchivedAPXSAnalysis, 'archiveId' | 'capturedAtMs'>): ArchivedAPXSAnalysis {
    const row: ArchivedAPXSAnalysis = {
      ...params,
      archiveId: newId(),
      capturedAtMs: Date.now(),
    }
    const next = [...analyses.value, row]
    analyses.value = next
    saveToStorage(next)
    return row
  }

  return { analyses, archiveAnalysis }
}
```

- [ ] **Step 2:** Run `npm run build`.

- [ ] **Step 3:** Commit: `feat(apxs): archive composable for science log`

---

### Task 5: APXS minigame component

**Files:**

- Create: `src/components/APXSMinigame.vue`

Port from `inspo/apxs-minigame-v2.html` into a Vue SFC. This is the largest single task.

- [ ] **Step 1:** Create `src/components/APXSMinigame.vue`. The component:

**Props:**
```typescript
defineProps<{
  rockType: string
  composition: APXSComposition
  durationSec: number
}>()
```

**Emits:**
```typescript
defineEmits<{
  complete: [result: {
    accuracy: number
    measuredComposition: APXSComposition
    caughtElements: Set<APXSElementId>
    totalCaught: number
    totalEmitted: number
  }]
}>()
```

**Structure:**
- Reuse `SAMMiniGameTutorial` for the start screen (APXS-specific title, icon, diagram, steps)
- Canvas game loop ported from prototype: rock grains, alpha particles, photon emission, detector circle, catch detection, spectrum bar chart
- Reuse `SAMMiniGameResult` for the end screen (passes accuracy as quality)
- Game receives `composition` (already normalized) — no generation needed inside the component
- `durationSec` controls the power bar depletion rate (thermal penalty applied by caller)
- On game end (power depleted), compute measured composition from caught counts, emit `complete`

Key differences from prototype:
- Uses Vue lifecycle (`onMounted`/`onUnmounted`) instead of global state
- Receives composition as prop instead of generating internally
- Emits result instead of rendering its own result screen (caller handles SP/archive)
- Uses project fonts (`var(--font-ui)`, `font-instrument` class)
- Responsive sizing via container ref (same pattern as `SAMPyrolysis.vue`)

- [ ] **Step 2:** Test manually with `npm run dev` (component will be wired in Task 7).

- [ ] **Step 3:** Commit: `feat(apxs): photon catcher minigame component`

---

### Task 6: APXSTickHandler + APXSResultChart + achievements data

**Files:**

- Create: `src/views/site-controllers/APXSTickHandler.ts`
- Create: `src/components/APXSResultChart.vue`
- Modify: `public/data/achievements.json`

- [ ] **Step 1:** Create `src/views/site-controllers/APXSTickHandler.ts`. Follows the `DrillTickHandler` pattern:

```typescript
import type { Ref } from 'vue'
import { APXSController } from '@/three/instruments'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export type APXSCountdownState = 'idle' | 'counting' | 'launching' | 'playing'

export interface APXSTickRefs {
  crosshairVisible: Ref<boolean>
  crosshairColor: Ref<'green' | 'red'>
  crosshairX: Ref<number>
  crosshairY: Ref<number>
  apxsCountdown: Ref<number>       // 3, 2, 1, 0
  apxsState: Ref<APXSCountdownState>
}

export interface APXSTickCallbacks {
  onLaunchMinigame: (rockMeshUuid: string, rockType: string, rockLabel: string) => void
}

export function createAPXSTickHandler(
  refs: APXSTickRefs,
  callbacks: APXSTickCallbacks,
): SiteTickHandler & { initIfReady(fctx: SiteFrameContext): void } {
  const { crosshairVisible, crosshairColor, crosshairX, crosshairY, apxsCountdown, apxsState } = refs
  const { onLaunchMinigame } = callbacks
  let gameplayInitialised = false
  let countdownTimer = 0

  function initIfReady(fctx: SiteFrameContext): void {
    if (gameplayInitialised) return
    const inst = fctx.rover?.instruments.find(i => i.id === 'apxs')
    if (inst instanceof APXSController && inst.attached && fctx.roverReady && fctx.siteScene.rover) {
      inst.initGameplay(fctx.siteScene.scene, fctx.camera, fctx.siteScene.terrain.getSmallRocks())
      gameplayInitialised = true
    }
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, camera } = fctx

    if (apxsState.value === 'playing') return // minigame is running, skip tick

    if (controller?.mode === 'active' && controller.activeInstrument instanceof APXSController) {
      const apxs = controller.activeInstrument
      apxs.setRoverPosition(siteScene.rover!.position)
      crosshairVisible.value = true
      const hasValidTarget = apxs.canAnalyzeTarget
      crosshairColor.value = hasValidTarget ? 'green' : 'red'

      // Project APXS position to screen for crosshair
      if (camera) {
        const projected = apxs.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }

      // Countdown state machine
      if (hasValidTarget && apxsState.value === 'idle') {
        apxsState.value = 'counting'
        countdownTimer = 3
        apxsCountdown.value = 3
      } else if (hasValidTarget && apxsState.value === 'counting') {
        countdownTimer -= fctx.sceneDelta
        apxsCountdown.value = Math.ceil(countdownTimer)
        if (countdownTimer <= 0) {
          apxsState.value = 'launching'
          const target = apxs['currentTarget']!
          const rockType = target.rockType
          const rockLabel = target.rock.userData.rockLabel ?? rockType
          const uuid = target.rock.uuid
          onLaunchMinigame(uuid, rockType, rockLabel)
        }
      } else if (!hasValidTarget && apxsState.value === 'counting') {
        // Pulled away — cancel
        apxsState.value = 'idle'
        apxsCountdown.value = 0
      }
    } else {
      crosshairVisible.value = false
      if (apxsState.value === 'counting') {
        apxsState.value = 'idle'
        apxsCountdown.value = 0
      }
    }
  }

  function dispose(): void {}

  return { tick, dispose, initIfReady }
}
```

- [ ] **Step 2:** Create `src/components/APXSResultChart.vue`:

```typescript
// Props: trueComposition, measuredComposition (both APXSComposition), grade (APXSGrade)
// Renders: horizontal or vertical bar chart with element labels, two bars per element
//          (faint = true, solid = measured), color-coded per ELEMENT_COLORS
// Style: amber palette, dark background, font-instrument for numbers
```

The chart should be a simple `<div>` layout with CSS bars (no canvas needed — this is a static display in the science log, not an animated game). Follow the `ach-row` styling patterns from other dialogs.

- [ ] **Step 3:** Add `apxs-analysis` category to `public/data/achievements.json`:

```json
"apxs-analysis": [
  {
    "id": "apxs-first-contact",
    "event": "first-analysis",
    "icon": "🤚",
    "title": "FIRST CONTACT",
    "description": "Complete your first APXS surface analysis.",
    "type": "APXS ANALYSIS"
  },
  {
    "id": "apxs-surface-reader",
    "event": "five-analyses",
    "icon": "📊",
    "title": "SURFACE READER",
    "description": "Complete 5 APXS analyses.",
    "type": "APXS ANALYSIS"
  },
  {
    "id": "apxs-anomaly-hunter",
    "event": "five-anomalies",
    "icon": "⚠",
    "title": "ANOMALY HUNTER",
    "description": "Detect trace element anomalies in 5 different analyses.",
    "type": "APXS ANALYSIS"
  },
  {
    "id": "apxs-precision",
    "event": "five-s-grades",
    "icon": "🎯",
    "title": "PRECISION INSTRUMENT",
    "description": "Achieve S grade in 5 APXS analyses.",
    "type": "APXS ANALYSIS"
  }
]
```

- [ ] **Step 4:** Run `npm run build`.

- [ ] **Step 5:** Commit: `feat(apxs): tick handler, result chart, and achievements data`

---

### Task 7: View wiring (MartianSiteView + MarsSiteViewController + ScienceLogDialog)

**Files:**

- Modify: `src/views/MarsSiteViewController.ts`
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/components/ScienceLogDialog.vue`

This task wires everything together. It's the integration task.

- [ ] **Step 1:** In `MarsSiteViewController.ts`:

1. Import `APXSController` (already imported from earlier work) and `createAPXSTickHandler`.
2. Create the APXS tick handler alongside drill/mastcam/chemcam handlers. Pass refs and a callback for launching the minigame.
3. Call `apxsHandler.initIfReady(fctx)` each frame (same pattern as drill's `initIfReady`).
4. Call `apxsHandler.tick(fctx)` each frame.
5. Add APXS-specific refs to `MarsSiteViewRefs`: `apxsCountdown`, `apxsState`.

- [ ] **Step 2:** In `MartianSiteView.vue`:

1. Add refs: `apxsMinigameOpen`, `apxsCountdown`, `apxsState`, `apxsGameRockUuid`, `apxsGameRockType`, `apxsGameRockLabel`, `apxsGameComposition`, `apxsGameDuration`.
2. Import `useAPXSArchive`, `APXSMinigame`, `generateComposition`, `computeAccuracy`, `computeAPXSSp` from the new files.
3. Fetch `apxs-compositions.json` (either alongside achievements fetch or separately).
4. Wire the `onLaunchMinigame` callback: generate composition from rock type, compute thermal duration, set refs, open dialog.
5. Handle `APXSMinigame` `@complete` event: compute accuracy, grade, SP, archive result, award SP, fire toast, mark rock analyzed, trigger achievements, reset APXS state.
6. Achievement counters: `apxsAnalysisCount`, `apxsAnomalyCount`, `apxsSGradeCount` (session refs). Trigger achievements at 1/5 thresholds.
7. Mount `APXSMinigame` component in template with Teleport + Transition (same pattern as SAMDialog).
8. Add countdown overlay (3-2-1 display) — simple centered text, conditional on `apxsState === 'counting'`.

- [ ] **Step 3:** In `ScienceLogDialog.vue`:

1. Add `apxsResults` prop (type `ArchivedAPXSAnalysis[]`).
2. Add APXS accordion section (same pattern as ChemCam/DAN/SAM sections).
3. Each item shows rock label, grade badge, and `APXSResultChart` as the detail panel.
4. Update the empty-state check to include `apxsResults.length`.
5. Pass the prop from `MartianSiteView.vue`.

- [ ] **Step 4:** Run `npm run build` and `npm run test`.

- [ ] **Step 5:** Manual test: activate APXS, move arm to a rock, verify countdown → minigame → result → science log entry.

- [ ] **Step 6:** Commit: `feat(apxs): full contact science integration`

---

## Verification commands

```bash
npm run test
npm run build
```

Manual checklist:
- [ ] Activate APXS (slot 4), move arm toward a rock — green cursor appears at close range.
- [ ] Hold arm in contact — 3-2-1 countdown, then minigame launches.
- [ ] Pull arm away during countdown — countdown cancels.
- [ ] Play minigame — catch photons, spectrum bar chart updates live.
- [ ] Game ends (power depleted) — result screen with grade and accuracy.
- [ ] SP toast fires with correct amount.
- [ ] SP ledger shows "APXS" source entry.
- [ ] Rock shows red cursor (already analyzed), but still drillable.
- [ ] Science log has APXS section with composition chart.
- [ ] After 1st analysis: "FIRST CONTACT" achievement banner.
- [ ] After 5 analyses: "SURFACE READER" achievement banner.
- [ ] Cold thermal zone: game duration visibly shorter.
- [ ] CRITICAL zone: toast "Too cold for APXS" instead of countdown.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-24-apxs-contact-science.md`.

**1. Subagent-driven (recommended)** — Fresh subagent per task, review between tasks.

**2. Inline execution** — Run tasks in this session with checkpoints.

Which approach do you want for implementation?
