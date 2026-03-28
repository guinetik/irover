# Tier 3 — Thermal environment (plan)

**Date:** 2026-03-22  
**Roadmap:** [2026-03-22-priority-roadmap.md](../../plans/gdd/2026-03-22-priority-roadmap.md) **Tier 3**  
**Depends on:** [Tier 1](./2026-03-22-tier1-battery-power-hud.md) power sim + HUD, [Tier 2](./2026-03-22-tier2-instrument-power-gating.md) instrument draws (heater must hit the **same** `consumptionW` / battery loop).  
**GDD:** [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md) § TEMPERATURE SYSTEM, HUD temperature panel  
**UI:** [mars_thermal_hud_mockup.html](../../../mars_thermal_hud_mockup.html) — [ui-reference-mockups](../../plans/gdd/ui-reference-mockups.md)  
**Epic:** [epic-power-thermal.md](../../plans/gdd/epic-power-thermal.md) Phase D

## Why thermal before the full tool suite

Thermal sits on the **same power budget** as science: **heater 0–12 W** competes with MastCam/ChemCam/DAN. Shipping **ambient → internal temp → heater draw → zones** first makes **Tier 4 tools** read as *“can I afford watts after survival?”* instead of bolting penalties on later. Site **`temperatureMinK` / `temperatureMaxK`** already encode difficulty; this tier makes that data **felt**.

---

## Landmark / spawn site (`public/data/landmarks.json`)

Ambient bounds **must** follow the **same site** the player chose on the globe — i.e. the **`siteId`** route param resolved against **[`landmarks.json`](../../../public/data/landmarks.json)**. Do **not** invent parallel temperature tables in the thermal composable.

### Resolution (align with existing site load)

[`MartianSiteView.vue`](../../../src/views/MartianSiteView.vue) **`getTerrainParams()`** already does:

| Landmark `type` | Thermal inputs |
|-----------------|----------------|
| **`geological`** | Use **`temperatureMinK`** and **`temperatureMaxK`** from the JSON record ([`GeologicalFeature`](../../../src/types/landmark.ts)) — copied onto [`TerrainParams`](../../../src/three/terrain/TerrainGenerator.ts) today. **Tier 3:** thermal tick reads these same params (or a small `SiteThermalBounds` struct passed from the view) as the **only** min/max for the diurnal ambient curve. |
| **`landing-site`** | JSON has **no** temperature fields yet; code uses a **fallback** band (**160–280 K**) in `getTerrainParams()`. **Tier 3:** replace or refine this with a **latitude-based model** using the landmark’s **`lat`** (e.g. higher \|lat\| → colder night floor, narrower day peak) so **Phoenix** / **Viking 2** feel harsher than **Curiosity** / **InSight** without hand-authoring every mission. **Optional follow-up:** add optional `temperatureMinK` / `temperatureMaxK` to `landing-site` entries in `landmarks.json` for manual overrides. |

### Optional modifiers (backlog, not MVP)

- **`waterIceIndex`** / **`featureType`** on geological sites: small **night cooling** or **heater stress** nudge (ties thermal to DAN fantasy).
- **`surfacePressureMbar`**: micro effect on heat loss (defer).

### Single source of truth

```text
landmarks.json  →  siteId match  →  TerrainParams (min/max K)  →  thermal ambient lerp  →  HUD
```

If terrain and thermal disagree, the bug is in **wiring**, not in two configs.

---

## Player-facing loop

```text
Time of sol + landmark site (JSON / lat)  →  ambient (effective °C)
        │
        ▼
Internal rover temp  ←  RTG waste heat + heater (W → warming)  −  heat loss
        │
        ▼
Zone: OPTIMAL / COLD / FRIGID / CRITICAL  →  HUD + (Tier 3) one gameplay penalty
        │
        ▼
Heater W added to useMarsPower consumption  →  battery + net W already truth
```

---

## Simulation MVP (roadmap **3.1**)

### State (reactive, e.g. `useMarsThermal()` or merged into power composable)

| Field | Notes |
|-------|--------|
| `internalTempC` | **WEB**-style internal temperature; primary driver for zones. |
| `ambientEffectiveC` | Derived each tick from site + time; player-facing “outside”. |
| `heaterW` | **0–12**; thermostat output; **feeds `useMarsPower`** as extra load. |
| `zone` | `OPTIMAL` \| `COLD` \| `FRIGID` \| `CRITICAL` (from internal bands below). |
| `insulationFactor` | Start **1.0**; later missions/drops reduce heat loss (out of scope until progression). |

### Ambient model (sprint-simple)

- Inputs: **`temperatureMinK` / `temperatureMaxK`** from the **spawn landmark** pipeline above (ultimately `TerrainParams` + same rules as `getTerrainParams()`), and `MarsSky.timeOfDay` (0–1).
- Map Kelvin → Celsius for display.
- **Diurnal curve:** e.g. cosine or smoothstep so **coldest** near `timeOfDay ≈ 0.75` (deep night), **warmest** near **noon** — tune to match sky `nightFactor` so cold nights **feel** aligned with visuals. **Endpoints** of the curve are the landmark-derived min/max.
- **No** dust-storm ambient modifier until **Tier 5** (progression).

