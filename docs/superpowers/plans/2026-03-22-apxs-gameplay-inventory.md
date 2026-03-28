# APXS Gameplay & Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instrument activation mode (rover locks, WASD controls instrument), APXS arm IK with laser drill, rock targeting with green/red crosshair, sample collection into a weight-based inventory with Tab-toggled UI.

**Architecture:** Extends the existing `RoverController` state machine with an `active` mode. The base `InstrumentController` gains `handleInput()` and `canActivate`. `APXSController` implements arm joint control and delegates to `RockTargeting` (raycaster) and `LaserDrill` (beam + particles + progress). A `useInventory` Vue composable provides reactive state for both 3D and UI layers.

**Tech Stack:** Vue 3, Three.js, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-apxs-gameplay-inventory-design.md`

---

### Task 1: Extend state machine — add `active` mode to RoverController

**Files:**
- Modify: `src/three/instruments/InstrumentController.ts`
- Modify: `src/three/RoverController.ts`

- [ ] **Step 1: Add `canActivate` and `handleInput` to InstrumentController base**

In `src/three/instruments/InstrumentController.ts`, add after `readonly altNodeNames`:

```typescript
  readonly canActivate: boolean = false
```

Add method after `getWorldFocusPosition()`:

```typescript
  handleInput(_keys: Set<string>, _delta: number): void {
    // Override per-instrument for active-mode input handling
  }
```

- [ ] **Step 2: Extend mode type in RoverController**

In `src/three/RoverController.ts`, change line 89:

```typescript
  mode: 'driving' | 'instrument' | 'active' = 'driving'
```

- [ ] **Step 3: Add ESC handling for `active` → `instrument`**

In the `onKeyDown` method, change the Escape block (line 173) from:

```typescript
    if (e.code === 'Escape' && this.mode === 'instrument') {
      this.mode = 'driving'
      this.activeInstrument = null
      return
    }
```

To:

```typescript
    if (e.code === 'Escape') {
      if (this.mode === 'active') {
        this.mode = 'instrument'
        return
      }
      if (this.mode === 'instrument') {
        this.mode = 'driving'
        this.activeInstrument = null
        return
      }
    }
```

- [ ] **Step 4: Add `enterActiveMode` method**

Add after `setInstrument`:

```typescript
  enterActiveMode(): void {
    if (this.mode === 'instrument' && this.activeInstrument?.canActivate) {
      this.mode = 'active'
    }
  }
```

- [ ] **Step 5: Guard rover movement behind mode check**

In the `update()` method, after the `roverState !== 'ready'` early return (line 219), add:

```typescript
    // In active mode, route input to instrument and skip rover controls
    if (this.mode === 'active' && this.activeInstrument) {
      this.activeInstrument.handleInput(this.keys, delta)
      this.activeInstrument.update(delta)
      this.updateCamera(delta)
      return
    }
```

This goes right before the "Keyboard turn" comment (line 221).

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 2: Wire ACTIVATE button and disable for non-APXS

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/three/instruments/APXSController.ts`

- [ ] **Step 1: Override `canActivate` in APXSController**

In `src/three/instruments/APXSController.ts`, add after `readonly viewPitch`:

```typescript
  override readonly canActivate = true
```

- [ ] **Step 2: Pass `canActivate` to InstrumentOverlay**

In `src/components/InstrumentOverlay.vue`, add prop:

```typescript
const props = defineProps<{
  activeSlot: number | null
  canActivate?: boolean
}>()
```

Update the ACTIVATE button to respect it. Find:

```html
          <button class="ov-btn-primary" @click="$emit('activate')">ACTIVATE</button>
```

Replace with:

```html
          <button
            class="ov-btn-primary"
            :class="{ disabled: !canActivate }"
            :disabled="!canActivate"
            @click="canActivate && $emit('activate')"
          >ACTIVATE</button>
```

Add CSS for the disabled state:

```css
.ov-btn-primary.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Wire @activate in MartianSiteView**

In `src/views/MartianSiteView.vue`, find the `<InstrumentOverlay>` line:

```html
    <InstrumentOverlay :active-slot="activeInstrumentSlot" />
