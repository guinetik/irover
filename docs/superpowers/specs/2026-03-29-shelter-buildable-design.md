# Shelter Buildable System

A driveable shelter the rover can enter in real-time for protection from environmental hazards. First entry in a data-driven buildables framework that mirrors the instrument system pattern.

## Context

The game has a `habitat.glb` model ready to use as a shelter. The rover drives on terrain in a chase-cam site view. Existing systems include orbital drops for delivering items, an inventory system, and environmental hazards (radiation, thermal, dust, meteors) with associated post-processing and particle effects. The SAM fabrication spec already references a "Shelter" buildable category. No buildable placement system exists yet.

## Scope

- Data-driven buildables framework (`buildables.json`)
- Inventory action system (generic, reusable by future buildables)
- Shelter placement from inventory with wireframe preview
- Door auto-open/close on rover proximity
- `isRoverInside` detection
- Hazard suppression while inside (gameplay + visual effects)
- Meteor exclusion zone around placed buildables
- localStorage persistence per playthrough

Out of scope: interior buildable slots, fabricator crafting, habitat damage/destruction.

## Data-Driven Buildables Framework

### `public/data/buildables.json`

Mirrors `instruments.json` — each buildable is fully described by its JSON entry. Controllers read all behavior params from the config object at runtime. No hardcoded constants in code.

```json
{
  "version": 1,
  "buildables": [
    {
      "id": "shelter",
      "label": "Shelter",
      "desc": "Pressurized shelter. Protects the rover from all environmental hazards. Drive inside to activate.",
      "image": "/inventory/shelter-kit.png",
      "model": "/habitat.glb",
      "category": "shelter",
      "placement": "exterior",
      "footprint": { "x": 20, "z": 20 },
      "door": {
        "meshName": "Cube012__0",
        "axis": "x",
        "openAngle": 1.57,
        "speed": 2.0,
        "triggerDistance": 8
      },
      "controllerType": "HabitatController",
      "inventoryItemId": "shelter-kit",
      "features": ["hazard-shield"]
    }
  ]
}
```

Key fields:

