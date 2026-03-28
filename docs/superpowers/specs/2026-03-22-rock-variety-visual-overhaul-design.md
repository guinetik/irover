# Rock Variety & Visual Overhaul Design

## Overview

Replaces the single-type, flat-material rock system with 6 geologically accurate Mars rock types. Each type has distinct procedural geometry, PBR materials with vertex-colour variation, and data-driven spawn distribution based on landmark geological indices.

## Rock Types

| Type | Driven By | Geometry | Visual Character |
|------|-----------|----------|------------------|
| Basalt | `basaltIndex` | Icosahedron, detail 1 | Dark grey-brown, matte, smooth rounded |
| Hematite | `ironOxideIndex` | Sphere, detail 2 | Rusty red-grey, metallic sheen (Opportunity "blueberries") |
| Olivine | `silicateIndex` | Dodecahedron, detail 1 | Olive-green tint, angular/crystalline |
| Sulfate | `waterIceIndex` | Cylinder, detail 1 | Pale tan/cream, chalky flat tabletop |
| Mudstone | `(1-basalt)*dustCover` | Box, detail 1 | Grey-brown flat slab, fully matte |
| Iron Meteorite | flat 0.02 | Icosahedron, detail 2 | Dark grey, high metalness, lumpy |

## Spawn Distribution

Each rock type defines a `spawnWeight(params)` function that receives the landmark's geological indices (`basalt`, `ironOxide`, `silicateIndex`, `waterIceIndex`, `dustCover`) from `TerrainParams`. Weights are normalised into a cumulative distribution at terrain build time. A seeded random per rock picks the type deterministically.

## Inventory

- Capacity reduced from 15 kg to 5 kg (small payload rover)
- Sample type expanded from `'regolith'` to the 6-type union `RockTypeId`
- Per-type weight ranges and labels (e.g. "Hematite #3, 0.45 kg")
- Inventory UI shows a coloured dot per sample matching the rock type

## Key Files

- `src/three/terrain/RockTypes.ts` — type catalog, geometry/material factories, spawn distribution
- `src/three/terrain/TerrainGenerator.ts` — builds per-type geometry map, weighted type selection per rock
- `src/composables/useInventory.ts` — 5 kg capacity, `RockTypeId` union, per-type weight ranges
- `src/three/instruments/APXSController.ts` — reads `userData.rockType`, passes to inventory
- `src/three/instruments/RockTargeting.ts` — includes `rockType` in `TargetResult`
- `src/components/InventoryPanel.vue` — per-type colour dot in sample rows
