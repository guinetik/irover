# Rover Instrument Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an MMO-style instrument toolbar with 5 instrument controllers that zoom the camera to specific rover nodes, with a state machine switching between driving and instrument modes.

**Architecture:** Base `InstrumentController` class with 5 subclasses (one per instrument), each mapping to a GLB node name. `RoverController` gains a `mode` field and `instruments[]` array. Camera lerps to the active instrument's world position when in instrument mode. Vue toolbar component shows the 5 slots with hotkey indicators.

**Tech Stack:** Vue 3, Three.js, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-rover-instrument-toolbar-design.md`

---

### Task 1: InstrumentController base class + barrel export

**Files:**
- Create: `src/three/instruments/InstrumentController.ts`
- Create: `src/three/instruments/index.ts`

- [ ] **Step 1: Create InstrumentController base class**

```typescript
// src/three/instruments/InstrumentController.ts
import * as THREE from 'three'

export abstract class InstrumentController {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly slot: number
  abstract readonly focusNodeName: string
  abstract readonly focusOffset: THREE.Vector3
  readonly altNodeNames: string[] = []

  node: THREE.Object3D | null = null
  attached = false

  attach(rover: THREE.Group): void {
    if (this.attached) return
    this.attached = true
    this.node = rover.getObjectByName(this.focusNodeName) ?? null
    if (!this.node) {
      for (const alt of this.altNodeNames) {
        this.node = rover.getObjectByName(alt) ?? null
        if (this.node) break
      }
    }
    if (!this.node) {
      console.warn(`[${this.id}] Node "${this.focusNodeName}" not found in rover`)
    }
  }

  update(_delta: number): void {
    // Override per-instrument for animation (stubs for now)
  }

  getWorldFocusPosition(): THREE.Vector3 {
    if (!this.node) return new THREE.Vector3()
    const worldPos = new THREE.Vector3()
    this.node.getWorldPosition(worldPos)
    return worldPos
  }

