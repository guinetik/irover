# APXS Contact Science — Design Spec

## Overview

The Alpha Particle X-ray Spectrometer (APXS) becomes a full contact science instrument. The player positions the arm turret against a rock, triggering a 2D minigame where they catch fluorescent X-ray photons to measure the rock's surface elemental composition. Results feed into the science log and SP economy.

**Distinction from ChemCam:** ChemCam fires a laser to ablate the surface and read *internal* composition (emission spectrum by wavelength). APXS presses a sensor against the rock surface to read *surface* composition (X-ray fluorescence by element). Different science, different missions, different visualizations.

**Pipeline position:** MastCam survey → ChemCam internals → **APXS surface** → Drill sample. Each step marks the rock (`mastcamScanned` → `chemcamAnalyzed` → `apxsAnalyzed`), stacking yields for the final drill. **APXS does not require prior steps** — it can be used independently on any rock. The pipeline order is a recommendation for optimal science, not a gate.

## Gameplay Flow

### 1. Activation & Arm Control

Already implemented: APXS activation rotates the turret head ~225 degrees (APXS faces front), WASD controls arm swing/extend. No changes needed here.

### 2. Rock Contact Detection

Reuse `RockTargeting` with a **configurable range parameter**. `RockTargeting.castFromDrillHead()` currently hardcodes `DRILL_HEAD_RANGE = 1.5m`. Refactor to accept an optional `maxRange` parameter, defaulting to 1.5m for backward compatibility. APXS passes `0.3m`.

The APXS node world position is the ray origin. Valid targets: small rocks (inherited from `RockTargeting.getSmallRocks()` — same filter as drill, no new logic needed), not already `apxsAnalyzed`.

- **Green cursor:** valid rock in contact range, not yet analyzed
- **Red cursor:** no target, already analyzed, or out of range
- Crosshair uses the same `InstrumentCrosshair.vue` component (already wired in `MartianSiteView.vue`)

### 3. Countdown

**Trigger:** automatic on proximity — when the cursor turns green (APXS node is within 0.3m of a valid rock), the countdown begins immediately. No key press required. Pulling the arm away cancels.

- 3-2-1 countdown overlay appears (centered, large text, same aesthetic as deploy overlay)
- Player can pull away to cancel (countdown resets)
- On "0" → minigame launches as a dialog overlay

### 4. Minigame: X-Ray Fluorescence Photon Catcher

Ported from `inspo/apxs-minigame-v2.html` (canonical reference for game mechanics: particle speeds, detector size, emission rates, etc.) into `APXSMinigame.vue`.

**Mechanics:**
- Rock surface rendered as colored mineral grains (element-tinted circles)
- Alpha particles stream in from edges, striking the rock
- Elements emit colored X-ray photons that fly outward
- Player moves a circular detector (mouse) to catch photons
- Each catch increments that element's measured count
- Photon emission rate proportional to element abundance — rare elements (< 2%) emit faster, brighter, with keV labels
- **Duration:** 25 seconds base (modified by thermal — see Thermal Penalty section)
- **Budget:** ~320 total photons distributed by composition

**HUD during gameplay:**
- Top-left: "Photons Caught" counter + rock type label
- Top-center: "Source Power" depletion bar
- Top-right: "Accuracy" percentage (cosine similarity, shows after 5+ catches)
- Bottom panel: live spectrum bar chart — true composition (faint bars) vs measured (solid bars), per-element percentages

**Screens:**
- Tutorial: reuse `SAMMiniGameTutorial` component with APXS-specific text and steps
- Result: reuse `SAMMiniGameResult` component for grade display, then show `APXSResultChart` with the full spectrum comparison

**Accuracy calculation:** cosine similarity between true composition vector and measured composition vector, scaled to 0-100%.

### 5. Rock Composition Data

Stored in `public/data/apxs-compositions.json`. Values are **relative weights** (not oxide percentages) — they do not sum to 100%. At runtime, `generateComposition()` applies random variance then normalizes to 100% to produce the actual game composition.

