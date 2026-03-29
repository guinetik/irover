# RAD Mission (m12-rad) Integration Design

## Context

Mission m12-rad ("RAD: Ground-Level Survey") is defined in `missions.json` but has no gameplay wiring. The RAD instrument system is fully built — controller, tick handler, radiation field, decode minigame, result display, archive, VFX, sound. What's missing is the mission objective integration: two new objective types, hazard-aware POI placement, and notification wiring.

RAD is the 11th mission in the chain (m10-sam → m12-rad). By this point the player has been playing for hours and may have already activated RAD and decoded events organically. All checkers must handle retroactive completion.

## Mission Objectives (from missions.json)

| # | ID | Type | Params | Sequential |
|---|-----|------|--------|------------|
| 1 | rad-1 | `rad-activate` | — | yes |
| 2 | rad-2 | `go-to` | poiId: rad-hotspot-01 | yes |
| 3 | rad-3 | `rad-decode` | — | yes |
| 4 | rad-4 | `ui-inspect` | target: rad-science | yes |
| 5 | rad-5 | `go-to` | poiId: rad-safe-return | yes |
| 6 | rad-6 | `use-repair-kit` | — | yes |

## Design

### 1. New Objective Types

Add `'rad-activate'` and `'rad-decode'` to the `ObjectiveType` union in `src/types/missions.ts`.

### 2. Objective Checkers (useMissions.ts)

**`rad-activate`** — Retroactive. The checker reads a ref that tracks whether RAD is currently enabled (or was enabled during this session). Set from the same passive-toggle handler that fires `notifyRemsActivated()` / `notifyDanActivated()`. Also: in the MartianSiteView watch on `radEnabled`, if it becomes true, fire the notification. This covers the case where RAD was already on before the mission was accepted.

**`rad-decode`** — Archive-based. The checker reads `useRadArchive().events.value.length >= 1`. This auto-completes retroactively if the player decoded events before the mission arrived. The notification fires in `onRadAcknowledge` — same location as the existing `first-decode` achievement check.

**`ui-inspect` with target `rad-science`** — Already supported by the generic `ui-inspect` checker. Fire `notifyUiInspected('rad-science')` in `onRadAcknowledge`, since the result display IS the science review for RAD events.

### 3. Hazard-Aware POI Placement

#### `rad-hotspot-01`

When `seedGoToPoisForMission` runs for m12-rad, the `rad-hotspot-01` POI must land inside a hazardous radiation zone. Add a helper function to `radiationField.ts`:

```
findHazardousCell(
  field: Float32Array,
  cols: number, rows: number,
  cellSize: number, halfExtent: number,
  roverX: number, roverZ: number,
  minDist: number
): { x: number, z: number } | null
```

Scans the radiation field grid for cells with value ≥ 0.60 (hazardous threshold) that are at least `minDist` world units from the rover. Returns the highest-value cell meeting the distance constraint. Falls back to the highest cell overall if nothing meets `minDist`.

The site controller exposes the radiation field via `RadTickHandler.getField()` (or a new accessor). `useMissionUI` calls this when it detects a `rad-hotspot` poiId during seeding.

#### `rad-safe-return`

Uses `findSafeZoneCentroids()` (already exists in `radiationField.ts`) to find the nearest safe zone centroid to the hotspot position. The POI is placed there. Since rad-5 is sequential and gated behind rad-4, `revealEligiblePois` handles the delayed reveal automatically.

#### Passing the field to useMissionUI

`useMissionUI` already receives `siteHandle` which has access to the site scene. The radiation field is owned by `RadTickHandler`. Add a method `getRadiationFieldData()` to the site controller handle that returns `{ field, cols, rows, cellSize, halfExtent }` or `null` if not yet generated. `seedGoToPoisForMission` calls this when it encounters rad-specific poiIds.

### 4. Notification Wiring (MartianSiteView.vue)

Three additions to the view:

1. **RAD activation**: In the passive subsystem toggle handler (where REMS/DAN already fire), add:
   ```
   if (inst?.id === 'rad' && inst.passiveSubsystemEnabled) {
     useMissions().notifyRadActivated()
   }
   ```
   Also add a `watch(radEnabled, ...)` that fires `notifyRadActivated()` when it becomes true (covers already-on case).

2. **RAD decode**: In `onRadAcknowledge()`, right next to the existing `first-decode` achievement line:
   ```
   useMissions().notifyRadDecodeCompleted()
   ```

3. **RAD science inspect**: In `onRadAcknowledge()`:
   ```
   useMissions().notifyUiInspected('rad-science')
   ```

### 5. Instrument Damage

No new logic needed. The existing hazard decay system degrades instruments in intermediate/hazardous zones via `computeDecayMultiplier()`. By the time the player drives to the hotspot, decodes, reviews, and drives back, their sensitive instruments (MastCam, ChemCam) will have taken real durability hits. The `use-repair-kit` objective (rad-6) will have something to repair.

### 6. Files Changed

| File | Change |
|------|--------|
| `src/types/missions.ts` | Add `'rad-activate'` and `'rad-decode'` to ObjectiveType union |
| `src/composables/useMissions.ts` | Add radActivated + radDecodeCompleted refs, checkers (archive-based for decode), notify functions, reset entries, exports |
| `src/views/MartianSiteView.vue` | Wire 3 notifications: rad activate (toggle + watch), rad decode (onRadAcknowledge), rad-science ui-inspect (onRadAcknowledge) |
| `src/lib/radiation/radiationField.ts` | Add `findHazardousCell()` helper |
| `src/composables/useMissionUI.ts` | Special-case rad POI placement: hotspot → hazardous cell, safe-return → nearest safe centroid |
| `src/views/MarsSiteViewController.ts` | Expose `getRadiationFieldData()` on the site handle |

### 7. Tests

- Unit test `findHazardousCell()` in `radiationField.test.ts` — verify it returns a hazardous cell beyond minDist, verify fallback
- Unit test the two new checkers in `useMissions` tests — verify archive-based rad-decode, flag-based rad-activate
- Existing mission integration tests cover the sequential gating and objective flow patterns
