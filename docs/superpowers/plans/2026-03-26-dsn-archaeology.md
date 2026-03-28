# DSN Archaeology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the DSN Archaeology narrative module — a lore-discovery system where colonist transmissions and historical echoes are found during UHF orbital passes, displayed in a dedicated Archive UI, tracked with achievements, and unlocked via a new mission.

**Architecture:** Five layers — (1) transmission data catalog in JSON with 39 colonist logs + 15 historical echoes, (2) `useDSNArchive` composable managing discovery state, weighted random pulls, and localStorage persistence, (3) integration into `AntennaTickHandler` to pull transmissions during UHF passes when archaeology mode is active, (4) `DSNArchiveDialog.vue` full-screen archive viewer with timeline, sender filters, and collection counter, (5) mission "Deep Signal" (m13) that unlocks DSN Archaeology via UHF firmware update, plus achievement hooks.

**Tech Stack:** Vue 3, TypeScript, localStorage persistence, existing composable singleton pattern, existing AntennaTickHandler integration.

**Spec:** `inspo/i-rover-dsn-archaeology.md`

---

### Task 1: Transmission Data Catalog

**Files:**
- Create: `public/data/dsn-transmissions.json`
- Create: `src/types/dsnArchive.ts`
- Test: `src/types/__tests__/dsnTransmissions.test.ts`

- [ ] **Step 1: Define TypeScript types**

```typescript
// src/types/dsnArchive.ts

export type TransmissionRarity = 'common' | 'uncommon' | 'rare' | 'legendary'
export type TransmissionCategory = 'colonist' | 'echo'

export interface DSNTransmission {
  id: string                    // e.g. 'TX-001' or 'ECHO-01'
  category: TransmissionCategory
  frequencyMHz: number
  date: string                  // ISO-ish or 'CORRUPTED'
  sender: string                // e.g. 'VASQUEZ, E.' or 'MARINER 4'
  senderRole?: string           // e.g. 'Commander' or undefined for echoes
  senderKey: string             // filter key: 'vasquez', 'oliveira', etc. or 'historical'
  body: string
  rarity: TransmissionRarity
  year?: number                 // for timeline positioning, undefined if corrupted
  sortOrder: number             // canonical order for timeline display
}

export interface DSNTransmissionCatalog {
  version: number
  transmissions: DSNTransmission[]
}

/** Player's discovered state for a single transmission. */
export interface DSNDiscovery {
  transmissionId: string
  discoveredAtSol: number
  read: boolean
}

/** Persisted archive state. */
export interface DSNArchiveState {
  unlocked: boolean              // true after mission 13 firmware install
  discoveries: DSNDiscovery[]
}
```

- [ ] **Step 2: Create the transmission data catalog**

Create `public/data/dsn-transmissions.json` with all 54 entries (39 colonist TX-001..TX-039 + 15 historical ECHO-01..ECHO-15). Each entry uses the `DSNTransmission` shape.

Rarity assignments per spec:
- **Common (60%):** Year 1-5 colonist logs (TX-001 through TX-017) — 17 entries
- **Uncommon (25%):** Year 6-7 colonist logs (TX-018 through TX-023) — 6 entries
- **Rare (10%):** Year 8 colonist logs (TX-024 through TX-034) — 11 entries
- **Legendary (5%):** Corrupted fragments (TX-035 through TX-038) — 4 entries
- **TX-039:** Not in pool — unlocked programmatically at 38/38
- **Echoes ECHO-01..ECHO-15:** Separate pool, common rarity, found alongside colonist logs

Sender keys: `'vasquez'`, `'oliveira'`, `'nakamura'`, `'al-rashid'`, `'tanaka'`, `'cortez'`, `'unknown'`, `'historical'`

```json
{
  "version": 1,
  "transmissions": [
    {
      "id": "TX-001",
      "category": "colonist",
      "frequencyMHz": 457.3,
      "date": "2031-03-14",
      "sender": "VASQUEZ, E.",
      "senderRole": "Commander",
      "senderKey": "vasquez",
      "body": "Station log, Sol 1. Touchdown confirmed. All 12 modules intact. Crew of 22 on surface, second wave in 14 months. Acidalia Planitia is flat as promised. The dust is finer than flour. Cortez has DSN uplink nominal — Earth copy confirmed at 14-minute delay. We're here. God help us, we're actually here.",
      "rarity": "common",
      "year": 2031,
      "sortOrder": 1
    }
  ]
}
```

Populate all 54 entries from the spec. The body text is copied verbatim from `inspo/i-rover-dsn-archaeology.md`. `[CORRUPTED]` markers stay in the body text as-is.

- [ ] **Step 3: Write data validation test**

