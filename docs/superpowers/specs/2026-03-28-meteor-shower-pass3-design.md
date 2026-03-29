# Meteor Shower — Pass 3 Design Spec
### DAN Crater Mode + Vent Placement

**Date:** 2026-03-28
**GDD Reference:** `inspo/mars-rovers-meteor-gdd-v01.md`
**Scope:** Pass 3 of 4 (builds on Pass 1 + 2)
**Depends on:** Pass 1 (shower + rocks), Pass 2 (craters + shockwave)

---

## Scoping

| Pass | Scope |
|------|-------|
| 1 (done) | Shower event + fall sequence + interactable rock + MastCam tagging |
| 2 (done) | Visual polish + shockwave damage + terrain craters + impact kill |
| **3 (this spec)** | DAN Crater Mode + vent placement + map markers + storm cleanup |
| 4 | Achievements + reward track perks |

---

## 0. Prerequisite: deformCrater Return Value

Pass 2's `deformCrater(x, z, radius, depth, rimHeight)` currently returns `void`. Pass 3 needs it to return the original heightmap values so craters can be reverted (by storms and by vent fracking). This changes the `ITerrainGenerator` interface and all four implementations.

**Do this first** — change the signature to return a `CraterDeformData` (the original cell values before deformation). Add `revertCrater(data: CraterDeformData)` to the interface. All downstream code builds against the new signature.

```typescript
interface CraterDeformData {
  cells: Array<{ gx: number; gz: number; originalY: number }>
  meshVertices: Array<{ meshIndex: number; vertexIndex: number; originalY: number }>
}
```

---

## 1. DAN Crater Mode

DAN Crater Mode is a specialization of the existing DAN prospecting module. Same UI, same animation, different context.

### Flow

