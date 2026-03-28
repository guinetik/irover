# SAM Fabrication Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 new refined inventory items and 16 new SAM discoveries that produce fabrication-grade materials.

**Architecture:** Pure data additions to two existing JSON files (`inventory-items.json`, `sam-experiments.json`). No TypeScript type changes needed — all interfaces use `string` for IDs, `string[]` for rock types, and existing `InventoryItemCategory` already includes `'refined'`. A validation test ensures the data is internally consistent.

**Tech Stack:** JSON data files, Vitest for validation

---

### Task 1: Add new inventory items to inventory-items.json

**Files:**
- Modify: `public/data/inventory-items.json` (add 8 items after the `biosignature-sample` entry, before the closing `]`)

- [ ] **Step 1: Add the 8 new refined items**

Insert after the `biosignature-sample` object (line 276, before the closing `]`):

```json
    {
      "id": "silicate-fiber",
      "category": "refined",
      "label": "Silicate Fiber",
      "description": "Thin translucent amber-orange glass fibers bundled in a coil. Pulled from molten volcanic glass during high-temp pyrolysis. Lightweight structural reinforcement.",
      "image": "/inventory/refined-silicate-fiber.png",
      "weightPerUnit": 0.005,
      "maxStack": 200
    },
    {
      "id": "iron-filament",
      "category": "refined",
      "label": "Iron Filament",
      "description": "Dark metallic spool of fine wire with a slight rust-red sheen. Electrodeposited from dissolved iron oxide. Weldable structural strand.",
      "image": "/inventory/refined-iron-filament.png",
      "weightPerUnit": 0.008,
      "maxStack": 150
    },
    {
      "id": "nickel-steel-billet",
      "category": "refined",
      "label": "Nickel-Steel Billet",
      "description": "Small dense rectangular ingot, gunmetal gray with a mirror-polished cross section showing crystalline Widmanstatten texture. High-strength meteoritic alloy, cold-worked.",
      "image": "/inventory/refined-nickel-steel-billet.png",
      "weightPerUnit": 0.015,
      "maxStack": 100
    },
    {
      "id": "perchlorate-oxidizer",
      "category": "refined",
      "label": "Perchlorate Oxidizer",
      "description": "Sealed cylindrical white canister with orange hazard stripes. Concentrated perchlorate salt extracted from sulfate evaporites. Reactive oxidizer for chemical processing.",
      "image": "/inventory/refined-perchlorate-oxidizer.png",
      "weightPerUnit": 0.006,
      "maxStack": 150
    },
    {
      "id": "magnesium-powder",
      "category": "refined",
      "label": "Magnesium Powder",
      "description": "Pale silvery-white powder in a clear vacuum-sealed pouch, faintly luminescent. Refined from olivine decomposition. Lightweight metal precursor and incendiary compound.",
      "image": "/inventory/refined-magnesium-powder.png",
      "weightPerUnit": 0.004,
      "maxStack": 200
    },
    {
      "id": "sulfuric-acid-vial",
      "category": "refined",
      "label": "Sulfuric Acid Vial",
      "description": "Small sealed glass vial of viscous amber-yellow liquid with vapor condensation inside. Distilled from sulfate thermal decomposition. Universal industrial reagent.",
      "image": "/inventory/refined-sulfuric-acid-vial.png",
      "weightPerUnit": 0.005,
      "maxStack": 150
    },
    {
      "id": "organic-polymer-sheet",
      "category": "refined",
      "label": "Organic Polymer Sheet",
      "description": "Thin flexible translucent sheet with a slight brownish tint, like dark cellophane. Polymerized from organic volatiles captured during mudstone pyrolysis. Sealant and insulation material.",
      "image": "/inventory/refined-organic-polymer-sheet.png",
      "weightPerUnit": 0.003,
      "maxStack": 200
    },
    {
      "id": "regolith-concrete",
      "category": "refined",
      "label": "Regolith Concrete",
      "description": "Rough-textured brick-red cylindrical pellet with visible mineral grain inclusions. Basalt powder sintered with sulfuric binder. Basic structural filler.",
      "image": "/inventory/refined-regolith-concrete.png",
      "weightPerUnit": 0.02,
      "maxStack": 100
    }
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/data/inventory-items.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/data/inventory-items.json
git commit -m "feat: add 8 fabrication-grade refined materials to inventory catalog"
```