  dispose(): void {
    // Override for cleanup
  }
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// src/three/instruments/index.ts
export { InstrumentController } from './InstrumentController'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors related to instruments/

---

### Task 2: Five instrument subclasses

**Files:**
- Create: `src/three/instruments/MastCamController.ts`
- Create: `src/three/instruments/ChemCamController.ts`
- Create: `src/three/instruments/APXSController.ts`
- Create: `src/three/instruments/DANController.ts`
- Create: `src/three/instruments/SAMController.ts`
- Modify: `src/three/instruments/index.ts`

All five subclasses follow the same pattern — only the id, name, slot, focusNodeName, altNodeNames, and focusOffset differ. Each `update()` is a no-op stub.

- [ ] **Step 1: Create MastCamController**

```typescript
// src/three/instruments/MastCamController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class MastCamController extends InstrumentController {
  readonly id = 'mastcam'
  readonly name = 'MastCam'
  readonly slot = 1
  readonly focusNodeName = 'MastCam'
  readonly focusOffset = new THREE.Vector3(0, 0.5, 1.5)
}
```

- [ ] **Step 2: Create ChemCamController**

```typescript
// src/three/instruments/ChemCamController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class ChemCamController extends InstrumentController {
  readonly id = 'chemcam'
  readonly name = 'ChemCam'
  readonly slot = 2
  readonly focusNodeName = 'mast_03001'
  readonly altNodeNames = ['mast_03.001']
  readonly focusOffset = new THREE.Vector3(0, 0.8, 1.2)
}
```

- [ ] **Step 3: Create APXSController**

```typescript
// src/three/instruments/APXSController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class APXSController extends InstrumentController {
  readonly id = 'apxs'
  readonly name = 'APXS'
  readonly slot = 3
  readonly focusNodeName = 'APXS'
  readonly focusOffset = new THREE.Vector3(1.0, 0.3, 0.8)
}
```

- [ ] **Step 4: Create DANController**

```typescript
// src/three/instruments/DANController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class DANController extends InstrumentController {
  readonly id = 'dan'
  readonly name = 'DAN'
  readonly slot = 4
  readonly focusNodeName = 'DAN_L'
  readonly focusOffset = new THREE.Vector3(-1.0, 0.5, -1.2)
}
```

- [ ] **Step 5: Create SAMController**

```typescript
// src/three/instruments/SAMController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class SAMController extends InstrumentController {
  readonly id = 'sam'
  readonly name = 'SAM'
  readonly slot = 5
  readonly focusNodeName = 'SAM'
  readonly focusOffset = new THREE.Vector3(1.0, 0.3, 0)
}
```

- [ ] **Step 6: Update barrel export**

```typescript
// src/three/instruments/index.ts
export { InstrumentController } from './InstrumentController'
export { MastCamController } from './MastCamController'
export { ChemCamController } from './ChemCamController'
export { APXSController } from './APXSController'
export { DANController } from './DANController'
export { SAMController } from './SAMController'
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors related to instruments/

---

### Task 3: Extend RoverController with instrument mode + camera

**Files:**
- Modify: `src/three/RoverController.ts`

This is the core integration. Add mode state machine, instrument array, key handling for Digit1-5/Escape, and instrument-mode camera logic.

- [ ] **Step 1: Add imports, constants, and new fields**

At the top of `RoverController.ts`, add the import:

```typescript
import type { InstrumentController } from './instruments'
```

Add constants after existing ones (after line 25 `MAST_LERP`):

```typescript
const INSTRUMENT_CAMERA_DISTANCE_MIN = 1.5
const INSTRUMENT_CAMERA_DISTANCE_MAX = 6
const INSTRUMENT_CAMERA_DISTANCE_DEFAULT = 3
const INSTRUMENT_CAMERA_LERP = 0.06
const INSTRUMENT_SHAKE_FACTOR = 0.25
```

Add a new field (after the `cameraDistance` field, line 56):

```typescript
  private instrumentCameraDistance = INSTRUMENT_CAMERA_DISTANCE_DEFAULT
```

Add new fields to the class (after line 79 `mastTiltAngle`):

```typescript
  // Instrument mode
  mode: 'driving' | 'instrument' = 'driving'
  activeInstrument: InstrumentController | null = null
  instruments: InstrumentController[] = []
```

- [ ] **Step 2: Add instrument key handling in onKeyDown**

Replace the existing `onKeyDown` method (line 148-150) with:

```typescript
  private onKeyDown(e: KeyboardEvent) {
    this.keys.add(e.code)

    // Instrument hotkeys (only when rover is ready)
    if (this.siteScene.roverState !== 'ready') return

    if (e.code === 'Escape' && this.mode === 'instrument') {
      this.mode = 'driving'
      this.activeInstrument = null
      return
    }

    const slotMatch = e.code.match(/^Digit([1-5])$/)
    if (slotMatch) {
      const slot = parseInt(slotMatch[1])
      const instrument = this.instruments.find(i => i.slot === slot)
      if (instrument && instrument !== this.activeInstrument) {
        this.mode = 'instrument'
        this.activeInstrument = instrument
      }
    }
  }
```

- [ ] **Step 3: Add method to activate instrument from external source (toolbar click)**

Add after `onKeyUp`:

```typescript
  activateInstrument(slot: number | null): void {
    if (slot === null) {
      this.mode = 'driving'
      this.activeInstrument = null
      return
    }
    const instrument = this.instruments.find(i => i.slot === slot)
    if (instrument) {
      this.mode = 'instrument'
      this.activeInstrument = instrument
    }
  }
```

- [ ] **Step 4: Guard mast tracking behind instrument mode**

In the `update()` method, wrap the mast tracking block (lines 232-246) with a guard. Replace:

```typescript
    // Animate mast — tracks camera orbit angle and steering
    const mast = this.siteScene.roverMast
    if (mast) {
```

With:

```typescript
    // Animate mast — tracks camera orbit angle and steering
    // Freeze mast when viewing mast-mounted instruments (slots 1-2) to prevent feedback loops
    const mastFrozen = this.mode === 'instrument' && this.activeInstrument !== null && this.activeInstrument.slot <= 2
    const mast = this.siteScene.roverMast
    if (mast && !mastFrozen) {
```

- [ ] **Step 5: Reduce chassis shake in instrument mode**

In the chassis shake block (line 271), change:

```typescript
      const intensity = 0.012 + slope * 0.03
```

To:

```typescript
      const shakeScale = this.mode === 'instrument' ? INSTRUMENT_SHAKE_FACTOR : 1.0
      const intensity = (0.012 + slope * 0.03) * shakeScale
```

- [ ] **Step 6: Update onWheel to respect instrument mode zoom bounds**

In the `onWheel` method (lines 119-125), replace:

```typescript
  private onWheel(e: WheelEvent) {
    e.preventDefault()
    this.cameraDistance = Math.max(
      CAMERA_DISTANCE_MIN,
      Math.min(CAMERA_DISTANCE_MAX, this.cameraDistance + e.deltaY * 0.01 * ZOOM_SENSITIVITY),
    )
  }
```

With:

```typescript
  private onWheel(e: WheelEvent) {
    e.preventDefault()
    if (this.mode === 'instrument') {
      this.instrumentCameraDistance = Math.max(
        INSTRUMENT_CAMERA_DISTANCE_MIN,
        Math.min(INSTRUMENT_CAMERA_DISTANCE_MAX, this.instrumentCameraDistance + e.deltaY * 0.01 * ZOOM_SENSITIVITY),
      )
    } else {
      this.cameraDistance = Math.max(
        CAMERA_DISTANCE_MIN,
        Math.min(CAMERA_DISTANCE_MAX, this.cameraDistance + e.deltaY * 0.01 * ZOOM_SENSITIVITY),
      )
    }
  }
```

- [ ] **Step 7: Update camera to handle instrument mode**

Replace the entire `updateCamera` method (lines 290-324) with:

```typescript
  private updateCamera(_delta: number) {
    // Smoothly zoom out to default distance after deployment
    if (this.siteScene.roverState === 'ready' && this.mode === 'driving' && this.cameraDistance < CAMERA_DISTANCE_DEFAULT) {
      this.cameraDistance += (CAMERA_DISTANCE_DEFAULT - this.cameraDistance) * 0.02
    }

    let desiredPos: THREE.Vector3
    let desiredTarget: THREE.Vector3

    if (this.mode === 'instrument' && this.activeInstrument?.node) {
      // Camera orbits around the instrument node
      const focusPos = this.activeInstrument.getWorldFocusPosition()
      const camDist = this.instrumentCameraDistance

      const camX = Math.sin(this.orbitAngle) * camDist * Math.cos(this.orbitPitch)
      const camZ = Math.cos(this.orbitAngle) * camDist * Math.cos(this.orbitPitch)
      const camY = focusPos.y + Math.sin(this.orbitPitch) * camDist * 0.5

      desiredPos = new THREE.Vector3(
        focusPos.x + camX,
        camY,
        focusPos.z + camZ,
      )
      desiredTarget = focusPos

      // Update active instrument
      this.activeInstrument.update(_delta)
    } else {
      // Normal driving orbit around rover
      const totalAngle = this.orbitAngle
      const camX = Math.sin(totalAngle) * this.cameraDistance * Math.cos(this.orbitPitch)
      const camZ = Math.cos(totalAngle) * this.cameraDistance * Math.cos(this.orbitPitch)
      const camY = this.rover.position.y + CAMERA_HEIGHT_OFFSET + Math.sin(this.orbitPitch) * this.cameraDistance * 0.5

      desiredPos = new THREE.Vector3(
        this.rover.position.x + camX,
        camY,
        this.rover.position.z + camZ,
      )
      desiredTarget = new THREE.Vector3(
        this.rover.position.x,
        this.rover.position.y + CAMERA_LOOK_HEIGHT_OFFSET,
        this.rover.position.z,
      )
    }

    if (!this.initialized) {
      this.cameraPos.copy(desiredPos)
      this.cameraTarget.copy(desiredTarget)
      this.initialized = true
    }

    const lerp = this.mode === 'instrument' ? INSTRUMENT_CAMERA_LERP : CAMERA_LERP
    this.cameraPos.lerp(desiredPos, lerp)
    this.cameraTarget.lerp(desiredTarget, lerp)

    this.camera.position.copy(this.cameraPos)
    this.camera.lookAt(this.cameraTarget)
  }
```

- [ ] **Step 8: Add instrument disposal in dispose()**

At the end of the existing `dispose()` method (before the closing `}`), add:

```typescript
    this.instruments.forEach(i => i.dispose())
```

- [ ] **Step 9: Reset instrument zoom when switching instruments or returning to driving**

In `activateInstrument`, reset the instrument zoom distance:

```typescript
  activateInstrument(slot: number | null): void {
    if (slot === null) {
      this.mode = 'driving'
      this.activeInstrument = null
      return
    }
    const instrument = this.instruments.find(i => i.slot === slot)
    if (instrument) {
      this.mode = 'instrument'
      this.activeInstrument = instrument
      this.instrumentCameraDistance = INSTRUMENT_CAMERA_DISTANCE_DEFAULT
    }
  }
```

Also add the same reset in the `onKeyDown` Escape and Digit handlers:

In the Digit handler block, after `this.activeInstrument = instrument`, add:
```typescript
        this.instrumentCameraDistance = INSTRUMENT_CAMERA_DISTANCE_DEFAULT
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 4: Wire instruments into SiteScene and MartianSiteView

**Files:**
- Modify: `src/three/SiteScene.ts` — remove debug traverse, add instrument attachment
- Modify: `src/views/MartianSiteView.vue` — create instruments, pass to controller, add toolbar

- [ ] **Step 1: Remove debug traverse from SiteScene**

In `src/three/SiteScene.ts`, remove the debug console.group block added earlier (lines 313-321 in the current file):

```typescript
    // DEBUG: dump all node names to identify instrument nodes
    console.group('Rover node tree')
    this.rover.traverse((node) => {
      const depth = []
      let p = node.parent
      while (p && p !== this.rover) { depth.push('  '); p = p.parent }
      console.log(`${depth.join('')}${node.name || '(unnamed)'} [${node.type}]`)
    })
    console.groupEnd()
```

- [ ] **Step 2: Update MartianSiteView — imports and instrument setup**

In `src/views/MartianSiteView.vue`, add imports after the existing imports (around line 56):

```typescript
import InstrumentToolbar from '@/components/InstrumentToolbar.vue'
import { MastCamController, ChemCamController, APXSController, DANController, SAMController } from '@/three/instruments'
```

Add reactive ref after `deployProgress` (line 65):

```typescript
const activeInstrumentSlot = ref<number | null>(null)
```

- [ ] **Step 3: Create instruments and attach after deployment**

In the `onMounted` block, after the controller is created (after line 157), add:

```typescript
    // Create instrument controllers
    const instrumentControllers = [
      new MastCamController(),
      new ChemCamController(),
      new APXSController(),
      new DANController(),
      new SAMController(),
    ]
    if (controller) {
      controller.instruments = instrumentControllers
    }
```

In the animate loop, after the `roverState === 'ready'` block (after line 197), add instrument attachment and active slot tracking:

```typescript
    // Attach instruments once ready (idempotent — attach() checks its own flag)
    if (siteScene.roverState === 'ready' && siteScene.rover && controller && !controller.instruments[0]?.attached) {
      controller.instruments.forEach(i => i.attach(siteScene!.rover!))
    }

    // Track active instrument for toolbar
    activeInstrumentSlot.value = controller?.activeInstrument?.slot ?? null
```

- [ ] **Step 4: Update template — add toolbar, fix controls-hint visibility**

Replace the controls-hint Transition block (lines 37-41):

```html
    <Transition name="deploy-fade">
      <div v-if="!deploying" class="controls-hint">
        WASD to drive &middot; Drag to orbit
      </div>
    </Transition>
```

With:

```html
    <Transition name="deploy-fade">
      <div v-if="!deploying && !descending && activeInstrumentSlot === null" class="controls-hint">
        WASD to drive &middot; Drag to orbit &middot; 1-5 instruments
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <InstrumentToolbar
        v-if="!deploying && !descending"
        :active-slot="activeInstrumentSlot"
        @select="(slot: number) => controller?.activateInstrument(slot)"
        @deselect="controller?.activateInstrument(null)"
      />
    </Transition>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors (InstrumentToolbar.vue will be created in next task)

---

### Task 5: InstrumentToolbar Vue component

**Files:**
- Create: `src/components/InstrumentToolbar.vue`

- [ ] **Step 1: Create InstrumentToolbar.vue**

```vue
<template>
  <div class="instrument-toolbar">
    <button
      v-for="inst in instruments"
      :key="inst.slot"
      class="instrument-slot"
      :class="{ active: activeSlot === inst.slot }"
      @click="handleClick(inst.slot)"
    >
      <span class="slot-key">{{ inst.slot }}</span>
      <span class="slot-icon">{{ inst.icon }}</span>
      <span class="slot-name">{{ inst.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  activeSlot: number | null
}>()

const emit = defineEmits<{
  select: [slot: number]
  deselect: []
}>()

const instruments = [
  { slot: 1, id: 'mastcam', name: 'MCAM', icon: '\u25A3' },   // ▣ viewfinder
  { slot: 2, id: 'chemcam', name: 'CHEM', icon: '\u2316' },   // ⌖ crosshair
  { slot: 3, id: 'apxs',    name: 'APXS', icon: '\u25CE' },   // ◎ detector
  { slot: 4, id: 'dan',     name: 'DAN',  icon: '\u2261' },    // ≡ pulse
  { slot: 5, id: 'sam',     name: 'SAM',  icon: '\u2394' },    // ⎔ hidden
]

function handleClick(slot: number) {
  if (props.activeSlot === slot) {
    emit('deselect')
  } else {
    emit('select', slot)
  }
}
</script>

<style scoped>
.instrument-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.15);
  border-radius: 6px;
  z-index: 40;
}

.instrument-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 52px;
  padding: 6px 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.instrument-slot:hover {
  background: rgba(196, 117, 58, 0.1);
  border-color: rgba(196, 117, 58, 0.3);
}

.instrument-slot.active {
  background: rgba(196, 117, 58, 0.15);
  border-color: rgba(196, 117, 58, 0.6);
  box-shadow: 0 0 8px rgba(196, 117, 58, 0.2);
}

.slot-key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-family: 'Courier New', monospace;
  font-size: 8px;
  font-weight: 600;
  color: rgba(196, 149, 106, 0.4);
  letter-spacing: 0;
}