```

Replace with:

```html
    <InstrumentOverlay
      :active-slot="activeInstrumentSlot"
      :can-activate="controller?.activeInstrument?.canActivate ?? false"
      @activate="controller?.enterActiveMode()"
    />
```

- [ ] **Step 4: Add reactive ref for `isActive` to drive UI**

After `activeInstrumentSlot` ref, add:

```typescript
const isInstrumentActive = ref(false)
```

In the animate loop, after the `activeInstrumentSlot.value` line, add:

```typescript
    isInstrumentActive.value = controller?.mode === 'active'
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 3: TerrainGenerator — expose small rocks

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts`

- [ ] **Step 1: Add `getSmallRocks` accessor**

In `src/three/terrain/TerrainGenerator.ts`, add a public method (after the `slopeAt` method or at the end of the class, before `dispose()`):

```typescript
  /** Returns only small rocks (excludes boulders with scale >= 2.0) */
  getSmallRocks(): THREE.Mesh[] {
    return this.rocks.filter(r => r.scale.x < 2.0)
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 4: RockTargeting — shared raycaster

**Files:**
- Create: `src/three/instruments/RockTargeting.ts`

- [ ] **Step 1: Create RockTargeting class**

```typescript
// src/three/instruments/RockTargeting.ts
import * as THREE from 'three'

const MAX_RANGE = 5  // meters from rover center

export interface TargetResult {
  rock: THREE.Mesh
  point: THREE.Vector3
}

export class RockTargeting {
  private raycaster = new THREE.Raycaster()
  private screenCenter = new THREE.Vector2(0, 0)
  private depletedRocks = new Set<THREE.Mesh>()
  private smallRocks: THREE.Mesh[] = []
  private roverPosition = new THREE.Vector3()

  setRocks(rocks: THREE.Mesh[]): void {
    this.smallRocks = rocks
  }

  setRoverPosition(pos: THREE.Vector3): void {
    this.roverPosition.copy(pos)
  }

  isDepeleted(rock: THREE.Mesh): boolean {
    return this.depletedRocks.has(rock)
  }

  depleteRock(rock: THREE.Mesh): void {
    this.depletedRocks.add(rock)
    // Clone material so we don't darken all rocks
    const mat = (rock.material as THREE.MeshStandardMaterial).clone()
    mat.color.multiplyScalar(0.4)
    mat.roughness = Math.min(1.0, mat.roughness + 0.3)
    rock.material = mat
  }

  /**
   * Cast a ray from screen center through the camera.
   * Returns the closest valid rock hit within range, or null.
   */
  cast(camera: THREE.PerspectiveCamera): TargetResult | null {
    this.raycaster.setFromCamera(this.screenCenter, camera)

    const hits = this.raycaster.intersectObjects(this.smallRocks, false)

    for (const hit of hits) {
      const rock = hit.object as THREE.Mesh

      // Skip depleted rocks
      if (this.depletedRocks.has(rock)) continue

      // Range check — rock must be near rover
      const dx = rock.position.x - this.roverPosition.x
      const dz = rock.position.z - this.roverPosition.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > MAX_RANGE) continue

      return { rock, point: hit.point }
    }

    return null
  }

  dispose(): void {
    this.depletedRocks.clear()
    this.smallRocks = []
  }
}
```

- [ ] **Step 2: Add export to barrel**

In `src/three/instruments/index.ts`, add:

```typescript
export { RockTargeting } from './RockTargeting'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 5: LaserDrill — beam, particles, progress

**Files:**
- Create: `src/three/instruments/LaserDrill.ts`

- [ ] **Step 1: Create LaserDrill class**

```typescript
// src/three/instruments/LaserDrill.ts
import * as THREE from 'three'

const DRILL_DURATION = 3.0  // seconds to complete
const GRACE_PERIOD = 0.2    // seconds before cancelling on lost target
const BEAM_COLOR = 0xff4400
const SPARK_COUNT = 20

export class LaserDrill {
  private scene: THREE.Scene
  private beam: THREE.Line | null = null
  private beamMat: THREE.LineBasicMaterial
  private sparks: THREE.Points | null = null
  private sparkPositions: Float32Array
  private sparkVelocities: Float32Array

  progress = 0        // 0..1
  isDrilling = false
  isComplete = false

  private graceTimer = 0
  private drillOrigin = new THREE.Vector3()
  private drillTarget = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.beamMat = new THREE.LineBasicMaterial({
      color: BEAM_COLOR,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    })
    this.sparkPositions = new Float32Array(SPARK_COUNT * 3)
    this.sparkVelocities = new Float32Array(SPARK_COUNT * 3)
  }

  startDrill(origin: THREE.Vector3, target: THREE.Vector3): void {
    if (this.isDrilling) return
    this.isDrilling = true
    this.isComplete = false
    this.progress = 0
    this.graceTimer = 0
    this.drillOrigin.copy(origin)
    this.drillTarget.copy(target)
    this.createBeam()
    this.createSparks()
  }

  updateTarget(origin: THREE.Vector3, target: THREE.Vector3 | null): void {
    if (!this.isDrilling) return

    if (target) {
      this.graceTimer = 0
      this.drillOrigin.copy(origin)
      this.drillTarget.copy(target)
      this.updateBeamGeometry()
    }
    // If no target, grace timer handles in update()
  }

  update(delta: number, hasTarget: boolean): void {
    if (!this.isDrilling) return

    if (!hasTarget) {
      this.graceTimer += delta
      if (this.graceTimer >= GRACE_PERIOD) {
        this.cancelDrill()
        return
      }
    } else {
      this.graceTimer = 0
    }

    this.progress += delta / DRILL_DURATION

    // Animate sparks
    if (this.sparks) {
      const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < SPARK_COUNT; i++) {
        // Reset sparks that have drifted too far
        const dx = positions.getX(i) - this.drillTarget.x
        const dy = positions.getY(i) - this.drillTarget.y
        const dz = positions.getZ(i) - this.drillTarget.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist > 0.5 || Math.random() < 0.05) {
          // Respawn at contact point
          positions.setXYZ(i, this.drillTarget.x, this.drillTarget.y, this.drillTarget.z)
          this.sparkVelocities[i * 3] = (Math.random() - 0.5) * 2
          this.sparkVelocities[i * 3 + 1] = Math.random() * 3
          this.sparkVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2
        } else {
          positions.setX(i, positions.getX(i) + this.sparkVelocities[i * 3] * delta)
          positions.setY(i, positions.getY(i) + this.sparkVelocities[i * 3 + 1] * delta)
          positions.setZ(i, positions.getZ(i) + this.sparkVelocities[i * 3 + 2] * delta)
          // Gravity
          this.sparkVelocities[i * 3 + 1] -= 5 * delta
        }
      }
      positions.needsUpdate = true
    }

    if (this.progress >= 1) {
      this.progress = 1
      this.isComplete = true
      this.isDrilling = false
      this.removeVisuals()
    }
  }

  cancelDrill(): void {
    this.isDrilling = false
    this.progress = 0
    this.isComplete = false
    this.removeVisuals()
  }

  private createBeam(): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      this.drillOrigin, this.drillTarget,
    ])
    this.beam = new THREE.Line(geo, this.beamMat)
    this.scene.add(this.beam)
  }

  private updateBeamGeometry(): void {
    if (!this.beam) return
    const positions = this.beam.geometry.getAttribute('position') as THREE.BufferAttribute
    positions.setXYZ(0, this.drillOrigin.x, this.drillOrigin.y, this.drillOrigin.z)
    positions.setXYZ(1, this.drillTarget.x, this.drillTarget.y, this.drillTarget.z)
    positions.needsUpdate = true
  }

  private createSparks(): void {
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkPositions[i * 3] = this.drillTarget.x
      this.sparkPositions[i * 3 + 1] = this.drillTarget.y
      this.sparkPositions[i * 3 + 2] = this.drillTarget.z
      this.sparkVelocities[i * 3] = (Math.random() - 0.5) * 2
      this.sparkVelocities[i * 3 + 1] = Math.random() * 3
      this.sparkVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.sparkPositions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.sparks = new THREE.Points(geo, mat)
    this.scene.add(this.sparks)
  }

  private removeVisuals(): void {
    if (this.beam) {
      this.scene.remove(this.beam)
      this.beam.geometry.dispose()
      this.beam = null
    }
    if (this.sparks) {
      this.scene.remove(this.sparks)
      this.sparks.geometry.dispose()
      ;(this.sparks.material as THREE.PointsMaterial).dispose()
      this.sparks = null
    }
  }

  dispose(): void {
    this.removeVisuals()
    this.beamMat.dispose()
  }
}
```

- [ ] **Step 2: Add export to barrel**

In `src/three/instruments/index.ts`, add:

```typescript
export { LaserDrill } from './LaserDrill'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 6: useInventory composable

