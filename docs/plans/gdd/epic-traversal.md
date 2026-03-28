# Epic: Traversal, terrain, hazards (GDD v0.4)

**Scheduling:** Maps to **[later tiers Tier 6](./2026-03-22-later-tiers-post-sprint.md)** — **post-sprint** relative to the current Tier 0–4 roadmap.

## Goal

Match GDD movement table: **night efficiency penalty** (partially done), **slope and roughness**, **dust storms**, **wheel damage**.

## Current codebase

- Night: ~50% speed via `nightFactor` in [MartianSiteView.vue](../../../src/views/MartianSiteView.vue).
- Slope: affects chassis tilt and shake, not max speed or extra motor draw ([RoverController.ts](../../../src/three/RoverController.ts)).

## Deliverables

### Slope and power

- Derive surface normal at rover (existing `normalAt`).
- Apply max speed factor vs slope angle; add +2W (or tuned) motor draw on steep segments per GDD.

### Rough / loose regolith

- Use `dustCover` / `roughness` from `TerrainParams` for small traction and speed modifiers.

### Dust storm

- Global event: solar efficiency multiplier, visibility (reuse [DustAtmospherePass](../../../src/three/DustAtmospherePass.ts) uniforms if possible).
- Stacks with night for “worst case” traversal.

### Wheel damage

- Persistent damage level per wheel or aggregate; affects speed, draw, pull-to-side at critical.
- Repair consumable from drops (Mission 4 table).

## Dependencies

- Power sim for marginal motor draw.
- Progression epic for repair kits and storm scripting tied to missions.
