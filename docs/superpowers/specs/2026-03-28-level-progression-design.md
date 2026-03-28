# Level Progression & Site Difficulty — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

Three-tier site progression system gated by a "legacy" counter. Players start with 5 gentle sites, unlock 14 moderate sites by completing the Deep Signal mission (m13) on a Tier 1 map, and unlock 9 extreme sites by completing it again on a Tier 2 map. All 28 sites get full geological data (landing sites promoted from position-only to full terrain params), plus two stub fields for future hazards (radiation, meteors). Schiaparelli is removed (redundant with Opportunity). Globe view defaults to Acidalia Planitia and shows lock state on the SELECT SITE button.

## Tier Assignments (28 sites)

### Tier 1 — "Learn the ropes" (5 sites)

| Site | ID | Reason |
|------|----|--------|
| Acidalia Planitia | acidalia-planitia | Flat dusty plain, gentle storms |
| Hellas Basin | hellas-basin | Deep basin = thick atmosphere shields from hazards |
| InSight | insight | Flat Elysium lowlands, very calm |
| Utopia Planitia | utopia-planitia | Flattest site in game |
| Zhurong | zhurong | Southern Utopia, similar gentle profile |

### Tier 2 — "You know what you're doing" (14 sites)

| Site | ID | Reason |
|------|----|--------|
| Argyre Basin | argyre-basin | Rough crater-heavy basin |
| Beagle-2 | beagle-2 | Isidis Planitia, moderate terrain |
| Curiosity | curiosity | Gale Crater walls, rough floor |
| Mars-3 | mars-3 | Southern highlands, moderate cold |
| Mars-6 | mars-6 | Margaritifer region, moderate |
| Mars Polar Lander | mars-polar-lander | 76S, cold but not pole-extreme |
| Opportunity | opportunity | Meridiani hematite plains |
| Pathfinder | pathfinder | Ares Vallis outwash, rocky |
| Perseverance | perseverance | Jezero Crater, deltaic terrain |
| Phoenix | phoenix | 68N arctic — flat but freezing |
| Spirit | spirit | Gusev Crater, rocky |
| Syrtis Major | syrtis-major | Volcanic plain, higher radiation exposure |
| Viking-1 | viking-1 | Chryse Planitia, moderate |
| Viking-2 | viking-2 | 48N, colder, more ice |

### Tier 3 — "Good luck" (9 sites)

| Site | ID | Reason |
|------|----|--------|
| Arsia Mons | arsia-mons | High altitude = thin atmosphere, high exposure |
| Ascraeus Mons | ascraeus-mons | Highest Tharsis mons, extreme rad/meteor |
| Elysium Mons | elysium-mons | Slightly less extreme than Tharsis |
| Mars-2 | mars-2 | Southern highlands, rough + cold + radiation |
| North Polar Cap | north-polar-cap | Flat ice, extreme cold/rad/meteor |
| Olympus Mons | olympus-mons | Highest point on Mars, extreme altitude |
| Pavonis Mons | pavonis-mons | Mid-Tharsis, high altitude |
| South Polar Cap | south-polar-cap | Coldest site in game, extreme everything |
| Valles Marineris | valles-marineris | Insane terrain, canyon wind funnel |

### Removed

| Site | ID | Reason |
|------|----|--------|
| Schiaparelli | schiaparelli | Too close to Opportunity landing site, redundant |

## Legacy System

### Storage

- Key: `mars-legacy` in localStorage
- Type: integer (0, 1, or 2)
- Default: 0 (new players)

### Progression

| Legacy Level | Unlocked Tiers | How to Earn |
|-------------|----------------|-------------|
| 0 | Tier 1 only | Default |
| 1 | Tier 1 + Tier 2 | Complete m13 (Deep Signal) on any Tier 1 site |
| 2 | All tiers | Complete m13 (Deep Signal) on any Tier 2 site |

### Trigger

When `useMissions().complete()` fires for mission `m13-deep-signal`:
1. Read current site's tier from landmarks data
2. Read current `mars-legacy` from localStorage
3. If site tier === 1 and legacy < 1: set legacy to 1
4. If site tier === 2 and legacy < 2: set legacy to 2
5. Tier 3 completions don't change legacy (already maxed)

