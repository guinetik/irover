# RAD Mission (m12-rad) Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire mission m12-rad objectives into the existing RAD instrument system so the player can accept and complete the RAD ground-level survey mission.

**Architecture:** Six files need changes. Two new objective types (`rad-activate`, `rad-decode`) get added to the type union and wired with checkers. A new `findHazardousCell()` helper in the radiation field module enables hazard-aware POI placement. The site controller exposes field metadata, and the Vue view fires three mission notifications at the right moments.

**Tech Stack:** Vue 3, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-rad-mission-integration-design.md`

---

### Task 1: Add `rad-activate` and `rad-decode` to ObjectiveType

**Files:**
- Modify: `src/types/missions.ts:1-19`

- [ ] **Step 1: Add the two new types to the union**

In `src/types/missions.ts`, add `'rad-activate'` and `'rad-decode'` to the `ObjectiveType` union:

```typescript
export type ObjectiveType =
  | 'go-to'
  | 'gather'
  | 'sam-experiment'
  | 'apxs'
  | 'mastcam-tag'
  | 'chemcam'
  | 'dan-activate'
  | 'dan-scan'
  | 'dan-prospect'
  | 'transmit'
  | 'rtg-overdrive'
  | 'rtg-shunt'
  | 'rems-activate'
  | 'rad-activate'
  | 'rad-decode'
  | 'use-repair-kit'
  | 'install-upgrade'
  | 'power-boot'
  | 'ui-inspect'
  | 'avionics-test'
```

- [ ] **Step 2: Verify types compile**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors related to missions.ts (there may be pre-existing warnings elsewhere — ignore those).

- [ ] **Step 3: Commit**

```bash
git add src/types/missions.ts
git commit -m "feat(missions): add rad-activate and rad-decode objective types"
```

---

### Task 2: Add `findHazardousCell()` to radiationField.ts

**Files:**
- Modify: `src/lib/radiation/radiationField.ts` (append after `findSafeZoneCentroids`)
- Modify: `src/lib/radiation/__tests__/radiationField.test.ts` (append new describe block)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/radiation/__tests__/radiationField.test.ts`:

```typescript
import {
  classifyZone,
  computeZoneThresholds,
  generateRadiationField,
  sampleRadiationAt,
  radiationToDoseRate,
  findHazardousCell,
} from '../radiationField'

// ... (existing tests above) ...

// ─────────────────────────────────────────────────────────────────────────────
// findHazardousCell
// ─────────────────────────────────────────────────────────────────────────────

describe('findHazardousCell', () => {
  const GRID = 8
  const TERRAIN_SCALE = 100

  function makeFieldWithHotspot(): Float32Array {
    // Mostly safe (0.10), one hazardous cluster at grid [6,6] and [7,7]
    const f = new Float32Array(GRID * GRID).fill(0.10)
    f[6 * GRID + 6] = 0.90
    f[7 * GRID + 7] = 0.85
    f[6 * GRID + 7] = 0.80
    return f
  }

  it('returns the highest hazardous cell beyond minDist', () => {
    const field = makeFieldWithHotspot()
    // Rover at world origin (0,0) = grid center (3.5, 3.5)
    // Hotspot at grid (6,6) → world ≈ (35.7, 35.7), distance ≈ 50
    const result = findHazardousCell(field, GRID, TERRAIN_SCALE, 0, 0, 10, 0.60)
    expect(result).not.toBeNull()
    // Should pick grid [6,6] (value 0.90) — the highest cell
    expect(result!.value).toBeCloseTo(0.90, 2)
  })

  it('returns null when no cell meets the hazardous threshold', () => {
    const field = new Float32Array(GRID * GRID).fill(0.10) // all safe
    const result = findHazardousCell(field, GRID, TERRAIN_SCALE, 0, 0, 10, 0.60)
    expect(result).toBeNull()
  })

  it('skips cells closer than minDist', () => {
    // Place hotspot right at grid center where rover is
    const field = new Float32Array(GRID * GRID).fill(0.10)
    const centerIdx = 4 * GRID + 4
    field[centerIdx] = 0.95
    // Rover at world origin, minDist = 80 → center cell is too close
    const result = findHazardousCell(field, GRID, TERRAIN_SCALE, 0, 0, 80, 0.60)
    expect(result).toBeNull()
  })

  it('falls back to highest hazardous cell if none meet minDist', () => {
    // Place hotspot right at grid center where rover is
    const field = new Float32Array(GRID * GRID).fill(0.10)
    const centerIdx = 4 * GRID + 4
    field[centerIdx] = 0.95
    // Rover at world origin, minDist = 80 → center cell is too close, but pass minDist=0
    const result = findHazardousCell(field, GRID, TERRAIN_SCALE, 0, 0, 0, 0.60)
    expect(result).not.toBeNull()
    expect(result!.value).toBeCloseTo(0.95, 2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/radiation/__tests__/radiationField.test.ts 2>&1 | tail -15`