```typescript
// src/types/__tests__/dsnTransmissions.test.ts
import { describe, it, expect } from 'vitest'
import catalogJson from '../../../public/data/dsn-transmissions.json'
import type { DSNTransmissionCatalog, TransmissionRarity } from '../dsnArchive'

const VALID_RARITIES: TransmissionRarity[] = ['common', 'uncommon', 'rare', 'legendary']
const VALID_CATEGORIES = ['colonist', 'echo']
const VALID_SENDER_KEYS = [
  'vasquez', 'oliveira', 'nakamura', 'al-rashid', 'tanaka', 'cortez', 'unknown', 'historical',
]

describe('dsn-transmissions.json', () => {
  const catalog = catalogJson as DSNTransmissionCatalog

  it('has version 1', () => {
    expect(catalog.version).toBe(1)
  })

  it('has 54 transmissions (39 colonist + 15 echoes)', () => {
    expect(catalog.transmissions.length).toBe(54)
  })

  it('no duplicate IDs', () => {
    const ids = catalog.transmissions.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all transmissions have required fields', () => {
    for (const t of catalog.transmissions) {
      expect(t.id).toBeTruthy()
      expect(VALID_CATEGORIES).toContain(t.category)
      expect(t.frequencyMHz).toBeGreaterThan(0)
      expect(t.sender).toBeTruthy()
      expect(t.body).toBeTruthy()
      expect(VALID_RARITIES).toContain(t.rarity)
      expect(VALID_SENDER_KEYS).toContain(t.senderKey)
      expect(t.sortOrder).toBeGreaterThan(0)
    }
  })

  it('has exactly 39 colonist and 15 echo entries', () => {
    const colonist = catalog.transmissions.filter(t => t.category === 'colonist')
    const echo = catalog.transmissions.filter(t => t.category === 'echo')
    expect(colonist.length).toBe(39)
    expect(echo.length).toBe(15)
  })

  it('TX-039 is legendary rarity', () => {
    const tx039 = catalog.transmissions.find(t => t.id === 'TX-039')
    expect(tx039).toBeDefined()
    expect(tx039!.rarity).toBe('legendary')
  })

  it('sort orders are unique', () => {
    const orders = catalog.transmissions.map(t => t.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/types/__tests__/dsnTransmissions.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/data/dsn-transmissions.json src/types/dsnArchive.ts src/types/__tests__/dsnTransmissions.test.ts
git commit -m "feat(dsn): transmission data catalog with 54 entries and type definitions"
```

---

### Task 2: DSN Archive Composable

**Files:**
- Create: `src/composables/useDSNArchive.ts`
- Test: `src/composables/__tests__/useDSNArchive.test.ts`

- [ ] **Step 1: Write tests for core archive operations**

```typescript
// src/composables/__tests__/useDSNArchive.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useDSNArchive } from '../useDSNArchive'
import type { DSNTransmission } from '@/types/dsnArchive'

const MOCK_TRANSMISSIONS: DSNTransmission[] = [
  {
    id: 'TX-001', category: 'colonist', frequencyMHz: 457.3,
    date: '2031-03-14', sender: 'VASQUEZ, E.', senderRole: 'Commander',
    senderKey: 'vasquez', body: 'Sol 1 log.', rarity: 'common',
    year: 2031, sortOrder: 1,
  },
  {
    id: 'TX-018', category: 'colonist', frequencyMHz: 438.6,
    date: '2036-01-15', sender: 'NAKAMURA, R.', senderRole: 'Systems Engineer',
    senderKey: 'nakamura', body: 'Battery at 58%.', rarity: 'uncommon',
    year: 2036, sortOrder: 18,
  },
  {
    id: 'TX-024', category: 'colonist', frequencyMHz: 457.3,
    date: '2038-01-10', sender: 'VASQUEZ, E.', senderRole: 'Commander',
    senderKey: 'vasquez', body: '19 crew remaining.', rarity: 'rare',
    year: 2038, sortOrder: 24,
  },
  {
    id: 'TX-035', category: 'colonist', frequencyMHz: 399.1,
    date: 'CORRUPTED', sender: 'UNKNOWN', senderKey: 'unknown',
    body: '[CORRUPTED] the boy runs...', rarity: 'legendary',
    sortOrder: 35,
  },
  {
    id: 'TX-039', category: 'colonist', frequencyMHz: 0,
    date: 'NULL', sender: 'UNKNOWN', senderKey: 'unknown',
    body: 'Hello. You found everything.', rarity: 'legendary',
    sortOrder: 39,
  },
  {
    id: 'ECHO-01', category: 'echo', frequencyMHz: 381.2,
    date: '1965-07-15', sender: 'MARINER 4', senderKey: 'historical',
    body: 'First close-range images.', rarity: 'common',
    year: 1965, sortOrder: 40,
  },
]

describe('useDSNArchive', () => {
  beforeEach(() => {
    const { resetForTests } = useDSNArchive()
    resetForTests()
  })

  it('starts with empty discoveries and locked', () => {
    const { discoveries, unlocked } = useDSNArchive()
    expect(discoveries.value).toEqual([])
    expect(unlocked.value).toBe(false)
  })

  it('loadCatalog stores transmissions', () => {
    const { loadCatalog, allTransmissions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    expect(allTransmissions.value.length).toBe(6)
  })

  it('unlock enables archaeology mode', () => {
    const { unlock, unlocked } = useDSNArchive()
    unlock()
    expect(unlocked.value).toBe(true)
  })

  it('pullTransmissions returns 1-3 from weighted pool, never TX-039', () => {
    const { loadCatalog, unlock, pullTransmissions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    const pulled = pullTransmissions(1)
    expect(pulled.length).toBeGreaterThanOrEqual(1)
    expect(pulled.length).toBeLessThanOrEqual(3)
    for (const p of pulled) {
      expect(p.id).not.toBe('TX-039')
    }
  })

  it('pullTransmissions does not return already-discovered entries', () => {
    const { loadCatalog, unlock, pullTransmissions, discoveries } = useDSNArchive()
    // Only 2 pullable entries (TX-001 common, ECHO-01 common) after removing TX-039
    const small: DSNTransmission[] = [
      MOCK_TRANSMISSIONS[0], // TX-001
      MOCK_TRANSMISSIONS[4], // TX-039 (not pullable)
      MOCK_TRANSMISSIONS[5], // ECHO-01
    ]
    loadCatalog({ version: 1, transmissions: small })
    unlock()
    const first = pullTransmissions(1)
    expect(first.length).toBeGreaterThanOrEqual(1)
    const second = pullTransmissions(2)
    // Should not re-pull what was already discovered
    for (const s of second) {
      for (const f of first) {
        expect(s.id).not.toBe(f.id)
      }
    }
  })

  it('first pull always includes TX-001 if not yet discovered', () => {
    const { loadCatalog, unlock, pullTransmissions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    const pulled = pullTransmissions(1)
    expect(pulled.some(p => p.id === 'TX-001')).toBe(true)
  })

  it('markRead updates discovery read state', () => {
    const { loadCatalog, unlock, pullTransmissions, markRead, discoveries } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    pullTransmissions(1)
    const id = discoveries.value[0].transmissionId
    expect(discoveries.value[0].read).toBe(false)
    markRead(id)
    expect(discoveries.value.find(d => d.transmissionId === id)!.read).toBe(true)
  })

  it('unlocks TX-039 when all other 38 colonist logs are discovered', () => {
    const { loadCatalog, unlock, discoverTransmission, discoveries, allTransmissions } = useDSNArchive()
    // Use a small set: 2 colonist + TX-039
    const small: DSNTransmission[] = [
      MOCK_TRANSMISSIONS[0], // TX-001
      MOCK_TRANSMISSIONS[1], // TX-018
      MOCK_TRANSMISSIONS[4], // TX-039
    ]
    loadCatalog({ version: 1, transmissions: small })
    unlock()
    discoverTransmission('TX-001', 1)
    expect(discoveries.value.some(d => d.transmissionId === 'TX-039')).toBe(false)
    discoverTransmission('TX-018', 2)
    // Now all non-039 colonist logs found — TX-039 should auto-unlock
    expect(discoveries.value.some(d => d.transmissionId === 'TX-039')).toBe(true)
  })

  it('colonistCount and echoCount are correct', () => {
    const { loadCatalog, unlock, discoverTransmission, colonistCount, echoCount } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    discoverTransmission('TX-001', 1)
    discoverTransmission('ECHO-01', 1)
    expect(colonistCount.value).toEqual({ found: 1, total: 5 }) // 5 colonist in mock (excluding TX-039 from pullable, but total includes it)
    expect(echoCount.value).toEqual({ found: 1, total: 1 })
  })

  it('unreadCount tracks unread discoveries', () => {
    const { loadCatalog, unlock, discoverTransmission, markRead, unreadCount } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    discoverTransmission('TX-001', 1)
    discoverTransmission('ECHO-01', 1)
    expect(unreadCount.value).toBe(2)
    markRead('TX-001')
    expect(unreadCount.value).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useDSNArchive.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the composable**

```typescript
// src/composables/useDSNArchive.ts
import { ref, computed } from 'vue'
import type {
  DSNTransmission,
  DSNTransmissionCatalog,
  DSNDiscovery,
} from '@/types/dsnArchive'