## New Landmark Fields

### Added to ALL landmarks

| Field | Type | Description |
|-------|------|-------------|
| `tier` | `1 \| 2 \| 3` | Progression tier |
| `radiationIndex` | `number` (0.0-1.0) | Future RAD hazard intensity (stub for Act 2) |
| `meteorRisk` | `number` (0.0-1.0) | Future meteor shower risk (stub for Act 2) |

### Added to landing sites (geological promotion)

Landing sites keep their existing fields (`type: 'landing-site'`, `mission`, `agency`, `year`, `status`) and gain the full geological field set:

| Field | Type | Description |
|-------|------|-------------|
| `roughness` | `number` (0.0-1.0) | Terrain traversal difficulty |
| `dustCover` | `number` (0.0-1.0) | Dust accumulation, affects storms |
| `craterDensity` | `number` (0.0-1.0) | Rock/crater abundance |
| `temperatureMinK` | `number` | Nighttime minimum temperature (Kelvin) |
| `temperatureMaxK` | `number` | Daytime maximum temperature (Kelvin) |
| `elevationKm` | `number` | Surface elevation relative to datum |
| `waterIceIndex` | `number` (0.0-1.0) | Subsurface water-ice presence |
| `ironOxideIndex` | `number` (0.0-1.0) | Iron oxide mineral abundance |
| `silicateIndex` | `number` (0.0-1.0) | Silicate mineral abundance |
| `basaltIndex` | `number` (0.0-1.0) | Basalt composition |
| `featureType` | `string` | Terrain classification for weather/rock systems |
| `diameterKm` | `number` | Feature diameter |
| `geologicalAge` | `string` | Noachian/Hesperian/Amazonian |

## Complete Site Data

### Tier 1

**Acidalia Planitia** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 1, radiationIndex: 0.15, meteorRisk: 0.10
Existing values unchanged: roughness 0.10, dustCover 0.65, craterDensity 0.20,
temperatureMinK 155, temperatureMaxK 255, elevationKm -4.0, waterIceIndex 0.55
```

**Hellas Basin** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 1, radiationIndex: 0.10, meteorRisk: 0.08
Existing values unchanged: roughness 0.40, dustCover 0.70, craterDensity 0.60,
temperatureMinK 150, temperatureMaxK 310, elevationKm -7.2, waterIceIndex 0.60
```

**InSight** (landing site — add all geological fields)
```
tier: 1, radiationIndex: 0.20, meteorRisk: 0.12
roughness: 0.15, dustCover: 0.50, craterDensity: 0.20,
temperatureMinK: 170, temperatureMaxK: 285, elevationKm: -2.5,
waterIceIndex: 0.15, ironOxideIndex: 0.55, silicateIndex: 0.35, basaltIndex: 0.70,
featureType: "plain", diameterKm: 0, geologicalAge: "hesperian"
```

**Utopia Planitia** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 1, radiationIndex: 0.15, meteorRisk: 0.10
Existing values unchanged: roughness 0.10, dustCover 0.75, craterDensity 0.25,
temperatureMinK 150, temperatureMaxK 260, elevationKm -3.5, waterIceIndex 0.70
```

**Zhurong** (landing site — add all geological fields)
```
tier: 1, radiationIndex: 0.15, meteorRisk: 0.10
roughness: 0.15, dustCover: 0.60, craterDensity: 0.25,
temperatureMinK: 160, temperatureMaxK: 270, elevationKm: -4.0,
waterIceIndex: 0.45, ironOxideIndex: 0.55, silicateIndex: 0.40, basaltIndex: 0.55,
featureType: "plain", diameterKm: 0, geologicalAge: "hesperian"
```

### Tier 2

**Argyre Basin** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 2, radiationIndex: 0.20, meteorRisk: 0.15
Existing values unchanged: roughness 0.45, dustCover 0.55, craterDensity 0.75,
temperatureMinK 148, temperatureMaxK 265, elevationKm -5.2, waterIceIndex 0.50
```

