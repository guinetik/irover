# SAM Fabrication Materials Expansion

Expand the SAM chemistry system with new discoveries that produce fabrication-grade refined materials, plus new inventory items for those materials, and a reference tech tree mapping materials to future fabricator buildables.

## Context

The SAM lab currently has 3 analysis modes (pyrolysis, wet-chemistry, isotope-analysis) producing 47 discoveries across 4 rarity tiers. Side products are refined materials (purified-iron-oxide, organic-extract, etc.) that accumulate with no downstream use. A future **Fabricator** machine will consume raw rocks + refined SAM outputs to build structures and equipment. This spec adds the SAM-side materials to feed that pipeline.

## Constraints

- No changes to SAM mechanics — uses existing 3 modes
- No new SP unlock gates — new discoveries roll alongside existing ones
- Chemistry is science-flavored but gameplay-first (approximate, not rigorous)
- Each new material maps to the most appropriate rock + mode combination
- The fabricator itself is out of scope — this spec covers materials only

## New Inventory Items

8 new refined materials added to `inventory-items.json`.

### Structural

#### Silicate Fiber
- **id:** `silicate-fiber`
- **category:** `refined`
- **weightPerUnit:** 0.005
- **maxStack:** 200
- **description:** Thin translucent amber-orange glass fibers bundled in a coil. Pulled from molten volcanic glass during high-temp pyrolysis. Lightweight structural reinforcement.
- **image:** `/inventory/refined-silicate-fiber.png`

#### Iron Filament
- **id:** `iron-filament`
- **category:** `refined`
- **weightPerUnit:** 0.008
- **maxStack:** 150
- **description:** Dark metallic spool of fine wire with a slight rust-red sheen. Electrodeposited from dissolved iron oxide. Weldable structural strand.
- **image:** `/inventory/refined-iron-filament.png`

#### Nickel-Steel Billet
- **id:** `nickel-steel-billet`
- **category:** `refined`
- **weightPerUnit:** 0.015
- **maxStack:** 100
- **description:** Small dense rectangular ingot, gunmetal gray with a mirror-polished cross section showing crystalline Widmanstatten texture. High-strength meteoritic alloy, cold-worked.
- **image:** `/inventory/refined-nickel-steel-billet.png`

### Chemical

#### Perchlorate Oxidizer
- **id:** `perchlorate-oxidizer`
- **category:** `refined`
- **weightPerUnit:** 0.006
- **maxStack:** 150
- **description:** Sealed cylindrical white canister with orange hazard stripes. Concentrated perchlorate salt extracted from sulfate evaporites. Reactive oxidizer for chemical processing.
- **image:** `/inventory/refined-perchlorate-oxidizer.png`

#### Magnesium Powder
- **id:** `magnesium-powder`
- **category:** `refined`
- **weightPerUnit:** 0.004
- **maxStack:** 200
- **description:** Pale silvery-white powder in a clear vacuum-sealed pouch, faintly luminescent. Refined from olivine decomposition. Lightweight metal precursor and incendiary compound.
- **image:** `/inventory/refined-magnesium-powder.png`

#### Sulfuric Acid Vial
- **id:** `sulfuric-acid-vial`
- **category:** `refined`
- **weightPerUnit:** 0.005
- **maxStack:** 150
- **description:** Small sealed glass vial of viscous amber-yellow liquid with vapor condensation inside. Distilled from sulfate thermal decomposition. Universal industrial reagent.
- **image:** `/inventory/refined-sulfuric-acid-vial.png`

### Organic / Versatile

#### Organic Polymer Sheet
- **id:** `organic-polymer-sheet`
- **category:** `refined`
- **weightPerUnit:** 0.003
- **maxStack:** 200
- **description:** Thin flexible translucent sheet with a slight brownish tint, like dark cellophane. Polymerized from organic volatiles captured during mudstone pyrolysis. Sealant and insulation material.
- **image:** `/inventory/refined-organic-polymer-sheet.png`

#### Regolith Concrete
- **id:** `regolith-concrete`
- **category:** `refined`
- **weightPerUnit:** 0.02
- **maxStack:** 100
- **description:** Rough-textured brick-red cylindrical pellet with visible mineral grain inclusions. Basalt powder sintered with sulfuric binder. Basic structural filler.
- **image:** `/inventory/refined-regolith-concrete.png`

## New Discoveries

16 new entries in the `discoveries` array of `sam-experiments.json`. SP values are intentionally lower than pure-science discoveries at the same rarity — applied science trades SP ceiling for material output.

### Structural Pathway (basalt, hematite, iron-meteorite)

