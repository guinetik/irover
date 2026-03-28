# Site mission POI tracking

Mission-defined points of interest (POIs) on the Martian site surface appear on the **compass strip** as colored dots. Their horizontal position is the **relative bearing** from the rover nose (same convention as the heading readout: 0° = north / world −Z, 90° = east / +X).

## Data: `public/data/site-pois.json`

```json
{
  "sites": {
    "<landmark-id>": [
      {
        "id": "unique-id",
        "label": "Tooltip / mission text",
        "x": 0,
        "z": 0,
        "color": "#5eb8ff"
      }
    ]
  }
}
```

- **`x`, `z`**: World coordinates on the terrain plane (same as the rover root `position.x` / `position.z`).
- **`color`**: Optional; defaults to a cool blue for markers.
- Keys under `sites` must match **`landmarks.json` `id`** values (e.g. `pathfinder`, `spirit`).

POIs for the current route load automatically when entering `/site/:siteId` and clear on leave.

Runtime payload deliveries also reuse this system: when an orbital drop lands, `MartianSiteView` registers a temporary POI for the payload box and removes it after the payload is fully claimed.

## Runtime API: `useSiteMissionPois()`

| Method | Purpose |
|--------|---------|
| `loadPoisForSite(siteId)` | Reload from JSON for a site (usually automatic via route watch). |
| `upsertPoi(poi)` | Add or replace a POI by `id` (scripted missions). |
| `removePoi(id)` | Remove one POI. |
| `setPois(list)` | Replace the entire list. |
| `clearPois()` | Clear all POIs and focus. |
| `setFocusPoi(id \| null)` | Emphasize one POI (ring + glow on the compass); `null` clears. |

Reactive state: `pois`, `focusPoiId`.

## Math: `src/lib/sitePoiBearing.ts`

Pure helpers for HUD-consistent bearings:

- `roverHeadingRadToCompassDeg(headingRad)`
- `worldBearingDegToPoi(roverX, roverZ, poiX, poiZ)`
- `signedRelativeBearingDeg(headingDeg, targetBearingDeg)`

## UI: `SiteCompass.vue`

Optional prop `pois`: `{ id, label, relativeDeg, focused?, color? }[]`. `MartianSiteView` fills this from `missionPois` and live rover pose.

Markers **clamp** to the strip edges when the target is outside the visible arc; stacked offsets avoid complete overlap when multiple POIs sit on the same side.
