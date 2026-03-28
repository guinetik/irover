# Mission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data-driven mission/quest system that serves as the tutorial progression spine, delivering missions via LGA mailbox, tracking objectives against game state, and gating instrument unlocks.

**Architecture:** Three-layer composable architecture — (1) LGA mailbox upgrade with typed expandable messages, (2) mission engine managing catalog/state/progression, (3) pluggable objective resolvers reading from existing composables. All state persisted to localStorage. UI: MessageDialog for reading messages, MissionTracker HUD for active tracking, MissionLogDialog for mission history.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Teleport+Transition dialogs

**Spec:** `docs/superpowers/specs/2026-03-24-mission-system-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/types/missions.ts` | MissionDef, ObjectiveDef, MissionState, MissionReward interfaces |
| `src/composables/useMissions.ts` | Mission engine singleton — catalog, active/completed state, accept/complete/chain |
| `src/composables/useObjectiveTrackers.ts` | Objective resolver registry — one checker per objective type |
| `src/composables/__tests__/useMissions.test.ts` | Mission engine unit tests |
| `src/composables/__tests__/useObjectiveTrackers.test.ts` | Objective resolver unit tests |
| `src/components/MessageDialog.vue` | Expandable message overlay (Teleport+Transition) |
| `src/components/MissionLogDialog.vue` | Mission log panel opened from navbar |
| `src/components/MissionTracker.vue` | Persistent HUD quest tracker (top-right) |
| `public/data/missions.json` | Mission definitions catalog (tutorial progression m01-m09) |

### Modified Files

| File | Change |
|------|--------|
| `src/types/lgaMailbox.ts` | Add optional `type`, `from`, `missionId` fields |
| `src/composables/useLGAMailbox.ts` | Add `pushMessage()` method |
| `src/composables/__tests__/useLGAMailbox.test.ts` | Add tests for `pushMessage()` |
| `src/composables/usePlayerProfile.ts` | Add `sandbox: boolean` to `PlayerProfile` |
| `src/components/InstrumentToolbar.vue` | Add `unlockedIds` prop, filter instruments |
| `src/components/LGAMailbox.vue` | Make messages clickable, emit `openMessage` |
| `src/views/MartianSiteView.vue` | Wire MissionTracker, MissionLogDialog, MessageDialog; add mission log button to hud-actions; call checkObjectives in tick; first-launch LGA auto-open |

---

## Task 1: Type Definitions

**Files:**
- Create: `src/types/missions.ts`
- Modify: `src/types/lgaMailbox.ts`

- [ ] **Step 1: Create mission type definitions**

Create `src/types/missions.ts`:

```typescript
export interface ObjectiveDef {
  id: string
  type: 'go-to' | 'gather' | 'sam-experiment' | 'apxs' | 'mastcam-tag' | 'chemcam' | 'dan-prospect' | 'transmit'
  label: string
  params: Record<string, unknown>
  sequential: boolean
}

export interface MissionReward {
  sp?: number
  items?: Array<{ id: string; quantity: number }>
}

export interface MissionDef {
  id: string
  name: string
  patron: string | null
  description: string
  briefing: string
  reward: MissionReward
  unlocks: string[]
  chain: string | null
  objectives: ObjectiveDef[]
}

export interface MissionCatalog {
  version: number
  missions: MissionDef[]
}

export interface ObjectiveState {
  id: string
  done: boolean
}

export interface MissionState {
  missionId: string
  status: 'active' | 'completed'
  acceptedAtSol: number
  completedAtSol?: number
  objectives: ObjectiveState[]
}
```

- [ ] **Step 2: Extend LGAMessage interface**

Modify `src/types/lgaMailbox.ts` — add three optional fields to the existing interface:

```typescript
export interface LGAMessage {
  id: string
  direction: 'sent' | 'received'
  sol: number
  timeOfDay: number
  subject: string
  body: string
  read: boolean
  // new optional fields for mission system
  type?: 'info' | 'mission' | 'alert'
  from?: string
  missionId?: string
}
```

