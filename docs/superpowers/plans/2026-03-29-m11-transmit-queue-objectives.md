# m11-transmit: Queue-Transmission Objectives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `queue-transmission` objective type so mission m11-transmit ("UHF — First Uplink") can track the player queuing science data from each of five instrument archives, and fix the `transmit` checker to count RAD events.

**Architecture:** One new objective type (`queue-transmission`) added to the type union and wired with an archive-based checker that reads the `queuedForTransmission` / `transmitted` flags already present on every archive record. The existing `transmit` checker gets RAD counting added. No new UI — the ScienceLogDialog already has per-source queue buttons and emits events through `handleQueueForTx()` in MartianSiteView.vue.

**Tech Stack:** Vue 3, TypeScript, Vitest

**Spec:** This plan (self-contained — no separate design spec needed; the feature is small and well-scoped).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/missions.ts` | Modify | Add `'queue-transmission'` to `ObjectiveType` union |
| `src/composables/useMissions.ts` | Modify | Register `queue-transmission` checker (archive-based); fix `transmit` checker to count RAD; add `notifyQueuedForTransmission()` for non-archive notification path |
| `src/composables/__tests__/useMissions.test.ts` | Modify | Add test coverage for `queue-transmission` checker and RAD-inclusive `transmit` checker |

---

## Task 1: Add `queue-transmission` to ObjectiveType

**Files:**
- Modify: `src/types/missions.ts:1-21`

- [ ] **Step 1: Add the new type to the union**

In `src/types/missions.ts`, add `'queue-transmission'` to the `ObjectiveType` union. Insert it after `'transmit'`:

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
  | 'queue-transmission'
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
Expected: No new errors from this change.

- [ ] **Step 3: Commit**

```bash
git add src/types/missions.ts
git commit -m "feat(missions): add queue-transmission objective type"
```

---

## Task 2: Write failing tests for `queue-transmission` checker

**Files:**
- Modify: `src/composables/__tests__/useMissions.test.ts`

The `queue-transmission` checker must:
1. Return `true` when any item from the specified source archive has `queuedForTransmission === true`
2. Return `true` when any item from that source has already been `transmitted` (retroactive completion)
3. Return `false` when no items exist or none are queued/transmitted for that source

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `src/composables/__tests__/useMissions.test.ts`:

```typescript
describe('queue-transmission checker', () => {
  it('returns false when no items exist for source', () => {
    const { loadCatalog, accept, checkAllObjectives, activeMissions, wireArchiveCheckers } = useMissions()
    wireArchiveCheckers()

    const catalog: MissionCatalog = {
      version: 1,
      missions: [{
        id: 'tx-test',
        name: 'TX Test',
        patron: null,
        description: 'test',
        briefing: 'test',
        reward: { sp: 10 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'qt-1', type: 'queue-transmission', label: 'Queue ChemCam', params: { source: 'chemcam' }, sequential: false },
        ],
      }],
    }
    loadCatalog(catalog)
    accept('tx-test', 1)

    // No spectra in archive — should remain incomplete
    checkAllObjectives(new THREE.Vector3(), 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(false)
  })

  it('completes when an item from the source is queued for transmission', () => {
    const { loadCatalog, accept, checkAllObjectives, activeMissions, wireArchiveCheckers } = useMissions()
    wireArchiveCheckers()

    const catalog: MissionCatalog = {
      version: 1,
      missions: [{
        id: 'tx-test',
        name: 'TX Test',
        patron: null,
        description: 'test',
        briefing: 'test',
        reward: { sp: 10 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'qt-1', type: 'queue-transmission', label: 'Queue RAD', params: { source: 'rad' }, sequential: false },
        ],
      }],
    }
    loadCatalog(catalog)
    accept('tx-test', 1)

    // Archive a RAD event and queue it
    const { archiveRadEvent, queueForTransmission } = useRadArchive()
    const row = archiveRadEvent({
      eventId: 'gcr-proton-shower',
      classifiedAs: 'gcr-proton-shower',
      eventName: 'Proton Shower',
      rarity: 'common',
      resolved: true,
      confidence: 0.9,
      caught: 8,
      total: 10,
      grade: 'B',
      spEarned: 20,
      sideProducts: [],
      capturedSol: 1,
      siteId: 'test-site',
      latitudeDeg: 0,
      longitudeDeg: 0,
    })
    queueForTransmission(row.archiveId)

    checkAllObjectives(new THREE.Vector3(), 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('completes retroactively when item already transmitted', () => {
    const { loadCatalog, accept, checkAllObjectives, activeMissions, wireArchiveCheckers } = useMissions()
    wireArchiveCheckers()

    // Archive and transmit a ChemCam spectrum BEFORE mission is accepted
    const { spectra } = useChemCamArchive()
    // Simulate a transmitted spectrum by pushing directly
    spectra.value = [{
      archiveId: 'test-spec-1',
      rockType: 'basalt',
      rockLabel: 'Basalt A',
      peaks: [],
      capturedAtMs: Date.now(),
      queuedForTransmission: false,
      transmitted: true,
    } as any]

    const catalog: MissionCatalog = {
      version: 1,
      missions: [{
        id: 'tx-test',
        name: 'TX Test',
        patron: null,
        description: 'test',
        briefing: 'test',
        reward: { sp: 10 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'qt-1', type: 'queue-transmission', label: 'Queue ChemCam', params: { source: 'chemcam' }, sequential: false },
        ],
      }],
    }
    loadCatalog(catalog)
    accept('tx-test', 1)

    checkAllObjectives(new THREE.Vector3(), 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
  })
})
```

Note: The test file already imports `useMissions` and has localStorage mocks. You will need to add imports for `useRadArchive`, `useChemCamArchive`, and `THREE` (use `import * as THREE from 'three'` or mock `Vector3`). Check the existing test file for the import pattern — if `THREE.Vector3` is already used, follow that pattern. If `checkAllObjectives` requires a `Vector3` argument, pass `new THREE.Vector3()` or a simple `{ x: 0, y: 0, z: 0 }` stub.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts 2>&1 | tail -30`
Expected: Failures — no checker registered for `queue-transmission`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/composables/__tests__/useMissions.test.ts
git commit -m "test(missions): add failing tests for queue-transmission checker"
```

---

## Task 3: Implement `queue-transmission` checker and fix `transmit` checker

**Files:**
- Modify: `src/composables/useMissions.ts:297-428` (inside `wireArchiveCheckers()`)

Two changes inside `wireArchiveCheckers()`:

1. Register a new `queue-transmission` checker
2. Add RAD event counting to the existing `transmit` checker

- [ ] **Step 1: Add `useRadArchive` import to `wireArchiveCheckers` scope**

The `useRadArchive` import already exists at the top of the file (line 11). Inside `wireArchiveCheckers()`, the `radEvents` ref is already destructured on line 426:

```typescript
const { events: radEvents } = useRadArchive()
```

Move this destructuring to the top of `wireArchiveCheckers()`, alongside the other archive destructurings (after line 302). This makes it available to both the new `queue-transmission` checker and the existing `transmit` checker.

Change the existing code at line 297-302 from:

```typescript
function wireArchiveCheckers(): void {
  const { stacks } = useInventory()
  const { spectra } = useChemCamArchive()
  const { prospects } = useDanArchive()
  const { discoveries } = useSamArchive()
  const { analyses } = useAPXSArchive()
```

To:

```typescript
function wireArchiveCheckers(): void {
  const { stacks } = useInventory()
  const { spectra } = useChemCamArchive()
  const { prospects } = useDanArchive()
  const { discoveries } = useSamArchive()
  const { analyses } = useAPXSArchive()
  const { events: radEvents } = useRadArchive()
```

And remove the duplicate destructuring on line 426 (inside the `rad-decode` checker). Replace:

```typescript
  // rad-decode: archive-based — check if player has ever completed a decode (retroactive)
  const { events: radEvents } = useRadArchive()
  registerChecker('rad-decode', () => radEvents.value.length >= 1)
```

With:

```typescript
  // rad-decode: archive-based — check if player has ever completed a decode (retroactive)
  registerChecker('rad-decode', () => radEvents.value.length >= 1)
```

- [ ] **Step 2: Register the `queue-transmission` checker**

Add the checker after the existing `transmit` checker (after line 381). Insert:

```typescript
  // queue-transmission: check if player has queued (or already transmitted) an item from a source archive
  registerChecker('queue-transmission', (p) => {
    const source = p.source as string
    if (source === 'chemcam') return spectra.value.some((s) => s.queuedForTransmission || s.transmitted)
    if (source === 'dan') return prospects.value.some((d) => d.queuedForTransmission || d.transmitted)
    if (source === 'sam') return discoveries.value.some((d) => d.queuedForTransmission || d.transmitted)
    if (source === 'apxs') return analyses.value.some((a) => a.queuedForTransmission || a.transmitted)
    if (source === 'rad') return radEvents.value.some((e) => e.queuedForTransmission || e.transmitted)
    return false
  })
```

The `|| transmitted` handles retroactive completion: if the player queued and transmitted an item before the mission was accepted, the objective still completes.

- [ ] **Step 3: Fix the `transmit` checker to count RAD events**

The existing `transmit` checker (lines 366-381) counts chemcam, dan, sam, apxs but skips RAD. Add RAD counting. Change from:

```typescript
  // transmit: count transmitted items across all archives
  registerChecker('transmit', (p) => {
    let count = 0
    if (!p.archive || p.archive === 'chemcam') {
      count += spectra.value.filter((s) => s.transmitted).length
    }
    if (!p.archive || p.archive === 'dan') {
      count += prospects.value.filter((d) => d.transmitted).length
    }
    if (!p.archive || p.archive === 'sam') {
      count += discoveries.value.filter((d) => d.transmitted).length
    }
    if (!p.archive || p.archive === 'apxs') {
      count += analyses.value.filter((a) => a.transmitted).length
    }
    return count >= (p.count ?? 1)
  })
```

To:

```typescript
  // transmit: count transmitted items across all archives
  registerChecker('transmit', (p) => {
    let count = 0
    if (!p.archive || p.archive === 'chemcam') {
      count += spectra.value.filter((s) => s.transmitted).length
    }
    if (!p.archive || p.archive === 'dan') {
      count += prospects.value.filter((d) => d.transmitted).length
    }
    if (!p.archive || p.archive === 'sam') {
      count += discoveries.value.filter((d) => d.transmitted).length
    }
    if (!p.archive || p.archive === 'apxs') {
      count += analyses.value.filter((a) => a.transmitted).length
    }
    if (!p.archive || p.archive === 'rad') {
      count += radEvents.value.filter((e) => e.transmitted).length
    }
    return count >= (p.count ?? 1)
  })
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts 2>&1 | tail -30`
Expected: All tests pass, including the new `queue-transmission` tests from Task 2.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: No regressions.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useMissions.ts
git commit -m "feat(missions): register queue-transmission checker and add RAD to transmit checker"
```

---

## Task 4: Write failing test for RAD-inclusive transmit counting

**Files:**
- Modify: `src/composables/__tests__/useMissions.test.ts`

The existing test suite likely has transmit checker tests already. This task adds explicit coverage for RAD events being counted by the `transmit` checker.

- [ ] **Step 1: Write the failing test**

Add to the existing test file (or inside the `queue-transmission checker` describe block):

```typescript
describe('transmit checker with RAD', () => {
  it('counts RAD transmitted events toward transmit total', () => {
    const { loadCatalog, accept, checkAllObjectives, activeMissions, wireArchiveCheckers } = useMissions()
    wireArchiveCheckers()

    const catalog: MissionCatalog = {
      version: 1,
      missions: [{
        id: 'tx-count-test',
        name: 'TX Count Test',
        patron: null,
        description: 'test',
        briefing: 'test',
        reward: { sp: 10 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'tx-1', type: 'transmit', label: 'Transmit 1', params: { count: 1 }, sequential: false },
        ],
      }],
    }
    loadCatalog(catalog)
    accept('tx-count-test', 1)

    // Archive a RAD event and mark it transmitted
    const { archiveRadEvent, markTransmitted } = useRadArchive()
    const row = archiveRadEvent({
      eventId: 'gcr-proton-shower',
      classifiedAs: 'gcr-proton-shower',
      eventName: 'Proton Shower',
      rarity: 'common',
      resolved: true,
      confidence: 0.9,
      caught: 8,
      total: 10,
      grade: 'B',
      spEarned: 20,
      sideProducts: [],
      capturedSol: 1,
      siteId: 'test-site',
      latitudeDeg: 0,
      longitudeDeg: 0,
    })
    markTransmitted(row.archiveId)

    checkAllObjectives(new THREE.Vector3(), 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
  })
})
```

Note: If you already implemented Task 3 before running this test, it will pass immediately. That's fine — this test documents the expected behavior.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/composables/__tests__/useMissions.test.ts
git commit -m "test(missions): add RAD transmit counting and queue-transmission test coverage"
```

---

## Summary

After these 4 tasks, mission m11-transmit will be fully functional:

| Objective | Type | Checker |
|-----------|------|---------|
| tx-1 | `queue-transmission` | `spectra.some(s => s.queuedForTransmission \|\| s.transmitted)` |
| tx-2 | `queue-transmission` | `analyses.some(a => a.queuedForTransmission \|\| a.transmitted)` |
| tx-3 | `queue-transmission` | `discoveries.some(d => d.queuedForTransmission \|\| d.transmitted)` |
| tx-4 | `queue-transmission` | `prospects.some(d => d.queuedForTransmission \|\| d.transmitted)` |
| tx-5 | `queue-transmission` | `radEvents.some(e => e.queuedForTransmission \|\| e.transmitted)` |
| tx-6 | `transmit` | count across all 5 archives ≥ 5 |

No new UI needed — `ScienceLogDialog.vue` already emits `queueForTransmission` per source, and `handleQueueForTx()` in `MartianSiteView.vue` dispatches to each archive's `queueForTransmission()` method. The objective checker reads archive state directly.

### Not in scope (future work)
- `dsn-receive` objective type for m13-deep-signal (next mission in chain)
- `notifyRadActivated()` / `notifyRadDecodeCompleted()` view wiring (covered by the separate RAD mission integration plan)