**Files:**
- Create: `src/composables/useInventory.ts`

- [ ] **Step 1: Create useInventory composable**

```typescript
// src/composables/useInventory.ts
import { ref, computed } from 'vue'

export interface Sample {
  id: string
  type: 'regolith'
  label: string
  weightKg: number
}

const CAPACITY_KG = 15
let sampleCounter = 0

const samples = ref<Sample[]>([])

export function useInventory() {
  const currentWeightKg = computed(() =>
    samples.value.reduce((sum, s) => sum + s.weightKg, 0)
  )

  const isFull = computed(() => currentWeightKg.value >= CAPACITY_KG)

  const capacityKg = CAPACITY_KG

  function addSample(type: 'regolith' = 'regolith'): Sample | null {
    const weight = 0.5 + Math.random() * 1.0  // 0.5–1.5 kg
    if (currentWeightKg.value + weight > CAPACITY_KG) return null

    sampleCounter++
    const sample: Sample = {
      id: `sample-${sampleCounter}`,
      type,
      label: `Regolith Sample #${sampleCounter}`,
      weightKg: Math.round(weight * 100) / 100,
    }
    samples.value.push(sample)
    return sample
  }

  function removeSample(id: string): void {
    const idx = samples.value.findIndex(s => s.id === id)
    if (idx >= 0) samples.value.splice(idx, 1)
  }

  return {
    samples,
    currentWeightKg,
    isFull,
    capacityKg,
    addSample,
    removeSample,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 7: APXSController — arm IK + drill + targeting integration

**Files:**
- Modify: `src/three/instruments/APXSController.ts`

This is the core gameplay task. The APXSController needs to:
1. Grab arm joint nodes on attach
2. Control arm with WASD in active mode
3. Use RockTargeting to find valid rocks
4. Use LaserDrill for the drill interaction
5. Collect samples into inventory on drill complete

- [ ] **Step 1: Rewrite APXSController with full gameplay**

Replace the entire file with:

```typescript
// src/three/instruments/APXSController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import { RockTargeting, type TargetResult } from './RockTargeting'
import { LaserDrill } from './LaserDrill'
import { useInventory } from '@/composables/useInventory'

const ARM_SWING_SPEED = 0.8     // radians/sec
const ARM_EXTEND_SPEED = 0.6    // radians/sec
const ARM_SWING_MAX = 1.0       // max shoulder swing (radians)
const ARM_EXTEND_MIN = -0.3     // retracted
const ARM_EXTEND_MAX = 0.8      // extended
const ARM_LERP = 0.1            // smooth movement

export class APXSController extends InstrumentController {
  readonly id = 'apxs'
  readonly name = 'APXS'
  readonly slot = 3
  readonly focusNodeName = 'APXS'
  readonly focusOffset = new THREE.Vector3(0.3, 0.1, 0.3)
  readonly viewAngle = Math.PI * 0.4
  readonly viewPitch = 0.3
  override readonly canActivate = true

  // Arm joint references
  private shoulder: THREE.Object3D | null = null
  private elbow: THREE.Object3D | null = null
  private drillNode: THREE.Object3D | null = null
  private shoulderBaseQuat = new THREE.Quaternion()
  private elbowBaseQuat = new THREE.Quaternion()

  // Arm state
  private swingAngle = 0
  private extendAngle = 0
  private targetSwing = 0
  private targetExtend = 0

  // Targeting + drill
  targeting: RockTargeting | null = null
  private drill: LaserDrill | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private mouseDown = false
  private currentTarget: TargetResult | null = null

  // Inventory
  private inventory = useInventory()

  // Public state for UI
  get drillProgress(): number { return this.drill?.progress ?? 0 }
  get isDrilling(): boolean { return this.drill?.isDrilling ?? false }
  get hasTarget(): boolean { return this.currentTarget !== null }
  get isInventoryFull(): boolean { return this.inventory.isFull.value }

  override attach(rover: THREE.Group): void {
    super.attach(rover)

    // Grab arm joints
    this.shoulder = rover.getObjectByName('arm_01001') ?? null
    this.elbow = rover.getObjectByName('arm_02001') ?? null
    this.drillNode = rover.getObjectByName('Drill') ?? null

    if (this.shoulder) this.shoulderBaseQuat.copy(this.shoulder.quaternion)
    if (this.elbow) this.elbowBaseQuat.copy(this.elbow.quaternion)

    if (!this.shoulder) console.warn('[APXS] arm_01001 not found')
    if (!this.elbow) console.warn('[APXS] arm_02001 not found')
    if (!this.drillNode) console.warn('[APXS] Drill node not found')
  }

  initGameplay(scene: THREE.Scene, camera: THREE.PerspectiveCamera, rocks: THREE.Mesh[]): void {
    this.camera = camera
    this.targeting = new RockTargeting()
    this.targeting.setRocks(rocks)
    this.drill = new LaserDrill(scene)
  }

  override handleInput(keys: Set<string>, delta: number): void {
    // A/D swings the arm left/right
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      this.targetSwing = Math.min(ARM_SWING_MAX, this.targetSwing + ARM_SWING_SPEED * delta)
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      this.targetSwing = Math.max(-ARM_SWING_MAX, this.targetSwing - ARM_SWING_SPEED * delta)
    }

    // W/S extends/retracts the arm
    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      this.targetExtend = Math.min(ARM_EXTEND_MAX, this.targetExtend + ARM_EXTEND_SPEED * delta)
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      this.targetExtend = Math.max(ARM_EXTEND_MIN, this.targetExtend - ARM_EXTEND_SPEED * delta)
    }
  }

  override update(delta: number): void {
    // Smooth arm movement
    this.swingAngle += (this.targetSwing - this.swingAngle) * ARM_LERP
    this.extendAngle += (this.targetExtend - this.extendAngle) * ARM_LERP

    // Apply shoulder rotation (swing left/right)
    if (this.shoulder) {
      const swingDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), this.swingAngle
      )
      this.shoulder.quaternion.copy(this.shoulderBaseQuat).multiply(swingDelta)
    }

    // Apply elbow rotation (extend/retract)
    if (this.elbow) {
      const extendDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), this.extendAngle
      )
      this.elbow.quaternion.copy(this.elbowBaseQuat).multiply(extendDelta)
    }

    // Update targeting
    if (this.targeting && this.camera) {
      this.currentTarget = this.targeting.cast(this.camera)
    }

    // Update drill
    if (this.drill) {
      if (this.mouseDown && this.currentTarget && !this.inventory.isFull.value) {
        const drillOrigin = this.getDrillWorldPosition()
        if (!this.drill.isDrilling) {
          this.drill.startDrill(drillOrigin, this.currentTarget.point)
        } else {
          this.drill.updateTarget(drillOrigin, this.currentTarget.point)
        }
      } else if (this.drill.isDrilling && !this.mouseDown) {
        this.drill.cancelDrill()
      }

      this.drill.update(delta, this.currentTarget !== null && this.mouseDown)

      // Check drill completion
      if (this.drill.isComplete && this.currentTarget) {
        this.collectSample(this.currentTarget.rock)
        this.drill.isComplete = false
      }
    }
  }

  onMouseDown(): void {
    this.mouseDown = true
  }

  onMouseUp(): void {
    this.mouseDown = false
  }

  private getDrillWorldPosition(): THREE.Vector3 {
    if (!this.drillNode) return this.getWorldFocusPosition()
    const pos = new THREE.Vector3()
    this.drillNode.getWorldPosition(pos)
    return pos
  }

  private collectSample(rock: THREE.Mesh): void {
    const sample = this.inventory.addSample('regolith')
    if (sample && this.targeting) {
      this.targeting.depleteRock(rock)
    }
  }

  setRoverPosition(pos: THREE.Vector3): void {
    this.targeting?.setRoverPosition(pos)
  }

  override dispose(): void {
    this.drill?.dispose()
    this.targeting?.dispose()
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 8: InstrumentCrosshair Vue component

**Files:**
- Create: `src/components/InstrumentCrosshair.vue`

- [ ] **Step 1: Create InstrumentCrosshair.vue**

```vue
<template>
  <Teleport to="body">
    <div v-if="visible" class="crosshair" :class="color">
      <div class="crosshair-dot" />
      <svg v-if="drilling" class="crosshair-ring" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" class="ring-track" />
        <circle cx="20" cy="20" r="16" class="ring-fill"
          :style="{ strokeDashoffset: dashOffset }" />
      </svg>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  color: 'green' | 'red'
  drilling: boolean
  progress: number  // 0..1
}>()