### Internal temperature dynamics (MVP)

Keep a **small ODE** or discrete step per frame:

- **Heat in:** RTG waste heat as constant **°C/s bias** (tunable; GDD cites ~+25 °C equivalent in their table — use one constant for “damaged RTG still warms”).
- **Heater:** `heaterW` maps to extra warming rate (linear gain W → °C/s); cap total heater at **12 W**.
- **Heat out:** proportional to `(internal - ambient) * lossRate * insulationFactor` (lossRate tuned for ~minute-scale sol).

**Thermostat (MVP):** bang-bang or P-controller: if internal below band floor (e.g. target **−10 °C** floor at night), ramp `heaterW` toward 12; if above target, ramp toward 0. Document targets in code constants.

### Power integration (required)

- Each frame after ambient/heater step: **`consumptionW` += `heaterW`** inside the authoritative power tick **or** pass `heaterW` into `tickPower` so **one** battery integration sees core + drive + instruments + heater.
- **No duplicate Wh math** for the heater.

### Zones (GDD bands — internal °C)

| Zone | Range (internal) | HUD color |
|------|------------------|-----------|
| **OPTIMAL** | 0 °C … +30 °C | Green |
| **COLD** | −20 °C … 0 °C | Amber |
| **FRIGID** | −40 °C … −20 °C | Red |
| **CRITICAL** | < −40 °C | Flashing red |

**Cold shutdown** (below **−55 °C** internal per GDD): **defer** full safe-mode reboot to a later milestone unless trivial — Tier 3 can **clamp** heater to max + flash CRITICAL + block new instruments (mirror NO POWER UX).

---

## HUD (roadmap **3.1**)

Extend the **left stack** beside existing PWR (see mockup):

- Rover internal temp (big readout).
- Ambient (smaller).
- Heater W when > 0 (♨ **N W**).
- Zone label (**OPTIMAL** / **COLD** / **FRIGID** / **CRITICAL**).

**Implementation:** `ThermalHud.vue` sibling under `PowerHud`, or one combined component — match [mars_thermal_hud_mockup.html](../../../mars_thermal_hud_mockup.html) spacing/typography family.

---

## First gameplay penalty (roadmap **3.2**)

**Ship one** vertical slice; expand instrument × zone matrix later.

| Penalty | Zone | Effect (MVP) |
|---------|------|----------------|
| **APXS analysis slower** | **COLD** | Multiply drill/analysis duration by **1.25** (GDD: 25% longer). Hook in `APXSController` or timing that reads `zone` from thermal store. |

**Out of this tier (document only):** ChemCam range, MastCam noise, SAM drill lock in FRIGID, battery charge modifiers, movement stacking — GDD table is the backlog for Tier 5+ polish or a **3.x** thermal pass.

---

## Definition of done — Tier 3

| # | Item | Done when |
|---|------|-----------|
| 3.1 | **Temperature MVP** | Ambient from **spawn landmark** min/max K (geological = JSON; landing-site = lat model or fallback until JSON extended) + `timeOfDay`; internal temp + heater 0–12 W; heater in **power** consumption; **TEMP** HUD row(s) live; zones computed. |
| 3.2 | **First penalty** | APXS measurably slower in **COLD**; optional frost/zone hint on toolbar (defer if timeboxed). |

---

## Verification

- **Geological** site (e.g. `hellas-basin` vs `olympus-mons`): ambient swing matches each feature’s **JSON** `temperatureMinK` / `temperatureMaxK` (not the generic landing fallback).
- **Landing** site: thermal uses **lat-aware** bounds (or documented fallback) so high-latitude missions read colder than equatorial ones.
- Midday vs deep night: curve respects min/max; heater draws when cold; net W on PWR HUD reflects drain.
- APXS: same rock, **COLD** vs **OPTIMAL** changes time-to-sample.
- `npm run build`.

---

## Implementation touchpoints (expected)

- [`src/composables/useMarsPower.ts`](../../../src/composables/useMarsPower.ts) — accept `heaterW` or extra load channel.
- [`src/views/MartianSiteView.vue`](../../../src/views/MartianSiteView.vue) — tick thermal with sky + **`getTerrainParams()`** (or equivalent) so bounds always match **`siteId`** + [`landmarks.json`](../../../public/data/landmarks.json); pass HUD props.
- [`public/data/landmarks.json`](../../../public/data/landmarks.json) — geological **K** fields; optional future per-landing-site K overrides.
- [`src/components/PowerHud.vue`](../../../src/components/PowerHud.vue) or new **`ThermalHud.vue`**.
- [`src/three/instruments/APXSController.ts`](../../../src/three/instruments/APXSController.ts) — duration multiplier from zone.
- [`src/three/terrain/TerrainGenerator.ts`](../../../src/three/terrain/TerrainGenerator.ts) / site load — already exposes min/max K.

---

## Out of scope

- Full GDD penalty matrix, CheMin lock, SAM drill lock, battery chemistry modifiers.
- Insulation drops, rock shelter, heat-soak tutorialization.
- REMS as separate sensor UI (ambient is **simulated** from site + time here).