| ID | Name | Rarity | SP | Mode | Rock Types | Side Products | Description |
|---|---|---|---|---|---|---|---|
| F01 | Basalt glass fiber draw | uncommon | 35 | pyrolysis | basalt | 2 silicate-fiber, 1 trace-Si | High-temperature pyrolysis melts volcanic glass into a drawable melt. Thin silicate fibers pulled from the cooling strand — lightweight structural reinforcement. |
| F02 | Iron electrodeposition | uncommon | 40 | wet-chemistry | hematite | 2 iron-filament, 1 trace-Fe | Dissolved hematite in acid solution, then electroplated onto a cathode wire. Pure iron filament deposits atom by atom. |
| F03 | Meteoritic cold-working | rare | 90 | wet-chemistry | iron-meteorite | 1 nickel-steel-billet, 2 trace-Ni | Acid-etching isolates high-purity kamacite-taenite phases. The nickel-iron is cold-worked into a dense structural billet. Requires 1 ice. |
| F04 | Silicate extraction | common | 20 | pyrolysis | basalt, olivine | 1 silicate-fiber | Basic thermal decomposition releases silicate melt. Low-yield fiber draw from general volcanic minerals. |

### Chemical Pathway (sulfate, olivine)

| ID | Name | Rarity | SP | Mode | Rock Types | Side Products | Description |
|---|---|---|---|---|---|---|---|
| F05 | Perchlorate extraction | uncommon | 30 | wet-chemistry | sulfate | 2 perchlorate-oxidizer, 1 trace-Na | Dissolving evaporite deposits and selectively precipitating perchlorate salts. Concentrated oxidizer — handle with care. Requires 1 ice. |
| F06 | Sulfuric acid distillation | uncommon | 35 | pyrolysis | sulfate | 2 sulfuric-acid-vial, 1 trace-S | Thermal decomposition of calcium sulfate releases SO3 gas. Captured and hydrated to produce sulfuric acid. The smell is unforgettable. |
| F07 | Magnesium reduction | uncommon | 40 | wet-chemistry | olivine | 2 magnesium-powder, 1 trace-Mg | Acid dissolution of forsterite crystals, then precipitation of magnesium salts from solution. Silvery powder, dangerously reactive in oxygen. Requires 1 ice. |
| F08 | Olivine acid leach | common | 18 | wet-chemistry | olivine | 1 magnesium-powder, 1 trace-Si | Simple acid dissolution yielding low-purity magnesium and silica residue. Not elegant, but it works. Requires 1 ice. |

### Organic / Versatile Pathway (mudstone, basalt + sulfate)

| ID | Name | Rarity | SP | Mode | Rock Types | Side Products | Description |
|---|---|---|---|---|---|---|---|
| F09 | Volatile polymerization | rare | 80 | pyrolysis | mudstone | 3 organic-polymer-sheet, 1 organic-extract | Capturing organic volatiles at precisely controlled temperatures and catalyzing chain polymerization. Flexible translucent sheets form as the polymer cools. |
| F10 | Clay-bound organic recovery | uncommon | 45 | wet-chemistry | mudstone | 1 organic-polymer-sheet, 2 clay-mineral-sample | Dissolving the clay matrix to release trapped organics, then polymerizing the extract under heat. The clay layers preserved these molecules for billions of years. Requires 1 ice. |
| F11 | Regolith sintering test | common | 15 | pyrolysis | basalt | 2 regolith-concrete | High-temperature fusion of crushed basalt with trace sulfur as binder. The pellets crack when they cool, but they hold. |
| F12 | Sulfuric binder synthesis | uncommon | 30 | pyrolysis | sulfate, basalt | 1 regolith-concrete, 1 sulfuric-acid-vial | Thermal processing produces a sulfuric binder that cements basalt powder into solid concrete. Stronger than raw sintering. |

### Trace Element Fabrication Reactions

| ID | Name | Rarity | SP | Mode | Rock Types | Side Products | Description |
|---|---|---|---|---|---|---|---|
| T13 | Iron wire drawing | uncommon | 35 | wet-chemistry | trace-Fe | 1 iron-filament | Electroplating concentrated iron traces onto a fine cathode. One atom-thick layer at a time, a usable filament emerges. |
| T14 | Sulfur acid conversion | uncommon | 30 | pyrolysis | trace-S | 1 sulfuric-acid-vial | Oxidizing concentrated trace sulfur to SO3 and hydrating to sulfuric acid. Small batch, high purity. |
| T15 | Magnesium flash powder | uncommon | 35 | pyrolysis | trace-Mg | 1 magnesium-powder | Thermal reduction of concentrated magnesium salts to pure metal powder. Blindingly bright if ignited. |
| T16 | Nickel-iron alloying | rare | 100 | wet-chemistry | trace-Ni | 1 nickel-steel-billet | Combining concentrated nickel with dissolved iron traces to precipitate a structural alloy. The meteorite's strength, refined by chemistry. |

### Ingredient Requirements

All wet-chemistry discoveries consume 1 ice per run (matching existing wet-chem behavior): F02, F03, F05, F07, F08, F10, T13, T16.

### Yield Table Updates