const circumference = 2 * Math.PI * 16
const dashOffset = computed(() =>
  circumference * (1 - props.progress)
)
</script>

<style scoped>
.crosshair {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 45;
  pointer-events: none;
}

.crosshair-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background 0.15s ease;
}

.crosshair.green .crosshair-dot {
  background: rgba(93, 201, 165, 0.9);
  box-shadow: 0 0 6px rgba(93, 201, 165, 0.5);
}

.crosshair.red .crosshair-dot {
  background: rgba(224, 80, 48, 0.9);
  box-shadow: 0 0 6px rgba(224, 80, 48, 0.5);
}

.crosshair-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  transform: translate(-50%, -50%) rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 2;
}

.ring-fill {
  fill: none;
  stroke: rgba(93, 201, 165, 0.8);
  stroke-width: 2.5;
  stroke-dasharray: 100.53;
  transition: stroke-dashoffset 0.1s linear;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 9: InventoryPanel Vue component

**Files:**
- Create: `src/components/InventoryPanel.vue`

- [ ] **Step 1: Create InventoryPanel.vue**

```vue
<template>
  <Teleport to="body">
    <Transition name="inv-slide">
      <div v-if="open" class="inventory-panel">
        <div class="inv-header">
          <span class="inv-title">INVENTORY</span>
          <span class="inv-weight" :class="{ full: isFull }">
            {{ currentWeight }} / {{ capacityKg }} KG
            <span v-if="isFull" class="inv-full-badge">FULL</span>
          </span>
        </div>

        <div class="inv-bar-track">
          <div
            class="inv-bar-fill"
            :class="{ warning: fillPct > 80, full: fillPct >= 100 }"
            :style="{ width: Math.min(100, fillPct) + '%' }"
          />
        </div>

        <div v-if="samples.length === 0" class="inv-empty">NO SAMPLES</div>

        <div v-else class="inv-list">
          <div
            v-for="sample in samples"
            :key="sample.id"
            class="inv-row"
          >
            <span class="inv-sample-icon">&#x25CF;</span>
            <span class="inv-sample-label">{{ sample.label }}</span>
            <span class="inv-sample-weight">{{ sample.weightKg.toFixed(2) }} kg</span>
            <button class="inv-dump-btn" @click="$emit('dump', sample.id)">DUMP</button>
          </div>
        </div>

        <div class="inv-footer">[I] CLOSE</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Sample } from '@/composables/useInventory'

const props = defineProps<{
  open: boolean
  samples: Sample[]
  currentWeightKg: number
  capacityKg: number
  isFull: boolean
}>()

defineEmits<{
  dump: [id: string]
}>()

const currentWeight = computed(() => props.currentWeightKg.toFixed(1))
const fillPct = computed(() => (props.currentWeightKg / props.capacityKg) * 100)
</script>

<style scoped>
.inventory-panel {
  position: fixed;
  bottom: 80px;
  left: 16px;
  width: 260px;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 8px;
  padding: 12px;
  z-index: 45;
  font-family: 'Courier New', monospace;
}

.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.inv-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: #e8a060;
}

.inv-weight {
  font-size: 10px;
  color: rgba(196, 149, 106, 0.6);
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.inv-weight.full {
  color: #e05030;
}

.inv-full-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 8px;
  font-weight: bold;
  color: #1a0d08;
  background: #e05030;
  border-radius: 3px;
  letter-spacing: 0.1em;
}

.inv-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 10px;
}

.inv-bar-fill {
  height: 100%;
  background: rgba(93, 201, 165, 0.7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.inv-bar-fill.warning {
  background: rgba(239, 159, 39, 0.8);
}

.inv-bar-fill.full {
  background: rgba(224, 80, 48, 0.8);
}

.inv-empty {
  font-size: 9px;
  color: rgba(196, 117, 58, 0.3);
  text-align: center;
  padding: 12px;
  letter-spacing: 0.15em;
}

.inv-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inv-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 9px;
}

.inv-sample-icon {
  color: rgba(196, 117, 58, 0.5);
  font-size: 6px;
}

.inv-sample-label {
  flex: 1;
  color: rgba(196, 149, 106, 0.7);
  letter-spacing: 0.04em;
}

.inv-sample-weight {
  color: rgba(196, 149, 106, 0.4);
  font-variant-numeric: tabular-nums;
}

.inv-dump-btn {
  font-family: 'Courier New', monospace;
  font-size: 7px;
  letter-spacing: 0.1em;
  color: rgba(224, 80, 48, 0.6);
  background: transparent;
  border: 1px solid rgba(224, 80, 48, 0.2);
  border-radius: 3px;
  padding: 2px 5px;
  cursor: pointer;
  transition: all 0.15s;
}

.inv-dump-btn:hover {
  color: #e05030;
  border-color: rgba(224, 80, 48, 0.5);
}

.inv-footer {
  text-align: center;
  margin-top: 8px;
  font-size: 8px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.15em;
}

/* Transition */
.inv-slide-enter-active,
.inv-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.inv-slide-enter-from,
.inv-slide-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 10: Wire everything into MartianSiteView

**Files:**
- Modify: `src/views/MartianSiteView.vue`

This connects all the pieces: crosshair, inventory panel, APXS gameplay init, mouse events, Tab key, and rover position updates.

- [ ] **Step 1: Add imports**

Add after existing instrument imports:

```typescript
import InstrumentCrosshair from '@/components/InstrumentCrosshair.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import { useInventory } from '@/composables/useInventory'
import { APXSController } from '@/three/instruments'
```

- [ ] **Step 2: Add reactive state**

After `isInstrumentActive` ref, add:

```typescript
const inventoryOpen = ref(false)
const crosshairVisible = ref(false)
const crosshairColor = ref<'green' | 'red'>('red')
const drillProgress = ref(0)
const isDrilling = ref(false)
const { samples, currentWeightKg, isFull, capacityKg, removeSample } = useInventory()
```

- [ ] **Step 3: Init APXS gameplay after instruments attach**

In the animate loop, after the instrument attachment block, add:

```typescript
    // Init APXS gameplay once (after attach)
    if (siteScene.roverState === 'ready' && siteScene.rover && camera) {
      const apxs = controller?.instruments.find(i => i.id === 'apxs')
      if (apxs instanceof APXSController && apxs.attached && !apxs.targeting) {
        apxs.initGameplay(siteScene.scene, camera, siteScene.terrain.getSmallRocks())
      }
    }
```

- [ ] **Step 4: Update APXS state each frame**

In the animate loop, after the active instrument slot tracking, add:

```typescript
    // Update APXS-specific state for crosshair/UI
    if (controller?.mode === 'active' && controller.activeInstrument instanceof APXSController) {
      const apxs = controller.activeInstrument
      apxs.setRoverPosition(siteScene!.rover!.position)
      crosshairVisible.value = true
      crosshairColor.value = (apxs.hasTarget && !apxs.isInventoryFull) ? 'green' : 'red'
      drillProgress.value = apxs.drillProgress
      isDrilling.value = apxs.isDrilling
    } else {
      crosshairVisible.value = false
      isDrilling.value = false
      drillProgress.value = 0
    }
```

- [ ] **Step 5: Add mouse event handlers**

In the `onMounted` block, after `window.addEventListener('resize', onResize)`, add:

```typescript
  canvas.addEventListener('mousedown', onCanvasMouseDown)
  canvas.addEventListener('mouseup', onCanvasMouseUp)
  window.addEventListener('keydown', onGlobalKeyDown)
```

Add the handler functions before `onMounted`:

```typescript
function onCanvasMouseDown() {
  if (controller?.mode === 'active' && controller.activeInstrument instanceof APXSController) {
    controller.activeInstrument.onMouseDown()
  }
}

function onCanvasMouseUp() {
  if (controller?.mode === 'active' && controller.activeInstrument instanceof APXSController) {
    controller.activeInstrument.onMouseUp()
  }
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.code === 'KeyI') {
    e.preventDefault()
    inventoryOpen.value = !inventoryOpen.value
  }
}
```

- [ ] **Step 6: Clean up event listeners in onUnmounted**

In `onUnmounted`, add:

```typescript
  window.removeEventListener('keydown', onGlobalKeyDown)
