# APXS Gameplay & Inventory System Design

## Overview

Two sub-systems built together:

1. **Instrument Activation System** — shared infrastructure for all instruments. Adds an `active` state where the rover is stationary and WASD controls the instrument. Includes rock targeting via raycaster with green/red cursor feedback.

2. **APXS Gameplay** — arm IK control with WASD, laser drill interaction on click, sample collection into a weight-based inventory. Rocks deplete after one sample.

SAM refinement (converting raw samples into science data) is deferred to a future project.

## Coordination with MastCam & ChemCam (survey → chemistry → contact)

**Roles:** **MastCam** = passive **identify** + **highlight** (e.g. wireframe targets for a chosen lithology). **ChemCam** = **standoff elements** so the player has **composition detail before** APXS contact or **SAM** lab work. **APXS** = expensive touch science after you already know *which* rock and (fictionally) why it matters.

**Power fantasy:** MastCam **~3W** survey; ChemCam **12W** burst; **APXS ~6W** sustained — commit in that order when possible.

- **Default:** **`userData.mastcamScanned === true`** **required** before drill fires (see [mastcam-chemcam design](./2026-03-22-mastcam-chemcam-gameplay-design.md) **science pipeline**). If not scanned: crosshair **red**, toast **“SURVEY WITH MASTCAM FIRST”**, no drill progress.
- **ChemCam → SAM (later):** when SAM gameplay ships, prefer requiring or strongly nudging **`chemcamAnalyzed`** (or equivalent) so the lab is not blind — spec detail lives in mastcam-chemcam ChemCam section.
- **When to wire:** ideally when MastCam **Tier 4** ships; until then APXS may remain unscanned-gated behind a feature flag or TODO so early builds do not soft-lock.

## State Machine (Extended)

```
'driving' ──(press 1-5)──▶ 'instrument' ──(ACTIVATE btn)──▶ 'active'
'active' ──(press ESC)──▶ 'instrument' ──(press ESC)──▶ 'driving'
```

In `active` mode:
- Rover movement is **locked** — `RoverController.update()` must guard the entire movement/wheel/mast block behind `if (this.mode !== 'active')`. Without this, WASD will simultaneously drive the rover AND control the instrument.
- WASD is routed to `activeInstrument.handleInput(keys, delta)`
- Mouse drag still orbits the camera around the instrument
- Each instrument controller overrides `handleInput()` for its own behavior
- ESC returns to `instrument` mode (zoomed view with overlay), not directly to driving
- The ACTIVATE button in `InstrumentOverlay.vue` emits `activate` — `MartianSiteView.vue` wires `@activate` to `controller.enterActiveMode()`
- Non-APXS instruments: ACTIVATE button is disabled (greyed out) until their gameplay is implemented. The base `InstrumentController` has `readonly canActivate = false`, APXS overrides to `true`.

## Rock Targeting

### Valid Targets

Only **small rocks** from `TerrainGenerator.rocks[]` are valid targets. Boulders (scale >= 2.0) are excluded. The terrain generator already stores rocks and boulders in the same `rocks[]` array — we filter by checking the mesh scale.

### Raycaster

- Casts from camera through screen center toward the scene
- Filters intersections against `terrain.rocks[]` meshes only (not terrain mesh, not rover, not boulders)
- **Range limit**: only rocks within 5m of the rover center are valid (prevents targeting rocks across the map). The arm reach is ~1.5m but the camera may be orbited farther — 5m gives comfortable visual range.
- Returns: hit rock mesh + world hit position, or null
- `TerrainGenerator.rocks` is currently `private` — add a public `getSmallRocks(): THREE.Mesh[]` accessor that returns rocks with scale < 2.0 (excludes boulders)
- A small crosshair/dot at screen center shows targeting state:
  - **Green**: valid rock in range
  - **Red**: no valid target, or rock already depleted, or inventory full
  - **Hidden**: when not in `active` mode

### Depleted Rocks

When a rock is drilled:
- It's marked as depleted (tracked in a `Set<THREE.Mesh>`)
- Its material is **cloned** first (rocks share a single `MeshStandardMaterial`), then darkened (multiply color by ~0.4, increase roughness)
- It becomes an invalid target (raycaster skips it)

## APXS Arm Control

### Joint Chain

The robotic arm has 5 segments: `arm_01001 → arm_02001 → arm_03001 → arm_04001 → arm_05_head001`

In `active` mode, WASD controls a **target tip position** in rover-local space:
- **W/S**: extends/retracts (moves tip forward/back relative to rover heading)
- **A/D**: swings left/right

### IK Approach