const STORAGE_KEY = 'mars-dsn-archive-v1'

// --- Singleton state ---
const catalog = ref<DSNTransmission[]>([])
const unlocked = ref(false)
const discoveries = ref<DSNDiscovery[]>([])

// Load persisted state
function loadFromStorage(): { unlocked: boolean; discoveries: DSNDiscovery[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { unlocked: false, discoveries: [] }
    const parsed = JSON.parse(raw)
    return {
      unlocked: parsed.unlocked ?? false,
      discoveries: Array.isArray(parsed.discoveries) ? parsed.discoveries : [],
    }
  } catch {
    return { unlocked: false, discoveries: [] }
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      unlocked: unlocked.value,
      discoveries: discoveries.value,
    }))
  } catch { /* quota / private mode */ }
}

// Restore on module load
const stored = loadFromStorage()
unlocked.value = stored.unlocked
discoveries.value = stored.discoveries

// --- Derived ---
const allTransmissions = computed(() => catalog.value)

const discoveredIds = computed(() => new Set(discoveries.value.map(d => d.transmissionId)))

const unreadCount = computed(() => discoveries.value.filter(d => !d.read).length)

const colonistCount = computed(() => {
  const total = catalog.value.filter(t => t.category === 'colonist').length
  const found = discoveries.value.filter(d => {
    const t = catalog.value.find(tx => tx.id === d.transmissionId)
    return t?.category === 'colonist'
  }).length
  return { found, total }
})

const echoCount = computed(() => {
  const total = catalog.value.filter(t => t.category === 'echo').length
  const found = discoveries.value.filter(d => {
    const t = catalog.value.find(tx => tx.id === d.transmissionId)
    return t?.category === 'echo'
  }).length
  return { found, total }
})

// --- Weighted random selection ---
const RARITY_WEIGHTS: Record<string, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  legendary: 5,
}

function weightedPick(pool: DSNTransmission[]): DSNTransmission | null {
  if (pool.length === 0) return null
  const totalWeight = pool.reduce((sum, t) => sum + (RARITY_WEIGHTS[t.rarity] ?? 1), 0)
  let roll = Math.random() * totalWeight
  for (const t of pool) {
    roll -= RARITY_WEIGHTS[t.rarity] ?? 1
    if (roll <= 0) return t
  }
  return pool[pool.length - 1]
}