```

- [ ] **Step 7: Add components to template**

After `<InstrumentOverlay>`, add:

```html
    <InstrumentCrosshair
      :visible="crosshairVisible"
      :color="crosshairColor"
      :drilling="isDrilling"
      :progress="drillProgress"
    />
    <InventoryPanel
      :open="inventoryOpen"
      :samples="samples"
      :current-weight-kg="currentWeightKg"
      :capacity-kg="capacityKg"
      :is-full="isFull"
      @dump="removeSample"
    />
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors

---

### Task 11: Integration test and commit

**Files:** (no new files)

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

Verify:
- After deployment, toolbar shows 5 instruments
- Press 3 (APXS) → camera zooms to arm
- Overlay shows ACTIVATE button (enabled for APXS, disabled for others)
- Click ACTIVATE → mode becomes 'active', crosshair appears
- WASD moves the arm (shoulder swing + elbow extend)
- Point crosshair at a small rock → turns green
- Click and hold → laser beam appears, sparks, progress ring fills
- After ~3 seconds → sample collected, rock darkens
- Press Tab → inventory panel shows the sample with weight
- Can DUMP samples from inventory
- Press ESC → returns to instrument view, crosshair hidden
- Press ESC again → returns to driving

- [ ] **Step 2: Tune arm rotation axes if needed**

The arm joint rotation axes (Y for shoulder swing, X for elbow extend) are assumptions. If the arm moves wrong at runtime, adjust the axis vectors in `APXSController.update()`. Add a `console.log` of the base quaternions during development to identify correct axes.

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/ src/composables/useInventory.ts src/components/InstrumentCrosshair.vue src/components/InventoryPanel.vue src/components/InstrumentOverlay.vue src/three/RoverController.ts src/three/terrain/TerrainGenerator.ts src/views/MartianSiteView.vue docs/superpowers/plans/2026-03-22-apxs-gameplay-inventory.md
git commit -m "feat: add APXS laser drill gameplay with arm control and inventory system"
```
