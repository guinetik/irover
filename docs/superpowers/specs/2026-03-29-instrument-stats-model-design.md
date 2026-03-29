# Instrument Stats Model — Design
**Date:** 2026-03-29
**Scope:** Extend `InstrumentDef` with `stats`, `provides`, and `chainBonuses` declarations. Add two new `ProfileModifiers` keys for chain bonuses. Zero changes to display or tick handlers.

---

## Goal

Every instrument declares which modifier-driven stats apply to it, what passive bonuses it emits when active, and what chain bonuses it grants to targets it has been used on. This gives the reward track, archetype, and patron modifier systems a single authoritative place to know what each instrument cares about — and gives Plan B's computed layer and overlay refactor a clean foundation to build on.

---

## Out of Scope (Plan B)

- Resolving declared stats against live modifiers (`ResolvedInstrumentStats`)
- `InstrumentOverlay.vue` refactor — replacing hardcoded per-slot stat blocks
- `buildSpeedBreakdown()` integration with the new model
- Wiring `chainDrillBonus` / `chainLootBonus` into `DrillController` / `LaserDrill` — declared in model now, applied in Plan B
- Any changes to `InstrumentController` subclasses

---

## 0. New ProfileModifiers Keys — `src/composables/usePlayerProfile.ts`

Two new keys added to the `ProfileModifiers` interface:

```ts
chainDrillBonus: number   // drill speed multiplier on MastCam-tagged rocks (base +40%)
chainLootBonus: number    // sample weight multiplier on ChemCam-analyzed rocks (base +30%)
```

Also add `0` defaults for both in `ZERO_MODIFIERS` and `NEUTRAL_MODIFIERS` (following the existing pattern for all other keys in that file).

**Why two new keys and not reusing existing ones:** these are chain-specific effects tied to instrument sequencing — independent from `analysisSpeed` (instrument operation speed) and `instrumentAccuracy` (yield quality). A reward track perk called "FIELD SEQUENCING" that buffs both chain bonuses makes narrative sense and requires its own knob.

**Note:** APXS trace element drops already scale with `accuracyMod` (from `instrumentAccuracy`) in `DrillController.ts:279`. No new key needed for APXS.

---

## 1. Type Extension — `src/types/instruments.ts`

Add three new interfaces and three fields to `InstrumentDef`:

```ts
export interface InstrumentStatDef {
  /** Key into ProfileModifiers — drives all buff/nerf sources (archetype, reward track, etc.) */
  key: keyof ProfileModifiers
  /** Display label shown in the overlay stat panel, e.g. "DRILL SPEED", "ACCURACY" */
  label: string
}

export interface InstrumentPassiveBonus {
  /** Which ProfileModifiers key is buffed when this instrument's passive subsystem is active */
  key: keyof ProfileModifiers
  /** Additive percentage offset, e.g. 0.05 = +5% */
  value: number
  /** Label shown in other instruments' buff breakdowns, e.g. "REMS ACTIVE" */
  label: string
}

export interface InstrumentChainBonus {
  /**
   * ProfileModifiers key that buffs this chain effect via reward track / archetypes.
   * e.g. "chainDrillBonus" for MastCam → drill speed, "chainLootBonus" for ChemCam → sample weight.
   */
  key: keyof ProfileModifiers
  /**
   * Base effect magnitude expressed as a positive benefit.
   * 0.4 = "40% faster", 0.3 = "+30% weight", 2 = "up to 2 drops".
   */
  baseValue: number
  /** Display label, e.g. "DRILL BONUS", "LOOT YIELD", "TRACE ELEMENTS" */
  label: string
  /** One-line description shown in instrument panel, e.g. "Tagged rocks drill 40% faster" */
  description: string
}
```

Add to `InstrumentDef`:

```ts
/**
 * Ordered list of modifier-driven stats this instrument exposes.
 * Order controls display order in the overlay stat panel.
 * Empty array = instrument has no modifier-driven stats (LGA, UHF, Mic).
 */
stats: InstrumentStatDef[]

/**
 * Passive buffs this instrument emits to all other instruments when its
 * passive subsystem is enabled. Stacked into modifier resolution by Plan B's
 * computed layer. Most instruments omit this field.
 */
provides?: InstrumentPassiveBonus[]

/**
 * Effects granted to a rock target when this instrument has been used on it.
 * Applied when that target is subsequently drilled. Buffable via ProfileModifiers.
 * e.g. MastCam tag → drill bonus; ChemCam shot → loot weight bonus.
 */
chainBonuses?: InstrumentChainBonus[]
```

`keyof ProfileModifiers` is the load-bearing constraint on both interfaces. It enforces that only valid modifier keys can be declared, and it guarantees that the reward track's `modifierKey` field, the instrument's `stat.key`, and the `provides[].key` are the same type — so buff resolution in Plan B requires no translation layer.

`ProfileModifiers` must be imported in `instruments.ts` (type-only import from `@/composables/usePlayerProfile`).

---

## 2. instruments.json — Stats Per Instrument

```
analysisSpeed  →  "how fast the instrument operates"
                  label varies by instrument (SCAN SPEED, DRILL SPEED, ANALYSIS SPEED)
                  same buff pool — reward track "analysisSpeed" benefits all of them

instrumentAccuracy  →  "yield quality and legendary result threshold"
                        universal for science instruments
                        below ~90% accuracy: no legendary results from SAM, poor yield

powerConsumption  →  "active power draw"
                      declared on high-draw instruments so reward track reductions are visible
                      RTG: declared as POWER OUTPUT (consumption reduction = more output)

danScanRadius, movementSpeed, heaterDraw, radiationTolerance  →  instrument-specific
```