New discoveries need to be rollable. The existing yield tables for each rock type should be updated to accommodate the new fabrication discoveries. Since fabrication discoveries coexist with science discoveries in the same rarity pool, no yield table structure changes are needed — just ensure the new discovery IDs are candidates when rolling for the matching rock + mode + rarity.

## Material Pipeline / Tech Tree Reference

Maps each refined material to its sources and proposed fabricator uses. The fabricator system itself is a separate spec.

### Structural Materials

| Material | Sources | Proposed Fabricator Uses |
|---|---|---|
| Silicate Fiber | basalt/olivine pyrolysis (F01, F04) | Habitat panels, thermal insulation blankets, window panes, cable sheathing |
| Iron Filament | hematite wet-chem (F02), trace-Fe (T13) | Structural framing, antenna masts, tool fabrication, weld reinforcement |
| Nickel-Steel Billet | iron-meteorite wet-chem (F03), trace-Ni (T16) | High-load structural joints, drill bits, pressure vessel walls, axle repair |
| Regolith Concrete | basalt pyrolysis (F11, F12) | Foundation pads, blast shields, road surface, radiation shielding walls |
| Meteoritic Alloy *(existing)* | iron-meteorite wet-chem (C06, R08) | Precision fittings, gear teeth, bearing surfaces |

### Chemical Materials

| Material | Sources | Proposed Fabricator Uses |
|---|---|---|
| Perchlorate Oxidizer | sulfate wet-chem (F05) | Solid rocket fuel pellets, oxygen generation canisters, explosive charges for excavation |
| Sulfuric Acid Vial | sulfate pyrolysis (F06), trace-S (T14) | Acid etching, ore leaching reagent, battery electrolyte, cleaning solvent |
| Magnesium Powder | olivine wet-chem (F07, F08), trace-Mg (T15) | Flare fabrication, lightweight structural alloy additive, incendiary mix, anode material |
| Brine Concentrate *(existing)* | sulfate wet-chem (R03, U08) | Water purification feedstock, de-icing fluid, electrolysis input |

### Organic / Versatile

| Material | Sources | Proposed Fabricator Uses |
|---|---|---|
| Organic Polymer Sheet | mudstone pyrolysis/wet-chem (F09, F10) | Habitat seals, gaskets, flexible tubing, sample bag lining, cable insulation |
| Organic Extract *(existing)* | mudstone pyrolysis (U04, R01, L01) | Lubricant base, adhesive precursor, fuel additive |
| Clay Mineral Sample *(existing)* | mudstone wet-chem (C05, U07, F10) | Ceramic firing, water filtration medium, thermal insulation filler |
| Purified Iron Oxide *(existing)* | hematite wet-chem (C02, U01) | Pigment, thermite component (with magnesium powder), magnetic shielding |

### Science / High-Value (not fabricator feedstock)

| Material | Role |
|---|---|
| Biosignature Sample | Mission objective / transmission for massive SP bonus |
| Noble Gas Vial | Transmission / atmospheric research objectives |

### Buildable Categories

| Category | Example Buildables | Key Materials |
|---|---|---|
| Shelter | Emergency bivouac, pressurized habitat module | Regolith concrete + silicate fiber + organic polymer sheet |
| Power | Backup battery bank, solar panel frame | Iron filament + silicate fiber + sulfuric acid vial |
| Thermal | Insulation upgrade, external heater | Silicate fiber + organic polymer sheet + clay mineral sample |
| Mobility | Wheel repair kit, tow cable | Iron filament + nickel-steel billet + organic extract |
| Science | Field spectrometer, sample cache station | Silicate fiber + organic polymer sheet + brine concentrate |
| Defense | Dust storm shelter, radiation shield | Regolith concrete + iron filament + purified iron oxide |
| Consumable | Flare, oxygen canister, solid fuel charge | Magnesium powder + perchlorate oxidizer + sulfuric acid vial |

### Design Principle

Every buildable category requires materials from at least 2-3 different rock sources. No single rock type is self-sufficient for crafting. This creates drilling strategy tension: do I grab another mudstone for SP, or do I need basalt for structural fiber?

## Rock Specialization Summary

| Rock Type | Primary Role | Crafting Contribution |
|---|---|---|
| Basalt | Structural workhorse | Silicate fiber, regolith concrete |
| Hematite | Iron source | Iron filament, purified iron oxide |
| Iron Meteorite | Premium structural | Nickel-steel billet, meteoritic alloy |
| Sulfate | Chemical source | Perchlorate oxidizer, sulfuric acid |
| Olivine | Chemical + lightweight metal | Magnesium powder, silicate fiber (minor) |
| Mudstone | Science king + organics | Organic polymer sheet (rare), organic extract, clay |

Mudstone stays primarily science-focused. Its fabrication outputs (polymer sheet) are rare-tier, rewarding players who invest in mudstone analysis but not making it the crafting default.