---

### Task 2: Add fabrication discoveries to sam-experiments.json

**Files:**
- Modify: `public/data/sam-experiments.json` (add 16 discoveries after the last discovery entry T12, before the closing `]` of the `discoveries` array)

- [ ] **Step 1: Add the 12 primary fabrication discoveries (F01-F12)**

Insert after the T12 entry (line 123, after its `}` and before the discoveries array `]`):

```json
    { "id": "F01", "name": "Basalt glass fiber draw", "rarity": "uncommon", "sp": 35, "mode": "pyrolysis", "rockTypes": ["basalt"], "description": "High-temperature pyrolysis melts volcanic glass into a drawable melt. Thin silicate fibers pulled from the cooling strand — lightweight structural reinforcement.", "sideProducts": [{ "itemId": "silicate-fiber", "quantity": 2 }, { "itemId": "trace-Si", "quantity": 1 }] },
    { "id": "F02", "name": "Iron electrodeposition", "rarity": "uncommon", "sp": 40, "mode": "wet-chemistry", "rockTypes": ["hematite"], "description": "Dissolved hematite in acid solution, then electroplated onto a cathode wire. Pure iron filament deposits atom by atom.", "sideProducts": [{ "itemId": "iron-filament", "quantity": 2 }, { "itemId": "trace-Fe", "quantity": 1 }] },
    { "id": "F03", "name": "Meteoritic cold-working", "rarity": "rare", "sp": 90, "mode": "wet-chemistry", "rockTypes": ["iron-meteorite"], "description": "Acid-etching isolates high-purity kamacite-taenite phases. The nickel-iron is cold-worked into a dense structural billet.", "sideProducts": [{ "itemId": "nickel-steel-billet", "quantity": 1 }, { "itemId": "trace-Ni", "quantity": 2 }] },
    { "id": "F04", "name": "Silicate extraction", "rarity": "common", "sp": 20, "mode": "pyrolysis", "rockTypes": ["basalt", "olivine"], "description": "Basic thermal decomposition releases silicate melt. Low-yield fiber draw from general volcanic minerals.", "sideProducts": [{ "itemId": "silicate-fiber", "quantity": 1 }] },
    { "id": "F05", "name": "Perchlorate extraction", "rarity": "uncommon", "sp": 30, "mode": "wet-chemistry", "rockTypes": ["sulfate"], "description": "Dissolving evaporite deposits and selectively precipitating perchlorate salts. Concentrated oxidizer — handle with care.", "sideProducts": [{ "itemId": "perchlorate-oxidizer", "quantity": 2 }, { "itemId": "trace-Na", "quantity": 1 }] },
    { "id": "F06", "name": "Sulfuric acid distillation", "rarity": "uncommon", "sp": 35, "mode": "pyrolysis", "rockTypes": ["sulfate"], "description": "Thermal decomposition of calcium sulfate releases SO₃ gas. Captured and hydrated to produce sulfuric acid. The smell is unforgettable.", "sideProducts": [{ "itemId": "sulfuric-acid-vial", "quantity": 2 }, { "itemId": "trace-S", "quantity": 1 }] },
    { "id": "F07", "name": "Magnesium reduction", "rarity": "uncommon", "sp": 40, "mode": "wet-chemistry", "rockTypes": ["olivine"], "description": "Acid dissolution of forsterite crystals, then precipitation of magnesium salts from solution. Silvery powder, dangerously reactive in oxygen.", "sideProducts": [{ "itemId": "magnesium-powder", "quantity": 2 }, { "itemId": "trace-Mg", "quantity": 1 }] },
    { "id": "F08", "name": "Olivine acid leach", "rarity": "common", "sp": 18, "mode": "wet-chemistry", "rockTypes": ["olivine"], "description": "Simple acid dissolution yielding low-purity magnesium and silica residue. Not elegant, but it works.", "sideProducts": [{ "itemId": "magnesium-powder", "quantity": 1 }, { "itemId": "trace-Si", "quantity": 1 }] },
    { "id": "F09", "name": "Volatile polymerization", "rarity": "rare", "sp": 80, "mode": "pyrolysis", "rockTypes": ["mudstone"], "description": "Capturing organic volatiles at precisely controlled temperatures and catalyzing chain polymerization. Flexible translucent sheets form as the polymer cools.", "sideProducts": [{ "itemId": "organic-polymer-sheet", "quantity": 3 }, { "itemId": "organic-extract", "quantity": 1 }] },
    { "id": "F10", "name": "Clay-bound organic recovery", "rarity": "uncommon", "sp": 45, "mode": "wet-chemistry", "rockTypes": ["mudstone"], "description": "Dissolving the clay matrix to release trapped organics, then polymerizing the extract under heat. The clay layers preserved these molecules for billions of years.", "sideProducts": [{ "itemId": "organic-polymer-sheet", "quantity": 1 }, { "itemId": "clay-mineral-sample", "quantity": 2 }] },
    { "id": "F11", "name": "Regolith sintering test", "rarity": "common", "sp": 15, "mode": "pyrolysis", "rockTypes": ["basalt"], "description": "High-temperature fusion of crushed basalt with trace sulfur as binder. The pellets crack when they cool, but they hold.", "sideProducts": [{ "itemId": "regolith-concrete", "quantity": 2 }] },
    { "id": "F12", "name": "Sulfuric binder synthesis", "rarity": "uncommon", "sp": 30, "mode": "pyrolysis", "rockTypes": ["sulfate", "basalt"], "description": "Thermal processing produces a sulfuric binder that cements basalt powder into solid concrete. Stronger than raw sintering.", "sideProducts": [{ "itemId": "regolith-concrete", "quantity": 1 }, { "itemId": "sulfuric-acid-vial", "quantity": 1 }] }
```

