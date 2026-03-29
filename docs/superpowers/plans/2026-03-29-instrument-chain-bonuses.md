# Instrument Chain Bonuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `chainDrillBonus` and `chainLootBonus` to the modifier system, extend `InstrumentDef` with `InstrumentChainBonus`, and declare chain bonuses for MastCam, ChemCam, and APXS in `instruments.json`.

**Architecture:** Two new `ProfileModifiers` keys make chain bonuses buffable by reward track and archetypes. `InstrumentChainBonus` on `InstrumentDef` is purely declarative — controllers are not touched here (Plan B wires the modifiers into `DrillController` and `LaserDrill`). APXS reuses `instrumentAccuracy` since its trace drop count already scales with `accuracyMod` in the controller.

**Tech Stack:** TypeScript strict, Vitest, JSON

---

## Context

**Chain bonuses** are effects applied to a rock target when a specific instrument has been used on it, realized at drill time:

| Instrument | Effect | Current code | Base value |
|------------|--------|-------------|------------|
| MastCam | Tagged rocks drill faster | `LaserDrill.scanSpeedMult = 0.6` (hardcoded) | 40% faster |
| ChemCam | Analyzed rocks yield heavier samples | `weightMult += 0.3` (hardcoded) | +30% weight |
| APXS | Yields trace elements on drill | `1 + Math.floor(Math.random() * 2 * accuracyMod)` | 1–2 drops (already uses `instrumentAccuracy`) |

This plan adds the **data model** only. The modifier keys are declared now so reward track authors can reference them; wiring into controllers is Plan B.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/composables/usePlayerProfile.ts` | Modify | Add `chainDrillBonus`, `chainLootBonus` to `ProfileModifiers` + `ZERO_MODIFIERS` |
| `src/types/instruments.ts` | Modify | Add `InstrumentChainBonus` interface + `chainBonuses?` field to `InstrumentDef` |
| `public/data/instruments.json` | Modify | Add `chainBonuses` to mastcam, chemcam, apxs |
| `src/types/__tests__/instrumentsData.test.ts` | Modify | Add validation test for `chainBonuses` entries |

---

## Task 1: Add chainDrillBonus and chainLootBonus to ProfileModifiers

**Files:**
- Modify: `src/composables/usePlayerProfile.ts`

`NEUTRAL_MODIFIERS` derives itself from `Object.keys(ZERO_MODIFIERS)` — no change needed there, it picks up new keys automatically.

- [ ] **Add two keys to `ProfileModifiers` interface** (lines 7–23, after `radiationTolerance`):

```typescript
export interface ProfileModifiers {
  movementSpeed: number
  analysisSpeed: number
  powerConsumption: number
  heaterDraw: number
  spYield: number
  inventorySpace: number
  instrumentAccuracy: number
  repairCost: number
  upgradeCost: number
  weatherWarning: number
  batteryCapacity: number
  danScanRadius: number
  buildSpeed: number
  structureDurability: number
  radiationTolerance: number
  /** Drill speed multiplier on MastCam-tagged rocks. 0 = no bonus, 0.4 = 40% faster (base). */
  chainDrillBonus: number
  /** Sample weight multiplier on ChemCam-analyzed rocks. 0 = no bonus, 0.3 = +30% weight (base). */
  chainLootBonus: number
}
```

- [ ] **Add two keys to `ZERO_MODIFIERS`** (lines 25–41, after `radiationTolerance: 0`):

```typescript
const ZERO_MODIFIERS: ProfileModifiers = {
  movementSpeed: 0,
  analysisSpeed: 0,
  powerConsumption: 0,
  heaterDraw: 0,
  spYield: 0,
  inventorySpace: 0,
  instrumentAccuracy: 0,
  repairCost: 0,
  upgradeCost: 0,
  weatherWarning: 0,
  batteryCapacity: 0,
  danScanRadius: 0,
  buildSpeed: 0,
  structureDurability: 0,
  radiationTolerance: 0,
  chainDrillBonus: 0,
  chainLootBonus: 0,
}
```

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd D:\Developer\irover && npx vue-tsc --noEmit 2>&1 | head -20
```

Expected: zero new errors. Pre-existing errors elsewhere are fine.

- [ ] **Commit:**

```bash
git add src/composables/usePlayerProfile.ts
git commit -m "feat(profile): add chainDrillBonus and chainLootBonus to ProfileModifiers"
```

---

## Task 2: Add InstrumentChainBonus to instruments.ts

**Files:**
- Modify: `src/types/instruments.ts`

The current file already has `InstrumentStatDef`, `InstrumentPassiveBonus`, and `InstrumentDef` with `stats` + `provides?`. Add one new interface and one new optional field.

- [ ] **Add `InstrumentChainBonus` interface** — insert after `InstrumentPassiveBonus` (before `InstrumentDef`):

```typescript
export interface InstrumentChainBonus {
  /**
   * ProfileModifiers key that buffs this chain effect via reward track / archetypes.
   * e.g. "chainDrillBonus" for MastCam → drill speed, "chainLootBonus" for ChemCam → sample weight.
   * APXS trace elements use "instrumentAccuracy" — already wired in DrillController.
   */
  key: keyof ProfileModifiers
  /**
   * Base effect magnitude expressed as a positive benefit.
   * 0.4 = "40% faster", 0.3 = "+30% weight", 2 = "up to 2 drops".
   */
  baseValue: number
  /** Display label shown in instrument panel, e.g. "DRILL BONUS", "LOOT YIELD" */
  label: string
  /** One-line description, e.g. "Tagged rocks drill 40% faster" */
  description: string
}
```

- [ ] **Add `chainBonuses?` field to `InstrumentDef`** — after the `provides?` field:

```typescript
  /**
   * Effects granted to a rock target when this instrument has been used on it,
   * realized when that target is subsequently drilled. Buffable via ProfileModifiers.
   * Plan B wires these into DrillController and LaserDrill.
   */
  chainBonuses?: InstrumentChainBonus[]
```

- [ ] **Verify TypeScript compiles cleanly:**

```bash
cd D:\Developer\irover && npx vue-tsc --noEmit 2>&1 | head -20
```

Expected: zero new errors.

- [ ] **Commit:**

```bash
git add src/types/instruments.ts
git commit -m "feat(instruments): add InstrumentChainBonus interface and chainBonuses field to InstrumentDef"
```

---

## Task 3: Populate chainBonuses in instruments.json

**Files:**
- Modify: `public/data/instruments.json`

Add `chainBonuses` to three instruments only: mastcam, chemcam, apxs. All other instruments are unchanged.

- [ ] **Add `chainBonuses` to mastcam** — after the `stats` array in the mastcam object:

```json
"chainBonuses": [
  {
    "key": "chainDrillBonus",
    "baseValue": 0.4,
    "label": "DRILL BONUS",
    "description": "Tagged rocks drill 40% faster"
  }
]
```

- [ ] **Add `chainBonuses` to chemcam** — after the `stats` array in the chemcam object:

```json
"chainBonuses": [
  {
    "key": "chainLootBonus",
    "baseValue": 0.3,
    "label": "LOOT YIELD",
    "description": "Analyzed rocks yield 30% heavier samples"
  }
]
```

- [ ] **Add `chainBonuses` to apxs** — after the `stats` array in the apxs object:

```json
"chainBonuses": [
  {
    "key": "instrumentAccuracy",
    "baseValue": 2,
    "label": "TRACE ELEMENTS",
    "description": "Yields 1–2 surface trace elements on drill"
  }
]
```

- [ ] **Validate JSON is well-formed:**

```bash
cd D:\Developer\irover && node -e "JSON.parse(require('fs').readFileSync('public/data/instruments.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Commit:**

```bash
git add public/data/instruments.json
git commit -m "feat(instruments): add chainBonuses to mastcam, chemcam, and apxs"
```

---

## Task 4: Add chainBonuses validation test

**Files:**
- Modify: `src/types/__tests__/instrumentsData.test.ts`

The current file has 10 tests. Add one new `it()` block inside the existing `describe('instruments.json', ...)`, after the last existing test. Also add `chainDrillBonus` and `chainLootBonus` to the `VALID_MODIFIER_KEYS` array at the top.

- [ ] **Update `VALID_MODIFIER_KEYS`** — the array at lines 9–25, add two entries:

```typescript
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
  'chainDrillBonus',
  'chainLootBonus',
]
```

- [ ] **Add the new test case** — after the last `it()` block (the `provides` test), before the closing `})`:

```typescript
  it('chainBonuses entries have valid key, numeric baseValue, label, and description', () => {
    for (const inst of instruments) {
      if (!inst.chainBonuses) continue
      for (const bonus of inst.chainBonuses) {
        expect(bonus.key, `${inst.id} chainBonus missing key`).toBeTruthy()
        expect(
          VALID_MODIFIER_KEYS,
          `${inst.id} chainBonus key "${bonus.key}" is not a valid ProfileModifiers key`,
        ).toContain(bonus.key)
        expect(typeof bonus.baseValue, `${inst.id} chainBonus baseValue must be number`).toBe('number')
        expect(bonus.baseValue, `${inst.id} chainBonus baseValue must be > 0`).toBeGreaterThan(0)
        expect(bonus.label, `${inst.id} chainBonus missing label`).toBeTruthy()
        expect(bonus.description, `${inst.id} chainBonus missing description`).toBeTruthy()
      }
    }
  })
```

- [ ] **Run the tests — expect 11 tests pass:**

```bash
cd D:\Developer\irover && npm run test -- src/types/__tests__/instrumentsData.test.ts
```

Expected:
```
Test Files  1 passed (1)
     Tests  11 passed (11)
```

- [ ] **Run full suite — expect no regressions:**

```bash
cd D:\Developer\irover && npm run test
```

Expected: all test files pass.

- [ ] **Commit:**

```bash
git add src/types/__tests__/instrumentsData.test.ts
git commit -m "test(instruments): validate chainBonuses entries in instruments.json"
```

---

## Self-Review

**Spec coverage:**
- ✅ `chainDrillBonus` + `chainLootBonus` added to `ProfileModifiers` and `ZERO_MODIFIERS` — Task 1
- ✅ `NEUTRAL_MODIFIERS` auto-derives — no task needed
- ✅ `InstrumentChainBonus` interface with `key: keyof ProfileModifiers`, `baseValue`, `label`, `description` — Task 2
- ✅ `chainBonuses?: InstrumentChainBonus[]` on `InstrumentDef` — Task 2
- ✅ MastCam `chainDrillBonus` baseValue 0.4 — Task 3
- ✅ ChemCam `chainLootBonus` baseValue 0.3 — Task 3
- ✅ APXS `instrumentAccuracy` baseValue 2 — Task 3
- ✅ Validation test with key in `VALID_MODIFIER_KEYS`, numeric baseValue > 0, label, description — Task 4
- ✅ `VALID_MODIFIER_KEYS` updated with new keys — Task 4

**Type consistency:** `InstrumentChainBonus.key` is `keyof ProfileModifiers` — the two new keys (`chainDrillBonus`, `chainLootBonus`) added in Task 1 are therefore valid values for Task 2's type. Tasks are ordered correctly: ProfileModifiers first, then the type that references it.