1. **Activate DAN** — player presses DAN keybind as usual
2. **Crater detection** — system checks if rover is inside a crater radius (from Pass 2's tracked craters) that still has a meteorite rock in it
3. **Confirmation prompt** — reuse the existing power shunt confirmation UI: "Crater detected — initiate DAN Crater Mode?" Player can deny and proceed with regular DAN.
4. **Immobilize** — on confirm, rover movement is locked (same mechanism as RTG power shunt: `criticalPowerMobilitySuspended` or equivalent)
5. **Scan** — DAN prospecting animation plays. No terrain overlay, no walk-to-spot phase. Fixed 30-second scan time (buffable by `analysisSpeed` modifier).
6. **Result** — same DAN result panel with crater-specific discovery data. Roll against the crater discovery table.
7. **Outcome** — either a vent is discovered (meteorite consumed, vent placed) or just data/items. Either way:
   - DAN turns off (deactivates)
   - Rover movement unlocked
   - Crater mode ends

### Crater Detection

A crater is eligible for crater mode when:
- Rover position is within the crater's radius
- The crater still has a meteorite rock (not consumed by a previous vent, not cleared by storm)
- The crater has NOT already been scanned — check the DAN archive for a `craterDiscovery` entry at this position. One scan per crater, no repeat farming.

The MeteorController already tracks craters from Pass 2. Expose a query: `getCraterAtPosition(x, z): MeteorCrater | null`. The DAN archive acts as the "already scanned" flag — storms clear craters (and their rocks), so the archive entry becomes orphaned naturally.

---

## 2. Discovery Table

Rolled on crater mode scan completion:

| ID | Name | Rarity | SP | Placeable Vent | Side Products |
|----|------|--------|-----|----------------|---------------|
| DC01 | CO₂ vent | Common | 20 | YES (co2) | — |
| DC02 | Carbonate decomposition | Uncommon | 55 | NO | trace-Ca ×2 |
| DC03 | Adsorbed water release | Uncommon | 60 | NO | ice ×1 |
| DC04 | Methane trace | Rare | 150 | YES (methane) | — |
| DC05 | Deep regolith stratigraphy | Uncommon | 45 | NO | — |

### Roll Weights

| Rarity | Weight | Probability |
|--------|--------|-------------|
| Common (DC01) | 40 | 40% |
| Uncommon (DC02, DC03, DC05) | 15 each | 45% total |
| Rare (DC04) | 15 | 15% |

### One Source Per Vent Type

If the player already has an active vent of the discovered type (e.g., already has a CO₂ vent on the map), the discovery still awards SP and side products but no vent is placed. Meteorite stays in the crater.

---

## 3. Vent Placement

When a placeable vent is discovered AND no active vent of that type exists:

1. **Meteorite consumed** — rock mesh removed from crater via `unregisterMeteoriteRock`
2. **Crater reverted** — terrain deformation reverted to flat ground (same as storm cleanup). The fracking process pounds the ground flat to expose the vent.
3. **Vent placed** — DAN water drill GLB model placed at the original crater center on flat terrain (same pattern as existing `dan.glb` drill marker). Reuse the existing drill marker template/loading.
4. **Toast** — "PNEUMATIC FRACTURING COMPLETE — [vent type] VENT EXPOSED"
5. **Crater removed from tracking** — no longer a crater, just a vent site. Storms have nothing to clean up (crater is gone, vent is permanent).

### Vent Types

Only two placeable vent types:
- **CO₂** (common, from DC01)
- **Methane** (rare, from DC04)

Water is handled by regular DAN prospecting. DC03 gives ice as a side product but no vent.

### Vent Persistence

Vents must survive page refresh. A new composable `useVentArchive.ts` (following the `useDanArchive` pattern) stores placed vents in localStorage:

```typescript
interface ArchivedVent {
  archiveId: string
  siteId: string
  ventType: 'co2' | 'methane'
  placedSol: number
  /** World position where the vent GLB should be placed on restore. */
  x: number
  z: number
}
```

On site load, persisted vents are restored: vent GLB placed at stored coordinates on flat terrain. No crater re-deformation needed — the fracking process already flattened the ground before the vent was placed.

---

## 4. Storm Cleanup Update

Pass 1 storms clear all meteorite rocks. Pass 2 added crater deformation. Now with vents:

- **No vent:** Storm clears meteorite rock + reverts crater heightmap deformation
- **Vent site:** Not a crater anymore (fracking flattened it). Storm has nothing to clean up. Vent persists permanently.

### Crater Deformation Revert

`deformCrater` from Pass 2 currently doesn't store revert data. Extend to return/store the original heightmap values so `revertCrater` can restore them. Add `revertCrater(craterData)` to `ITerrainGenerator`. Used by both storm cleanup (non-vent craters) and vent placement (fracking flattens the crater before placing the buildable).

---

## 5. Map Overlay Markers

Placed vents appear on the terrain map overlay (`MapOverlay.vue`) as colored dots:

| Vent Type | Color | Label |
|-----------|-------|-------|
| CO₂ | `#ff8844` (orange) | "CO₂ VENT" |
| Methane | `#44ff88` (green) | "CH₄ VENT" |

The `MapOverlay` already supports a `markers` prop (`MapMarker[]`). The site view passes vent positions as markers alongside any existing markers (mission waypoints, DAN drill sites, etc.).

Vent markers pulse (`pulse: true`) to distinguish them from static markers.

---

## 6. DAN Crater Archive

Crater mode discoveries are archived for the Science Log. Extend the existing DAN archive or create a parallel one.

**Recommended: extend the existing `ArchivedDANProspect`** with an optional `craterDiscovery` field:

```typescript
interface ArchivedDANProspect {
  // ... existing fields ...
  /** Present only for DAN Crater Mode discoveries. */
  craterDiscovery?: {
    discoveryId: string    // DC01–DC05
    discoveryName: string
    ventPlaced: boolean
    ventType?: 'co2' | 'methane'
  }
}
```

This keeps all DAN science in one archive and one Science Log accordion. Crater discoveries show with a distinct badge/icon in the DAN accordion.

---

## 7. DAN Tick Handler Implementation Guidance

The existing `DANProspectPhase` union is:
```typescript
type DANProspectPhase = 'idle' | 'drive-to-zone' | 'initiating' | 'prospecting' | 'complete'
```

The tick handler's prospect state machine branches on these phases at ~line 432-460. Crater mode needs to **bypass** `drive-to-zone` and `initiating` entirely — the rover is already at the spot.

**Add two new phase values:**
```typescript
type DANProspectPhase = 'idle' | 'drive-to-zone' | 'initiating' | 'prospecting' | 'complete'
  | 'crater-confirm' | 'crater-scanning'
```

### Detection → Confirmation (Vue boundary)

When DAN activates and the tick handler detects an eligible crater:
1. Tick handler sets a **reactive ref** (e.g., `danCraterModeAvailable: Ref<boolean>`) to `true`
2. The tick handler sets `prospectPhase = 'crater-confirm'` to pause normal DAN logic
3. `MartianSiteView.vue` watches this ref and shows a confirmation dialog (same pattern as `showConservationConfirm` — reuse the `overdrive-confirm-overlay` CSS with DAN-themed copy)
4. Dialog text: "CRATER DETECTED — Initiate DAN Crater Mode? Rover will be immobilized during scan."
5. **Confirm button** → calls a callback that sets `prospectPhase = 'crater-scanning'` + immobilizes rover
6. **Cancel button** → calls a callback that sets `prospectPhase = 'idle'` + `danCraterModeAvailable = false`, regular DAN resumes

The tick handler does NOT show UI — it sets refs. Vue shows UI. Callbacks flow back. Same boundary as RTG power shunt.

### crater-scanning phase

The 30-second scan. Same branch location as `prospecting` in the tick function — advance progress, check completion. On complete → roll discovery table, archive result, handle vent placement, deactivate DAN, unlock rover, transition to `idle`.

**Key rule:** The existing `drive-to-zone` → `initiating` → `prospecting` → `complete` chain is untouched. Crater mode is a parallel branch that enters from `idle` and returns to `idle`. The two paths never cross.

The tick handler is 400+ lines. The crater branch adds ~60-80 lines in the same `tick()` function. If the implementer prefers, the crater-specific logic can be extracted to a helper function called from within `tick()` to keep the main function readable.

---

## File Layout

### New Files

| File | Purpose |
|------|---------|
| `src/lib/meteor/craterDiscovery.ts` | Discovery table, roll function, vent type mapping |
| `src/composables/useVentArchive.ts` | Vent persistence in localStorage |
| `src/types/ventArchive.ts` | `ArchivedVent` interface |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/meteor/meteorTypes.ts` | Add `MeteorCrater` interface (position, radius, hasVent, ventType, deformData) |
| `src/views/site-controllers/MeteorController.ts` | Track craters, expose `getCraterAtPosition()`, vent placement, storm revert |
| `src/views/site-controllers/DanTickHandler.ts` | Detect crater proximity on DAN activate, trigger crater mode flow |
| `src/three/terrain/TerrainGenerator.ts` | Add `revertCrater()` to interface, store/return deform data |
| `src/three/terrain/GlbTerrainGenerator.ts` | Implement `revertCrater()` |
| `src/three/terrain/MarsGlobalTerrainGenerator.ts` | Implement `revertCrater()` |
| `src/three/terrain/ElevationTerrainGenerator.ts` | Implement `revertCrater()` |
| `src/types/danArchive.ts` | Add optional `craterDiscovery` field |
| `src/views/MartianSiteView.vue` | Pass vent markers to MapOverlay, restore vents on load |
| `src/composables/useDanArchive.ts` | Handle crater discovery archiving |
| `src/components/ScienceLogDialog.vue` | Show crater discovery badge in DAN accordion |

---

## Future Pass 4 Hooks

- **Achievements:** Crater mode events (first crater scan, first vent placed, methane detected) fire from the controller
- **Reward track perks:** `crater-reader` (extends freshness — N/A since we scrapped freshness), `impact-brace` (shockwave reduction), `meteor-sense` (marker warning extension)
