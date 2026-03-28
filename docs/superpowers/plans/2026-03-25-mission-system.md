# Mission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a data-driven mission system that serves as tutorial/progression spine, delivering missions via LGA mailbox, tracking objectives, and unlocking instruments progressively.

**Architecture:** Three-layer design — (1) LGA mailbox upgrade for message types and push delivery, (2) mission engine composable that manages lifecycle and persistence, (3) objective resolver registry with per-type checkers. UI adds MessageDialog, MissionLogDialog, MissionTracker HUD, and upgrades LGAMailbox + InstrumentToolbar for clickability and gating.

**Tech Stack:** Vue 3, TypeScript, localStorage persistence, existing composable singleton pattern.

**Spec:** `docs/superpowers/specs/2026-03-24-mission-system-design.md`

---

### Task 1: Mission Type Definitions

**Files:**
- Create: `src/types/missions.ts`
- Test: `src/types/__tests__/missions.test.ts`

- [ ] **Step 1: Write type validation test**

```typescript
// src/types/__tests__/missions.test.ts
import { describe, it, expect } from 'vitest'
import type {
  MissionDef,
  ObjectiveDef,
  MissionReward,
  MissionState,
  ObjectiveType,
} from '../missions'

describe('Mission types', () => {
  it('MissionDef shape is valid', () => {
    const def: MissionDef = {
      id: 'm01-triangulate',
      name: 'Triangulate Position',
      patron: null,
      description: 'Navigate to three survey markers.',
      briefing: 'Rover, we need to confirm coordinates.',
      reward: { sp: 25 },
      unlocks: [],
      chain: 'm02-rtg',
      objectives: [
        {
          id: 'tri-1',
          type: 'go-to',
          label: 'Reach marker Alpha',
          params: { poiId: 'tri-alpha' },
          sequential: false,
        },
      ],
    }
    expect(def.id).toBe('m01-triangulate')
    expect(def.objectives[0].type).toBe('go-to')
  })

  it('MissionState shape is valid', () => {
    const state: MissionState = {
      missionId: 'm01-triangulate',
      status: 'active',
      acceptedAtSol: 1,
      objectives: [{ id: 'tri-1', done: false }],
    }
    expect(state.status).toBe('active')
    expect(state.objectives[0].done).toBe(false)
  })

  it('MissionState completed shape includes completedAtSol', () => {
    const state: MissionState = {
      missionId: 'm01-triangulate',
      status: 'completed',
      acceptedAtSol: 1,
      completedAtSol: 3,
      objectives: [{ id: 'tri-1', done: true }],
    }
    expect(state.completedAtSol).toBe(3)
  })

  it('MissionReward supports sp and items', () => {
    const reward: MissionReward = {
      sp: 50,
      items: [{ id: 'welding-wire', quantity: 2 }],
    }
    expect(reward.sp).toBe(50)
    expect(reward.items![0].quantity).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/__tests__/missions.test.ts`
Expected: FAIL — cannot resolve `'../missions'`

- [ ] **Step 3: Write the type definitions**

```typescript
// src/types/missions.ts

export type ObjectiveType =
  | 'go-to'
  | 'gather'
  | 'sam-experiment'
  | 'apxs'
  | 'mastcam-tag'
  | 'chemcam'
  | 'dan-prospect'
  | 'transmit'

export interface ObjectiveDef {
  id: string
  type: ObjectiveType
  label: string
  params: Record<string, any>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/__tests__/missions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/missions.ts src/types/__tests__/missions.test.ts
git commit -m "feat(missions): add mission type definitions"
```

---

### Task 2: Mission Data File

**Files:**
- Create: `public/data/missions.json`
- Test: `src/types/__tests__/missionsData.test.ts`

- [ ] **Step 1: Write data validation test**

This test loads the JSON and validates it against the type contracts — checking required fields, valid objective types, chain references, and no duplicate IDs.

```typescript
// src/types/__tests__/missionsData.test.ts
import { describe, it, expect } from 'vitest'
import type { MissionCatalog, ObjectiveType } from '../missions'
import catalogJson from '../../../public/data/missions.json'

const VALID_OBJECTIVE_TYPES: ObjectiveType[] = [
  'go-to', 'gather', 'sam-experiment', 'apxs',
  'mastcam-tag', 'chemcam', 'dan-prospect', 'transmit',
]

describe('missions.json', () => {
  const catalog = catalogJson as MissionCatalog

  it('has version 1', () => {
    expect(catalog.version).toBe(1)
  })

  it('has at least 9 tutorial missions', () => {
    expect(catalog.missions.length).toBeGreaterThanOrEqual(9)
  })

  it('every mission has required fields', () => {
    for (const m of catalog.missions) {
      expect(m.id).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.briefing).toBeTruthy()
      expect(m.objectives.length).toBeGreaterThan(0)
    }
  })

  it('no duplicate mission IDs', () => {
    const ids = catalog.missions.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no duplicate objective IDs within a mission', () => {
    for (const m of catalog.missions) {
      const ids = m.objectives.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('all objective types are valid', () => {
    for (const m of catalog.missions) {
      for (const o of m.objectives) {
        expect(VALID_OBJECTIVE_TYPES).toContain(o.type)
      }
    }
  })

  it('chain references point to existing missions or null', () => {
    const ids = new Set(catalog.missions.map((m) => m.id))
    for (const m of catalog.missions) {
      if (m.chain !== null) {
        expect(ids.has(m.chain)).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/__tests__/missionsData.test.ts`
Expected: FAIL — cannot find `missions.json`

- [ ] **Step 3: Create the missions JSON**

Create `public/data/missions.json` with the full tutorial chain (m01 through m09). Reference the spec for the progression table:

| # | Mission ID | Name | Unlocks | Key Objective Types |
|---|-----------|------|---------|-------------------|
| m01 | m01-triangulate | Triangulate Position | *(nothing)* | go-to ×3 |
| m02 | m02-rtg | RTG Management | rtg | go-to + gather |
| m03 | m03-mastcam | MastCam Survey | mastcam | mastcam-tag ×3 |
| m04 | m04-chemcam | ChemCam Analysis | chemcam | chemcam ×1 |
| m05 | m05-drill | First Core Sample | drill | gather ×1 |
| m06 | m06-apxs | APXS Elemental Scan | apxs | apxs ×1 |
| m07 | m07-dan | DAN Prospecting | dan | dan-prospect ×1 |
| m08 | m08-sam | SAM Laboratory | sam | sam-experiment ×1 |
| m09 | m09-transmit | First Transmission | uhf | transmit ×1 |