Expected: FAIL — `findHazardousCell` is not exported.

- [ ] **Step 3: Implement `findHazardousCell`**

Append to `src/lib/radiation/radiationField.ts` (after `findSafeZoneCentroids`):

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Hazardous Cell Finder (for mission POI placement)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the highest-radiation cell in the field that is at least `minDist`
 * world units from the given position and meets the `hazardousThreshold`.
 *
 * Returns world coordinates + field value, or null if no hazardous cell exists.
 */
export function findHazardousCell(
  field: Float32Array,
  gridSize: number,
  terrainScale: number,
  roverX: number,
  roverZ: number,
  minDist: number,
  hazardousThreshold: number,
): { x: number; z: number; value: number } | null {
  const gMax = gridSize - 1
  const roverGx = (roverX / terrainScale + 0.5) * gMax
  const roverGz = (roverZ / terrainScale + 0.5) * gMax
  const minDistGrid = (minDist / terrainScale) * gMax

  let bestValue = -1
  let bestGx = -1
  let bestGz = -1

  for (let gz = 0; gz < gridSize; gz++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const v = field[gz * gridSize + gx]
      if (v < hazardousThreshold) continue

      const dx = gx - roverGx
      const dz = gz - roverGz
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < minDistGrid) continue

      if (v > bestValue) {
        bestValue = v
        bestGx = gx
        bestGz = gz
      }
    }
  }

  if (bestGx < 0) return null

  return {
    x: (bestGx / gMax - 0.5) * terrainScale,
    z: (bestGz / gMax - 0.5) * terrainScale,
    value: bestValue,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/radiation/__tests__/radiationField.test.ts 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/radiation/radiationField.ts src/lib/radiation/__tests__/radiationField.test.ts
git commit -m "feat(radiation): add findHazardousCell for mission POI placement"
```

---

### Task 3: Register RAD checkers and notifications in useMissions.ts

**Files:**
- Modify: `src/composables/useMissions.ts`

This task adds the `rad-activate` and `rad-decode` checkers plus their notification functions, following the exact pattern used by `rems-activate` and `dan-activate`.

- [ ] **Step 1: Add the rad archive import**

At the top of `src/composables/useMissions.ts`, add `useRadArchive` to the imports (after the existing `useAPXSArchive` import on line 11):

```typescript
import { useRadArchive } from './useRadArchive'
```

- [ ] **Step 2: Add the radActivated ref**

After the existing `danScanCompleted` ref (line 428), add:

```typescript
const radActivated = ref(false)
const radDecodeCompleted = ref(false)
```

- [ ] **Step 3: Register both checkers in `wireArchiveCheckers()`**

Inside `wireArchiveCheckers()`, after the `avionics-test` checker registration (line 419), add:

```typescript
  // rad-activate: flag set externally when player enables RAD passive subsystem
  registerChecker('rad-activate', () => radActivated.value)

  // rad-decode: archive-based — check if player has ever completed a decode (retroactive)
  const { events: radEvents } = useRadArchive()
  registerChecker('rad-decode', () => radEvents.value.length >= 1)
```

- [ ] **Step 4: Add the notification functions**

After the existing `addAvionicsDistance` function (line 478), add:

```typescript
function notifyRadActivated(): void {
  radActivated.value = true
}

function notifyRadDecodeCompleted(): void {
  radDecodeCompleted.value = true
}
```

- [ ] **Step 5: Add to resetForTests()**

In `resetForTests()` (around line 480), add alongside the other flag resets:

```typescript
  radActivated.value = false
  radDecodeCompleted.value = false
```

- [ ] **Step 6: Add to resetMissionProgressForDev()**

In `resetMissionProgressForDev()` (around line 501), add alongside the other flag resets:

```typescript
  radActivated.value = false
  radDecodeCompleted.value = false
```

- [ ] **Step 7: Export both notification functions**

In the `useMissions()` return object (line 584+), add:

```typescript
    notifyRadActivated,
    notifyRadDecodeCompleted,
```

- [ ] **Step 8: Run existing tests to verify nothing is broken**

Run: `npx vitest run src/composables/__tests__/useMissions 2>&1 | tail -15`
Expected: All existing tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/composables/useMissions.ts
git commit -m "feat(missions): register rad-activate and rad-decode objective checkers"
```

---

### Task 4: Expose radiation field data from site controller

**Files:**
- Modify: `src/views/site-controllers/RadTickHandler.ts`
- Modify: `src/views/MarsSiteViewController.ts`

The `useMissionUI` seeding logic needs access to the radiation field grid to place the hotspot POI. The field is private to `RadTickHandler`. Expose it via a getter on the tick handler, then surface it on the site controller handle.

- [ ] **Step 1: Add `getFieldData()` to RadTickHandler interface**

In `src/views/site-controllers/RadTickHandler.ts`, add to the `RadTickHandler` interface (after `getDevSafeZoneCentroids`, around line 61):

```typescript
  /** Returns the radiation field data and thresholds for POI placement, or null if field not yet initialized. */
  getFieldData(): { field: Float32Array; gridSize: number; terrainScale: number; thresholds: import('@/lib/radiation').RadiationThresholds } | null
```

- [ ] **Step 2: Implement `getFieldData()` in the factory function**

Inside the `createRadTickHandler` function body, after the `endDecode` function (around line 138), add:

```typescript
  function getFieldData(): { field: Float32Array; gridSize: number; terrainScale: number; thresholds: RadiationThresholds } | null {
    if (!field) return null
    return { field, gridSize, terrainScale, thresholds }
  }
```

Note: `thresholds` is already computed at the top of `createRadTickHandler` (line 89: `const thresholds = computeZoneThresholds(radiationIndex)`). We just return the same object.

And add `getFieldData` to the returned object.

- [ ] **Step 3: Find where the tick handler return object is and add getFieldData**

Locate the return statement of `createRadTickHandler` (search for `return {` after the tick function). Add `getFieldData` to the returned object alongside `setField`, `dismissEvent`, `startDecode`, `endDecode`, `getSafePan`, `getSafeDist`.

- [ ] **Step 4: Add `getRadiationFieldData` to MarsSiteViewControllerHandle**

In `src/views/MarsSiteViewController.ts`, add to the `MarsSiteViewControllerHandle` interface (after `handleRadDismiss`, around line 454):

```typescript
  /** Returns radiation field metadata for hazard-aware POI placement, or null if not ready. */
  getRadiationFieldData: () => { field: Float32Array; gridSize: number; terrainScale: number; thresholds: import('@/lib/radiation').RadiationThresholds } | null
```

- [ ] **Step 5: Implement in the controller factory**

In the returned handle object of `createMarsSiteViewController`, add:

```typescript
  getRadiationFieldData: () => tickHandlers?.radHandler?.getFieldData() ?? null,
```

You'll need to find where the handle object is returned (search for `handleRadDismiss:` in the return block) and add this line after it.

- [ ] **Step 6: Verify types compile**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/site-controllers/RadTickHandler.ts src/views/MarsSiteViewController.ts
git commit -m "feat(rad): expose radiation field data via site controller handle"
```

---

### Task 5: Hazard-aware POI placement in useMissionUI.ts

**Files:**
- Modify: `src/composables/useMissionUI.ts`

When `seedGoToPoisForMission` runs for m12-rad, the `rad-hotspot-01` POI should land inside a hazardous radiation zone, and `rad-safe-return` should land in the nearest safe zone.

- [ ] **Step 1: Add radiation field imports**

At the top of `src/composables/useMissionUI.ts`, add:

```typescript
import { findHazardousCell, findSafeZoneCentroids } from '@/lib/radiation'
```

- [ ] **Step 2: Add radiation-aware placement inside `seedGoToPoisForMission`**

In `seedGoToPoisForMission` (line 113), the `goToObjs.forEach` loop (line 119) computes `px`/`pz` for each objective. Add a new branch at the top of the loop body, before the existing `if (obj.params.nearRocks)` check (line 123):

```typescript
      // Radiation-aware POI placement
      if (obj.params.poiId === 'rad-hotspot-01') {
        const fieldData = siteHandle.value?.getRadiationFieldData()
        if (fieldData) {
          const cell = findHazardousCell(
            fieldData.field, fieldData.gridSize, fieldData.terrainScale,
            rx, rz, 80, fieldData.thresholds.hazardousMin,
          )
          if (cell) {
            px = Math.max(-390, Math.min(390, cell.x))
            pz = Math.max(-390, Math.min(390, cell.z))
            plannedPoiPositions.set(obj.params.poiId, { x: px, z: pz, label: obj.label })
            return // skip default placement
          }
        }
        // Fallback: place at distance like normal go-to
      } else if (obj.params.poiId === 'rad-safe-return') {
        // Place at the nearest safe zone centroid to the hotspot
        const hotspotPos = plannedPoiPositions.get('rad-hotspot-01')
        const fieldData = siteHandle.value?.getRadiationFieldData()
        if (hotspotPos && fieldData) {
          const centroids = findSafeZoneCentroids(
            fieldData.field, fieldData.gridSize, fieldData.terrainScale, fieldData.thresholds,
          )
          if (centroids.length > 0) {
            // Pick centroid nearest to the hotspot
            let bestDist = Infinity
            let bestC = centroids[0]
            for (const c of centroids) {
              const dx = c.x - hotspotPos.x
              const dz = c.z - hotspotPos.z
              const d = dx * dx + dz * dz
              if (d < bestDist) { bestDist = d; bestC = c }
            }
            px = Math.max(-390, Math.min(390, bestC.x))
            pz = Math.max(-390, Math.min(390, bestC.z))
            plannedPoiPositions.set(obj.params.poiId, { x: px, z: pz, label: obj.label })
            return // skip default placement
          }
        }
        // Fallback: place at distance like normal go-to
      }
```

Note: The `return` inside the `forEach` callback just skips to the next iteration — the existing code after the `if/else` branches (the generic angle/distance placement + `plannedPoiPositions.set` at the end of the loop body) serves as the fallback for both cases. Both `fieldData.thresholds.hazardousMin` and `fieldData.thresholds` come directly from the `RadTickHandler.getFieldData()` call, which returns the site's precomputed zone thresholds — no hardcoded values.

- [ ] **Step 3: Verify types compile**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/composables/useMissionUI.ts
git commit -m "feat(missions): hazard-aware POI placement for rad-hotspot and rad-safe-return"
```

---

### Task 6: Wire mission notifications in MartianSiteView.vue

**Files:**
- Modify: `src/views/MartianSiteView.vue`

Three notification calls need to be wired:

1. `notifyRadActivated()` — when RAD passive subsystem is enabled
2. `notifyRadDecodeCompleted()` — when player acknowledges a decode result
3. `notifyUiInspected('rad-science')` — when player acknowledges a decode result (the result screen IS the science review)

- [ ] **Step 1: Wire RAD activation notification**

Find the passive subsystem toggle handler in `MartianSiteView.vue`. It's around line 1841-1847 where REMS and DAN activation notifications fire:

```typescript
    // Notify mission system when REMS is activated
    if (inst?.id === 'rems' && inst.passiveSubsystemEnabled) {
      useMissions().notifyRemsActivated()
    }
    // Notify mission system when DAN is activated
    if (inst?.id === 'dan' && inst.passiveSubsystemEnabled) {
      useMissions().notifyDanActivated()
    }
```

Add after the DAN block:

```typescript
    // Notify mission system when RAD is activated
    if (inst?.id === 'rad' && inst.passiveSubsystemEnabled) {
      useMissions().notifyRadActivated()
    }
```

- [ ] **Step 2: Wire RAD activation for already-enabled case**

Find the `watch(radEnabled, ...)` block (around line 1064). Add a new watch right after it that fires the notification when radEnabled becomes true (covers the case where RAD was already on before the mission was accepted):

```typescript
watch(radEnabled, (enabled) => {
  if (enabled) useMissions().notifyRadActivated()
})
```

- [ ] **Step 3: Wire RAD decode and science-inspect notifications**

Find the `onRadAcknowledge()` function. It's around line 2037. After the existing achievement lines (around line 2072-2074 where `radDecodeCount` is checked), add:

```typescript
  // Notify mission system
  useMissions().notifyRadDecodeCompleted()
  useMissions().notifyUiInspected('rad-science')
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

1. Start a game, use dev tools to jump to mission m12-rad (or naturally reach it).
2. Verify the mission tracker shows 6 sequential objectives.
3. Activate RAD — objective 1 should complete.
4. Drive to the rad-hotspot marker on the map — objective 2 should complete when you arrive.
5. Wait for / trigger a radiation event and complete the decode minigame — objective 3 should complete.
6. Acknowledge the result — objective 4 should complete (rad-science inspect).
7. Drive to rad-safe-return marker — objective 5 should complete.
8. Repair any damaged instrument — objective 6 should complete.
9. Mission transitions to awaiting-transmit.

- [ ] **Step 5: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(missions): wire RAD mission notifications for activate, decode, and science inspect"
```

---

### Task 7: Add RAD objective checker tests

**Files:**
- Modify: `src/composables/__tests__/useMissions.test.ts`

- [ ] **Step 1: Write tests for both new checkers**

Add a new describe block at the end of `src/composables/__tests__/useMissions.test.ts`. Import `resetForTests as resetRadArchive` from `useRadArchive` and `useRadArchive` at the top of the file:

```typescript
import { resetForTests as resetRadArchive, useRadArchive } from '../useRadArchive'
```

Then add the describe block:

```typescript
describe('RAD objective checkers', () => {
  beforeEach(() => {
    localStorage.clear()
    resetRadArchive()
    const { resetForTests } = useMissions()
    resetForTests()
  })

  it('rad-activate completes when notifyRadActivated is called', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'rad-test', name: 'RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'r1', type: 'rad-activate', label: 'Activate RAD', params: {}, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('rad-test', 1)

    // Not yet activated
    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)

    // Activate
    m.notifyRadActivated()
    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('rad-decode completes retroactively when archive already has events', () => {
    // Populate the rad archive BEFORE wiring checkers — simulates a player
    // who decoded RAD events organically before this mission arrived.
    const { archiveRadEvent } = useRadArchive()
    archiveRadEvent({
      eventId: 'gcr-fluctuation', classifiedAs: 'gcr-fluctuation',
      eventName: 'GCR Fluctuation', rarity: 'common', resolved: true, confidence: 0.85,
      caught: 10, total: 15, grade: 'B', spEarned: 20, sideProducts: [],
      capturedSol: 5, siteId: 'test', latitudeDeg: 0, longitudeDeg: 0,
    })

    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'rad-test', name: 'RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'r1', type: 'rad-decode', label: 'Decode event', params: {}, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('rad-test', 1)

    // Should auto-complete because archive already has an entry
    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('rad-decode does not complete with empty archive', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'rad-test', name: 'RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'r1', type: 'rad-decode', label: 'Decode event', params: {}, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('rad-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts 2>&1 | tail -20`
Expected: All tests PASS including the new RAD checker tests.

- [ ] **Step 3: Commit**

```bash
git add src/composables/__tests__/useMissions.test.ts
git commit -m "test(missions): add rad-activate and rad-decode objective checker tests"
```