.instrument-slot.active .slot-key {
  color: rgba(196, 117, 58, 0.8);
}

.slot-icon {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1;
  margin-top: 2px;
}

.instrument-slot.active .slot-icon {
  color: rgba(196, 117, 58, 0.9);
}

.slot-name {
  font-family: 'Courier New', monospace;
  font-size: 7px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.25);
  text-transform: uppercase;
}

.instrument-slot.active .slot-name {
  color: rgba(196, 149, 106, 0.7);
}
</style>
```

- [ ] **Step 2: Verify full build compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 6: Manual testing and offset tuning

**Files:** (no new files — just runtime verification)

- [ ] **Step 1: Run dev server and verify toolbar appears after deployment**

Run: `npm run dev`
Expected: After sky crane descent + deployment animation, toolbar with 5 slots appears at bottom center. Controls hint text is visible when no instrument is active.

- [ ] **Step 2: Test instrument activation via keyboard**

Press 1-5 keys after deployment. Camera should lerp to each instrument's node position. Press ESC to return to driving orbit. Verify:
- Camera transitions are smooth (no teleporting)
- WASD still moves the rover while zoomed on an instrument
- Pressing a different number switches instruments directly
- Pressing ESC returns to driving mode

- [ ] **Step 3: Test toolbar click interaction**

Click each toolbar slot. Should activate the same as keyboard. Click active slot to deselect (return to driving).

- [ ] **Step 4: Tune focus offsets if needed**

The initial offsets are estimates. Adjust `focusOffset` vectors in each controller subclass based on visual results. The camera should frame each instrument clearly without clipping through geometry.

- [ ] **Step 5: Commit**

```bash
git add src/three/instruments/ src/components/InstrumentToolbar.vue src/three/RoverController.ts src/three/SiteScene.ts src/views/MartianSiteView.vue
git commit -m "feat: add instrument toolbar with 5 controllers and camera zoom"
```