```jsonc
{
  "version": 1,
  "missions": [
    {
      "id": "m01-triangulate",
      "name": "Triangulate Position",
      "patron": null,
      "description": "Navigate to three survey markers to establish your position on the Martian surface.",
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
      "name": "RTG Management",
      "patron": null,
      "description": "Learn to manage your radioisotope thermoelectric generator — your primary power source on Mars.",
      "briefing": "Good news — triangulation confirms your position. Now let's get your power systems online. Your RTG is your lifeline out here. Head to the supply cache we dropped nearby and retrieve the calibration rods, then activate the RTG panel to run a startup sequence.",
      "reward": { "sp": 30 },
      "unlocks": ["rtg"],
      "chain": "m03-mastcam",
      "objectives": [
        { "id": "rtg-1", "type": "go-to", "label": "Reach supply cache", "params": { "poiId": "supply-cache-01" }, "sequential": true },
        { "id": "rtg-2", "type": "gather", "label": "Collect calibration rods", "params": { "itemId": "calibration-rod", "quantity": 1 }, "sequential": true }
      ]
    },
    {
      "id": "m03-mastcam",
      "name": "MastCam Survey",
      "patron": null,
      "description": "Use the MastCam to photograph and classify rocks in your vicinity.",
      "briefing": "Your MastCam is now online. The science team needs a visual survey of your landing area. Use MastCam to photograph and tag at least three different rock formations. This will help us plan your traverse route.",
      "reward": { "sp": 35 },
      "unlocks": ["mastcam"],
      "chain": "m04-chemcam",
      "objectives": [
        { "id": "mc-1", "type": "mastcam-tag", "label": "Photograph a basalt formation", "params": { "rockType": "basalt" }, "sequential": false },
        { "id": "mc-2", "type": "mastcam-tag", "label": "Photograph a mudstone outcrop", "params": { "rockType": "mudstone" }, "sequential": false },
        { "id": "mc-3", "type": "mastcam-tag", "label": "Photograph a sandstone layer", "params": { "rockType": "sandstone" }, "sequential": false }
      ]
    },
    {
      "id": "m04-chemcam",
      "name": "ChemCam Analysis",
      "patron": null,
      "description": "Fire the ChemCam laser at a rock to perform LIBS spectroscopy.",
      "briefing": "MastCam survey looks great. Time to bring the big gun online — literally. Your ChemCam fires a laser that vaporizes rock, and we analyze the plasma spectrum remotely. Find a rock and give it a zap.",
      "reward": { "sp": 40 },
      "unlocks": ["chemcam"],
      "chain": "m05-drill",
      "objectives": [
        { "id": "cc-1", "type": "chemcam", "label": "Perform a LIBS analysis on any rock", "params": { "rockType": "any" }, "sequential": false }
      ]
    },
    {
      "id": "m05-drill",
      "name": "First Core Sample",
      "patron": null,
      "description": "Drill into a rock and collect your first core sample.",
      "briefing": "Spectroscopy can only tell us so much from the surface. We need to look inside. Use the drill to extract a core sample from any rock. The sample will go into your inventory for later analysis.",
      "reward": { "sp": 40 },
      "unlocks": ["drill"],
      "chain": "m06-apxs",
      "objectives": [
        { "id": "dr-1", "type": "gather", "label": "Collect a rock sample", "params": { "itemId": "rock-sample", "quantity": 1 }, "sequential": false }
      ]
    },
    {
      "id": "m06-apxs",
      "name": "APXS Elemental Scan",
      "patron": null,
      "description": "Deploy the APXS sensor against a rock for elemental composition analysis.",
      "briefing": "Now that you can drill, let's complement that with elemental analysis. The Alpha Particle X-Ray Spectrometer gives us a detailed chemical fingerprint. Place it against any rock and run a scan.",
      "reward": { "sp": 45 },
      "unlocks": ["apxs"],
      "chain": "m07-dan",
      "objectives": [
        { "id": "apxs-1", "type": "apxs", "label": "Complete an APXS analysis", "params": { "rockType": "any" }, "sequential": false }
      ]
    },
    {
      "id": "m07-dan",
      "name": "DAN Prospecting",
      "patron": null,
      "description": "Use the Dynamic Albedo of Neutrons instrument to prospect for subsurface water ice.",
      "briefing": "Water is the key to everything out here — fuel, life support, future missions. Your DAN instrument fires neutrons into the ground and measures the bounce-back to detect hydrogen. Run a prospect sweep.",
      "reward": { "sp": 45 },
      "unlocks": ["dan"],
      "chain": "m08-sam",
      "objectives": [
        { "id": "dan-1", "type": "dan-prospect", "label": "Find a location with water ice signal", "params": { "minWaterChance": 0.3 }, "sequential": false }
      ]
    },
    {
      "id": "m08-sam",
      "name": "SAM Laboratory",
      "patron": null,
      "description": "Run a sample through the SAM instrument suite for detailed chemical analysis.",
      "briefing": "You've collected samples, you've scanned them — now let's cook them. SAM is your onboard laboratory. Load a sample and run an experiment. Pick your analysis mode carefully — each one reveals different secrets.",
      "reward": { "sp": 50 },
      "unlocks": ["sam"],
      "chain": "m09-transmit",
      "objectives": [
        { "id": "sam-1", "type": "sam-experiment", "label": "Complete a SAM experiment", "params": { "mode": "any" }, "sequential": false }
      ]
    },
    {
      "id": "m09-transmit",
      "name": "First Transmission",
      "patron": null,
      "description": "Transmit your collected science data back to Earth via the UHF antenna during an orbital pass.",
      "briefing": "Outstanding work, Rover. You've built up quite a dataset. But science isn't science until it's shared. Queue your findings for transmission and beam them home via UHF during the next orbital pass. Earth is waiting.",
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/__tests__/missionsData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/data/missions.json src/types/__tests__/missionsData.test.ts
git commit -m "feat(missions): add tutorial mission definitions (m01-m09)"
```

---

### Task 3: LGA Mailbox Upgrade

**Files:**
- Modify: `src/types/lgaMailbox.ts`
- Modify: `src/composables/useLGAMailbox.ts`
- Test: `src/composables/__tests__/useLGAMailbox.test.ts` (extend existing if present, else create)

- [ ] **Step 1: Write test for pushMessage and new fields**

```typescript
// src/composables/__tests__/useLGAMailbox.mission.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useLGAMailbox, resetForTests } from '../useLGAMailbox'

describe('useLGAMailbox mission extensions', () => {
  beforeEach(() => {
    localStorage.clear()
    resetForTests()
  })

  it('pushMessage adds a message with generated id and read=false', () => {
    const { pushMessage, messages } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'New Mission',
      body: 'Test body',
      type: 'mission',
      from: 'Mission Control',
      missionId: 'm01-triangulate',
    })
    expect(messages.value.length).toBe(1)
    const msg = messages.value[0]
    expect(msg.id).toBeTruthy()
    expect(msg.read).toBe(false)
    expect(msg.type).toBe('mission')
    expect(msg.from).toBe('Mission Control')
    expect(msg.missionId).toBe('m01-triangulate')
  })

  it('pushMessage persists to localStorage', () => {
    const { pushMessage } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 2,
      timeOfDay: 0.3,
      subject: 'Alert',
      body: 'Storm warning',
      type: 'alert',
      from: 'REMS',
    })
    const raw = localStorage.getItem('mars-lga-mailbox-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.length).toBe(1)
    expect(parsed[0].type).toBe('alert')
  })

  it('messages without type default to undefined (handled by consumer)', () => {
    const { pushMessage, messages } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'Info msg',
      body: 'Just info',
    })
    expect(messages.value[0].type).toBeUndefined()
  })

  it('unreadCount includes pushed messages', () => {
    const { pushMessage, unreadCount } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'Test',
      body: 'Body',
      type: 'mission',
      missionId: 'm01-triangulate',
    })
    expect(unreadCount.value).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useLGAMailbox.mission.test.ts`
