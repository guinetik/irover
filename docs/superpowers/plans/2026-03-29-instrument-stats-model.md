# Instrument Stats Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `InstrumentDef` with `stats` (which modifier-driven stats each instrument exposes) and `provides` (passive bonuses emitted when active), then populate all 14 instruments in `instruments.json`.

**Architecture:** Three purely additive changes — new interfaces in `src/types/instruments.ts`, new fields in `public/data/instruments.json`, and new test cases in the existing validation test. No controllers, no overlay, no tick handlers touched. `keyof ProfileModifiers` types the `key` field on both new interfaces, ensuring the instrument model and the modifier system speak the same language.

**Tech Stack:** TypeScript strict, Vitest, JSON

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/types/instruments.ts` | Modify | Add `InstrumentStatDef`, `InstrumentPassiveBonus` interfaces; add `stats` + `provides?` to `InstrumentDef` |
| `public/data/instruments.json` | Modify | Add `stats` array to all 14 instruments; add `provides` to REMS |
| `src/types/__tests__/instrumentsData.test.ts` | Modify | Add 3 new test cases for stats and provides validation |

---

## Task 1: Extend the type definitions

**Files:**
- Modify: `src/types/instruments.ts`

Current file ends at line 49. The new interfaces go before `InstrumentDef` and two new fields are appended inside it.

- [ ] **Update `src/types/instruments.ts` to the following complete content:**

```typescript
// src/types/instruments.ts
import type { ProfileModifiers } from '@/composables/usePlayerProfile'

export interface InstrumentHelpImage {
  /** Path to screenshot, e.g. "/images/help/dan-panel.jpg". Player-sourced. */
  src: string
  /** Describes exactly what screenshot to capture — shown as caption in dialog. */
  alt: string
}

export interface InstrumentHelpSection {
  /** Uppercase heading, e.g. "OPERATION", "WATCH FOR", "POWER BUDGET" */
  heading: string
  /** Plain text body — no HTML. */
  body: string
}

export interface InstrumentHelp {
  /** One-line gameplay summary shown at the top of the help dialog. */
  summary: string
  sections: InstrumentHelpSection[]
  images?: InstrumentHelpImage[]
}

export interface InstrumentUpgradeDef {
  name: string
  desc: string
  req: string
}

export interface InstrumentStatDef {
  /**
   * Key into ProfileModifiers — ties this stat to every buff/nerf source:
   * archetype, foundation, patron, reward track.
   * Must match a key on the ProfileModifiers interface exactly.
   */
  key: keyof ProfileModifiers
  /** Display label shown in the overlay stat panel, e.g. "DRILL SPEED", "ACCURACY" */
  label: string
}

export interface InstrumentPassiveBonus {
  /**
   * Which ProfileModifiers key is buffed when this instrument's passive
   * subsystem is active (e.g. REMS active → spYield gets +5%).
   */
  key: keyof ProfileModifiers
  /** Additive percentage offset, e.g. 0.05 = +5%, -0.05 = -5% */
  value: number
  /** Label shown in other instruments' buff breakdown, e.g. "REMS ACTIVE" */
  label: string
}

export interface InstrumentDef {
  /** Stable lowercase identifier, e.g. "dan", "chemcam" */
  id: string
  /** Matches slot keys in InstrumentOverlay (1–14) */
  slot: number
  icon: string
  name: string
  /** Subtitle shown in overlay header */
  type: string
  /** Short description shown in overlay body */
  desc: string
  /** Display string for power draw, e.g. "10W" or "6W / 100W drilling" */
  power: string
  /** Key into CONTROLLER_REGISTRY */
  controllerType: string
  /** Key into TICK_HANDLER_REGISTRY (populated in Plan B) */
  tickHandlerType: string
  upgrade: InstrumentUpgradeDef
  help: InstrumentHelp
  /**
   * Ordered list of modifier-driven stats this instrument exposes.
   * Order controls display order in the overlay stat panel (Plan B).
   * Empty array = instrument has no modifier-driven stats (LGA, UHF, Mic).
   */
  stats: InstrumentStatDef[]
  /**
   * Passive bonuses this instrument emits to all other instruments when its
   * passive subsystem is enabled. Collected by Plan B's computed layer and
   * stacked into modifier resolution for every other instrument.
   * Most instruments omit this field.
   */
  provides?: InstrumentPassiveBonus[]
}
```

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd D:\Developer\irover && npx vue-tsc --noEmit 2>&1 | head -20
```

Expected: zero new errors (pre-existing errors in the codebase are fine; errors referencing `instruments.ts` are not).

- [ ] **Commit:**

```bash
git add src/types/instruments.ts
git commit -m "feat(instruments): add InstrumentStatDef and InstrumentPassiveBonus to InstrumentDef"
```

---

## Task 2: Populate stats in instruments.json

**Files:**
- Modify: `public/data/instruments.json`

Add a `"stats"` array after the `"help"` field of every instrument. Add `"provides"` to REMS only. The `stats` array is empty (`[]`) for LGA, UHF, and Mic.