| Instrument | `stats` | `chainBonuses` |
|------------|---------|---------------|
| MastCam | `analysisSpeed` "SCAN SPEED", `instrumentAccuracy` "RANGE" | `chainDrillBonus` "DRILL BONUS" baseValue 0.4 — "Tagged rocks drill 40% faster" |
| ChemCam | `analysisSpeed` "ANALYSIS SPEED", `instrumentAccuracy` "ACCURACY", `powerConsumption` "POWER DRAW" | `chainLootBonus` "LOOT YIELD" baseValue 0.3 — "Analyzed rocks yield 30% heavier samples" |
| Drill | `analysisSpeed` "DRILL SPEED", `instrumentAccuracy` "ACCURACY", `powerConsumption` "POWER DRAW" | — |
| APXS | `analysisSpeed` "ANALYSIS SPEED", `instrumentAccuracy` "ACCURACY" | `instrumentAccuracy` "TRACE ELEMENTS" baseValue 2 — "Yields 1–2 surface trace elements on drill" |
| DAN | `analysisSpeed` "SCAN SPEED", `instrumentAccuracy` "ACCURACY", `danScanRadius` "SCAN RADIUS", `powerConsumption` "POWER DRAW" | — |
| SAM | `analysisSpeed` "ANALYSIS SPEED", `instrumentAccuracy` "ACCURACY", `powerConsumption` "POWER DRAW" | — |
| RTG | `powerConsumption` "POWER OUTPUT" | — |
| REMS | `spYield` "SP YIELD" + **`provides`:** `{ key: "spYield", value: 0.05, label: "REMS ACTIVE" }` | — |
| RAD | `radiationTolerance` "TOLERANCE" | — |
| Heater | `heaterDraw` "HEAT DRAW" | — |
| LGA | _(empty)_ | — |
| UHF | _(empty)_ | — |
| Wheels | `movementSpeed` "DRIVE SPEED" | — |
| Mic | _(empty)_ | — |

---

## 3. Validation Test Update — `src/types/__tests__/instrumentsData.test.ts`

Add three new test cases:

```ts
it('every instrument has a stats array', () => {
  for (const inst of instruments) {
    expect(Array.isArray(inst.stats), `${inst.id} missing stats array`).toBe(true)
  }
})

it('every stat has a non-empty key and label', () => {
  for (const inst of instruments) {
    for (const stat of inst.stats) {
      expect(stat.key, `${inst.id} stat missing key`).toBeTruthy()
      expect(stat.label, `${inst.id} stat missing label`).toBeTruthy()
    }
  }
})

it('provides entries have key, value, and label', () => {
  for (const inst of instruments) {
    if (!inst.provides) continue
    for (const bonus of inst.provides) {
      expect(bonus.key, `${inst.id} provides entry missing key`).toBeTruthy()
      expect(typeof bonus.value, `${inst.id} provides entry value must be number`).toBe('number')
      expect(bonus.label, `${inst.id} provides entry missing label`).toBeTruthy()
    }
  }
})
```

Type-safety via `keyof ProfileModifiers` is enforced at compile time — the tests cover the runtime JSON shape.

---

## File Checklist

| File | Action |
|------|--------|
| `src/composables/usePlayerProfile.ts` | Add `chainDrillBonus` and `chainLootBonus` to `ProfileModifiers`, `ZERO_MODIFIERS`, `NEUTRAL_MODIFIERS` |
| `src/types/instruments.ts` | Add `InstrumentChainBonus` interface + `chainBonuses?` field to `InstrumentDef` |
| `public/data/instruments.json` | Add `chainBonuses` to MastCam, ChemCam, APXS |
| `src/types/__tests__/instrumentsData.test.ts` | Add validation case for `chainBonuses` entries |

---

## Plan B Hook

When Plan B's computed layer is built, it will:

1. Collect `provides[]` from all currently active instruments → stack into a `passiveBonuses` modifier map
2. Take `instrument.stats[]` + all modifier sources (profile, reward track, thermal, storm, passiveBonuses)
3. For each `stat`, call `buildSpeedBreakdown(stat.key, ...)` → `ResolvedStat { pct, buffs[] }`
   - If an active REMS contributes `spYield +5%`, SAM's SP YIELD bar shows "REMS ACTIVE +5%" as a line item
4. Return `ResolvedInstrumentStats` — one resolved entry per declared stat
5. `InstrumentOverlay.vue` renders a generic stat bar + breakdown per entry, replacing all hardcoded per-slot blocks

**Chain bonus wiring (Plan B):**
- `DrillController` reads `playerMod('chainDrillBonus')` and applies it to `LaserDrill.scanSpeedMult` when target is MastCam-tagged: `scanSpeedMult = 1 - 0.4 * playerMod('chainDrillBonus')`
- `DrillController` reads `playerMod('chainLootBonus')` and applies it to `weightMult` when target is ChemCam-analyzed: `weightMult += 0.3 * playerMod('chainLootBonus')`
- APXS trace element `dropCount` already uses `this.accuracyMod` — no wiring change needed