Expected: FAIL — `pushMessage` is not exported

- [ ] **Step 3: Extend LGAMessage interface**

Add optional fields to `src/types/lgaMailbox.ts`:

```typescript
// Add these optional fields to the existing LGAMessage interface:
  type?: 'info' | 'mission' | 'alert'
  from?: string
  missionId?: string
```

- [ ] **Step 4: Add pushMessage to useLGAMailbox**

Add to `src/composables/useLGAMailbox.ts`:

```typescript
function pushMessage(msg: Omit<LGAMessage, 'id' | 'read'>): void {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const next = [...messages.value, { ...msg, id, read: false }]
  messages.value = next
  saveToStorage(next)
}
```

Add `pushMessage` to the returned object from the composable.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/useLGAMailbox.mission.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/lgaMailbox.ts src/composables/useLGAMailbox.ts src/composables/__tests__/useLGAMailbox.mission.test.ts
git commit -m "feat(lga): add pushMessage method and mission/alert message types"
```

---

### Task 4: Player Profile Sandbox Flag

**Files:**
- Modify: `src/composables/usePlayerProfile.ts`
- Test: `src/composables/__tests__/usePlayerProfile.sandbox.test.ts`

- [ ] **Step 1: Write test for sandbox flag**

```typescript
// src/composables/__tests__/usePlayerProfile.sandbox.test.ts
import { describe, it, expect } from 'vitest'
import { usePlayerProfile } from '../usePlayerProfile'