- [ ] **Step 3: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No new errors (fields are optional, so existing code is unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/types/missions.ts src/types/lgaMailbox.ts
git commit -m "feat(missions): add mission type definitions and extend LGAMessage"
```

---

## Task 2: LGA Mailbox — pushMessage

**Files:**
- Modify: `src/composables/useLGAMailbox.ts`
- Modify: `src/composables/__tests__/useLGAMailbox.test.ts`

- [ ] **Step 1: Write failing test for pushMessage**

Add to `src/composables/__tests__/useLGAMailbox.test.ts`:

```typescript
describe('pushMessage', () => {
  it('adds a custom message to the mailbox', () => {
    const { pushMessage, messages } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.25,
      subject: 'New Mission Available',
      body: 'Navigate to the survey markers.',
      type: 'mission',
      from: 'Mission Control',
      missionId: 'm01-triangulate',
    })

    expect(messages.value).toHaveLength(1)
    const msg = messages.value[0]
    expect(msg.id).toBeTruthy()
    expect(msg.read).toBe(false)
    expect(msg.type).toBe('mission')
    expect(msg.from).toBe('Mission Control')
    expect(msg.missionId).toBe('m01-triangulate')
    expect(msg.subject).toBe('New Mission Available')
  })

  it('is not idempotent — multiple calls create multiple messages', () => {
    const { pushMessage, messages } = useLGAMailbox()
    const base = {
      direction: 'received' as const,
      sol: 1,
      timeOfDay: 0.25,
      subject: 'Test',
      body: 'Body',
    }
    pushMessage(base)
    pushMessage(base)
    expect(messages.value).toHaveLength(2)
    expect(messages.value[0].id).not.toBe(messages.value[1].id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useLGAMailbox.test.ts`
Expected: FAIL — `pushMessage` is not a function

- [ ] **Step 3: Implement pushMessage**

Add to `useLGAMailbox.ts`, inside the `useLGAMailbox()` function, before the return:

```typescript
function pushMessage(msg: Omit<LGAMessage, 'id' | 'read'>): void {
  const next = [...messages.value, { ...msg, id: newId(), read: false }]
  messages.value = next
  saveToStorage(next)
}
```

Add `pushMessage` to the return object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useLGAMailbox.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useLGAMailbox.ts src/composables/__tests__/useLGAMailbox.test.ts
git commit -m "feat(lga): add pushMessage method for mission delivery"
```

---

## Task 3: Player Profile — sandbox flag

**Files:**
- Modify: `src/composables/usePlayerProfile.ts`

- [ ] **Step 1: Add sandbox to PlayerProfile**

In `src/composables/usePlayerProfile.ts`, add `sandbox` to the `PlayerProfile` interface:

```typescript
export interface PlayerProfile {
  archetype: ArchetypeId | null
  foundation: FoundationId | null
  patron: PatronId | null
  sandbox: boolean
  modifiers: ProfileModifiers
}
```

- [ ] **Step 2: Update the default/initial profile**

Find where the initial profile is created (the default state). Add `sandbox: true` as the default so existing players and dev workflows are unaffected. Update `setProfile()` or any factory that creates `PlayerProfile` to include the field. **Migration:** If loading a stored profile from localStorage that lacks `sandbox`, default to `true` (e.g., `sandbox: stored.sandbox ?? true`).

- [ ] **Step 3: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: Fix any compilation errors from missing `sandbox` field in profile construction

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePlayerProfile.ts
git commit -m "feat(profile): add sandbox flag to PlayerProfile (defaults true)"
```

---

## Task 4: Objective Resolvers

**Files:**
- Create: `src/composables/useObjectiveTrackers.ts`
- Create: `src/composables/__tests__/useObjectiveTrackers.test.ts`

- [ ] **Step 1: Write failing tests for objective checkers**

Create `src/composables/__tests__/useObjectiveTrackers.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { checkObjective } from '../useObjectiveTrackers'
import type { SiteMissionPoi } from '../useSiteMissionPois'

describe('go-to objective', () => {
  it('returns true when rover is within 5 units of POI', () => {
    const pois: SiteMissionPoi[] = [{ id: 'poi-a', label: 'A', x: 10, z: 20 }]
    const result = checkObjective(
      { type: 'go-to', params: { poiId: 'poi-a' } },
      { roverX: 12, roverZ: 21, pois }
    )
    expect(result).toBe(true)
  })

  it('returns false when rover is more than 5 units from POI', () => {
    const pois: SiteMissionPoi[] = [{ id: 'poi-a', label: 'A', x: 10, z: 20 }]
    const result = checkObjective(
      { type: 'go-to', params: { poiId: 'poi-a' } },
      { roverX: 0, roverZ: 0, pois }
    )
    expect(result).toBe(false)
  })

  it('returns false when POI not found', () => {
    const result = checkObjective(
      { type: 'go-to', params: { poiId: 'missing' } },
      { roverX: 0, roverZ: 0, pois: [] }
    )
    expect(result).toBe(false)
  })
})

describe('unknown objective type', () => {
  it('returns false for unregistered types', () => {
    const result = checkObjective(
      { type: 'apxs' as any, params: {} },
      { roverX: 0, roverZ: 0, pois: [] }
    )
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useObjectiveTrackers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement objective resolver**

Create `src/composables/useObjectiveTrackers.ts`:

```typescript
import type { SiteMissionPoi } from './useSiteMissionPois'

export interface CheckerContext {
  roverX: number
  roverZ: number
  pois: SiteMissionPoi[]
}

interface ObjectiveInput {
  type: string
  params: Record<string, unknown>
}

type ObjectiveChecker = (params: Record<string, unknown>, ctx: CheckerContext) => boolean

function distanceTo(ctx: CheckerContext, poiId: string): number {
  const poi = ctx.pois.find((p) => p.id === poiId)
  if (!poi) return Infinity
  const dx = ctx.roverX - poi.x
  const dz = ctx.roverZ - poi.z
  return Math.sqrt(dx * dx + dz * dz)
}

const checkers: Record<string, ObjectiveChecker> = {
  'go-to': (p, ctx) => distanceTo(ctx, p.poiId as string) < 5,
}

export function checkObjective(obj: ObjectiveInput, ctx: CheckerContext): boolean {
  const checker = checkers[obj.type]
  if (!checker) return false
  return checker(obj.params, ctx)
}

export function registerChecker(type: string, checker: ObjectiveChecker): void {
  checkers[type] = checker
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useObjectiveTrackers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Add archive-based checkers**

Add checkers that read from existing composables. These import the singleton composables and check their reactive state:

```typescript
import { useInventory } from './useInventory'
import { useChemCamArchive } from './useChemCamArchive'
import { useSamArchive } from './useSamArchive'
import { useDanArchive } from './useDanArchive'
import { useTransmissionQueue } from './useTransmissionQueue'
```

Add to the `checkers` record:

```typescript
'gather': (p) => {
  // Wildcard: "any-rock" matches any rock-category item
  const { stacks } = useInventory()
  if (p.itemId === 'any-rock') {
    const total = stacks.value
      .filter((s) => s.itemId.match(/basalt|hematite|olivine|sulfate|mudstone|iron-meteorite/))
      .reduce((sum, s) => sum + s.quantity, 0)
    return total >= (p.quantity as number)
  }
  const stack = stacks.value.find((s) => s.itemId === p.itemId)
  return (stack?.quantity ?? 0) >= (p.quantity as number)
},
'chemcam': (p) => {
  // useChemCamArchive exports `spectra` (not readouts)
  // Wildcard: "any" matches any rockType
  const { spectra } = useChemCamArchive()
  if (p.rockType === 'any') return spectra.value.length > 0
  return spectra.value.some((r) => r.rockType === p.rockType)
},
'sam-experiment': (p) => {
  // useSamArchive exports `discoveries` (not results)
  // ArchivedSAMDiscovery uses `modeId` (not mode) and `sampleLabel` (not rockType)
  const { discoveries } = useSamArchive()
  return discoveries.value.some((r) =>
    r.modeId === p.mode && (!p.rockType || r.sampleLabel === p.rockType)
  )
},
'dan-prospect': (p) => {
  // ArchivedDANProspect uses `reservoirQuality` (0-1 scale), not `waterChance`
  // Mission params use percentage (0-100), so multiply by 100
  const { prospects } = useDanArchive()
  return prospects.value.some((d) => d.reservoirQuality * 100 >= (p.minWaterChance as number))
},
'transmit': (p) => {
  // useTransmissionQueue has no totalTransmittedCount
  // Count transmitted items across all three archive composables
  const { spectra } = useChemCamArchive()
  const { prospects } = useDanArchive()
  const { discoveries } = useSamArchive()
  const count =
    spectra.value.filter((s) => s.transmitted).length +
    prospects.value.filter((d) => d.transmitted).length +
    discoveries.value.filter((d) => d.transmitted).length
  return count >= ((p.count as number) ?? 1)
},
'apxs': () => false,         // stub until useApxsArchive exists
'mastcam-tag': () => false,  // stub until MastCam archive exposed
```

- [ ] **Step 6: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors (fix any property name mismatches found in step 5)

- [ ] **Step 7: Commit**

```bash
git add src/composables/useObjectiveTrackers.ts src/composables/__tests__/useObjectiveTrackers.test.ts
git commit -m "feat(missions): add objective resolver registry with go-to and archive checkers"
```

---

## Task 5: Mission Engine

**Files:**
- Create: `src/composables/useMissions.ts`
- Create: `src/composables/__tests__/useMissions.test.ts`
- Reference: `public/data/missions.json` (created in Task 6)

- [ ] **Step 1: Write failing tests**

Create `src/composables/__tests__/useMissions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMissions, resetMissionsForTests } from '../useMissions'

const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

beforeEach(() => {
  localStorageMock.clear()
  resetMissionsForTests()
})

describe('mission catalog', () => {
  it('can load mission definitions from a provided array', () => {
    const { loadCatalog, catalog } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [{ id: 'o1', type: 'go-to', label: 'Go', params: { poiId: 'p1' }, sequential: false }],
      }],
    })
    expect(catalog.value).toHaveLength(1)
    expect(catalog.value[0].id).toBe('m01')
  })
})

describe('accept', () => {
  it('creates an active mission state with all objectives false', () => {
    const { loadCatalog, accept, activeMissions } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: ['mastcam'], chain: null,
        objectives: [
          { id: 'o1', type: 'go-to', label: 'Go A', params: { poiId: 'a' }, sequential: false },
          { id: 'o2', type: 'go-to', label: 'Go B', params: { poiId: 'b' }, sequential: false },
        ],
      }],
    })

    accept('m01', 1)
    expect(activeMissions.value).toHaveLength(1)
    expect(activeMissions.value[0].missionId).toBe('m01')
    expect(activeMissions.value[0].status).toBe('active')
    expect(activeMissions.value[0].objectives).toEqual([
      { id: 'o1', done: false },
      { id: 'o2', done: false },
    ])
  })

  it('does not accept the same mission twice', () => {
    const { loadCatalog, accept, activeMissions } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [],
      }],
    })
    accept('m01', 1)
    accept('m01', 1)
    expect(activeMissions.value).toHaveLength(1)
  })
})