// --- Core API ---
function loadCatalog(data: DSNTransmissionCatalog): void {
  catalog.value = data.transmissions
}

function unlock(): void {
  unlocked.value = true
  persist()
}

function discoverTransmission(txId: string, currentSol: number): void {
  if (discoveredIds.value.has(txId)) return
  discoveries.value = [...discoveries.value, {
    transmissionId: txId,
    discoveredAtSol: currentSol,
    read: false,
  }]
  persist()
  // Check if TX-039 should auto-unlock
  checkTx039Unlock(currentSol)
}

function checkTx039Unlock(currentSol: number): void {
  const tx039 = catalog.value.find(t => t.id === 'TX-039')
  if (!tx039) return
  if (discoveredIds.value.has('TX-039')) return

  // All colonist transmissions except TX-039 must be discovered
  const allColonist = catalog.value.filter(t => t.category === 'colonist' && t.id !== 'TX-039')
  const allFound = allColonist.every(t => discoveredIds.value.has(t.id))
  if (allFound) {
    discoveries.value = [...discoveries.value, {
      transmissionId: 'TX-039',
      discoveredAtSol: currentSol,
      read: false,
    }]
    persist()
  }
}

/**
 * Pull 1-3 random transmissions during a UHF pass.
 * First pull always includes TX-001 if not yet discovered.
 * TX-039 is never in the random pool (auto-unlocks at 38/38).
 */
function pullTransmissions(currentSol: number): DSNTransmission[] {
  const pool = catalog.value.filter(t =>
    t.id !== 'TX-039' && !discoveredIds.value.has(t.id),
  )
  if (pool.length === 0) return []

  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 3)) // 1-3
  const pulled: DSNTransmission[] = []

  // First pull ever: force TX-001
  const tx001 = pool.find(t => t.id === 'TX-001')
  if (tx001 && discoveries.value.length === 0) {
    pulled.push(tx001)
  }

  while (pulled.length < count) {
    const remaining = pool.filter(t => !pulled.some(p => p.id === t.id))
    const pick = weightedPick(remaining)
    if (!pick) break
    pulled.push(pick)
  }

  // Record discoveries
  for (const tx of pulled) {
    discoverTransmission(tx.id, currentSol)
  }

  return pulled
}

function markRead(txId: string): void {
  const d = discoveries.value.find(d => d.transmissionId === txId)
  if (d && !d.read) {
    d.read = true
    discoveries.value = [...discoveries.value]
    persist()
  }
}

function markAllRead(): void {
  let changed = false
  for (const d of discoveries.value) {
    if (!d.read) { d.read = true; changed = true }
  }
  if (changed) {
    discoveries.value = [...discoveries.value]
    persist()
  }
}

function getTransmission(txId: string): DSNTransmission | undefined {
  return catalog.value.find(t => t.id === txId)
}