Simple 2-axis control:
- `arm_01001` (shoulder): rotates for left/right swing (A/D)
- `arm_02001` (elbow): rotates for extend/retract (W/S)
- Remaining joints (`arm_03001`, `arm_04001`, `arm_05_head001`) follow passively — no IK solve needed, they inherit parent rotation
- **Note**: the actual local rotation axes depend on how the GLB was authored. The implementer must inspect joint quaternions at runtime (like the mast tracking code does) and may need to adjust which axis is used. Do not assume world Y/X.

Movement is:
- Smoothly lerped (not instant snapping)
- Clamped to a reachable arc (~1.5m radius from rover center, ~120° sweep)
- Speed: responsive but not twitchy — similar to mast tracking lerp

### Node Setup

After deployment, `APXSController.attach()` grabs references to `arm_01001`, `arm_02001`, and `Drill` nodes (same pattern as mast tracking — save base quaternions, apply delta rotations). The `attach()` method also receives a reference to `TerrainGenerator` (or its `getSmallRocks()` output) so `RockTargeting` can filter raycast hits.

## Laser Drill Interaction

### Trigger

When in `active` mode with a valid green target:
- **Click and hold** (mouse button down) → drill fires
- **Release** or cursor turns red → drill cancels after 0.2s grace period (prevents frustrating resets from momentary jitter), then progress resets

### Visuals

- A thin beam line from the `Drill` node (child of `arm_05_head001`) to the rock hit point (THREE.Line with emissive orange-red material)
- Small particle emitter at the contact point (sparks/dust, ~20 particles)
- Progress bar: small radial ring around the crosshair, fills over ~3 seconds

### On Complete

- Sample added to inventory with random weight (0.5–1.5 kg)
- Sample type: `'regolith'` (only type for now)
- Rock marked as depleted (darkened)
- Beam and particles stop
- Brief flash/pulse on the crosshair to confirm collection
- If inventory is now full, crosshair turns red immediately

### Blocked States

Drill cannot fire when:
- No valid target (cursor red)
- Target rock already depleted
- Inventory full — crosshair stays red, overlay shows "INVENTORY FULL" text

## Inventory Data Model (as implemented)

```typescript
import type { RockTypeId } from '@/three/terrain/RockTypes'

interface Sample {
  id: string
  type: RockTypeId       // basalt | hematite | olivine | sulfate | mudstone | iron-meteorite
  label: string          // e.g. "Basalt #3" from ROCK_TYPES[type].label
  weightKg: number       // random in ROCK_TYPES[type].weightRange
}

interface Inventory {
  samples: Sample[]
  capacityKg: number     // currently 5 kg (see useInventory)
}
```

- Rock meshes from [TerrainGenerator.ts](../../../src/three/terrain/TerrainGenerator.ts) store **`userData.rockType`**. [APXSController.ts](../../../src/three/instruments/APXSController.ts) passes that into `addSample(type)`.
- `currentWeightKg` is computed (sum of sample weights).
- Discard: DUMP per row in `InventoryPanel.vue` (SAM refinement still deferred).
- State: reactive composable `useInventory()` shared by 3D and UI.

## Inventory UI

### Panel

- Toggled with **`I`** (accessible from any mode). **`Tab`** is reserved for GDD **UI mode** later — see [gdd-input-modes-design.md](./gdd-input-modes-design.md). The `I` keydown handler must call `e.preventDefault()` when toggling.
- Fixed position: bottom-left corner
- Collapsible — shows/hides with transition
- Matches HUD aesthetic: dark background, `#c4753a` accent, monospace, blur backdrop

### Content

- Header: "INVENTORY" + weight summary (e.g. "2.1 / 5.0 KG" per current capacity)
- Weight bar: visual fill bar under the header
- Sample list: compact table rows, each showing:
  - Sample type icon/label
  - Weight in kg
- Empty state: "NO SAMPLES" text
- Full state: weight bar turns amber/red, "FULL" badge

### Component

`InventoryPanel.vue` — receives inventory data from `useInventory()` composable.

## File Structure

```
src/three/instruments/
├── InstrumentController.ts
├── APXSController.ts
├── RockTargeting.ts
└── LaserDrill.ts

src/three/terrain/
├── RockTypes.ts               — catalog, spawn weights, materials
└── TerrainGenerator.ts        — assigns userData.rockType per mesh

src/composables/
└── useInventory.ts

src/components/
├── InstrumentCrosshair.vue
└── InventoryPanel.vue
```

## What's Deferred

- SAM refinement (converting raw samples to science data)
- Other instrument activations (MastCam scan, ChemCam laser, DAN neutron scan)
- Sound effects
- Arm physics/collision with terrain