- **`controllerType`** — string resolved at runtime to a controller class via a BuildableRegistry (same pattern as instrument `controllerType` resolution).
- **`placement`** — `"exterior"` (placed on terrain around the rover) or `"interior"` (future: placed inside another buildable's interior slots).
- **`inventoryItemId`** — links to the inventory item whose `action` field triggers placement.
- **`features`** — declarative string tags queried by game systems at runtime (e.g. `"hazard-shield"` means suppress all hazards when rover is inside).
- **`footprint`** — axis-aligned bounding size used for placement preview, `isRoverInside` detection, and meteor exclusion.
- **`door`** — optional. If present, the controller finds the named mesh and animates it. `axis` is the rotation axis, `openAngle` is the target rotation in radians, `speed` is radians/sec, `triggerDistance` is how close the rover must be for the door to open.
- **`model`** — path to the GLB file loaded by the controller.

### Inventory Item

New entry in `public/data/inventory-items.json`:

```json
{
  "id": "shelter-kit",
  "category": "buildable",
  "label": "Shelter Kit",
  "description": "Prefab pressurized shelter module. Activate to construct.",
  "image": "/inventory/shelter-kit.png",
  "action": "place-buildable:shelter",
  "maxStack": 1
}
```

### Inventory Action System

Items gain an optional `"action"` string field. When the player clicks an item with an action in the inventory UI, the system resolves the action string to a registered handler.

- **Action format:** `"place-buildable:<buildableId>"` — generic pattern. The handler looks up `buildables.json` by id and initiates the placement flow.
- **Action registry:** A simple `Record<string, (context) => void>` map. The inventory UI checks `item.action`, splits on `:` to get the handler key, and calls it. Future buildables or consumables register their own action handlers with no inventory UI changes.
- **Item consumed** on successful placement. If the player cancels, the item stays in inventory.

## Placement Flow

1. Player receives a `shelter-kit` via orbital drop (delivered to inventory).
2. Player clicks the shelter-kit in inventory UI. The `"place-buildable:shelter"` action fires.
3. The handler loads the buildable's GLB model from `config.model` and renders it as a **green wireframe** (THREE.MeshBasicMaterial, wireframe: true, green color) positioned a fixed distance in front of the rover along its current heading, snapped to terrain via `heightAt(x, z)`.
4. The preview inherits the rover's current Y rotation so the door faces the rover's forward direction. No manual rotation control.
5. Player confirms placement (click or key). The wireframe is replaced with the real textured model at that position. The item is consumed from inventory.
6. Player can cancel (Escape) to abort — the item remains in inventory.

## HabitatController

A controller class in `src/three/` that manages the shelter's 3D presence and interaction.

**Construction:** receives the full buildable config object from `buildables.json` and the placement position.

**Responsibilities:**
- Loads the GLB model from `config.model` via GLTFLoader.
- Positions the model on terrain at the given world position.
- Finds the door mesh by `config.door.meshName` during GLB traversal.
- Animates the door open/closed each frame based on rover distance vs `config.door.triggerDistance`. Rotates on `config.door.axis` toward `config.door.openAngle` at `config.door.speed` rad/sec. Reverses when rover moves away.
- Computes `isRoverInside` — true when the rover's world position is within the axis-aligned bounding box defined by `config.footprint` centered on the shelter's world position.
- Exposes `features: string[]` from `config.features` for runtime queries.

**Interface:**
- `init(): Promise<void>` — load model, find door mesh, add to scene
- `update(roverPosition: Vector3, dt: number): void` — door animation, inside check
- `dispose(): void` — remove from scene, dispose geometry/materials
- `readonly isRoverInside: boolean`
- `readonly features: string[]`
- `readonly position: Vector3`
- `readonly footprint: { x: number, z: number }`

**Integration with SiteScene:**
- `SiteScene` gains a `buildables: BuildableController[]` array.
- On placement or restore from persistence, the appropriate controller is instantiated via the BuildableRegistry and added to the array.
- The site view controller calls `buildable.update(roverPos, dt)` for each buildable each frame.

**Camera behavior:** the chase cam follows the rover inside seamlessly. If the shelter is large enough the camera won't clip. If clipping occurs at wide zoom, the camera distance is clamped to a tighter max when `isRoverInside` is true (the max distance can come from an optional `cameraMaxDistance` field in the buildable JSON if needed).

## Hazard Suppression

When the rover is inside any buildable with the `"hazard-shield"` feature, the following are suppressed:

### Gameplay effects (disabled while shielded)

- Radiation damage (RAD events, cumulative dose accumulation)
- Thermal extremes (cold/heat penalties, heater draw spikes)
- Dust storm instrument penalties
- Meteor strike damage

### Visual effects (disabled while shielded)

- `RadiationAtmospherePass` post-processing
- `DustAtmospherePass` post-processing
- `DustParticles` particle emitter
- Storm screen overlays

### Implementation

- A single derived boolean — `isShielded` — propagated through the site frame context: `buildables.some(b => b.isRoverInside && b.features.includes('hazard-shield'))`.
- Each hazard system and postfx pass already runs per-frame. They early-return or skip their effect when `isShielded` is true.
- No event bus or pub/sub. Just a flag check at the top of each relevant update/render path.

### What remains active inside

- Sky and lighting (visible through the open door)
- Rover controls, instrument selection, HUD
- Normal gameplay — the rover is just parked somewhere safe

### Meteor exclusion zone

Meteor impact position sampling rejects any candidate point that falls within a placed buildable's footprint bounding box. The shelter is indestructible — meteors simply don't land on it. No habitat damage system.

## Persistence

Placed buildables are saved to localStorage:

```json
{
  "buildables": [
    {
      "id": "shelter",
      "siteId": "curiosity",
      "position": { "x": 12.5, "y": 3.2, "z": -45.0 },
      "rotationY": 1.57
    }
  ]
}
```

- On site load, the system reads stored buildables for the current siteId and instantiates them via the BuildableRegistry.
- On game over: the buildables storage is cleared.
- On new site: different siteId means no buildables to restore.
- Permanent per playthrough — once placed, the shelter stays until game over.

## BuildableRegistry

Resolves `controllerType` strings from `buildables.json` to controller classes at runtime. Same pattern as the InstrumentRegistry.

```typescript
// Register at boot
BuildableRegistry.register('HabitatController', HabitatController)

// Resolve at placement/restore
const ControllerClass = BuildableRegistry.resolve(config.controllerType)
const controller = new ControllerClass(config, position, rotation)
```

Future buildables register their own controller classes. The JSON drives everything — adding a new buildable means a new JSON entry, a new controller class, and a registry call.

## File Plan

| File | Purpose |
|---|---|
| `public/data/buildables.json` | Buildable definitions (data-driven) |
| `public/data/inventory-items.json` | New `shelter-kit` entry with `action` field |
| `src/types/buildables.ts` | TypeScript types for buildable config, persistence |
| `src/three/buildables/BuildableController.ts` | Base interface / abstract class |
| `src/three/buildables/BuildableRegistry.ts` | String-to-class resolution |
| `src/three/buildables/HabitatController.ts` | Shelter-specific controller |
| `src/composables/useBuildables.ts` | Placement flow, persistence, action registration |
| `src/three/SiteScene.ts` | Add `buildables[]` array, update loop |
| `src/views/MarsSiteViewController.ts` | Wire buildable updates into frame loop |
| Hazard systems (various) | Add `isShielded` early-return checks |
| Meteor spawn logic | Add footprint exclusion check |
| Inventory UI component | Check `item.action`, call registry |