**Stat key reference** — these are the exact `ProfileModifiers` keys used:
- `"analysisSpeed"` — how fast the instrument operates (scan, drill, analysis)
- `"instrumentAccuracy"` — yield quality and legendary result threshold
- `"powerConsumption"` — active power draw (reduction = less draw)
- `"danScanRadius"` — DAN passive scan radius
- `"spYield"` — science points earned per result
- `"movementSpeed"` — drive speed
- `"heaterDraw"` — heater power draw
- `"radiationTolerance"` — radiation damage resistance

- [ ] **Add `"stats"` to mastcam (slot 1)** — inside the mastcam object, after `"help": { ... }`:

```json
"stats": [
  { "key": "analysisSpeed", "label": "SCAN SPEED" },
  { "key": "instrumentAccuracy", "label": "ACCURACY" }
]
```

- [ ] **Add `"stats"` to chemcam (slot 2):**

```json
"stats": [
  { "key": "analysisSpeed", "label": "ANALYSIS SPEED" },
  { "key": "instrumentAccuracy", "label": "ACCURACY" },
  { "key": "powerConsumption", "label": "POWER DRAW" }
]
```

- [ ] **Add `"stats"` to drill (slot 3):**

```json
"stats": [
  { "key": "analysisSpeed", "label": "DRILL SPEED" },
  { "key": "instrumentAccuracy", "label": "ACCURACY" },
  { "key": "powerConsumption", "label": "POWER DRAW" }
]
```

- [ ] **Add `"stats"` to apxs (slot 4):**

```json
"stats": [
  { "key": "analysisSpeed", "label": "ANALYSIS SPEED" },
  { "key": "instrumentAccuracy", "label": "ACCURACY" }
]
```

- [ ] **Add `"stats"` to dan (slot 5):**

```json
"stats": [
  { "key": "analysisSpeed", "label": "SCAN SPEED" },
  { "key": "instrumentAccuracy", "label": "ACCURACY" },
  { "key": "danScanRadius", "label": "SCAN RADIUS" },
  { "key": "powerConsumption", "label": "POWER DRAW" }
]
```

- [ ] **Add `"stats"` to sam (slot 6):**

```json
"stats": [
  { "key": "analysisSpeed", "label": "ANALYSIS SPEED" },
  { "key": "instrumentAccuracy", "label": "ACCURACY" },
  { "key": "powerConsumption", "label": "POWER DRAW" }
]
```

- [ ] **Add `"stats"` to rtg (slot 7):**

```json
"stats": [
  { "key": "powerConsumption", "label": "POWER OUTPUT" }
]
```

- [ ] **Add `"stats"` and `"provides"` to rems (slot 8):**

```json
"stats": [
  { "key": "spYield", "label": "SP YIELD" }
],
"provides": [
  { "key": "spYield", "value": 0.05, "label": "REMS ACTIVE" }
]
```

- [ ] **Add `"stats"` to rad (slot 9):**

```json
"stats": [
  { "key": "radiationTolerance", "label": "TOLERANCE" }
]
```

- [ ] **Add `"stats"` to heater (slot 10):**

```json
"stats": [
  { "key": "heaterDraw", "label": "HEAT DRAW" }
]
```

- [ ] **Add `"stats"` to lga (slot 11):**

```json
"stats": []
```

- [ ] **Add `"stats"` to uhf (slot 12):**

```json
"stats": []
```

- [ ] **Add `"stats"` to wheels (slot 13):**

```json
"stats": [
  { "key": "movementSpeed", "label": "DRIVE SPEED" }
]
```

- [ ] **Add `"stats"` to mic (slot 14):**

```json
"stats": []
```

- [ ] **Validate the JSON is well-formed:**

```bash
cd D:\Developer\irover && node -e "JSON.parse(require('fs').readFileSync('public/data/instruments.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Commit:**

```bash
git add public/data/instruments.json
git commit -m "feat(instruments): add stats and provides declarations to all 14 instruments"
```

---

## Task 3: Extend the validation test

**Files:**
- Modify: `src/types/__tests__/instrumentsData.test.ts`

Add three new `it()` blocks inside the existing `describe('instruments.json', ...)` block, after the last existing test case (line 62, before the closing `})`).

- [ ] **Add the three new test cases to `src/types/__tests__/instrumentsData.test.ts`:**

The complete updated file content:

```typescript
// src/types/__tests__/instrumentsData.test.ts
import { describe, it, expect } from 'vitest'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '../instruments'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

// All valid ProfileModifiers keys — must stay in sync with usePlayerProfile.ts
const VALID_MODIFIER_KEYS = [
  'movementSpeed',
  'analysisSpeed',
  'powerConsumption',
  'heaterDraw',
  'spYield',
  'inventorySpace',
  'instrumentAccuracy',
  'repairCost',
  'upgradeCost',
  'weatherWarning',
  'batteryCapacity',
  'danScanRadius',
  'buildSpeed',
  'structureDurability',
  'radiationTolerance',
]

