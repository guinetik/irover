# Instrument Stats Model — Design
**Date:** 2026-03-29
**Scope:** Extend `InstrumentDef` with a `stats` declaration that links each instrument to its relevant `ProfileModifiers` keys. Zero changes to display, controllers, or tick handlers.

---

## Goal

Every instrument declares which modifier-driven stats apply to it and what to call them. This gives the reward track, archetype, and patron modifier systems a single authoritative place to know what each instrument cares about — and gives Plan B's computed layer and overlay refactor a clean foundation to build on.

---

## Out of Scope (Plan B)

- Resolving declared stats against live modifiers (`ResolvedInstrumentStats`)
- `InstrumentOverlay.vue` refactor — replacing hardcoded per-slot stat blocks
- `buildSpeedBreakdown()` integration with the new model
- Any changes to `InstrumentController` subclasses

---

## 1. Type Extension — `src/types/instruments.ts`

Add one new interface and one field to `InstrumentDef`:

```ts
export interface InstrumentStatDef {
  /** Key into ProfileModifiers — drives all buff/nerf sources (archetype, reward track, etc.) */
  key: keyof ProfileModifiers
  /** Display label shown in the overlay stat panel, e.g. "DRILL SPEED", "ACCURACY" */
  label: string
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
```

`keyof ProfileModifiers` is the load-bearing constraint. It enforces that only valid modifier keys can be declared, and it guarantees that the reward track's `modifierKey` field and the instrument's `stat.key` are the same type — so buff resolution in Plan B requires no translation layer.

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

| Instrument | `stats` array |
|------------|--------------|
| MastCam | `analysisSpeed` "SCAN SPEED", `instrumentAccuracy` "ACCURACY" |
| ChemCam | `analysisSpeed` "ANALYSIS SPEED", `instrumentAccuracy` "ACCURACY", `powerConsumption` "POWER DRAW" |
| Drill | `analysisSpeed` "DRILL SPEED", `instrumentAccuracy` "ACCURACY", `powerConsumption` "POWER DRAW" |
| APXS | `analysisSpeed` "ANALYSIS SPEED", `instrumentAccuracy` "ACCURACY" |
| DAN | `analysisSpeed` "SCAN SPEED", `instrumentAccuracy` "ACCURACY", `danScanRadius` "SCAN RADIUS", `powerConsumption` "POWER DRAW" |
| SAM | `analysisSpeed` "ANALYSIS SPEED", `instrumentAccuracy` "ACCURACY", `powerConsumption` "POWER DRAW" |
| RTG | `powerConsumption` "POWER OUTPUT" |
| REMS | `instrumentAccuracy` "ACCURACY" |
| RAD | `radiationTolerance` "TOLERANCE" |
| Heater | `heaterDraw` "HEAT DRAW" |
| LGA | _(empty)_ |
| UHF | _(empty)_ |
| Wheels | `movementSpeed` "DRIVE SPEED" |
| Mic | _(empty)_ |

---

## 3. Validation Test Update — `src/types/__tests__/instrumentsData.test.ts`

Add two new test cases:

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
```

Type-safety via `keyof ProfileModifiers` is enforced at compile time — the test covers the runtime JSON shape.

---

## File Checklist

| File | Action |
|------|--------|
| `src/types/instruments.ts` | Add `InstrumentStatDef` interface + `stats` field to `InstrumentDef` |
| `public/data/instruments.json` | Add `stats` array to all 14 instruments |
| `src/types/__tests__/instrumentsData.test.ts` | Add 2 new validation cases |

---

## Plan B Hook

When Plan B's computed layer is built, it will:

1. Take `instrument.stats[]` + all modifier sources (profile, reward track, thermal, storm)
2. For each `stat`, call `buildSpeedBreakdown(stat.key, ...)` → `ResolvedStat { pct, buffs[] }`
3. Return `ResolvedInstrumentStats` — one resolved entry per declared stat
4. `InstrumentOverlay.vue` renders a generic stat bar + breakdown per entry, replacing all hardcoded per-slot blocks