describe('completeObjective', () => {
  it('marks a specific objective as done', () => {
    const { loadCatalog, accept, activeMissions, completeObjective } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'o1', type: 'go-to', label: 'Go', params: {}, sequential: false },
        ],
      }],
    })
    accept('m01', 1)
    completeObjective('m01', 'o1')
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
  })
})

describe('unlockedInstruments', () => {
  it('returns unlocks from completed missions', () => {
    const { loadCatalog, accept, completeMission, unlockedInstruments } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: ['mastcam'], chain: null,
        objectives: [],
      }],
    })
    accept('m01', 1)
    completeMission('m01', 1)
    expect(unlockedInstruments.value).toContain('mastcam')
  })
})

describe('trackedMissionId', () => {
  it('auto-tracks when only one active mission', () => {
    const { loadCatalog, accept, trackedMissionId } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [],
      }],
    })
    accept('m01', 1)
    expect(trackedMissionId.value).toBe('m01')
  })
})

describe('persistence', () => {
  it('persists mission state to localStorage', () => {
    const { loadCatalog, accept } = useMissions()
    loadCatalog({
      version: 1,
      missions: [{
        id: 'm01', name: 'Test', patron: null,
        description: 'desc', briefing: 'brief',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [{ id: 'o1', type: 'go-to', label: 'Go', params: {}, sequential: false }],
      }],
    })
    accept('m01', 1)

    const stored = JSON.parse(store['mars-missions-v1'] ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].missionId).toBe('m01')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement mission engine**

Create `src/composables/useMissions.ts`:

```typescript
import { ref, computed } from 'vue'
import type { MissionDef, MissionCatalog, MissionState, ObjectiveState } from '@/types/missions'

const STORAGE_KEY = 'mars-missions-v1'

function loadFromStorage(): MissionState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveToStorage(states: MissionState[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(states)) }
  catch { /* quota */ }
}

// --- Singleton state ---
const catalog = ref<MissionDef[]>([])
const missionStates = ref<MissionState[]>(loadFromStorage())
const trackedMissionId = ref<string | null>(null)

export function resetMissionsForTests(): void {
  catalog.value = []
  missionStates.value = []
  trackedMissionId.value = null
}

export function useMissions() {
  const activeMissions = computed(() =>
    missionStates.value.filter((m) => m.status === 'active')
  )

  const completedMissions = computed(() =>
    missionStates.value.filter((m) => m.status === 'completed')
  )

  const unlockedInstruments = computed(() => {
    const ids: string[] = []
    for (const ms of completedMissions.value) {
      const def = catalog.value.find((d) => d.id === ms.missionId)
      if (def) ids.push(...def.unlocks)
    }
    return ids
  })

  function loadCatalog(data: MissionCatalog): void {
    catalog.value = data.missions
  }

  function getMissionDef(missionId: string): MissionDef | undefined {
    return catalog.value.find((m) => m.id === missionId)
  }

  function accept(missionId: string, currentSol: number): void {
    // Don't accept duplicates
    if (missionStates.value.some((m) => m.missionId === missionId)) return

    const def = getMissionDef(missionId)
    if (!def) return

    const state: MissionState = {
      missionId,
      status: 'active',
      acceptedAtSol: currentSol,
      objectives: def.objectives.map((o) => ({ id: o.id, done: false })),
    }

    missionStates.value = [...missionStates.value, state]
    saveToStorage(missionStates.value)

    // Auto-track if only active mission
    if (activeMissions.value.length === 1) {
      trackedMissionId.value = missionId
    }
  }

  function completeObjective(missionId: string, objectiveId: string): void {
    const next = missionStates.value.map((ms) => {
      if (ms.missionId !== missionId) return ms
      return {
        ...ms,
        objectives: ms.objectives.map((o) =>
          o.id === objectiveId ? { ...o, done: true } : o
        ),
      }
    })
    missionStates.value = next
    saveToStorage(next)
  }

  function completeMission(missionId: string, currentSol: number): void {
    const next = missionStates.value.map((ms) => {
      if (ms.missionId !== missionId) return ms
      return { ...ms, status: 'completed' as const, completedAtSol: currentSol }
    })
    missionStates.value = next
    saveToStorage(next)

    // If tracked mission completed, clear tracker
    if (trackedMissionId.value === missionId) {
      const remaining = next.filter((m) => m.status === 'active')
      trackedMissionId.value = remaining.length === 1 ? remaining[0].missionId : null
    }
  }

  function setTracked(missionId: string | null): void {
    trackedMissionId.value = missionId
  }

  function allObjectivesDone(missionId: string): boolean {
    const ms = missionStates.value.find((m) => m.missionId === missionId)
    if (!ms) return false
    return ms.objectives.every((o) => o.done)
  }

  return {
    catalog,
    activeMissions,
    completedMissions,
    unlockedInstruments,
    trackedMissionId,
    loadCatalog,
    getMissionDef,
    accept,
    completeObjective,
    completeMission,
    setTracked,
    allObjectivesDone,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useMissions.ts src/composables/__tests__/useMissions.test.ts
git commit -m "feat(missions): add mission engine composable with catalog, accept, complete, tracking"
```

---

## Task 6: Mission Catalog JSON

**Files:**
- Create: `public/data/missions.json`

- [ ] **Step 1: Create the tutorial mission catalog**

Create `public/data/missions.json` with the 9 tutorial missions. Each mission should have meaningful briefing text, appropriate objectives for the instrument it teaches, and correct `unlocks`/`chain` fields.

For missions where the instrument archive doesn't exist yet (APXS, MastCam tag), use simpler objective types that do work (e.g., `go-to` waypoints to find the right rock, then a `gather` objective).

```jsonc
{
  "version": 1,
  "missions": [
    {
      "id": "m01-triangulate",
      "name": "Triangulate Position",
      "patron": null,
      "description": "Navigate to three survey markers to establish your position.",
      "briefing": "Rover, we're receiving your signal but need to confirm coordinates. We've placed three transponder markers in a triangle around your landing zone. Drive to each one so we can triangulate your exact position.",
      "reward": { "sp": 25 },
      "unlocks": [],
      "chain": "m02-rtg",
      "objectives": [
        { "id": "tri-1", "type": "go-to", "label": "Reach marker Alpha", "params": { "poiId": "tri-alpha" }, "sequential": false },
        { "id": "tri-2", "type": "go-to", "label": "Reach marker Beta", "params": { "poiId": "tri-beta" }, "sequential": false },
        { "id": "tri-3", "type": "go-to", "label": "Reach marker Gamma", "params": { "poiId": "tri-gamma" }, "sequential": false }
      ]
    },
    {
      "id": "m02-rtg",
      "name": "Power Systems Check",
      "patron": null,
      "description": "Learn to manage your RTG power source.",
      "briefing": "Good work on triangulation. Your RTG is online — it's your lifeline out here. Open the RTG panel and monitor your power levels. We need you to activate RTG overdrive once to confirm the system is operational.",
      "reward": { "sp": 20 },
      "unlocks": ["rtg"],
      "chain": "m03-mastcam",
      "objectives": [
        { "id": "rtg-1", "type": "go-to", "label": "Drive to the power test site", "params": { "poiId": "rtg-test" }, "sequential": false }
      ]
    },
    {
      "id": "m03-mastcam",
      "name": "MastCam Survey",
      "patron": null,
      "description": "Use the MastCam to survey and tag rocks in the area.",
      "briefing": "Your MastCam is now online. This is your eyes on Mars — use it to survey the terrain. We need you to photograph and tag some rocks so we can plan your science targets.",
      "reward": { "sp": 30 },
      "unlocks": ["mastcam"],
      "chain": "m04-chemcam",
      "objectives": [
        { "id": "mcam-1", "type": "go-to", "label": "Navigate to survey area", "params": { "poiId": "survey-site" }, "sequential": true },
        { "id": "mcam-2", "type": "go-to", "label": "Photograph the outcrop", "params": { "poiId": "survey-outcrop" }, "sequential": true }
      ]
    },
    {
      "id": "m04-chemcam",
      "name": "ChemCam Analysis",
      "patron": null,
      "description": "Fire the ChemCam laser at a rock target for spectral analysis.",
      "briefing": "Excellent survey work. We're bringing your ChemCam online — the laser spectrometer. Find a rock and fire the laser to get a spectral readout. This is how we identify minerals from a distance.",
      "reward": { "sp": 40 },
      "unlocks": ["chemcam"],
      "chain": "m05-drill",
      "objectives": [
        { "id": "chem-1", "type": "chemcam", "label": "Perform ChemCam analysis on any rock", "params": { "rockType": "any" }, "sequential": false }
      ]
    },
    {
      "id": "m05-drill",
      "name": "First Core Sample",
      "patron": null,
      "description": "Use the drill to collect your first rock sample.",
      "briefing": "Time to get hands-on. The drill arm is ready. Find a suitable rock and extract a core sample. This will go into your inventory for later analysis in the SAM lab.",
      "reward": { "sp": 40 },
      "unlocks": ["drill"],
      "chain": "m06-apxs",
      "objectives": [
        { "id": "drill-1", "type": "gather", "label": "Collect a rock sample", "params": { "itemId": "any-rock", "quantity": 1 }, "sequential": false }
      ]
    },
    {
      "id": "m06-apxs",
      "name": "APXS Contact Science",
      "patron": null,
      "description": "Deploy the APXS sensor against a rock for elemental analysis.",
      "briefing": "The Alpha Particle X-Ray Spectrometer is your close-range chemistry lab. Press it against a rock to get a full elemental breakdown. This tells us exactly what Mars is made of.",
      "reward": { "sp": 40 },
      "unlocks": ["apxs"],
      "chain": "m07-dan",
      "objectives": [
        { "id": "apxs-1", "type": "apxs", "label": "Perform APXS analysis on any rock", "params": { "rockType": "any" }, "sequential": false }
      ]
    },
    {
      "id": "m07-dan",
      "name": "DAN Prospecting",
      "patron": null,
      "description": "Use the DAN neutron detector to search for subsurface water.",
      "briefing": "The Dynamic Albedo of Neutrons detector fires neutrons into the ground and listens for the echo. It can find water hidden beneath the surface. Start a DAN prospect and find a spot with water potential.",
      "reward": { "sp": 50 },
      "unlocks": ["dan"],
      "chain": "m08-sam",
      "objectives": [
        { "id": "dan-1", "type": "dan-prospect", "label": "Find a location with >20% water chance", "params": { "minWaterChance": 20 }, "sequential": false }
      ]
    },
    {
      "id": "m08-sam",
      "name": "SAM Laboratory",
      "patron": null,
      "description": "Run your first SAM experiment on a collected sample.",
      "briefing": "The Sample Analysis at Mars suite is your onboard laboratory. Load a sample and run pyrolysis — heat it up and see what volatiles it releases. This is how we search for organics.",
      "reward": { "sp": 60 },
      "unlocks": ["sam"],
      "chain": "m09-transmit",
      "objectives": [
        { "id": "sam-1", "type": "sam-experiment", "label": "Run a pyrolysis experiment", "params": { "mode": "pyrolysis" }, "sequential": false }
      ]
    },
    {
      "id": "m09-transmit",
      "name": "First Transmission",
      "patron": null,
      "description": "Transmit your science data back to Earth via the UHF antenna.",
      "briefing": "You've been collecting incredible data. Time to send it home. Queue up your science results and transmit them during the next orbital pass. Earth is waiting.",
      "reward": { "sp": 50 },
      "unlocks": ["uhf"],
      "chain": null,
      "objectives": [
        { "id": "tx-1", "type": "transmit", "label": "Transmit science data to Earth", "params": { "count": 1 }, "sequential": false }
      ]
    }
  ]
}
```

**Note:** The `poiId` values (`tri-alpha`, `tri-beta`, `tri-gamma`, `rtg-test`, `survey-site`, `survey-outcrop`) will need matching entries in `public/data/site-pois.json`. Add them with appropriate XZ coordinates for the pathfinder site. The `"any"` value for `rockType` in chemcam/drill objectives means the checker should treat `"any"` as a wildcard — update the `chemcam` and `gather` checkers to handle this.

- [ ] **Step 2: Update site-pois.json with mission POIs**

Add the mission waypoint POIs to `public/data/site-pois.json` under the pathfinder site:

```json
{
  "sites": {
    "pathfinder": [
      { "id": "ares-outcrop", "label": "Survey: layered outcrop", "x": 95, "z": -55, "color": "#5eb8ff" },
      { "id": "tri-alpha", "label": "Marker Alpha", "x": 30, "z": -20, "color": "#ffaa44" },
      { "id": "tri-beta", "label": "Marker Beta", "x": -25, "z": 35, "color": "#ffaa44" },
      { "id": "tri-gamma", "label": "Marker Gamma", "x": 40, "z": 50, "color": "#ffaa44" },
      { "id": "rtg-test", "label": "Power Test Site", "x": 15, "z": 10, "color": "#ff6644" },
      { "id": "survey-site", "label": "Survey Area", "x": 60, "z": -30, "color": "#5eb8ff" },
      { "id": "survey-outcrop", "label": "Outcrop", "x": 75, "z": -40, "color": "#5eb8ff" }
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add public/data/missions.json public/data/site-pois.json
git commit -m "feat(missions): add tutorial mission catalog (m01-m09) and mission POIs"
```

---

## Task 7: MessageDialog Component

**Files:**
- Create: `src/components/MessageDialog.vue`

- [ ] **Step 1: Create MessageDialog**

Create `src/components/MessageDialog.vue`. Follow the AchievementsDialog pattern (Teleport to body, science-fade transition, dark Mars theme):

```vue
<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="msg-overlay" @click.self="emit('close')">
        <div class="msg-dialog">
          <div class="msg-header">
            <span v-if="message?.from" class="msg-from">{{ message.from }}</span>
            <span class="msg-subject">{{ message?.subject }}</span>
            <button class="msg-close" @click="emit('close')">&times;</button>
          </div>
          <div class="msg-body">
            <p>{{ message?.body }}</p>
          </div>
          <div class="msg-footer">
            <template v-if="message?.type === 'mission'">
              <button class="msg-btn accept" @click="emit('acceptMission', message!.missionId!)">
                Accept Mission
              </button>
              <button class="msg-btn" @click="emit('close')">Maybe Later</button>
            </template>
            <template v-else>
              <button class="msg-btn" @click="emit('close')">Close</button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { LGAMessage } from '@/types/lgaMailbox'

defineProps<{
  open: boolean
  message: LGAMessage | null
}>()

const emit = defineEmits<{
  close: []
  acceptMission: [missionId: string]
}>()
</script>

<style scoped>
.msg-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.msg-dialog {
  width: 420px;
  max-height: 80vh;
  background: rgba(10, 6, 4, 0.96);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 8px;
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.15);
}
.msg-from {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(196, 117, 58, 0.7);
}
.msg-subject {
  flex: 1;
  font-family: var(--font-ui);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}
.msg-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}
.msg-close:hover { color: rgba(255, 255, 255, 0.8); }
.msg-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.7);
}
.msg-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid rgba(196, 117, 58, 0.15);
}
.msg-btn {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid rgba(196, 117, 58, 0.3);
  background: rgba(196, 117, 58, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}
.msg-btn:hover {
  background: rgba(196, 117, 58, 0.15);
  border-color: rgba(196, 117, 58, 0.5);
  color: rgba(255, 255, 255, 0.8);
}
.msg-btn.accept {
  background: rgba(196, 117, 58, 0.2);
  border-color: rgba(196, 117, 58, 0.5);
  color: rgba(232, 176, 96, 0.9);
}
.msg-btn.accept:hover {
  background: rgba(196, 117, 58, 0.3);
  border-color: rgba(196, 117, 58, 0.7);
}
</style>
```

- [ ] **Step 2: Verify it renders**

Run: `npm run dev`
Manually test by temporarily mounting the component in MartianSiteView with a test message.

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageDialog.vue
git commit -m "feat(missions): add MessageDialog component for expandable messages"
```

---

## Task 8: MissionTracker HUD Component

**Files:**
- Create: `src/components/MissionTracker.vue`

- [ ] **Step 1: Create MissionTracker**

Create `src/components/MissionTracker.vue` — persistent HUD overlay, top-right:

```vue
<template>
  <Transition name="tracker-fade">
    <div v-if="mission" class="mission-tracker">
      <div class="tracker-header">
        <span class="tracker-name">{{ mission.name }}</span>
        <button class="tracker-pin" title="Untrack" @click="emit('untrack')">&times;</button>
      </div>
      <ul class="tracker-objectives">
        <li
          v-for="(obj, i) in objectives"
          :key="obj.id"
          class="tracker-obj"
          :class="{ done: obj.done, dimmed: obj.dimmed }"
        >
          <span class="obj-check">{{ obj.done ? '\u2611' : '\u2610' }}</span>
          <span class="obj-label">{{ obj.label }}</span>
        </li>
      </ul>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MissionDef, MissionState } from '@/types/missions'

const props = defineProps<{
  missionDef: MissionDef | null
  missionState: MissionState | null
}>()

const emit = defineEmits<{ untrack: [] }>()

const mission = computed(() => props.missionDef)

const objectives = computed(() => {
  if (!props.missionDef || !props.missionState) return []
  let canProceed = true
  return props.missionDef.objectives.map((def, i) => {
    const stateObj = props.missionState!.objectives.find((o) => o.id === def.id)
    const done = stateObj?.done ?? false
    const dimmed = def.sequential && !canProceed
    if (def.sequential && !done) canProceed = false
    return { id: def.id, label: def.label, done, dimmed }
  })
})
</script>

<style scoped>
.mission-tracker {
  position: fixed;
  top: 56px;
  right: 16px;
  width: 240px;
  background: rgba(10, 6, 4, 0.85);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 6px;
  backdrop-filter: blur(8px);
  padding: 10px 12px;
  z-index: 35;
}
.tracker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.tracker-name {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(232, 176, 96, 0.9);
}
.tracker-pin {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
}
.tracker-pin:hover { color: rgba(255, 255, 255, 0.6); }
.tracker-objectives {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 100px;
  overflow-y: auto;
}
.tracker-obj {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0;
  font-family: var(--font-ui);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  transition: opacity 0.2s ease;
}
.tracker-obj.done { color: rgba(136, 204, 136, 0.7); }
.tracker-obj.dimmed { opacity: 0.35; }
.obj-check {
  flex-shrink: 0;
  font-size: 13px;
}

.tracker-fade-enter-active,
.tracker-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.tracker-fade-enter-from,
.tracker-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MissionTracker.vue
git commit -m "feat(missions): add MissionTracker HUD component"
```

---

## Task 9: MissionLogDialog Component

**Files:**
- Create: `src/components/MissionLogDialog.vue`

- [ ] **Step 1: Create MissionLogDialog**

Create `src/components/MissionLogDialog.vue` following the AchievementsDialog pattern:

```vue
<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="mlog-overlay" @click.self="emit('close')">
        <div class="mlog-dialog">
          <div class="mlog-header">
            <span class="mlog-title">MISSION LOG</span>
            <button class="mlog-close" @click="emit('close')">&times;</button>
          </div>
          <div class="mlog-body">
            <div v-if="activeMissions.length" class="mlog-section">
              <h3 class="mlog-section-title">Active</h3>
              <div
                v-for="ms in activeMissions"
                :key="ms.missionId"
                class="mlog-entry"
                :class="{ tracked: ms.missionId === trackedId }"
              >
                <div class="mlog-entry-header">
                  <span class="mlog-entry-name">{{ defFor(ms.missionId)?.name }}</span>
                  <button
                    class="mlog-track-btn"
                    :class="{ active: ms.missionId === trackedId }"
                    @click="emit('track', ms.missionId)"
                  >
                    {{ ms.missionId === trackedId ? 'TRACKING' : 'TRACK' }}
                  </button>
                </div>
                <p class="mlog-entry-desc">{{ defFor(ms.missionId)?.description }}</p>
                <ul class="mlog-objectives">
                  <li
                    v-for="obj in objectivesFor(ms)"
                    :key="obj.id"
                    :class="{ done: obj.done }"
                  >
                    {{ obj.done ? '\u2611' : '\u2610' }} {{ obj.label }}
                  </li>
                </ul>
              </div>
            </div>
            <div v-if="completedMissions.length" class="mlog-section">
              <h3 class="mlog-section-title">Completed</h3>
              <div
                v-for="ms in completedMissions"
                :key="ms.missionId"
                class="mlog-entry completed"
              >
                <span class="mlog-entry-name">{{ defFor(ms.missionId)?.name }}</span>
                <span class="mlog-sol">Sol {{ ms.completedAtSol }}</span>
              </div>
            </div>
            <div v-if="!activeMissions.length && !completedMissions.length" class="mlog-empty">
              No missions yet. Check your LGA mailbox.
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { MissionDef, MissionState } from '@/types/missions'

const props = defineProps<{
  open: boolean
  activeMissions: MissionState[]
  completedMissions: MissionState[]
  catalog: MissionDef[]
  trackedId: string | null
}>()

const emit = defineEmits<{
  close: []
  track: [missionId: string]
}>()

function defFor(missionId: string): MissionDef | undefined {
  return props.catalog.find((d) => d.id === missionId)
}

function objectivesFor(ms: MissionState) {
  const def = defFor(ms.missionId)
  if (!def) return []
  return def.objectives.map((o) => {
    const state = ms.objectives.find((s) => s.id === o.id)
    return { id: o.id, label: o.label, done: state?.done ?? false }
  })
}
</script>

<style scoped>
.mlog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.mlog-dialog {
  width: 480px;
  max-height: 78vh;
  background: rgba(10, 6, 4, 0.96);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 8px;
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mlog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.15);
}
.mlog-title {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: rgba(232, 176, 96, 0.9);
}
.mlog-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  cursor: pointer;
}
.mlog-close:hover { color: rgba(255, 255, 255, 0.8); }
.mlog-body {
  padding: 12px 16px;
  overflow-y: auto;
  flex: 1;
}
.mlog-section { margin-bottom: 16px; }
.mlog-section-title {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 117, 58, 0.6);
  margin: 0 0 8px;
}
.mlog-entry {
  padding: 10px 12px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}