describe('instruments.json', () => {
  it('has at least one instrument', () => {
    expect(instruments.length).toBeGreaterThan(0)
  })

  it('every instrument has required top-level fields', () => {
    for (const inst of instruments) {
      expect(inst.id, `${inst.id} missing id`).toBeTruthy()
      expect(typeof inst.slot, `${inst.id} slot must be number`).toBe('number')
      expect(inst.name, `${inst.id} missing name`).toBeTruthy()
      expect(inst.type, `${inst.id} missing type`).toBeTruthy()
      expect(inst.desc, `${inst.id} missing desc`).toBeTruthy()
      expect(inst.power, `${inst.id} missing power`).toBeTruthy()
      expect(inst.controllerType, `${inst.id} missing controllerType`).toBeTruthy()
      expect(inst.tickHandlerType, `${inst.id} missing tickHandlerType`).toBeTruthy()
    }
  })

  it('every instrument has a valid help object', () => {
    for (const inst of instruments) {
      expect(inst.help, `${inst.id} missing help`).toBeDefined()
      expect(inst.help.summary, `${inst.id} help missing summary`).toBeTruthy()
      expect(inst.help.sections.length, `${inst.id} help must have at least one section`).toBeGreaterThan(0)
      for (const section of inst.help.sections) {
        expect(section.heading, `${inst.id} section missing heading`).toBeTruthy()
        expect(section.body, `${inst.id} section missing body`).toBeTruthy()
      }
    }
  })

  it('slot numbers are unique', () => {
    const slots = instruments.map(i => i.slot)
    const unique = new Set(slots)
    expect(unique.size).toBe(slots.length)
  })

  it('all 14 instruments are present', () => {
    expect(instruments.length).toBe(14)
  })

  it('ids are unique', () => {
    const ids = instruments.map(i => i.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('images have src and alt if present', () => {
    for (const inst of instruments) {
      if (!inst.help.images) continue
      for (const img of inst.help.images) {
        expect(img.src, `${inst.id} image missing src`).toBeTruthy()
        expect(img.alt, `${inst.id} image missing alt`).toBeTruthy()
      }
    }
  })

  it('every instrument has a stats array', () => {
    for (const inst of instruments) {
      expect(Array.isArray(inst.stats), `${inst.id} missing stats array`).toBe(true)
    }
  })

  it('every stat has a valid key and non-empty label', () => {
    for (const inst of instruments) {
      for (const stat of inst.stats) {
        expect(stat.key, `${inst.id} stat missing key`).toBeTruthy()
        expect(stat.label, `${inst.id} stat missing label`).toBeTruthy()
        expect(
          VALID_MODIFIER_KEYS,
          `${inst.id} stat.key "${stat.key}" is not a valid ProfileModifiers key`,
        ).toContain(stat.key)
      }
    }
  })

  it('provides entries have valid key, numeric value, and non-empty label', () => {
    for (const inst of instruments) {
      if (!inst.provides) continue
      for (const bonus of inst.provides) {
        expect(bonus.key, `${inst.id} provides entry missing key`).toBeTruthy()
        expect(
          VALID_MODIFIER_KEYS,
          `${inst.id} provides key "${bonus.key}" is not a valid ProfileModifiers key`,
        ).toContain(bonus.key)
        expect(typeof bonus.value, `${inst.id} provides entry value must be number`).toBe('number')
        expect(bonus.label, `${inst.id} provides entry missing label`).toBeTruthy()
      }
    }
  })
})
```

- [ ] **Run the tests — expect all to pass:**

```bash
cd D:\Developer\irover && npm run test -- src/types/__tests__/instrumentsData.test.ts
```

Expected output:
```
Test Files  1 passed (1)
     Tests  10 passed (10)
```

- [ ] **Run the full suite to confirm no regressions:**

```bash
cd D:\Developer\irover && npm run test
```

Expected: all test files pass.

- [ ] **Commit:**

```bash
git add src/types/__tests__/instrumentsData.test.ts
git commit -m "test(instruments): validate stats and provides arrays in instruments.json"
```

---

## Self-Review

**Spec coverage:**
- ✅ `InstrumentStatDef` interface with `key: keyof ProfileModifiers` + `label` — Task 1
- ✅ `InstrumentPassiveBonus` interface with `key`, `value`, `label` — Task 1
- ✅ `stats: InstrumentStatDef[]` on `InstrumentDef` — Task 1
- ✅ `provides?: InstrumentPassiveBonus[]` on `InstrumentDef` — Task 1
- ✅ All 14 instruments populated with stat arrays per spec table — Task 2
- ✅ REMS has `provides: [{ key: "spYield", value: 0.05, label: "REMS ACTIVE" }]` — Task 2
- ✅ 3 new test cases: stats array exists, stat keys valid, provides entries valid — Task 3
- ✅ Runtime key validation against `VALID_MODIFIER_KEYS` list — Task 3 (stronger than spec required)

**Type consistency:** `InstrumentStatDef.key` and `InstrumentPassiveBonus.key` are both `keyof ProfileModifiers` throughout. The `VALID_MODIFIER_KEYS` array in the test matches the 15 keys on `ProfileModifiers` in `usePlayerProfile.ts`.