**Beagle-2** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.25, meteorRisk: 0.20
roughness: 0.25, dustCover: 0.40, craterDensity: 0.30,
temperatureMinK: 165, temperatureMaxK: 280, elevationKm: -3.5,
waterIceIndex: 0.20, ironOxideIndex: 0.60, silicateIndex: 0.40, basaltIndex: 0.65,
featureType: "plain", diameterKm: 0, geologicalAge: "hesperian"
```

**Curiosity** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.25, meteorRisk: 0.18
roughness: 0.50, dustCover: 0.45, craterDensity: 0.40,
temperatureMinK: 163, temperatureMaxK: 280, elevationKm: -4.5,
waterIceIndex: 0.25, ironOxideIndex: 0.60, silicateIndex: 0.50, basaltIndex: 0.55,
featureType: "basin", diameterKm: 154, geologicalAge: "noachian"
```

**Mars-3** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.30, meteorRisk: 0.22
roughness: 0.35, dustCover: 0.50, craterDensity: 0.35,
temperatureMinK: 148, temperatureMaxK: 260, elevationKm: 0.5,
waterIceIndex: 0.30, ironOxideIndex: 0.50, silicateIndex: 0.40, basaltIndex: 0.50,
featureType: "plain", diameterKm: 0, geologicalAge: "noachian"
```

**Mars-6** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.25, meteorRisk: 0.20
roughness: 0.30, dustCover: 0.55, craterDensity: 0.30,
temperatureMinK: 160, temperatureMaxK: 275, elevationKm: -1.0,
waterIceIndex: 0.20, ironOxideIndex: 0.55, silicateIndex: 0.45, basaltIndex: 0.55,
featureType: "plain", diameterKm: 0, geologicalAge: "noachian"
```

**Mars Polar Lander** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.40, meteorRisk: 0.30
roughness: 0.30, dustCover: 0.40, craterDensity: 0.20,
temperatureMinK: 145, temperatureMaxK: 230, elevationKm: 1.0,
waterIceIndex: 0.65, ironOxideIndex: 0.20, silicateIndex: 0.25, basaltIndex: 0.20,
featureType: "plain", diameterKm: 0, geologicalAge: "amazonian"
```

**Opportunity** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.20, meteorRisk: 0.15
roughness: 0.20, dustCover: 0.50, craterDensity: 0.35,
temperatureMinK: 168, temperatureMaxK: 290, elevationKm: -1.4,
waterIceIndex: 0.15, ironOxideIndex: 0.80, silicateIndex: 0.35, basaltIndex: 0.40,
featureType: "plain", diameterKm: 0, geologicalAge: "noachian"
```

**Pathfinder** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.20, meteorRisk: 0.18
roughness: 0.35, dustCover: 0.60, craterDensity: 0.45,
temperatureMinK: 163, temperatureMaxK: 278, elevationKm: -3.7,
waterIceIndex: 0.10, ironOxideIndex: 0.65, silicateIndex: 0.40, basaltIndex: 0.50,
featureType: "plain", diameterKm: 0, geologicalAge: "hesperian"
```

**Perseverance** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.22, meteorRisk: 0.18
roughness: 0.40, dustCover: 0.45, craterDensity: 0.40,
temperatureMinK: 165, temperatureMaxK: 285, elevationKm: -2.0,
waterIceIndex: 0.30, ironOxideIndex: 0.55, silicateIndex: 0.50, basaltIndex: 0.50,
featureType: "basin", diameterKm: 45, geologicalAge: "noachian"
```

**Phoenix** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.45, meteorRisk: 0.30
roughness: 0.20, dustCover: 0.35, craterDensity: 0.15,
temperatureMinK: 140, temperatureMaxK: 225, elevationKm: -4.1,
waterIceIndex: 0.80, ironOxideIndex: 0.15, silicateIndex: 0.20, basaltIndex: 0.15,
featureType: "plain", diameterKm: 0, geologicalAge: "amazonian"
```

**Spirit** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.22, meteorRisk: 0.18
roughness: 0.35, dustCover: 0.55, craterDensity: 0.50,
temperatureMinK: 163, temperatureMaxK: 280, elevationKm: -1.9,
waterIceIndex: 0.20, ironOxideIndex: 0.60, silicateIndex: 0.45, basaltIndex: 0.55,
featureType: "basin", diameterKm: 166, geologicalAge: "noachian"
```