10 elements tracked: Fe, Si, Ca, S, Mg, Al, Na, Mn, P, Ni.

| Rock Type | Fe | Si | Ca | S | Mg | Al | Na | Mn | P | Ni |
|-----------|----|----|----|----|----|----|----|----|---|-----|
| Basalt | 18 | 24 | 8 | 2 | 6 | 9 | 3 | 0.3 | 0.2 | 0.05 |
| Hematite | 42 | 10 | 3 | 1 | 2 | 5 | 1 | 1.5 | 0.1 | 0.08 |
| Mudstone | 14 | 20 | 6 | 5 | 4 | 8 | 2 | 0.4 | 0.8 | 0.03 |
| Sulfate | 8 | 12 | 14 | 18 | 5 | 4 | 4 | 0.2 | 0.15 | 0.02 |
| Olivine | 12 | 18 | 2 | 1 | 28 | 2 | 1 | 0.3 | 0.1 | 0.4 |
| Iron Meteorite | 52 | 2 | 1 | 1 | 1 | 1 | 0.5 | 0.2 | 0.3 | 8 |

Variance applied at game start: `base * (0.6 + Math.random() * 0.8)`, then **normalized to sum to 100%**.

### 6. SP Awards

New `'apxs'` source added to `SPSource` type in `useSciencePoints.ts`. Follows the SAM award pattern: custom function with fixed base SP (not the instrument YIELDS system), idempotency set keyed by rock mesh UUID.

| Grade | Accuracy | Base SP |
|-------|----------|---------|
| S | 97%+ | 10 |
| A | 92%+ | 8 |
| B | 82%+ | 6 |
| C | 65%+ | 4 |
| D | < 65% | 2 |

Anomaly bonus: +2 SP per trace element (< 2% true composition) caught at least once. Bonus only applies to grades B and below (S and A already earn near-max SP). Final SP before `spYield` multiplier is capped at 10. The `mod('spYield')` multiplier is applied after the cap (same as all other sources — the multiplier is a profile-level scaling, not part of the base award).

APXS is **not** added to the multi-instrument `scored` map or `multiBonus()` — it awards SP independently via its own function. The multi-instrument bonus system (x1.5 / x3.0) remains for mastcam/chemcam/drill only.

### 7. Rock State

After analysis completes (any grade):
- `rock.userData.apxsAnalyzed = true`
- Rock becomes invalid APXS target (red cursor)
- Rock remains drillable — APXS is non-destructive
- The `apxsAnalyzed` flag can later feed into drill yield bonuses (multi-instrument pipeline)

### 8. Science Log

New "APXS analysis" section in `ScienceLogDialog.vue`. Each entry contains:
- Rock type name
- Analysis grade (S/A/B/C/D)
- `APXSResultChart.vue` — elemental composition bar chart showing measured vs true percentages
- SP earned
- Site ID + sol metadata

The chart is a discrete bar chart (not the ChemCam wavelength spectrum). Each element gets two bars: faint (true) and solid (measured), color-coded per element. Same amber palette and typography as the rest of the UI.

### 9. Achievements

New `apxs-analysis` category in `achievements.json`, event-based (same format as `dan-prospecting` / `sam-analysis`):

| ID | Event | Icon | Title | Description |
|----|-------|------|-------|-------------|
| apxs-first-contact | first-analysis | &#x1F91A; | FIRST CONTACT | Complete your first APXS surface analysis. |
| apxs-surface-reader | five-analyses | &#x1F4CA; | SURFACE READER | Complete 5 APXS analyses. |
| apxs-anomaly-hunter | five-anomalies | &#x26A0; | ANOMALY HUNTER | Detect trace element anomalies in 5 different analyses. |
| apxs-precision | five-s-grades | &#x1F3AF; | PRECISION INSTRUMENT | Achieve S grade in 5 APXS analyses. |

Counter-based achievements (5x) track a session-scoped counter incremented by the view on each qualifying event. The counter is not persisted — same reset-on-reload behavior as other achievement categories.

