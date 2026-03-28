# Terrain Map Overlay

## Overview

A full-screen map overlay triggered by **M** that shows the current terrain site as two color-coded 2D maps generated from the existing 512x512 heightmap. The mic keybinding moves from M to **P**.

## Map Image Generation

On terrain load (after `GlbTerrainGenerator.generate()` completes), generate two 512x512 `HTMLCanvasElement` images from the existing `heightmap: Float32Array`, `heightMin`, and `heightMax`:

### Mars Color Map (default view)
Terracotta-to-latte ramp from the mars lab project (`D:\Developer\mars\src\lib\colorSchemes.js`):

| t | color |
|---|-------|
| 0.00 | `#7a4a30` |
| 0.12 | `#8b5a3a` |
| 0.25 | `#a06840` |
| 0.40 | `#c08050` |
| 0.55 | `#d8a070` |
| 0.68 | `#e0b888` |
| 0.80 | `#ecd0a0` |
| 0.92 | `#f5e0c0` |
| 1.00 | `#ffffff` |

### Hypsometric Map (alt view)
Blue-to-red elevation viz:

| t | color |
|---|-------|
| 0.00 | `#0000aa` |
| 0.15 | `#0044cc` |
| 0.25 | `#00aacc` |
| 0.35 | `#00cc66` |
| 0.45 | `#44dd00` |
| 0.55 | `#ccdd00` |
| 0.65 | `#ffcc00` |
| 0.75 | `#ff8800` |
| 0.85 | `#ff3300` |
| 0.95 | `#cc0000` |
| 1.00 | `#880000` |

### Generation approach

Pure `ImageData` pixel write on an offscreen canvas. For each pixel `(i, j)`:
1. `t = (heightmap[j * 512 + i] - heightMin) / (heightMax - heightMin)`
2. Lerp between the two surrounding ramp stops
3. Write RGBA to ImageData

Store the two canvases on the terrain generator (or a dedicated helper) so `MapComponent` can reference them.

## Coordinate System

Reuse the existing `MastTelemetry.vue` approach:

```
DEG_PER_METER = 1 / 59200
```

The terrain spans 1000 world units (-500 to +500). Each pixel = 1000/512 ≈ 1.953 world units.

**Site center** comes from `landmarks.json` (`lat`, `lon` fields). From any pixel `(px, pz)`:
- `worldX = (px / 511 - 0.5) * 1000`
- `worldZ = (pz / 511 - 0.5) * 1000`
- `lat = baseLat + (-worldZ * DEG_PER_METER)`
- `lon = baseLon + (worldX * DEG_PER_METER / cos(baseLat))`

## MapComponent.vue

### Layout
Full-screen overlay with semi-transparent dark backdrop (consistent with existing panel overlays). Contains:

- **Map canvas** — centered, scaled to fit viewport (preserving 1:1 aspect)
- **Grid overlay** — lat/lon grid lines drawn as a CSS/canvas overlay on top of the map image. Spacing derived from terrain extent (auto-pick a sensible degree increment based on site span)
- **Grid labels** — lat/lon degree values at grid edges
- **Cursor readout** — as the mouse moves over the map, display the lat/lon in a small label near the cursor
- **Rover position dot** — pulsing point at the rover's current position (derived from `roverWorldX`/`roverWorldZ` → pixel coords). Updated reactively.
- **Toggle button** — switch between Mars color and hypsometric views
- **Site name** — top header showing the current site name

### Interaction
- **M** key toggles the overlay open/closed
- **Mouse hover** shows lat/lon readout
- **Click** or **Escape** closes the overlay (or M again)
- No pan/zoom for v1 — the full terrain fits in the viewport

## Keybinding Changes

In `MartianSiteView.vue`:
- `onGlobalKeyDown`: change `'m'`/`'M'` from `toggleMicPanel()` to `toggleMapOverlay()`
- Add new `'p'`/`'P'` case → `toggleMicPanel()`
- Update the mic HUD button: label `P`, title text updated

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/terrain/mapColors.ts` | **New** — color ramp definitions + `generateMapCanvas(heightmap, min, max, ramp)` pure function |
| `src/components/MapOverlay.vue` | **New** — full-screen map overlay component |
| `src/three/terrain/GlbTerrainGenerator.ts` | **Modify** — after heightmap build, call `generateMapCanvas` twice, expose the two canvases |
| `src/views/MartianSiteView.vue` | **Modify** — add MapOverlay, wire M key to toggle it, move mic to P, update HUD button labels |