**Syrtis Major** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 2, radiationIndex: 0.30, meteorRisk: 0.25
Existing values unchanged: roughness 0.20, dustCover 0.20, craterDensity 0.35,
temperatureMinK 170, temperatureMaxK 295, elevationKm 1.0, waterIceIndex 0.15
```

**Viking-1** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.22, meteorRisk: 0.18
roughness: 0.30, dustCover: 0.55, craterDensity: 0.35,
temperatureMinK: 160, temperatureMaxK: 260, elevationKm: -3.6,
waterIceIndex: 0.20, ironOxideIndex: 0.60, silicateIndex: 0.40, basaltIndex: 0.50,
featureType: "plain", diameterKm: 0, geologicalAge: "hesperian"
```

**Viking-2** (landing site — add all geological fields)
```
tier: 2, radiationIndex: 0.30, meteorRisk: 0.22
roughness: 0.25, dustCover: 0.50, craterDensity: 0.30,
temperatureMinK: 150, temperatureMaxK: 245, elevationKm: -4.5,
waterIceIndex: 0.50, ironOxideIndex: 0.50, silicateIndex: 0.35, basaltIndex: 0.45,
featureType: "plain", diameterKm: 0, geologicalAge: "hesperian"
```

### Tier 3

**Arsia Mons** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.70, meteorRisk: 0.55
Existing values unchanged: roughness 0.35, dustCover 0.50, craterDensity 0.08,
temperatureMinK 155, temperatureMaxK 275, elevationKm 17.0, waterIceIndex 0.25
```

**Ascraeus Mons** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.75, meteorRisk: 0.60
Existing values unchanged: roughness 0.35, dustCover 0.55, craterDensity 0.12,
temperatureMinK 155, temperatureMaxK 270, elevationKm 18.0, waterIceIndex 0.10
```

**Elysium Mons** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.60, meteorRisk: 0.50
Existing values unchanged: roughness 0.25, dustCover 0.45, craterDensity 0.15,
temperatureMinK 160, temperatureMaxK 275, elevationKm 12.6, waterIceIndex 0.12
```

**Mars-2** (landing site — add all geological fields)
```
tier: 3, radiationIndex: 0.50, meteorRisk: 0.35
roughness: 0.55, dustCover: 0.60, craterDensity: 0.50,
temperatureMinK: 145, temperatureMaxK: 255, elevationKm: 2.0,
waterIceIndex: 0.35, ironOxideIndex: 0.50, silicateIndex: 0.40, basaltIndex: 0.45,
featureType: "plain", diameterKm: 0, geologicalAge: "noachian"
```

**North Polar Cap** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.85, meteorRisk: 0.70
Existing values unchanged: roughness 0.15, dustCover 0.30, craterDensity 0.05,
temperatureMinK 143, temperatureMaxK 205, elevationKm -5.0, waterIceIndex 1.00
```

**Olympus Mons** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.80, meteorRisk: 0.65
Existing values unchanged: roughness 0.30, dustCover 0.60, craterDensity 0.10,
temperatureMinK 150, temperatureMaxK 300, elevationKm 21.9, waterIceIndex 0.15
```

**Pavonis Mons** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.65, meteorRisk: 0.55
Existing values unchanged: roughness 0.30, dustCover 0.50, craterDensity 0.10,
temperatureMinK 160, temperatureMaxK 280, elevationKm 14.0, waterIceIndex 0.08
```

