# SAM Cover Animation & Activation Dialog Design

## Overview

The SAM instrument intake covers (`cover_01`, `cover_02`, `cover_03`) open during the deployment animation but should close once the rover is ready. Covers only reopen when SAM is **activated** (not just selected/viewed). Activating SAM also opens a 16:9 dialog panel — the future home of a 2D puzzle minigame. ESC deactivates SAM, closing both the dialog and the covers.

## GLB Nodes

All three covers are children of `Chassis`:

- `cover_01` — Object3D
- `cover_02` — Object3D
- `cover_03` — Object3D

## State Flow

```
deployment finishes → covers close automatically (~1s)
                                    ↓
                     covers stay closed during driving
                                    ↓
        press 5 → camera zooms to SAM deck (instrument mode)
                    covers remain CLOSED — just viewing
                                    ↓
        press ACTIVATE → covers open (~0.8s), SAM dialog appears
                    SAMController enters active mode
                                    ↓
        press ESC → covers close (~0.8s), dialog closes
                    returns to instrument mode, then ESC again → driving
```

Key distinction from MastCam/ChemCam: **selecting SAM (pressing 5) does NOT open covers or show the dialog**. Only ACTIVATE does. This is because SAM activation represents a physical action (opening the sample intake).

## SAM Dialog Panel

### Layout

- Position: left side of screen, vertically centered, to the left of the power bar
- Aspect ratio: 16:9
- Size: ~480x270px (scales with viewport)

### Content (placeholder for now)

- Header: "SAM — SAMPLE ANALYSIS" with the SAM icon
- Body: placeholder text "ANALYSIS MODULE READY — NO PUZZLES LOADED" or similar empty state
- The dialog is where 2D puzzles will render in the future

### Visibility

- Shown only when `mode === 'active'` AND `activeInstrument` is SAMController
- Appears with a slide-in transition (from left)
- Disappears on ESC (same transition reversed)

### Component

`SAMDialog.vue` — new component. Receives `visible: boolean` prop. Uses `<Teleport to="body">` like other overlays. Matches HUD aesthetic.

## SAMController Changes

### `canActivate = true`

SAM needs activation to open covers and show dialog.

### Cover Animation

Follows the same pattern as APXS arm joints (`baseQuat` + delta rotation):

```typescript
private covers: THREE.Object3D[] = []
private coverOpenQuats: THREE.Quaternion[] = []
private coverClosedQuats: THREE.Quaternion[] = []
private coverProgress = 0  // 0 = closed, 1 = open
private coverTarget = 0    // 0 or 1
```

**`attach(rover)`** — after `super.attach()`:
- Find `cover_01`, `cover_02`, `cover_03` via `getObjectByName`
- Save each node's current quaternion as the open pose
- Compute closed pose by applying a rotation delta (axis and angle TBD at runtime — same tuning process as mast/arm)
- Set `coverTarget = 0` and immediately snap covers to closed pose

**`update(delta)`** — always called (SAM needs its cover animation to tick even in instrument mode, not just active mode). Lerps `coverProgress` toward `coverTarget`, slerps each cover quaternion accordingly.

**`openCovers()` / `closeCovers()`** — set `coverTarget` to 1 or 0.

**`deactivate()`** — calls `closeCovers()`.

### Determining the Close Rotation

Same runtime tuning process as mast and arm:
1. Log the open-pose quaternions of all 3 covers at attach time
2. Try rotating on each axis by ~-90 degrees
3. Each cover may use a different axis depending on its orientation on the chassis
4. Hardcode the delta once tuned

## RoverController Changes

- `enterActiveMode()`: if activeInstrument is SAMController, call `openCovers()`
- ESC from active (SAM): call `deactivate()` which closes covers
- Switching instruments while SAM is active: call `deactivate()` (same pattern as MastCam/ChemCam)
- SAMController must be ticked in `update()` even when just in instrument mode (for cover lerp animation). Currently the instrument `update()` is called in the camera block — this should work as-is since SAM is the activeInstrument.

## MartianSiteView Changes

- Import and render `SAMDialog` component
- Pass `visible` prop based on `controller.mode === 'active' && controller.activeInstrument.id === 'sam'`

## Files

- `src/three/instruments/SAMController.ts` — cover nodes, open/close logic, `canActivate`, `deactivate()`
- `src/three/RoverController.ts` — SAMController deactivation in ESC/switch handling
- `src/components/SAMDialog.vue` — new placeholder dialog component
- `src/views/MartianSiteView.vue` — render SAMDialog, wire visibility

## What's Deferred

- 2D puzzle minigame content inside the dialog
- Mass spectrometry visualization
- Sample refinement gameplay
- Per-cover staggered timing for visual flair