.mlog-entry.tracked {
  border-color: rgba(196, 117, 58, 0.3);
}
.mlog-entry.completed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.6;
}
.mlog-entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.mlog-entry-name {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}
.mlog-entry-desc {
  font-family: var(--font-ui);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 6px;
}
.mlog-sol {
  font-family: var(--font-instrument);
  font-size: 11px;
  color: rgba(196, 117, 58, 0.5);
}
.mlog-track-btn {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid rgba(196, 117, 58, 0.25);
  background: rgba(196, 117, 58, 0.05);
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
}
.mlog-track-btn.active {
  background: rgba(196, 117, 58, 0.15);
  border-color: rgba(196, 117, 58, 0.5);
  color: rgba(232, 176, 96, 0.8);
}
.mlog-objectives {
  list-style: none;
  margin: 0;
  padding: 0;
}
.mlog-objectives li {
  font-family: var(--font-ui);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 1px 0;
}
.mlog-objectives li.done {
  color: rgba(136, 204, 136, 0.6);
}
.mlog-empty {
  font-family: var(--font-ui);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  padding: 32px 0;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MissionLogDialog.vue
git commit -m "feat(missions): add MissionLogDialog panel component"
```

---

## Task 10: InstrumentToolbar Gating

**Files:**
- Modify: `src/components/InstrumentToolbar.vue`

- [ ] **Step 1: Add unlockedIds prop and filter instruments**

Modify `InstrumentToolbar.vue`:

Add a new prop:
```typescript
const props = defineProps<{
  activeSlot: number | null
  inventoryOpen?: boolean
  chemCamUnread?: number
  danScanning?: boolean
  samUnread?: number
  unlockedIds?: string[] | null  // null = show all (sandbox mode)
}>()
```

Add a computed that filters the instruments array:

```typescript
import { computed } from 'vue'

const ALWAYS_AVAILABLE = ['rems', 'rad']

const visibleInstruments = computed(() => {
  if (!props.unlockedIds) return instruments
  const allowed = new Set([...props.unlockedIds, ...ALWAYS_AVAILABLE])
  return instruments.filter((inst) => allowed.has(inst.id))
})
```

In the template, change `v-for="inst in instruments"` to `v-for="inst in visibleInstruments"`.

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/InstrumentToolbar.vue
git commit -m "feat(missions): gate instrument toolbar via unlockedIds prop"
```

---

## Task 11: LGA Mailbox — Clickable Messages

**Files:**
- Modify: `src/components/LGAMailbox.vue`

- [ ] **Step 1: Make messages clickable**

Modify `LGAMailbox.vue` to emit an event when a message row is clicked:

Add emit:
```typescript
const emit = defineEmits<{
  markRead: [messageId: string]
  openMessage: [message: LGAMessage]
}>()
```

In the template, on each message row element, add:
```html
@click="emit('openMessage', msg)"
```

Add a cursor pointer style to the message rows and a small mission icon badge for mission-type messages:

```html
<span v-if="msg.type === 'mission'" class="msg-mission-badge">&#x25B6;</span>
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`
Click a message row — verify the event fires (wire up in MartianSiteView in Task 12).

- [ ] **Step 3: Commit**

```bash
git add src/components/LGAMailbox.vue
git commit -m "feat(lga): make mailbox messages clickable with openMessage emit"
```

---

## Task 12: Wire Everything in MartianSiteView

**Files:**
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/views/MarsSiteViewController.ts`

This is the integration task. It connects all the pieces.

- [ ] **Step 1: Import mission composable and components**

In `MartianSiteView.vue`, add imports:

```typescript
import { useMissions } from '@/composables/useMissions'
import MessageDialog from '@/components/MessageDialog.vue'
import MissionTracker from '@/components/MissionTracker.vue'
import MissionLogDialog from '@/components/MissionLogDialog.vue'
import type { LGAMessage } from '@/types/lgaMailbox'
import type { MissionCatalog } from '@/types/missions'
```

Set up state:

```typescript
const {
  catalog, activeMissions, completedMissions, unlockedInstruments,
  trackedMissionId, loadCatalog, getMissionDef, accept,
  completeObjective, completeMission, allObjectivesDone, setTracked,
} = useMissions()

const messageDialogOpen = ref(false)
const messageDialogMessage = ref<LGAMessage | null>(null)
const missionLogOpen = ref(false)
```

- [ ] **Step 2: Load mission catalog on mount**

In the setup/onMounted, fetch and load the catalog:

```typescript
fetch('/data/missions.json')
  .then((r) => r.json())
  .then((data: MissionCatalog) => loadCatalog(data))
```

- [ ] **Step 3: Add mission log button to hud-actions**

In the template's `hud-actions` div, before the achievements button, add:

```html
<button
  v-if="!deploying && !descending"
  class="hud-btn"
  @click="missionLogOpen = true"
>
  MISSIONS
</button>
```

- [ ] **Step 4: Add MissionTracker, MissionLogDialog, and MessageDialog to template**

Add to the template:

```html
<MissionTracker
  :mission-def="trackedMissionId ? getMissionDef(trackedMissionId) ?? null : null"
  :mission-state="trackedMissionId ? activeMissions.find(m => m.missionId === trackedMissionId) ?? null : null"
  @untrack="setTracked(null)"
/>

<MissionLogDialog
  :open="missionLogOpen"
  :active-missions="activeMissions"
  :completed-missions="completedMissions"
  :catalog="catalog"
  :tracked-id="trackedMissionId"
  @close="missionLogOpen = false"
  @track="setTracked($event)"
/>

<MessageDialog
  :open="messageDialogOpen"
  :message="messageDialogMessage"
  @close="messageDialogOpen = false"
  @accept-mission="handleAcceptMission"
/>
```

- [ ] **Step 5: Wire up message dialog opening from LGA mailbox**

Handle the `openMessage` event from LGAMailbox:

```typescript
function handleOpenMessage(msg: LGAMessage) {
  messageDialogMessage.value = msg
  messageDialogOpen.value = true
  // Mark as read
  const { markRead } = useLGAMailbox()
  markRead(msg.id)
}

function handleAcceptMission(missionId: string) {
  accept(missionId, currentSol.value)
  messageDialogOpen.value = false
  // Register go-to POIs
  const def = getMissionDef(missionId)
  if (def) {
    for (const obj of def.objectives) {
      if (obj.type === 'go-to' && obj.params.poiId) {
        // POIs should already be in site-pois.json for tutorial missions
        // For dynamic missions, would call upsertPoi here
      }
    }
  }
}
```

- [ ] **Step 6: Pass unlockedIds to InstrumentToolbar**

Find where `<InstrumentToolbar>` is rendered and add the prop:

```html
<InstrumentToolbar
  ...existing-props...
  :unlocked-ids="playerProfile.sandbox ? null : unlockedInstruments"
/>
```

- [ ] **Step 7: Add objective checking to tick loop**

In `MarsSiteViewController.ts`, in the tick/animate function (around line 779, after sol/time sync), add objective checking:

```typescript
// Check mission objectives each tick
if (roverReady) {
  const { activeMissions, completeObjective, allObjectivesDone, completeMission, getMissionDef } = useMissions()
  const { pois } = useSiteMissionPois()
  const ctx = { roverX: roverWorldX.value, roverZ: roverWorldZ.value, pois: pois.value }

  for (const ms of activeMissions.value) {
    const def = getMissionDef(ms.missionId)
    if (!def) continue

    let canProceed = true
    for (const objDef of def.objectives) {
      const objState = ms.objectives.find((o) => o.id === objDef.id)
      if (!objState || objState.done) continue
      // Skip blocked sequential objectives but keep checking non-sequential ones
      if (objDef.sequential && !canProceed) continue

      if (checkObjective({ type: objDef.type, params: objDef.params as Record<string, unknown> }, ctx)) {
        completeObjective(ms.missionId, objDef.id)
      } else if (objDef.sequential) {
        canProceed = false
      }
    }

    if (allObjectivesDone(ms.missionId)) {
      completeMission(ms.missionId, marsSol)
      // Award SP — use awardSurvival which accepts arbitrary baseSp + label
      // (award() is instrument-specific with idempotency keyed on rockId)
      if (def.reward.sp) {
        const { awardSurvival } = useSciencePoints()
        awardSurvival(`Mission: ${def.name}`, def.reward.sp)
      }
      // Deliver chained mission after short delay
      if (def.chain) {
        const chainDef = getMissionDef(def.chain)
        if (chainDef) {
          setTimeout(() => {
            const { pushMessage } = useLGAMailbox()
            pushMessage({
              direction: 'received',
              sol: marsSol,
              timeOfDay: marsTimeOfDay,
              subject: `New Mission: ${chainDef.name}`,
              body: chainDef.briefing,
              type: 'mission',
              from: 'Mission Control',
              missionId: chainDef.id,
            })
          }, 3000)
        }
      }
    }
  }
}
```

Import `checkObjective` from `@/composables/useObjectiveTrackers` and other needed composables at the top of the file.

- [ ] **Step 8: First-launch LGA auto-open**

Add logic to detect first launch (no missions in history, Guided mode) and auto-open the LGA mailbox with the first mission:

```typescript
// On mount, after catalog loads, deliver m01 if no missions exist
function deliverFirstMission() {
  const { activeMissions, completedMissions } = useMissions()
  if (activeMissions.value.length === 0 && completedMissions.value.length === 0) {
    const firstMission = catalog.value.find((m) => m.id === 'm01-triangulate')
    if (firstMission) {
      const { pushMessage } = useLGAMailbox()
      pushMessage({
        direction: 'received',
        sol: 1,
        timeOfDay: 0.25,
        subject: `New Mission: ${firstMission.name}`,
        body: firstMission.briefing,
        type: 'mission',
        from: 'Mission Control',
        missionId: firstMission.id,
      })
      // Auto-open LGA mailbox
      // (Set the relevant ref that controls LGA panel visibility)
    }
  }
}
```

Call `deliverFirstMission()` after the catalog finishes loading.

- [ ] **Step 9: Run type check and dev server**

Run: `npx vue-tsc --noEmit`
Run: `npm run dev`
Test the full flow: first launch -> LGA opens -> message arrives -> accept -> tracker shows -> drive to waypoints -> mission completes

- [ ] **Step 10: Commit**

```bash
git add src/views/MartianSiteView.vue src/views/MarsSiteViewController.ts
git commit -m "feat(missions): wire mission system into site view — tracker, log, objective checking, toolbar gating"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual playthrough test**

Run: `npm run dev`

Verify the full tutorial flow:
1. Game starts -> LGA highlighted, mailbox opens, m01 message arrives
2. Open message -> MessageDialog shows briefing -> Accept Mission
3. MissionTracker appears top-right with 3 waypoint objectives
4. Toolbar is empty (Guided mode)
5. Drive to all 3 waypoints -> objectives check off
6. Mission completes -> SP awarded -> m02 message arrives
7. Accept m02 -> RTG appears in toolbar
8. Open Mission Log -> shows active + completed missions
9. Track button works in Mission Log

- [ ] **Step 4: Test sandbox mode**

Set `sandbox: true` in player profile. Verify all instruments visible from start and missions still work.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(missions): complete mission system with tutorial progression"
```