- [ ] **Step 2: Add the 4 trace element fabrication discoveries (T13-T16)**

Insert after F12, continuing in the same discoveries array:

```json
    { "id": "T13", "name": "Iron wire drawing", "rarity": "uncommon", "sp": 35, "mode": "wet-chemistry", "rockTypes": ["trace-Fe"], "description": "Electroplating concentrated iron traces onto a fine cathode. One atom-thick layer at a time, a usable filament emerges.", "sideProducts": [{ "itemId": "iron-filament", "quantity": 1 }] },
    { "id": "T14", "name": "Sulfur acid conversion", "rarity": "uncommon", "sp": 30, "mode": "pyrolysis", "rockTypes": ["trace-S"], "description": "Oxidizing concentrated trace sulfur to SO₃ and hydrating to sulfuric acid. Small batch, high purity.", "sideProducts": [{ "itemId": "sulfuric-acid-vial", "quantity": 1 }] },
    { "id": "T15", "name": "Magnesium flash powder", "rarity": "uncommon", "sp": 35, "mode": "pyrolysis", "rockTypes": ["trace-Mg"], "description": "Thermal reduction of concentrated magnesium salts to pure metal powder. Blindingly bright if ignited.", "sideProducts": [{ "itemId": "magnesium-powder", "quantity": 1 }] },
    { "id": "T16", "name": "Nickel-iron alloying", "rarity": "rare", "sp": 100, "mode": "wet-chemistry", "rockTypes": ["trace-Ni"], "description": "Combining concentrated nickel with dissolved iron traces to precipitate a structural alloy. The meteorite's strength, refined by chemistry.", "sideProducts": [{ "itemId": "nickel-steel-billet", "quantity": 1 }] }
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/data/sam-experiments.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/data/sam-experiments.json
git commit -m "feat: add 16 fabrication discoveries to SAM experiments"
```

---

### Task 3: Write validation test for SAM experiments data

**Files:**
- Create: `src/types/__tests__/samExperimentsData.test.ts`

This follows the same validation pattern as `missionsData.test.ts` — load the JSON, assert structural integrity and cross-references.