describe('PlayerProfile sandbox flag', () => {
  it('sandbox defaults to true', () => {
    const { profile } = usePlayerProfile()
    expect(profile.sandbox).toBe(true)
  })

  it('sandbox can be set to false', () => {
    const { profile } = usePlayerProfile()
    profile.sandbox = false
    expect(profile.sandbox).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/usePlayerProfile.sandbox.test.ts`
Expected: FAIL — `sandbox` property does not exist

- [ ] **Step 3: Add sandbox to PlayerProfile**

In `src/composables/usePlayerProfile.ts`, add `sandbox: boolean` to the `PlayerProfile` interface (or type), defaulting to `true` in the reactive initialization.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/usePlayerProfile.sandbox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePlayerProfile.ts src/composables/__tests__/usePlayerProfile.sandbox.test.ts
git commit -m "feat(profile): add sandbox flag (defaults true until character creation exists)"
```

---

### Task 5: Objective Trackers

**Files:**
- Create: `src/composables/useObjectiveTrackers.ts`
- Test: `src/composables/__tests__/useObjectiveTrackers.test.ts`

- [ ] **Step 1: Write tests for objective checkers**

```typescript
// src/composables/__tests__/useObjectiveTrackers.test.ts
import { describe, it, expect } from 'vitest'
import { checkObjective } from '../useObjectiveTrackers'
import type { SiteMissionPoi } from '../useSiteMissionPois'

describe('useObjectiveTrackers', () => {
  describe('go-to', () => {
    const pois: SiteMissionPoi[] = [
      { id: 'tri-alpha', label: 'Alpha', x: 100, z: 200 },
    ]

    it('returns true when rover is within 5 units of POI', () => {
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 103, roverZ: 200, pois,
      })
      expect(result).toBe(true)
    })

    it('returns false when rover is far from POI', () => {
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 0, roverZ: 0, pois,
      })
      expect(result).toBe(false)
    })

    it('returns false for unknown POI', () => {
      const result = checkObjective('go-to', { poiId: 'unknown' }, {
        roverX: 100, roverZ: 200, pois,
      })
      expect(result).toBe(false)
    })
  })

  describe('unknown type', () => {
    it('returns false for unregistered objective type', () => {
      const result = checkObjective('unknown-type' as any, {}, {
        roverX: 0, roverZ: 0, pois: [],
      })
      expect(result).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useObjectiveTrackers.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Implement objective tracker registry**

```typescript
// src/composables/useObjectiveTrackers.ts
import type { SiteMissionPoi } from './useSiteMissionPois'
import type { ObjectiveType } from '@/types/missions'

export interface CheckerContext {
  roverX: number
  roverZ: number
  pois: SiteMissionPoi[]
}

type ObjectiveChecker = (params: Record<string, any>, ctx: CheckerContext) => boolean

function poiDistance(ctx: CheckerContext, poiId: string): number {
  const poi = ctx.pois.find((p) => p.id === poiId)
  if (!poi) return Infinity
  const dx = ctx.roverX - poi.x
  const dz = ctx.roverZ - poi.z
  return Math.sqrt(dx * dx + dz * dz)
}

const checkers: Record<string, ObjectiveChecker> = {
  'go-to': (p, ctx) => poiDistance(ctx, p.poiId) < 5,
  'gather': (_p) => false,       // wired in Task 6
  'sam-experiment': (_p) => false, // wired in Task 6
  'apxs': (_p) => false,          // stub — useApxsArchive exists but objective checker needs spec
  'mastcam-tag': (_p) => false,    // stub — MastCam archive not yet exposed
  'chemcam': (_p) => false,        // wired in Task 6
  'dan-prospect': (_p) => false,   // wired in Task 6
  'transmit': (_p) => false,       // wired in Task 6
}

export function checkObjective(
  type: ObjectiveType | string,
  params: Record<string, any>,
  ctx: CheckerContext,
): boolean {
  const checker = checkers[type]
  if (!checker) return false
  return checker(params, ctx)
}

/**
 * Register or replace a checker for an objective type.
 * Used by useMissions to wire archive-based checkers at init.
 */
export function registerChecker(type: string, checker: ObjectiveChecker): void {
  checkers[type] = checker
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/useObjectiveTrackers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useObjectiveTrackers.ts src/composables/__tests__/useObjectiveTrackers.test.ts
git commit -m "feat(missions): add objective tracker registry with go-to checker"
```

---

### Task 6: Mission Engine Composable

**Files:**
- Create: `src/composables/useMissions.ts`
- Test: `src/composables/__tests__/useMissions.test.ts`

This is the largest task. The composable is a singleton that manages the full mission lifecycle.

- [ ] **Step 1: Write tests for core mission engine**

```typescript
// src/composables/__tests__/useMissions.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useMissions } from '../useMissions'

const mockMissions = {
  version: 1,
  missions: [
    {
      id: 'm01-test',
      name: 'Test Mission',
      patron: null,
      description: 'Test',
      briefing: 'Test briefing',
      reward: { sp: 25 },
      unlocks: ['mastcam'],
      chain: 'm02-test',
      objectives: [
        { id: 'obj-1', type: 'go-to', label: 'Go here', params: { poiId: 'poi-a' }, sequential: false },
        { id: 'obj-2', type: 'go-to', label: 'Go there', params: { poiId: 'poi-b' }, sequential: false },
      ],
    },
    {
      id: 'm02-test',
      name: 'Chained Mission',
      patron: null,
      description: 'Chained',
      briefing: 'Chained briefing',
      reward: { sp: 30 },
      unlocks: [],
      chain: null,
      objectives: [
        { id: 'obj-3', type: 'go-to', label: 'Final', params: { poiId: 'poi-c' }, sequential: false },
      ],
    },
  ],
}

describe('useMissions', () => {
  beforeEach(() => {
    localStorage.clear()
    const { resetForTests } = useMissions()
    resetForTests()
  })

  it('catalog loads mission definitions', () => {
    const { loadCatalog, catalog } = useMissions()
    loadCatalog(mockMissions)
    expect(catalog.value.length).toBe(2)
    expect(catalog.value[0].id).toBe('m01-test')
  })

  it('accept() creates active mission state', () => {
    const { loadCatalog, accept, activeMissions } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    expect(activeMissions.value.length).toBe(1)
    expect(activeMissions.value[0].missionId).toBe('m01-test')
    expect(activeMissions.value[0].status).toBe('active')
    expect(activeMissions.value[0].acceptedAtSol).toBe(1)
    expect(activeMissions.value[0].objectives).toEqual([
      { id: 'obj-1', done: false },
      { id: 'obj-2', done: false },
    ])
  })

  it('accept() auto-tracks when only one active mission', () => {
    const { loadCatalog, accept, trackedMissionId } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    expect(trackedMissionId.value).toBe('m01-test')
  })

  it('markObjectiveDone() marks a specific objective', () => {
    const { loadCatalog, accept, activeMissions, markObjectiveDone } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    markObjectiveDone('m01-test', 'obj-1')
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
    expect(activeMissions.value[0].objectives[1].done).toBe(false)
  })

  it('complete() moves mission to completed and records sol', () => {
    const { loadCatalog, accept, complete, completedMissions } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    complete('m01-test', 5)
    expect(completedMissions.value.length).toBe(1)
    expect(completedMissions.value[0].status).toBe('completed')
    expect(completedMissions.value[0].completedAtSol).toBe(5)
  })

  it('unlockedInstruments is derived from completed missions', () => {
    const { loadCatalog, accept, complete, unlockedInstruments } = useMissions()
    loadCatalog(mockMissions)
    expect(unlockedInstruments.value).toEqual([])
    accept('m01-test', 1)
    complete('m01-test', 5)
    expect(unlockedInstruments.value).toContain('mastcam')
  })

  it('persists state to localStorage', () => {
    const { loadCatalog, accept } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    const raw = localStorage.getItem('mars-missions-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.length).toBe(1)
  })

  it('sequential objective is skipped if prior not done', () => {
    const seqMissions = {
      version: 1,
      missions: [{
        id: 'seq-test',
        name: 'Sequential',
        patron: null,
        description: 'Test',
        briefing: 'Test',
        reward: { sp: 10 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 's1', type: 'go-to', label: 'First', params: { poiId: 'a' }, sequential: true },
          { id: 's2', type: 'go-to', label: 'Second', params: { poiId: 'b' }, sequential: true },
        ],
      }],
    }
    const { loadCatalog, accept, isObjectiveEligible } = useMissions()
    loadCatalog(seqMissions)
    accept('seq-test', 1)
    expect(isObjectiveEligible('seq-test', 's2')).toBe(false)
    expect(isObjectiveEligible('seq-test', 's1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Implement useMissions composable**

Create `src/composables/useMissions.ts`. Key design:

- Module-level singleton refs: `catalog`, `missionStates`, `trackedMissionId`
- `loadCatalog(data)` — accepts parsed JSON (for testability) or fetches from `/data/missions.json`
- `accept(missionId, currentSol)` — creates MissionState, auto-tracks
- `markObjectiveDone(missionId, objectiveId)` — marks objective, persists
- `complete(missionId, currentSol)` — moves to completed, persists
- `checkObjectives(roverX, roverZ, pois, currentSol)` — iterates active missions, calls `checkObjective()` from useObjectiveTrackers, marks done, auto-completes when all objectives done
- `isObjectiveEligible(missionId, objectiveId)` — sequential gating check
- `unlockedInstruments` — computed from completed missions' `unlocks`
- `activeMissions` / `completedMissions` — computed filters on `missionStates`
- Persistence: `mars-missions-v1` localStorage key
- `resetForTests()` — clears all state

Wire archive-based checkers via `registerChecker()` at init time, importing from the relevant archive composables:
- `gather` → check `useInventory` stacks using `INVENTORY_CATALOG[itemId].category === 'rock'` for `"rock-sample"`, else match by itemId+quantity
- `chemcam` → check `useChemCamArchive().spectra` for matching rockType (or any if `"any"`)
- `dan-prospect` → check `useDanArchive().prospects` for `waterConfirmed && signalStrength >= threshold` (note: ArchivedDANProspect uses `signalStrength: number` and `waterConfirmed: boolean`, NOT `waterChance`)
- `sam-experiment` → check `useSamArchive().discoveries` for matching `modeId` (note: ArchivedSAMDiscovery uses `modeId`, NOT `mode`)
- `transmit` → count total `transmitted` items across all archives
- `apxs` → check `useAPXSArchive().analyses` for matching rockType (or any if `"any"`)

```typescript
// src/composables/useMissions.ts
import { ref, computed, type Ref } from 'vue'
import type { MissionDef, MissionState, MissionCatalog, ObjectiveState } from '@/types/missions'
import { checkObjective, registerChecker, type CheckerContext } from './useObjectiveTrackers'
import type { SiteMissionPoi } from './useSiteMissionPois'

const STORAGE_KEY = 'mars-missions-v1'

const catalog: Ref<MissionDef[]> = ref([])
const missionStates: Ref<MissionState[]> = ref([])
const trackedMissionId: Ref<string | null> = ref(null)

function loadFromStorage(): MissionState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveToStorage(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(missionStates.value))
}

// Initialize from storage
missionStates.value = loadFromStorage()

const activeMissions = computed(() =>
  missionStates.value.filter((s) => s.status === 'active')
)

const completedMissions = computed(() =>
  missionStates.value.filter((s) => s.status === 'completed')
)

const unlockedInstruments = computed(() => {
  const ids: string[] = []
  for (const state of completedMissions.value) {
    const def = catalog.value.find((m) => m.id === state.missionId)
    if (def) ids.push(...def.unlocks)
  }
  return [...new Set(ids)]
})

function loadCatalog(data: MissionCatalog): void {
  catalog.value = data.missions
}

function accept(missionId: string, currentSol: number): void {
  if (missionStates.value.some((s) => s.missionId === missionId)) return
  const def = catalog.value.find((m) => m.id === missionId)
  if (!def) return
  const state: MissionState = {
    missionId,
    status: 'active',
    acceptedAtSol: currentSol,
    objectives: def.objectives.map((o) => ({ id: o.id, done: false })),
  }
  missionStates.value = [...missionStates.value, state]
  // Auto-track if only one active
  if (activeMissions.value.length === 1) {
    trackedMissionId.value = missionId
  }
  saveToStorage()
}

function markObjectiveDone(missionId: string, objectiveId: string): void {
  const state = missionStates.value.find((s) => s.missionId === missionId)
  if (!state) return
  const obj = state.objectives.find((o) => o.id === objectiveId)
  if (!obj || obj.done) return
  obj.done = true
  missionStates.value = [...missionStates.value] // trigger reactivity
  saveToStorage()
}

function complete(missionId: string, currentSol: number): void {
  const state = missionStates.value.find((s) => s.missionId === missionId)
  if (!state || state.status === 'completed') return
  const def = catalog.value.find((m) => m.id === missionId)
  state.status = 'completed'
  state.completedAtSol = currentSol
  missionStates.value = [...missionStates.value]
  if (trackedMissionId.value === missionId) {
    trackedMissionId.value = null
  }
  saveToStorage()

  // --- Award rewards ---
  if (def?.reward) {
    // SP reward — uses awardSurvival with 'mission' detail for flat SP awards
    if (def.reward.sp) {
      const { awardSurvival } = useSciencePoints()
      awardSurvival(`mission:${missionId}`, def.reward.sp)
    }
    // Item rewards
    if (def.reward.items?.length) {
      const inventory = useInventory()
      for (const item of def.reward.items) {
        inventory.addComponent(item.id, item.quantity)
      }
    }
  }

  // --- Deliver chained mission via LGA after short delay ---
  if (def?.chain) {
    const chainedDef = catalog.value.find((m) => m.id === def.chain)
    if (chainedDef) {
      const { pushMessage } = useLGAMailbox()
      setTimeout(() => {
        pushMessage({
          direction: 'received',
          sol: currentSol,
          timeOfDay: 0.5,
          subject: chainedDef.name,
          body: chainedDef.briefing,
          type: 'mission',
          from: chainedDef.patron ?? 'Mission Control',
          missionId: chainedDef.id,
        })
      }, 3000) // 3-second delay for "moments later" feel
    }
  }
}

function isObjectiveEligible(missionId: string, objectiveId: string): boolean {
  const state = missionStates.value.find((s) => s.missionId === missionId)
  const def = catalog.value.find((m) => m.id === missionId)
  if (!state || !def) return false
  const objDef = def.objectives.find((o) => o.id === objectiveId)
  if (!objDef) return false
  if (!objDef.sequential) return true
  // All prior objectives must be done
  for (const o of def.objectives) {
    if (o.id === objectiveId) break
    const oState = state.objectives.find((s) => s.id === o.id)
    if (!oState?.done) return false
  }
  return true
}

function getMissionDef(missionId: string): MissionDef | undefined {
  return catalog.value.find((m) => m.id === missionId)
}

function resetForTests(): void {
  catalog.value = []
  missionStates.value = []
  trackedMissionId.value = null
  localStorage.removeItem(STORAGE_KEY)
}

export function useMissions() {
  return {
    catalog,
    missionStates,
    trackedMissionId,
    activeMissions,
    completedMissions,
    unlockedInstruments,
    loadCatalog,
    accept,
    markObjectiveDone,
    complete,
    isObjectiveEligible,
    getMissionDef,
    resetForTests,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useMissions.ts src/composables/__tests__/useMissions.test.ts
git commit -m "feat(missions): add mission engine composable with lifecycle management"
```

- [ ] **Step 6: Wire archive-based checkers**

Add a `wireArchiveCheckers()` function to `useMissions.ts` that registers the real checkers using `registerChecker()`. This function should be called once during site initialization. Each checker imports its archive composable and reads the reactive ref:

```typescript
import { useInventory } from './useInventory'
import { useChemCamArchive } from './useChemCamArchive'
import { useDanArchive } from './useDanArchive'
import { useSamArchive } from './useSamArchive'
import { useAPXSArchive } from './useAPXSArchive'
import { useLGAMailbox } from './useLGAMailbox'
import { useSciencePoints } from './useSciencePoints'
import { INVENTORY_CATALOG } from '@/types/inventory'

function wireArchiveCheckers(): void {
  const inventory = useInventory()
  const chemcam = useChemCamArchive()
  const dan = useDanArchive()
  const sam = useSamArchive()
  const apxs = useAPXSArchive()

  registerChecker('gather', (p) => {
    if (p.itemId === 'rock-sample') {
      // Any rock-category item in inventory counts
      return inventory.stacks.value.some((s) => INVENTORY_CATALOG[s.itemId]?.category === 'rock')
    }
    const stack = inventory.stacks.value.find((s) => s.itemId === p.itemId)
    return (stack?.quantity ?? 0) >= (p.quantity ?? 1)
  })

  registerChecker('chemcam', (p) => {
    if (p.rockType === 'any') return chemcam.spectra.value.length > 0
    return chemcam.spectra.value.some((s) => s.rockType === p.rockType)
  })

  // ArchivedDANProspect uses signalStrength (0-1) and waterConfirmed (boolean)
  registerChecker('dan-prospect', (p) => {
    return dan.prospects.value.some(
      (d) => d.waterConfirmed && d.signalStrength >= (p.minWaterChance ?? 0)
    )
  })

  // ArchivedSAMDiscovery uses modeId (not mode)
  registerChecker('sam-experiment', (p) => {
    if (p.mode === 'any') return sam.discoveries.value.length > 0
    return sam.discoveries.value.some((d) => d.modeId === p.mode)
  })

  registerChecker('apxs', (p) => {
    if (p.rockType === 'any') return apxs.analyses.value.length > 0
    return apxs.analyses.value.some((a) => a.rockType === p.rockType)
  })

  registerChecker('transmit', (p) => {
    // Count total transmitted across all archives
    const txCount =
      chemcam.spectra.value.filter((s) => s.transmitted).length +
      dan.prospects.value.filter((d) => d.transmitted).length +
      sam.discoveries.value.filter((d) => d.transmitted).length +
      apxs.analyses.value.filter((a) => a.transmitted).length
    return txCount >= (p.count ?? 1)
  })
}
```

Add `wireArchiveCheckers` to the returned object. Also add a `checkAllObjectives(roverX, roverZ, pois, currentSol)` method that iterates active missions and auto-completes:

```typescript
function checkAllObjectives(
  roverX: number,
  roverZ: number,
  pois: SiteMissionPoi[],
  currentSol: number,
): void {
  const ctx: CheckerContext = { roverX, roverZ, pois }
  let changed = false
  for (const state of activeMissions.value) {
    const def = catalog.value.find((m) => m.id === state.missionId)
    if (!def) continue
    for (let i = 0; i < state.objectives.length; i++) {
      const objState = state.objectives[i]
      if (objState.done) continue
      const objDef = def.objectives[i]
      if (!isObjectiveEligible(state.missionId, objState.id)) continue
      if (checkObjective(objDef.type, objDef.params, ctx)) {
        objState.done = true
        changed = true
      }
    }
    // Auto-complete if all objectives done
    if (state.objectives.every((o) => o.done) && state.status === 'active') {
      complete(state.missionId, currentSol)
      changed = true
    }
  }
  if (changed) {
    missionStates.value = [...missionStates.value]
    saveToStorage()
  }
}
```

- [ ] **Step 7: Run all mission tests**

Run: `npx vitest run src/composables/__tests__/useMissions.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/composables/useMissions.ts
git commit -m "feat(missions): wire archive-based objective checkers and auto-completion"
```

---

### Task 7: MessageDialog Component

**Files:**
- Create: `src/components/MessageDialog.vue`

No unit test — this is a pure UI component. Tested via integration in Task 12.

- [ ] **Step 1: Create MessageDialog.vue**

Follow the existing `AchievementsDialog.vue` Teleport + Transition pattern.

```vue
<!-- src/components/MessageDialog.vue -->
<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="message" class="msg-overlay" @click.self="$emit('close')">
        <div class="msg-dialog" role="dialog" aria-modal="true">
          <div class="msg-head">
            <div class="msg-from" v-if="message.from">FROM: {{ message.from }}</div>
            <h2 class="msg-subject">{{ message.subject }}</h2>
            <button class="msg-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="msg-body">
            <p>{{ message.body }}</p>
          </div>
          <div class="msg-footer">
            <template v-if="message.type === 'mission' && !missionAccepted">
              <button class="msg-btn msg-btn-accept" @click="$emit('accept-mission', message.missionId)">
                ACCEPT MISSION
              </button>
              <button class="msg-btn msg-btn-later" @click="$emit('close')">
                MAYBE LATER
              </button>
            </template>
            <template v-else-if="message.type === 'mission' && missionAccepted">
              <span class="msg-accepted-label">MISSION ACCEPTED</span>
              <button class="msg-btn msg-btn-later" @click="$emit('close')">CLOSE</button>
            </template>
            <template v-else>
              <button class="msg-btn msg-btn-later" @click="$emit('close')">CLOSE</button>
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
  message: LGAMessage | null
  missionAccepted: boolean
}>()

defineEmits<{
  close: []
  'accept-mission': [missionId: string]
}>()
</script>
```

Style: same overlay pattern as AchievementsDialog (`z-index: 55`, `backdrop-filter: blur(16px)`, `inset: 0`). Use the cyan/orange color scheme. Dialog width ~500px, centered. See existing dialogs for exact CSS patterns.

- [ ] **Step 2: Commit**

```bash
git add src/components/MessageDialog.vue
git commit -m "feat(missions): add MessageDialog component for LGA message expansion"
```

---

### Task 8: MissionTracker HUD Component

**Files:**
- Create: `src/components/MissionTracker.vue`

- [ ] **Step 1: Create MissionTracker.vue**

Persistent HUD overlay, top-right below navbar. Shows tracked mission name + objective checklist.

```vue
<!-- src/components/MissionTracker.vue -->
<template>
  <Transition name="science-fade">
    <div v-if="mission && missionDef" class="mission-tracker">
      <div class="mt-header">
        <span class="mt-name">{{ missionDef.name }}</span>
        <button class="mt-unpin" @click="$emit('untrack')" title="Hide tracker">&#x2715;</button>
      </div>
      <ul class="mt-objectives">
        <li
          v-for="(obj, i) in mission.objectives"
          :key="obj.id"
          class="mt-obj"
          :class="{
            done: obj.done,
            dimmed: missionDef.objectives[i]?.sequential && !isEligible(obj.id),
          }"
        >
          <span class="mt-check">{{ obj.done ? '☑' : '☐' }}</span>
          <span class="mt-label">{{ missionDef.objectives[i]?.label }}</span>
        </li>
      </ul>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { MissionState } from '@/types/missions'
import type { MissionDef } from '@/types/missions'

const props = defineProps<{
  mission: MissionState | null
  missionDef: MissionDef | null
  isEligible: (objectiveId: string) => boolean
}>()

defineEmits<{
  untrack: []
}>()
</script>
```

Style: `position: fixed; top: 58px; right: 12px; z-index: 40`. Dark semi-transparent background matching existing HUD panels. Max 5 lines visible, overflow-y auto. Compact.

- [ ] **Step 2: Commit**

```bash
git add src/components/MissionTracker.vue
git commit -m "feat(missions): add MissionTracker HUD component"
```

---

### Task 9: MissionLogDialog Component

**Files:**
- Create: `src/components/MissionLogDialog.vue`

- [ ] **Step 1: Create MissionLogDialog.vue**

Full panel dialog (same Teleport + Transition pattern). Shows active + completed missions.

```vue
<!-- src/components/MissionLogDialog.vue -->
<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="ml-overlay" @click.self="$emit('close')">
        <div class="ml-dialog" role="dialog" aria-modal="true">
          <div class="ml-head">
            <h2 class="ml-title">MISSION LOG</h2>
            <button class="ml-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="ml-body">
            <!-- Active Missions -->
            <section v-if="activeMissions.length > 0" class="ml-section">
              <h3 class="ml-section-title">ACTIVE</h3>
              <div
                v-for="state in activeMissions"
                :key="state.missionId"
                class="ml-mission"
                :class="{ tracked: state.missionId === trackedMissionId }"
              >
                <div class="ml-mission-head">
                  <span class="ml-mission-name">{{ getDef(state.missionId)?.name }}</span>
                  <button
                    class="ml-track-btn"
                    @click="$emit('track', state.missionId)"
                  >
                    {{ state.missionId === trackedMissionId ? 'TRACKING' : 'TRACK' }}
                  </button>
                </div>
                <ul class="ml-obj-list">
                  <li
                    v-for="obj in state.objectives"
                    :key="obj.id"
                    class="ml-obj"
                    :class="{ done: obj.done }"
                  >
                    <span>{{ obj.done ? '☑' : '☐' }}</span>
                    <span>{{ getObjLabel(state.missionId, obj.id) }}</span>
                  </li>
                </ul>
              </div>
            </section>

            <!-- Completed Missions -->
            <section v-if="completedMissions.length > 0" class="ml-section">
              <h3 class="ml-section-title">COMPLETED</h3>
              <div
                v-for="state in completedMissions"
                :key="state.missionId"
                class="ml-mission completed"
              >
                <div class="ml-mission-head">
                  <span class="ml-mission-name">{{ getDef(state.missionId)?.name }}</span>
                  <span class="ml-completed-sol">Sol {{ state.completedAtSol }}</span>
                </div>
              </div>
            </section>

            <div v-if="activeMissions.length === 0 && completedMissions.length === 0" class="ml-empty">
              No missions yet. Check LGA mailbox for incoming transmissions.
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { MissionState, MissionDef } from '@/types/missions'

const props = defineProps<{
  open: boolean
  activeMissions: MissionState[]
  completedMissions: MissionState[]
  trackedMissionId: string | null
  getDef: (missionId: string) => MissionDef | undefined
  getObjLabel: (missionId: string, objectiveId: string) => string
}>()

defineEmits<{
  close: []
  track: [missionId: string]
}>()
</script>
```

Style: Same overlay as AchievementsDialog (`width: 75vw; height: 75vh`). Two sections with scroll. Tracked mission highlighted with accent border.

- [ ] **Step 2: Commit**

```bash
git add src/components/MissionLogDialog.vue
git commit -m "feat(missions): add MissionLogDialog component"
```

---

### Task 10: LGAMailbox Clickable Messages

**Files:**
- Modify: `src/components/LGAMailbox.vue`

- [ ] **Step 1: Read current LGAMailbox.vue implementation**

Read the full file to understand the template structure, how messages are rendered, and the existing click behavior (expand/collapse).

- [ ] **Step 2: Add message click emit**

Modify `LGAMailbox.vue` to emit an `open-message` event when a message row is clicked, instead of (or in addition to) the current expand behavior:

- Add emit: `'open-message': [message: LGAMessage]`
- On message row click: `$emit('open-message', msg)` and `$emit('markRead', msg.id)`
- Add a small mission icon badge for messages where `msg.type === 'mission'`
- Add unread dot indicator per message (based on `msg.read`)

- [ ] **Step 3: Commit**

```bash
git add src/components/LGAMailbox.vue
git commit -m "feat(lga): make messages clickable with open-message emit and mission badges"
```

---

### Task 11: InstrumentToolbar Gating

**Files:**
- Modify: `src/components/InstrumentToolbar.vue`

- [ ] **Step 1: Read current InstrumentToolbar.vue**

Read the file to understand the static `instruments` array and rendering.

- [ ] **Step 2: Add instrument gating prop**

Add a prop `unlockedInstruments: string[]` and a prop `sandbox: boolean`. Filter the rendered instruments:

```typescript
const props = defineProps<{
  // ... existing props
  unlockedInstruments: string[]
  sandbox: boolean
}>()

// Only REMS and RAD appear in the instrument toolbar and are always available.
// Wheels and Heater are handled outside the toolbar (always active).
// LGA/UHF are in the CommToolbar, not here.
const ALWAYS_AVAILABLE = ['rems', 'rad']

const visibleInstruments = computed(() => {
  if (props.sandbox) return instruments
  return instruments.filter(
    (inst) =>
      ALWAYS_AVAILABLE.includes(inst.id) ||
      props.unlockedInstruments.includes(inst.id)
  )
})
```

Replace `v-for="inst in instruments"` with `v-for="inst in visibleInstruments"`.

- [ ] **Step 3: Commit**

```bash
git add src/components/InstrumentToolbar.vue
git commit -m "feat(missions): gate instrument toolbar based on mission unlocks"
```

---

### Task 12: Wire Everything in MartianSiteView

**Files:**
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/components/MartianSiteNavbar.vue`
- Modify: `src/views/MarsSiteViewController.ts`

This task wires all new components and the mission engine into the site view. It's the integration layer.

- [ ] **Step 1: Read relevant sections of MartianSiteView.vue**

Read the template section (component slots), the script setup (imports, refs, tick loop), and the existing navbar props to understand where to inject.

- [ ] **Step 2: Add Mission Log button to MartianSiteNavbar**

In `src/components/MartianSiteNavbar.vue`:
- Add a new prop: `activeMissionCount: number`
- Add emit: `'open-mission-log'`
- Add button in `.hud-actions` div, before the achievements button:

```vue
<button class="mission-log-btn" @click="$emit('open-mission-log')">
  <span class="ml-icon">◎</span>
  <span class="ml-label">MISSIONS</span>
  <span v-if="activeMissionCount > 0" class="ml-badge">{{ activeMissionCount }}</span>
</button>
```

- [ ] **Step 3: Add mission state and components to MartianSiteView**

In the `<script setup>` of `MartianSiteView.vue`:

```typescript
import { useMissions } from '@/composables/useMissions'
import MessageDialog from '@/components/MessageDialog.vue'
import MissionLogDialog from '@/components/MissionLogDialog.vue'
import MissionTracker from '@/components/MissionTracker.vue'

const {
  catalog,
  activeMissions,
  completedMissions,
  trackedMissionId,
  unlockedInstruments,
  loadCatalog,
  accept,
  checkAllObjectives,
  isObjectiveEligible,
  getMissionDef,
  wireArchiveCheckers,
} = useMissions()

const { profile } = usePlayerProfile()

// State
const missionLogOpen = ref(false)
const openedMessage = ref<LGAMessage | null>(null)

// Computed for tracked mission
const trackedMission = computed(() =>
  activeMissions.value.find((m) => m.missionId === trackedMissionId.value) ?? null
)
const trackedMissionDef = computed(() =>
  trackedMissionId.value ? getMissionDef(trackedMissionId.value) ?? null : null
)

// Helper for MissionLogDialog
function getObjLabel(missionId: string, objectiveId: string): string {
  const def = getMissionDef(missionId)
  return def?.objectives.find((o) => o.id === objectiveId)?.label ?? ''
}

// Mission acceptance handler
function handleAcceptMission(missionId: string) {
  accept(missionId, currentSol.value)
  // Register POIs for go-to objectives
  const def = getMissionDef(missionId)
  if (def) {
    for (const obj of def.objectives) {
      if (obj.type === 'go-to' && obj.params.poiId) {
        // POIs should be pre-defined in site-pois.json or upserted here
        // This depends on how POI positions are determined per site
      }
    }
  }
  openedMessage.value = null
}
```

- [ ] **Step 4: Add components to template**

In the template of `MartianSiteView.vue`, add alongside existing dialogs:

```vue
<!-- Message Dialog (from LGA click) -->
<MessageDialog
  :message="openedMessage"
  :mission-accepted="openedMessage?.missionId
    ? activeMissions.some((m) => m.missionId === openedMessage?.missionId)
      || completedMissions.some((m) => m.missionId === openedMessage?.missionId)
    : false"
  @close="openedMessage = null"
  @accept-mission="handleAcceptMission"
/>

<!-- Mission Log Dialog -->
<MissionLogDialog
  :open="missionLogOpen"
  :active-missions="activeMissions"
  :completed-missions="completedMissions"
  :tracked-mission-id="trackedMissionId"
  :get-def="getMissionDef"
  :get-obj-label="getObjLabel"
  @close="missionLogOpen = false"
  @track="(id) => trackedMissionId = id"
/>

<!-- Mission Tracker HUD -->
<MissionTracker
  v-if="!deploying && !descending"
  :mission="trackedMission"
  :mission-def="trackedMissionDef"
  :is-eligible="(objId) => trackedMissionId ? isObjectiveEligible(trackedMissionId, objId) : false"
  @untrack="trackedMissionId = null"
/>
```

- [ ] **Step 5: Wire navbar props**

Pass new props to `MartianSiteNavbar`:

```vue
<MartianSiteNavbar
  ...existing props...
  :active-mission-count="activeMissions.length"
  @open-mission-log="missionLogOpen = true"
/>
```

- [ ] **Step 6: Wire LGAMailbox open-message event**

Update the LGAMailbox usage to handle message opening:

```vue
<LGAMailbox
  ...existing props...
  @open-message="(msg) => { openedMessage = msg }"
/>
```

- [ ] **Step 7: Wire InstrumentToolbar gating**

Pass unlocked instruments and sandbox flag to InstrumentToolbar:

```vue
<InstrumentToolbar
  ...existing props...
  :unlocked-instruments="unlockedInstruments"
  :sandbox="profile.sandbox"
/>
```

- [ ] **Step 8: Initialize mission system in site controller**

In `MarsSiteViewController.ts` (or the init section of `MartianSiteView.vue`), add mission system initialization:

```typescript
// During site init (after scene is ready):
const missionsData = await fetch('/data/missions.json').then((r) => r.json())
loadCatalog(missionsData)
wireArchiveCheckers()
```

- [ ] **Step 9: Wire checkAllObjectives into tick loop**

In the existing tick handler (where `roverWorldX` and `roverWorldZ` are updated), add:

```typescript
// In the tick/update function, after roverWorldX/Z are updated:
checkAllObjectives(
  roverWorldX.value,
  roverWorldZ.value,
  pois.value, // from useSiteMissionPois
  currentSol.value,
)
```

This is cheap — the checkers are simple comparisons, called every frame.

- [ ] **Step 10: First-launch flow (Guided mode)**

After mission system init, check if this is a first launch in Guided mode and push the first mission:

```typescript
// After loadCatalog + wireArchiveCheckers:
if (!profile.sandbox && activeMissions.value.length === 0 && completedMissions.value.length === 0) {
  const firstMission = catalog.value[0]
  if (firstMission) {
    const { pushMessage } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: currentSol.value,
      timeOfDay: 0.1,
      subject: firstMission.name,
      body: firstMission.briefing,
      type: 'mission',
      from: 'Mission Control',
      missionId: firstMission.id,
    })
    // Auto-open LGA mailbox on first launch
    // Set activeInstrumentSlot to 11 (LGA) to show mailbox
  }
}
```

- [ ] **Step 11: UHF gating in CommToolbar**

In `src/components/CommToolbar.vue`, add a prop `uhfUnlocked: boolean` (default `true`). When false, render the UHF slot as disabled (grayed out, click does nothing). Pass from MartianSiteView:

```vue
<CommToolbar
  ...existing props...
  :uhf-unlocked="profile.sandbox || unlockedInstruments.includes('uhf')"
/>
```

- [ ] **Step 12: Commit**

```bash
git add src/views/MartianSiteView.vue src/components/MartianSiteNavbar.vue src/views/MarsSiteViewController.ts src/components/CommToolbar.vue
git commit -m "feat(missions): wire mission system into site view with full UI integration"
```

---

### Task 13: Integration Test and Polish

**Files:**
- Test: `src/composables/__tests__/useMissions.integration.test.ts`

- [ ] **Step 1: Write integration test for full mission lifecycle**

```typescript
// src/composables/__tests__/useMissions.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useMissions } from '../useMissions'
import { checkObjective } from '../useObjectiveTrackers'
import type { SiteMissionPoi } from '../useSiteMissionPois'

const catalog = {
  version: 1,
  missions: [
    {
      id: 'int-01',
      name: 'Integration Test',
      patron: null,
      description: 'Test',
      briefing: 'Test',
      reward: { sp: 25 },
      unlocks: ['mastcam'],
      chain: null,
      objectives: [
        { id: 'g1', type: 'go-to', label: 'Go A', params: { poiId: 'a' }, sequential: false },
        { id: 'g2', type: 'go-to', label: 'Go B', params: { poiId: 'b' }, sequential: false },
      ],
    },
  ],
}

describe('Mission lifecycle integration', () => {
  const pois: SiteMissionPoi[] = [
    { id: 'a', label: 'A', x: 10, z: 10 },
    { id: 'b', label: 'B', x: 50, z: 50 },
  ]

  beforeEach(() => {
    localStorage.clear()
    const { resetForTests, loadCatalog } = useMissions()
    resetForTests()
    loadCatalog(catalog)
  })

  it('full lifecycle: accept -> check objectives -> auto-complete', () => {
    const { accept, activeMissions, completedMissions, unlockedInstruments, checkAllObjectives } = useMissions()

    accept('int-01', 1)
    expect(activeMissions.value.length).toBe(1)

    // Rover not near any POI
    checkAllObjectives(0, 0, pois, 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(false)

    // Rover reaches POI A
    checkAllObjectives(10, 10, pois, 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
    expect(activeMissions.value[0].objectives[1].done).toBe(false)

    // Rover reaches POI B
    checkAllObjectives(50, 50, pois, 2)
    // All objectives done -> auto-completed
    expect(completedMissions.value.length).toBe(1)
    expect(unlockedInstruments.value).toContain('mastcam')
  })

  it('persists and restores across composable re-init', () => {
    const { accept } = useMissions()
    accept('int-01', 1)

    // Simulate re-init by reading from storage
    const { resetForTests, loadCatalog, activeMissions } = useMissions()
    // State should persist via localStorage (singleton refs already populated)
    expect(activeMissions.value.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Run type check**

Run: `npx vue-tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
- Verify site loads without errors
- Check LGA mailbox opens and messages are clickable
- Verify Mission Log button appears in navbar
- Verify InstrumentToolbar respects sandbox mode (all instruments visible when `sandbox: true`)

- [ ] **Step 5: Commit**

```bash
git add src/composables/__tests__/useMissions.integration.test.ts
git commit -m "test(missions): add integration test for full mission lifecycle"
```

---

## File Summary

### Files to Create
| File | Task | Purpose |
|------|------|---------|
| `src/types/missions.ts` | 1 | Type definitions |
| `public/data/missions.json` | 2 | Tutorial mission catalog |
| `src/composables/useObjectiveTrackers.ts` | 5 | Objective checker registry |
| `src/composables/useMissions.ts` | 6 | Mission engine singleton |
| `src/components/MessageDialog.vue` | 7 | LGA message expansion dialog |
| `src/components/MissionTracker.vue` | 8 | HUD quest tracker |
| `src/components/MissionLogDialog.vue` | 9 | Full mission log panel |

### Files to Modify
| File | Task | Change |
|------|------|--------|
| `src/types/lgaMailbox.ts` | 3 | Add optional type/from/missionId fields |
| `src/composables/useLGAMailbox.ts` | 3 | Add pushMessage() method |
| `src/composables/usePlayerProfile.ts` | 4 | Add sandbox boolean |
| `src/composables/useSciencePoints.ts` | 6 | Ensure awardSurvival supports mission source (verify `mission:` prefix works) |
| `src/components/LGAMailbox.vue` | 10 | Clickable messages, open-message emit |
| `src/components/InstrumentToolbar.vue` | 11 | Filter by unlockedInstruments |
| `src/views/MartianSiteView.vue` | 12 | Wire all components + mission state + first-launch flow |
| `src/components/MartianSiteNavbar.vue` | 12 | Add Mission Log button |
| `src/views/MarsSiteViewController.ts` | 12 | Init mission system, tick loop check |
| `src/components/CommToolbar.vue` | 12 | Add uhfUnlocked prop, disable UHF when locked |

### Test Files
| File | Task |
|------|------|
| `src/types/__tests__/missions.test.ts` | 1 |
| `src/types/__tests__/missionsData.test.ts` | 2 |
| `src/composables/__tests__/useLGAMailbox.mission.test.ts` | 3 |
| `src/composables/__tests__/usePlayerProfile.sandbox.test.ts` | 4 |
| `src/composables/__tests__/useObjectiveTrackers.test.ts` | 5 |
| `src/composables/__tests__/useMissions.test.ts` | 6 |
| `src/composables/__tests__/useMissions.integration.test.ts` | 13 |
