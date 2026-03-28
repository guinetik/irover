# DAN drill-site marker (`/dan.glb`)

When a DAN prospect confirms subsurface ice, the site tick handler spawns a clone of the model at `public/dan.glb` instead of a procedural cone.

- **Load path:** cached once via `GLTFLoader` in `DanTickHandler.ts`; each confirmation uses `template.clone(true)`.
- **Sizing:** the clone is uniformly scaled so its axis-aligned bounding box’s largest edge equals **0.5** scene units (same order as the previous 0.5-unit-tall cone). Adjust `DAN_DRILL_MARKER_TARGET_SIZE` in that file if the asset reads too large or small.
- **Placement:** the bottom of the scaled model sits on terrain height at the hit XZ, lifted **0.05** to match the prospect disc offset.

## Reload persistence

On water confirm, `drillSiteX` / `drillSiteY` / `drillSiteZ` are written onto the new row in `mars-dan-archive-v1` (`useDanArchive`). On site load, `initIfReady` reads the latest water-confirmed row for the current `siteId` via `findLatestPersistedDanDrillSite` and rebuilds the completed disc (hidden until DAN is selected) and the GLB marker. Older archive rows without drill coordinates are ignored.

## Scan vs prospect rules

- **Single target:** While `pendingHit` is set (hydrogen found until prospect resolves or standby clears it), `DANController` does not roll for another passive hit.
- **Standby cancels work:** The prospect state machine (drive-to-zone → initiating → prospecting) only advances while `passiveSubsystemEnabled` is true. If the player puts DAN on standby or sleep/power forces it off, `DanTickHandler` removes the active disc, clears `pendingHit`, resets phases, restores move speed, and shows an appropriate toast — the run cannot finish while DAN is off.