## Architecture

### Dependency Flow

```
public/data/apxs-compositions.json  <- static data
        |
src/lib/apxsComposition.ts          <- pure: generate composition from rock type + variance
        |
src/components/APXSMinigame.vue     <- 2D canvas game (receives composition, emits quality)
        |
src/views/site-controllers/APXSTickHandler.ts  <- manages contact, countdown, dialog launch
        |
src/views/MartianSiteView.vue       <- wires tick handler, dialog state, SP, achievements
```

### File Map

| File | Action | Role |
|------|--------|------|
| `public/data/apxs-compositions.json` | Create | Rock type -> base element relative weights |
| `src/lib/apxsComposition.ts` | Create | `generateComposition(rockType)` — applies variance, normalizes to 100%. Pure function, no Vue. |
| `src/components/APXSMinigame.vue` | Create | Canvas-based photon catcher game. Props: `rockType`, `composition`, `durationSec`. Emits: `complete(quality, measuredComposition, anomaliesCaught)`. Reuses `SAMMiniGameTutorial` and `SAMMiniGameResult`. |
| `src/components/APXSResultChart.vue` | Create | Elemental bar chart for science log. Props: `trueComposition`, `measuredComposition`, `grade`. |
| `src/three/instruments/RockTargeting.ts` | Modify | Make `castFromDrillHead` accept optional `maxRange` param (default 1.5m for backward compat). |
| `src/three/instruments/APXSController.ts` | Modify | Add `RockTargeting` with 0.3m contact range, expose `hasTarget`, `canAnalyzeTarget`, `currentTarget`, `apxsAnalyzed` marking. |
| `src/views/site-controllers/APXSTickHandler.ts` | Create | Tick handler: crosshair, contact detection, countdown state machine, dialog trigger. |
| `src/composables/useSciencePoints.ts` | Modify | Add `'apxs'` to `SPSource`, add `awardAPXS(rockId, baseSp, label)` function (SAM pattern). |
| `src/components/SciencePointsDialog.vue` | Modify | Add `'apxs': 'APXS'` to `SOURCE_HEADLINE` record. |
| `src/composables/useAPXSArchive.ts` | Create | Stores completed analyses for science log (reactive array, same pattern as `useSamArchive`). |
| `src/components/ScienceLogDialog.vue` | Modify | Add APXS section with `APXSResultChart` per entry. |
| `public/data/achievements.json` | Modify | Add `apxs-analysis` category (4 event-based achievements). |
| `src/views/MartianSiteView.vue` | Modify | Wire APXSTickHandler, dialog state, SP awards, achievement triggers, archive. |
| `src/views/MarsSiteViewController.ts` | Modify | Register APXSTickHandler in the tick handler chain. |

### Thermal Penalty

Per GDD: APXS analysis is harder in cold. Unlike the drill (where thermal multiplier increases drill duration = harder), APXS uses thermal to **shrink game duration** = fewer photons to catch = harder. This is the opposite direction from drill — intentional, because the APXS minigame difficulty scales with available time.

| Zone | Duration | Effect |
|------|----------|--------|
| OPTIMAL | 25s | Base duration |
| COLD | 21s | 16% less time — noticeable |
| FRIGID | 12.5s | 50% less time — very hard |
| CRITICAL | blocked | Toast: "Too cold for APXS — warm up first" |

The `durationSec` is passed as a prop to `APXSMinigame.vue`. The tick handler computes it from the thermal zone before launching the game.

### Power Draw

6W sustained during the minigame (already configured in `APXSController.getInstrumentBusPowerW` for active phase). No change needed.

## What's Deferred

- APXS -> Drill yield bonus (multi-instrument pipeline wiring beyond the flag)
- APXS calibration track (like LIBS calibration — instrument improves with use)
- APXS-specific missions from Mission Control
- Sound effects
- Arm collision with terrain
- Pipeline gating (requiring mastcam/chemcam before APXS)
