# Rover Instrument Toolbar Design

## Overview

Add an MMO-style instrument toolbar to the Mars rover site view. Five instruments (1-5 hotkeys) each map to a rover GLB node. Selecting an instrument zooms the camera to it; pressing ESC returns to driving mode. Each instrument gets its own controller class for future rotate/tilt/yaw gameplay.

## State Machine

```
'driving' ──(press 1-5)──▶ 'instrument' (activeInstrument set)
'instrument' ──(press ESC)──▶ 'driving' (activeInstrument cleared)
'instrument' ──(press different 1-5)──▶ 'instrument' (activeInstrument switched)
'instrument' ──(press same slot)──▶ no-op (stay on current instrument)
```

- WASD movement works in both modes.
- In `driving` mode, camera orbits the rover (existing behavior).
- In `instrument` mode, camera lerps to the instrument's focus node and orbits around it.
- Mast tracking (pan/tilt) is frozen while in instrument mode for mast-mounted instruments (slots 1-2) to prevent feedback loops.
- Chassis shake intensity is reduced to 25% while in instrument mode to avoid disorientation at close zoom.

## Instrument-to-Node Mapping

| Slot | ID | Class | GLB Node | Tooltip Summary |
|------|----|-------|----------|-----------------|
| 1 | mastcam | MastCamController | `MastCam` (runtime-verified) | Camera viewfinder, zoom level, "SCAN" |
| 2 | chemcam | ChemCamController | `mast_03001` | Targeting reticle, range, shot counter, laser icon |
| 3 | apxs | APXSController | `APXS` | Arm reach radius, analysis timer, contact dot |
| 4 | dan | DANController | `DAN_L` | Sonar pulse, depth range, water droplet fill |
| 5 | sam | SAMController | `SAM` | Drill icon, sample slots, spectrometry graph |

Note: Node names may lose dots after pose bake (e.g. `mast_03.001` → `mast_03001`). Controllers should try both variants.

## Architecture

### InstrumentController (base class)

File: `src/three/instruments/InstrumentController.ts`

```typescript
export abstract class InstrumentController {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly slot: number          // 1-5
  abstract readonly focusNodeName: string // primary getObjectByName target
  abstract readonly focusOffset: Vector3  // camera offset in node-local space (rotates with node)
  readonly altNodeNames: string[] = []    // fallback node names (dot-stripping)

  node: Object3D | null = null

  attach(rover: Group): void {
    // Resolve node by name, trying altNodeNames as fallbacks
  }

  update(delta: number): void {
    // Override per-instrument for animation (stubs for now)
  }

  getWorldFocusPosition(): Vector3 {
    // Returns node world position for camera targeting
  }

  dispose(): void {
    // Override for cleanup (event listeners, overlays, etc.)
  }
}
```

### 5 Subclasses

Each in its own file under `src/three/instruments/`:

- `MastCamController.ts` — slot 1, node `MastCam`, offset behind+above camera head
- `ChemCamController.ts` — slot 2, node `mast_03001` (alt: `mast_03.001`), offset above looking down at laser
- `APXSController.ts` — slot 3, node `APXS`, offset to the side of the arm turret
- `DANController.ts` — slot 4, node `DAN_L`, offset low rear angle
- `SAMController.ts` — slot 5, node `SAM`, offset showing chassis area

### RoverController Changes

Add to existing `RoverController`:

- `mode: 'driving' | 'instrument'` — starts as `'driving'`
- `activeInstrument: InstrumentController | null`
- `instruments: InstrumentController[]` — created in constructor, attached after deployment
- Key handling: `Digit1`-`Digit5` sets active instrument + mode, `Escape` returns to driving
- `updateCamera()`: when in instrument mode, lerp to `activeInstrument.getWorldFocusPosition() + focusOffset` instead of rover orbit
- Call `activeInstrument.update(delta)` each frame when active

### SiteScene Changes

After deployment finishes (in the `'finished'` mixer event), call `attach(rover)` on each instrument controller. This happens alongside the existing `extractWheelNodes()`.

### InstrumentToolbar.vue

File: `src/components/InstrumentToolbar.vue`

Position: fixed bottom-center, horizontal bar with 5 slots.
Visibility: only after deployment (`roverState === 'ready'`).

Each slot renders:
- Key number (1-5) in top-left corner
- Instrument icon (text/SVG symbol)
- Instrument short name below

Active slot: highlighted border in `#c4753a` (matching compass accent).
Styling: `rgba(0,0,0,0.4)` bg, `backdrop-filter: blur(8px)`, monospace text — matches existing HUD aesthetic from SiteCompass and deploy overlay.

Clicking a slot activates the instrument (same as pressing the hotkey). Emits `select(slot)` event.

Props from MartianSiteView:
- `instruments: { id, name, slot }[]`
- `activeSlot: number | null`

The existing controls-hint ("WASD to drive...") is hidden when the toolbar is visible — the toolbar replaces it.

### MartianSiteView.vue Changes

- Import and render `InstrumentToolbar`
- Add reactive refs: `activeInstrumentSlot`
- Wire refs from `controller.activeInstrument` in the animate loop
- Pass to toolbar component

## Camera Transition Details

- Lerp factor: reuse existing `CAMERA_LERP` (0.08)
- Driving → instrument: lerp `cameraPos` toward `node.getWorldFocusPosition() + focusOffset`, `cameraTarget` toward node world position
- Instrument → driving: lerp back to normal rover orbit position
- During instrument mode, mouse drag orbits around the instrument node (not the rover)

## File Structure

```
src/three/instruments/
├── InstrumentController.ts    (base class)
├── MastCamController.ts
├── ChemCamController.ts
├── APXSController.ts
├── DANController.ts
├── SAMController.ts
└── index.ts                   (barrel export)

src/components/
└── InstrumentToolbar.vue      (new)
```

## What's Deferred

- Per-instrument gameplay (rotate/tilt/yaw controls) — controllers are stubs
- Instrument sub-menus and overlays
- Tooltip overlays with the detailed HUD elements described in requirements
- Instrument-specific sounds or visual effects