function resetForTests(): void {
  catalog.value = []
  unlocked.value = false
  discoveries.value = []
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function useDSNArchive() {
  return {
    // State
    unlocked,
    discoveries,
    allTransmissions,
    unreadCount,
    colonistCount,
    echoCount,
    // Actions
    loadCatalog,
    unlock,
    pullTransmissions,
    discoverTransmission,
    markRead,
    markAllRead,
    getTransmission,
    resetForTests,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useDSNArchive.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDSNArchive.ts src/composables/__tests__/useDSNArchive.test.ts
git commit -m "feat(dsn): archive composable with weighted random pulls and persistence"
```

---

### Task 3: Mission Definition & Objective Wiring

**Files:**
- Modify: `public/data/missions.json` — add m13-deep-signal mission
- Modify: `src/types/missions.ts` — add `'dsn-firmware-install'` objective type
- Modify: `src/composables/useMissions.ts` — add checker + notifier
- Modify: `src/types/__tests__/missionsData.test.ts` — add new type to valid list

- [ ] **Step 1: Add `'dsn-firmware-install'` to ObjectiveType union**

```typescript
// src/types/missions.ts — add to the union:
  | 'install-upgrade'
  | 'dsn-firmware-install'
```

- [ ] **Step 2: Add m13-deep-signal mission to missions.json**

Chain m12-upgrade to m13-deep-signal by setting `"chain": "m13-deep-signal"` on m12-upgrade. Then append:

```json
{
  "id": "m13-deep-signal",
  "name": "13. Deep Signal",
  "patron": null,
  "description": "Install a DSN Archaeology firmware update on the UHF antenna to unlock legacy band reception.",
  "briefing": "Rover, routine diagnostic. Your UHF transceiver has been operating on standard relay frequencies — adequate for orbital uplinks. However, your hardware is technically capable of receiving across the full DSN frequency spectrum. We're pushing a firmware update to unlock legacy band reception. There's... a lot of old data out there. Most of it is noise. Calibration pings. Deprecated telemetry. But some of our analysts think there might be recoverable mission archives from early Mars programs. Historical interest only. No science value. Install the update and see what you find. Low priority.",
  "reward": { "sp": 100 },
  "unlocks": ["dsn-archaeology"],
  "chain": null,
  "objectives": [
    { "id": "dsn-1", "type": "dsn-firmware-install", "label": "Install DSN Archaeology firmware on UHF", "params": {}, "sequential": false }
  ]
}
```

- [ ] **Step 3: Wire the checker and notifier in useMissions.ts**

Add to singleton state:

```typescript
const dsnFirmwareInstalled = ref(false)
```

Add to `wireArchiveCheckers()`:

```typescript
// dsn-firmware-install: flag set externally when player installs DSN firmware
registerChecker('dsn-firmware-install', () => dsnFirmwareInstalled.value)
```

Add notifier function:

```typescript
function notifyDsnFirmwareInstalled(): void {
  dsnFirmwareInstalled.value = true
}
```

Add to `resetForTests()`:

```typescript
dsnFirmwareInstalled.value = false
```

Export `notifyDsnFirmwareInstalled` from the return object.

- [ ] **Step 4: Update test valid types list**

In `src/types/__tests__/missionsData.test.ts`, add `'dsn-firmware-install'` to `VALID_OBJECTIVE_TYPES`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/types/__tests__/missionsData.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/data/missions.json src/types/missions.ts src/composables/useMissions.ts src/types/__tests__/missionsData.test.ts
git commit -m "feat(dsn): Deep Signal mission (m13) with dsn-firmware-install objective"
```

---

### Task 4: AntennaTickHandler Integration

**Files:**
- Modify: `src/views/site-controllers/AntennaTickHandler.ts` — add DSN pull during UHF passes
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts` — pass new deps
- Modify: `src/views/MartianSiteView.vue` — load DSN catalog, wire refs

- [ ] **Step 1: Load DSN catalog at site init**

In `src/views/MarsSiteViewController.ts`, after `loadCatalog(missionsData)` and `wireArchiveCheckers()`, add:

```typescript
const dsnData = await fetch('/data/dsn-transmissions.json').then(r => r.json())
const { loadCatalog: loadDSNCatalog } = useDSNArchive()
loadDSNCatalog(dsnData)
```

Add the import at the top:

```typescript
import { useDSNArchive } from '@/composables/useDSNArchive'
```

- [ ] **Step 2: Add DSN pull logic to AntennaTickHandler**

In `src/views/site-controllers/AntennaTickHandler.ts`, within the `tickUHF` function, add a check at the **end of a pass** (when `activePass` transitions from non-null to null). If DSN archaeology is unlocked, pull transmissions:

```typescript
// Inside tickUHF, in the pass-end detection block (where lastUhfPassId is cleared):
const { unlocked: dsnUnlocked, pullTransmissions: dsnPull } = useDSNArchive()
if (dsnUnlocked.value) {
  const pulled = dsnPull(currentSol)
  if (pulled.length > 0) {
    deps.onDSNTransmissionsReceived?.(pulled)
  }
}
```

Add `onDSNTransmissionsReceived` to the deps/callback interface:

```typescript
onDSNTransmissionsReceived?: (transmissions: DSNTransmission[]) => void
```

- [ ] **Step 3: Wire callback in createMarsSiteTickHandlers**

Pass a callback from MartianSiteView that shows a toast when transmissions arrive:

```typescript
onDSNTransmissionsReceived: (txs) => {
  const count = txs.length
  const label = count === 1 ? '1 DSN transmission received' : `${count} DSN transmissions received`
  sampleToastRef.value?.show?.(label)
}
```

- [ ] **Step 4: Add DSN archive refs to MartianSiteView**

In `MartianSiteView.vue`, import `useDSNArchive` and expose the refs needed for the navbar badge:

```typescript
const { unlocked: dsnUnlocked, unreadCount: dsnUnreadCount } = useDSNArchive()
```

- [ ] **Step 5: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: Clean (no errors)

- [ ] **Step 6: Commit**

```bash
git add src/views/site-controllers/AntennaTickHandler.ts src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/MartianSiteView.vue src/views/MarsSiteViewController.ts
git commit -m "feat(dsn): pull transmissions during UHF passes when archaeology unlocked"
```

---

### Task 5: DSN Firmware Install UI Trigger

**Files:**
- Modify: `src/components/InstrumentOverlay.vue` — add firmware install button for UHF slot
- Modify: `src/views/MartianSiteView.vue` — handle firmware install event

This task adds the "INSTALL DSN ARCHAEOLOGY v1.0" button to the UHF instrument overlay. It appears only when mission m13-deep-signal is active and the objective is not yet complete.

- [ ] **Step 1: Add firmware install button to InstrumentOverlay**

In `src/components/InstrumentOverlay.vue`, add a new prop and conditional button for the UHF slot (slot 12):

Props to add:

```typescript
dsnFirmwareAvailable: { type: Boolean, default: false },
```

Emit to add:

```typescript
'install-dsn-firmware'
```

Template addition (inside the slot-12 section, before the hint):

```html
<div v-if="dsnFirmwareAvailable && currentSlot === 12" class="ov-firmware">
  <button class="ov-btn-primary" @click="$emit('install-dsn-firmware')">
    INSTALL DSN ARCHAEOLOGY v1.0
  </button>
</div>
```

Style:

```css
.ov-firmware {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(102, 255, 238, 0.15);
}
```

- [ ] **Step 2: Handle install event in MartianSiteView**

```typescript
function handleDsnFirmwareInstall() {
  const { unlock } = useDSNArchive()
  unlock()
  useMissions().notifyDsnFirmwareInstalled()
  sampleToastRef.value?.show?.('DSN ARCHAEOLOGY v1.0 — INSTALLED')
}
```

Compute `dsnFirmwareAvailable`:

```typescript
const dsnFirmwareAvailable = computed(() => {
  const { activeMissions, getMissionDef } = useMissions()
  const { unlocked } = useDSNArchive()
  if (unlocked.value) return false
  return activeMissions.value.some(m => {
    const def = getMissionDef(m.missionId)
    return def?.objectives.some(o => o.type === 'dsn-firmware-install')
  })
})
```

Pass `dsnFirmwareAvailable` prop to `InstrumentOverlay` and listen for `@install-dsn-firmware="handleDsnFirmwareInstall"`.

- [ ] **Step 3: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/components/InstrumentOverlay.vue src/views/MartianSiteView.vue
git commit -m "feat(dsn): firmware install button on UHF overlay triggers archaeology unlock"
```

---

### Task 6: DSN Archive Dialog — Layout & Timeline

**Files:**
- Create: `src/components/DSNArchiveDialog.vue`
- Modify: `src/views/MartianSiteView.vue` — add toggle
- Modify: `src/components/MartianSiteNavbar.vue` — add ARCHIVE button

- [ ] **Step 1: Create the archive dialog component**

```vue
<!-- src/components/DSNArchiveDialog.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDSNArchive } from '@/composables/useDSNArchive'
import type { DSNTransmission } from '@/types/dsnArchive'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const {
  discoveries, allTransmissions, colonistCount, echoCount,
  markRead, getTransmission,
} = useDSNArchive()

// --- Sender filter ---
const SENDER_FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'vasquez', label: 'VASQUEZ' },
  { key: 'oliveira', label: 'OLIVEIRA' },
  { key: 'nakamura', label: 'NAKAMURA' },
  { key: 'al-rashid', label: 'AL-RASHID' },
  { key: 'tanaka', label: 'TANAKA' },
  { key: 'cortez', label: 'CORTEZ' },
  { key: 'unknown', label: 'UNKNOWN' },
  { key: 'historical', label: 'DSN ECHOES' },
] as const

const activeSenderFilter = ref<string>('all')

// --- Discovered transmissions sorted by sortOrder ---
const discoveredTransmissions = computed(() => {
  const found = discoveries.value
    .map(d => {
      const tx = getTransmission(d.transmissionId)
      return tx ? { ...tx, read: d.read, discoveredAtSol: d.discoveredAtSol } : null
    })
    .filter((t): t is DSNTransmission & { read: boolean; discoveredAtSol: number } => t !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (activeSenderFilter.value === 'all') return found
  return found.filter(t => t.senderKey === activeSenderFilter.value)
})

// --- Timeline dots (all transmissions, discovered or not) ---
const timelineEntries = computed(() => {
  return allTransmissions.value
    .filter(t => t.category === 'colonist' && t.id !== 'TX-039')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(t => ({
      id: t.id,
      year: t.year,
      discovered: discoveries.value.some(d => d.transmissionId === t.id),
    }))
})

// --- Collection counter ---
const totalFound = computed(() => discoveries.value.length)
const totalEntries = computed(() => allTransmissions.value.length)

// --- Selected transmission ---
const selectedId = ref<string | null>(null)
const selectedTx = computed(() => {
  if (!selectedId.value) return null
  return discoveredTransmissions.value.find(t => t.id === selectedId.value) ?? null
})

function selectTransmission(id: string) {
  selectedId.value = id
  markRead(id)
}

// Reset selection when dialog opens
watch(() => props.open, (open) => {
  if (open) selectedId.value = null
})
</script>

<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="dsn-overlay" @click.self="emit('close')">
        <div class="dsn-dialog">
          <!-- Header -->
          <div class="dsn-header">
            <div class="dsn-header-left">
              <div class="dsn-title">DSN ARCHIVE</div>
              <div class="dsn-subtitle">Deep Space Network — Legacy Transmissions</div>
            </div>
            <div class="dsn-counter">
              <span class="dsn-counter-found">{{ totalFound }}</span>
              <span class="dsn-counter-sep"> / </span>
              <span class="dsn-counter-total">{{ totalEntries }}</span>
              <span v-if="totalFound >= totalEntries" class="dsn-counter-complete"> — ARCHIVE COMPLETE</span>
            </div>
            <button class="dsn-close" @click="emit('close')">✕</button>
          </div>

          <!-- Timeline -->
          <div class="dsn-timeline">
            <div class="dsn-timeline-track">
              <div
                v-for="entry in timelineEntries"
                :key="entry.id"
                class="dsn-timeline-dot"
                :class="{ discovered: entry.discovered }"
                :title="entry.discovered ? entry.id : 'Undiscovered'"
              />
            </div>
            <div class="dsn-timeline-labels">
              <span>2031</span>
              <span>2033</span>
              <span>2035</span>
              <span>2037</span>
              <span>2039</span>
            </div>
          </div>

          <!-- Sender filters -->
          <div class="dsn-filters">
            <button
              v-for="f in SENDER_FILTERS"
              :key="f.key"
              class="dsn-filter-btn"
              :class="{ active: activeSenderFilter === f.key }"
              @click="activeSenderFilter = f.key"
            >{{ f.label }}</button>
          </div>

          <!-- Two-pane content -->
          <div class="dsn-panes">
            <!-- List -->
            <div class="dsn-list">
              <div
                v-for="tx in discoveredTransmissions"
                :key="tx.id"
                class="dsn-item"
                :class="{
                  selected: selectedId === tx.id,
                  unread: !tx.read,
                  echo: tx.category === 'echo',
                }"
                @click="selectTransmission(tx.id)"
              >
                <div class="dsn-item-header">
                  <span class="dsn-item-id">{{ tx.id }}</span>
                  <span class="dsn-item-freq">{{ tx.frequencyMHz }} MHz</span>
                  <span class="dsn-item-date">{{ tx.date }}</span>
                </div>
                <div class="dsn-item-sender">{{ tx.sender }}
                  <span v-if="tx.senderRole" class="dsn-item-role"> — {{ tx.senderRole }}</span>
                </div>
                <div class="dsn-item-preview">{{ tx.body.slice(0, 80) }}...</div>
              </div>
              <div v-if="discoveredTransmissions.length === 0" class="dsn-empty">
                No transmissions found{{ activeSenderFilter !== 'all' ? ' for this sender' : '' }}.
              </div>
            </div>

            <!-- Detail -->
            <div class="dsn-detail">
              <template v-if="selectedTx">
                <div class="dsn-detail-header">
                  <div class="dsn-detail-id">{{ selectedTx.id }}</div>
                  <div class="dsn-detail-meta">
                    {{ selectedTx.frequencyMHz }} MHz | {{ selectedTx.date }}
                  </div>
                  <div class="dsn-detail-sender">
                    {{ selectedTx.sender }}
                    <span v-if="selectedTx.senderRole"> — {{ selectedTx.senderRole }}</span>
                  </div>
                  <div v-if="selectedTx.category === 'echo'" class="dsn-detail-tag echo-tag">DSN ECHO</div>
                  <div v-else class="dsn-detail-tag colonist-tag">ARES STATION</div>
                </div>
                <div class="dsn-detail-body" v-html="formatBody(selectedTx.body)" />
                <div class="dsn-detail-sol">Discovered: Sol {{ selectedTx.discoveredAtSol }}</div>
              </template>
              <div v-else class="dsn-detail-empty">
                Select a transmission to read.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
function formatBody(body: string): string {
  // Highlight [CORRUPTED] markers in red
  return body.replace(
    /\[CORRUPTED\]/g,
    '<span class="dsn-corrupted">[CORRUPTED]</span>',
  )
}
</script>
```

Style block should follow the project conventions:
- Dark semi-transparent background: `rgba(10, 5, 2, 0.92)` with `backdrop-filter: blur(16px)`
- Colonist text: warm amber `rgba(196, 149, 106, 0.85)`
- Echo text: cool blue-gray `rgba(136, 180, 220, 0.85)`
- `[CORRUPTED]` markers: `#e05030` (red)
- Monospace font for body: `var(--font-mono)`
- Timeline dots: `rgba(196, 149, 106, 0.2)` (undiscovered), `#e8a060` (discovered)
- Counter: `var(--font-instrument)` with tabular-nums
- Two-pane layout: left list (280px) + right detail (flex: 1)
- Full-screen overlay (Teleport to body, z-index 55) matching ScienceLogDialog pattern

The full `<style scoped>` block should implement all these styles following the exact patterns used in `ScienceLogDialog.vue` and `AchievementsDialog.vue`.

- [ ] **Step 2: Add ARCHIVE button to navbar**

In `src/components/MartianSiteNavbar.vue`, add a new button in the right `.hud-actions` section, between ACHIEVEMENTS and SCIENCE:

```html
<button
  v-if="showArchiveButton"
  class="hud-btn hud-btn--archive"
  @click="$emit('open-archive')"
>
  <span class="hud-btn-icon">⦿</span>
  <span class="hud-btn-label">ARCHIVE</span>
  <span v-if="archiveUnreadCount > 0" class="hud-badge archive-badge">{{ archiveUnreadCount }}</span>
</button>
```

Add props:

```typescript
showArchiveButton: { type: Boolean, default: false },
archiveUnreadCount: { type: Number, default: 0 },
```

Add emit: `'open-archive'`

Style the badge with warm amber color (same as LGA unread dot) to distinguish from cyan science styling.

- [ ] **Step 3: Wire in MartianSiteView**

```typescript
const showArchive = ref(false)

// Pass to navbar:
// :show-archive-button="dsnUnlocked"
// :archive-unread-count="dsnUnreadCount"
// @open-archive="showArchive = true"

// Add DSNArchiveDialog:
// <DSNArchiveDialog :open="showArchive" @close="showArchive = false" />
```

- [ ] **Step 4: Run type check and visual test**

Run: `npx vue-tsc --noEmit`
Expected: Clean

Manual test: Start dev server, complete missions through m13, verify archive button appears and dialog opens.

- [ ] **Step 5: Commit**

```bash
git add src/components/DSNArchiveDialog.vue src/components/MartianSiteNavbar.vue src/views/MartianSiteView.vue
git commit -m "feat(dsn): archive dialog with timeline, sender filters, and collection counter"
```

---

### Task 7: Achievement Hooks

**Files:**
- Modify: `public/data/achievements.json` — add DSN achievement category
- Modify: `src/composables/useDSNArchive.ts` — emit achievement events

- [ ] **Step 1: Add DSN achievement category to achievements.json**

Add a new `"dsn-archaeology"` category to `achievements.json` with the achievements from the spec:

```json
{
  "id": "dsn-archaeology",
  "label": "DSN ARCHAEOLOGY",
  "items": [
    { "id": "signal-acquired", "label": "SIGNAL ACQUIRED", "description": "Old frequencies. Old voices. Someone was here before you.", "threshold": 1, "thresholdType": "dsn-total", "reward": {} },
    { "id": "voices-in-static", "label": "VOICES IN THE STATIC", "description": "The colony had a name. Ares Station. 47 people. 8 years.", "threshold": 10, "thresholdType": "dsn-total", "reward": {} },
    { "id": "commanders-log", "label": "COMMANDER'S LOG", "description": "She kept the records. She made the hard calls. She stayed.", "threshold": 0, "thresholdType": "dsn-sender-vasquez", "reward": {} },
    { "id": "the-grid", "label": "THE GRID", "description": "He found the pattern. 200 meters. 1.2 meters deep. Everywhere.", "threshold": 0, "thresholdType": "dsn-sender-oliveira", "reward": {} },
    { "id": "power-budget", "label": "POWER BUDGET", "description": "His firmware is still running. In your rover. Right now.", "threshold": 0, "thresholdType": "dsn-sender-nakamura", "reward": {} },
    { "id": "perseverance-patience-spite", "label": "PERSEVERANCE, PATIENCE, SPITE", "description": "She named them. Every single one.", "threshold": 0, "thresholdType": "dsn-sender-al-rashid", "reward": {} },
    { "id": "the-ground-knows", "label": "THE GROUND KNOWS", "description": "'This planet catches you.' She was right.", "threshold": 0, "thresholdType": "dsn-sender-tanaka", "reward": {} },
    { "id": "last-signal", "label": "LAST SIGNAL", "description": "6 hours 41 minutes. 2.3 terabytes. Then silence.", "threshold": 0, "thresholdType": "dsn-sender-cortez", "reward": {} },
    { "id": "between-neutrons", "label": "BETWEEN THE NEUTRONS", "description": "The boy. The father. The catcher. It's all in there.", "threshold": 0, "thresholdType": "dsn-corrupted-all", "reward": {} },
    { "id": "archive-complete", "label": "ARCHIVE COMPLETE", "description": "You found them all. Now find TX-039.", "threshold": 38, "thresholdType": "dsn-colonist-total", "reward": {} },
    { "id": "welcome-home", "label": "WELCOME HOME", "description": "You are the message and the reader. You always were.", "threshold": 0, "thresholdType": "dsn-tx039-read", "reward": {} }
  ]
}
```

Note: The exact threshold/thresholdType fields should match how the existing achievement system checks unlocks. Examine the existing achievement checker in `useRewardTrack.ts` or the achievement dialog to determine the correct hook pattern. The `threshold: 0` entries are sender-completion achievements that trigger when all logs from that sender are found (the checker will need to count per-sender totals from the catalog).

- [ ] **Step 2: Wire achievement checks in useDSNArchive**

The achievement system integration depends on how `achievements.json` is consumed (likely in `useRewardTrack.ts` or a dedicated achievement composable). The DSN archive should expose computed values that achievement checkers can query:

```typescript
// Add to useDSNArchive.ts:
const senderCompletions = computed(() => {
  const result: Record<string, { found: number; total: number }> = {}
  for (const tx of catalog.value) {
    if (tx.category !== 'colonist') continue
    if (!result[tx.senderKey]) result[tx.senderKey] = { found: 0, total: 0 }
    result[tx.senderKey].total++
    if (discoveredIds.value.has(tx.id)) result[tx.senderKey].found++
  }
  return result
})

const corruptedAllFound = computed(() => {
  const corrupted = catalog.value.filter(
    t => t.category === 'colonist' && t.senderKey === 'unknown' && t.id !== 'TX-039',
  )
  return corrupted.length > 0 && corrupted.every(t => discoveredIds.value.has(t.id))
})

const tx039Read = computed(() => {
  const d = discoveries.value.find(d => d.transmissionId === 'TX-039')
  return d?.read ?? false
})
```

Export these from the composable return object.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add public/data/achievements.json src/composables/useDSNArchive.ts
git commit -m "feat(dsn): achievement hooks for transmission milestones and sender completions"
```

---

### Task 8: Final Integration & Polish

**Files:**
- Modify: `src/views/MarsSiteViewController.ts` — ensure DSN catalog loads
- Run full test suite and type check

- [ ] **Step 1: Verify full integration**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: Clean type check, all tests pass

- [ ] **Step 2: Manual testing checklist**

1. Start dev server (`npm run dev`)
2. Complete missions through m12-upgrade
3. Receive m13-deep-signal via LGA mailbox
4. Accept mission, open UHF overlay (slot 12)
5. Verify "INSTALL DSN ARCHAEOLOGY v1.0" button appears
6. Click install — verify toast, mission objective completes
7. Wait for UHF pass — verify transmissions arrive (toast notification)
8. Open ARCHIVE from navbar — verify dialog opens
9. Verify TX-001 is always in first batch
10. Verify timeline dots, sender filters, collection counter work
11. Verify colonist logs show warm amber, echoes show cool blue-gray
12. Verify `[CORRUPTED]` markers render in red
13. Verify unread badge on ARCHIVE button clears when transmissions are read

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(dsn): DSN Archaeology complete — transmissions, archive UI, mission, achievements"
```