**South Polar Cap** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.90, meteorRisk: 0.75
Existing values unchanged: roughness 0.20, dustCover 0.25, craterDensity 0.08,
temperatureMinK 130, temperatureMaxK 195, elevationKm -1.5, waterIceIndex 0.95
```

**Valles Marineris** (existing geological — update: add tier, radiationIndex, meteorRisk)
```
tier: 3, radiationIndex: 0.25, meteorRisk: 0.15
Existing values unchanged: roughness 0.95, dustCover 0.35, craterDensity 0.15,
temperatureMinK 160, temperatureMaxK 290, elevationKm -7.0, waterIceIndex 0.30
```

## Difficulty Rationale

### Existing hazard axes (already implemented)

| Axis | What drives it | Effect |
|------|---------------|--------|
| **Storm severity** | dustCover, roughness, featureType | Wind damage, visibility loss, instrument downtime |
| **Temperature extremes** | temperatureMinK/MaxK, latitude | Heater power drain, thermal zone penalties, instrument durability |
| **Terrain roughness** | roughness, craterDensity | Driving difficulty, rock hazard density |
| **Power pressure** | elevation (solar), temperature (heater), storms (downtime) | Less power = slower science = longer hazard exposure |

### Future hazard axes (stubbed, not implemented)

| Axis | What drives it | Planned effect |
|------|---------------|----------------|
| **Radiation** | radiationIndex (altitude, latitude, magnetosphere) | RAD instrument readings, rover health over time, shelter mechanics |
| **Meteor showers** | meteorRisk (atmospheric thickness, polar exposure) | Direct rover damage from sky, shelter/timing mechanics |

### Why certain sites are tier 3 despite easy terrain

- **North/South Pole:** Flat ice, trivial to drive. But 130-205K temperatures drain the heater constantly, radiation/meteor exposure is extreme, and permanent twilight limits solar. The danger is environmental, not navigational.
- **Mars-2:** Southern highlands with moderate terrain but compounding cold + rad + rough surface. Everything is slightly hostile simultaneously.
- **Volcanoes (all Mons):** Moderate terrain but extreme altitude means almost no atmospheric shielding from radiation and meteors. Thin air = less storm risk but more sky hazards.
- **Valles Marineris:** Pure terrain brutality. Canyon wind funnel effect, 0.95 roughness, but low radiation (deep canyon = thick atmosphere above).

## Globe View Changes

### Default Camera

On mount, the globe camera flies to Acidalia Planitia (lat 46.66, lon -22.0) as the default landing point. This replaces the current neutral starting position.

### SELECT SITE Button

| State | Appearance | Behavior |
|-------|-----------|----------|
| Tier unlocked | Normal button | Click navigates to site |
| Tier locked | Disabled/greyed | Tooltip: "Complete the Deep Signal mission on a Tier N site to unlock" |

Tooltip text:
- Legacy 0, viewing Tier 2: "Complete the Deep Signal mission on a Tier 1 site to unlock"
- Legacy 0 or 1, viewing Tier 3: "Complete the Deep Signal mission on a Tier 2 site to unlock"

### Landmark Pins

All 28 pins visible regardless of tier. Players should see what's out there. No visual tier indicator on the pins — the lock is on the button, not the map.

## Code Changes

| File | Change |
|------|--------|
| `public/data/landmarks.json` | Remove Schiaparelli; add tier/radiationIndex/meteorRisk to all; add geological fields to landing sites |
| `src/types/landmark.ts` | Add tier, radiationIndex, meteorRisk to base type; add geological fields to LandingSite type |
| `src/views/MarsSiteViewController.ts` | Update `getTerrainParamsForSite` to read geological fields from any landmark type |
| `src/components/LandmarkInfoCard.vue` | Disable SELECT SITE when tier locked; add lock tooltip |
| `src/three/terrain/GlbTerrainGenerator.ts` | Remove schiaparelli from GLB_TERRAIN_SITES |
| `src/composables/useThreeScene.ts` or `GlobeView.vue` | Default camera to Acidalia Planitia on mount |
| `src/composables/useMissions.ts` or new `useLegacy.ts` | Legacy read/write from localStorage; increment on m13 completion |
| `public/terrain/schiaparelli.glb` | Delete file |

## What This Does NOT Include

- RAD instrument gameplay (m12, Act 2)
- Meteor shower gameplay system (Act 2)
- Radiation/meteor damage mechanics — just the data fields
- Any changes to the mission chain or mission content
- Difficulty indicators on the globe UI beyond the lock tooltip
- Per-tier weather tuning (the existing geological params already drive weather naturally)