- [ ] **Step 1: Write the validation test**

Create `src/types/__tests__/samExperimentsData.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { SAMExperimentsFile } from '../samExperiments'
import samJson from '../../../public/data/sam-experiments.json'
import inventoryJson from '../../../public/data/inventory-items.json'

describe('sam-experiments.json', () => {
  const sam = samJson as SAMExperimentsFile
  const inventoryIds = new Set(inventoryJson.items.map((i) => i.id))

  it('has version 1', () => {
    expect(sam.version).toBe(1)
  })

  it('has exactly 3 analysis modes', () => {
    expect(sam.modes).toHaveLength(3)
    const ids = sam.modes.map((m) => m.id)
    expect(ids).toContain('pyrolysis')
    expect(ids).toContain('wet-chemistry')
    expect(ids).toContain('isotope-analysis')
  })

  it('every mode has required fields', () => {
    for (const mode of sam.modes) {
      expect(mode.id).toBeTruthy()
      expect(mode.name).toBeTruthy()
      expect(mode.instrument).toBeTruthy()
      expect(mode.powerW).toBeGreaterThan(0)
      expect(mode.baseDurationSec).toBeGreaterThan(0)
      expect(mode.unlockSP).toBeGreaterThanOrEqual(0)
      expect(mode.icon).toBeTruthy()
    }
  })

  it('mode ingredient itemIds exist in inventory catalog', () => {
    for (const mode of sam.modes) {
      for (const ing of mode.ingredients) {
        expect(inventoryIds.has(ing.itemId)).toBe(true)
      }
    }
  })

  it('no duplicate discovery IDs', () => {
    const ids = sam.discoveries.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every discovery has required fields', () => {
    const validRarities = ['common', 'uncommon', 'rare', 'legendary']
    const modeIds = new Set(sam.modes.map((m) => m.id))

    for (const d of sam.discoveries) {
      expect(d.id).toBeTruthy()
      expect(d.name).toBeTruthy()
      expect(validRarities).toContain(d.rarity)
      expect(d.sp).toBeGreaterThan(0)
      expect(modeIds.has(d.mode)).toBe(true)
      expect(d.rockTypes.length).toBeGreaterThan(0)
      expect(d.description).toBeTruthy()
    }
  })

  it('discovery sideProduct itemIds exist in inventory catalog', () => {
    for (const d of sam.discoveries) {
      for (const sp of d.sideProducts) {
        expect(
          inventoryIds.has(sp.itemId),
          `discovery ${d.id} references unknown item "${sp.itemId}"`,
        ).toBe(true)
        expect(sp.quantity).toBeGreaterThan(0)
      }
    }
  })

  it('discovery rockTypes exist in yield table', () => {
    const yieldRocks = new Set(Object.keys(sam.yieldTable))
    for (const d of sam.discoveries) {
      for (const rt of d.rockTypes) {
        expect(
          yieldRocks.has(rt),
          `discovery ${d.id} references rock "${rt}" not in yieldTable`,
        ).toBe(true)
      }
    }
  })

  it('yield table rarity weights sum to ~100 for each rock×mode', () => {
    for (const [rock, modes] of Object.entries(sam.yieldTable)) {
      for (const [mode, weights] of Object.entries(modes)) {
        const sum =
          weights.common + weights.uncommon + weights.rare + weights.legendary
        expect(
          sum,
          `${rock}/${mode} weights sum to ${sum}, expected 100`,
        ).toBe(100)
      }
    }
  })

  it('has at least 60 discoveries (47 original + 16 fabrication)', () => {
    expect(sam.discoveries.length).toBeGreaterThanOrEqual(63)
  })
})
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/types/__tests__/samExperimentsData.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/types/__tests__/samExperimentsData.test.ts
git commit -m "test: add SAM experiments data validation tests"
```

---

### Task 4: Verify build and full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run the type check**

Run: `npm run build`
Expected: `vue-tsc` type check passes, vite build succeeds

- [ ] **Step 3: Final commit (if any fixes needed)**

If Task 4 revealed issues, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve issues found during verification"
```
