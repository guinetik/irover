# 3D Terminal Scene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3D terminal model that frames the character creation form — rotates in from a void, zooms to the screen, form overlays on top, then the terminal recedes on acceptance.

**Architecture:** A `TerminalScene` class loads `terminal.glb`, manages intro/outro animations via lerp, and projects screen corners to DOM coordinates. `CharacterCreateView.vue` gains a canvas layer behind the form, a phase state machine, and overlay positioning that aligns the form content with the 3D screen area.

**Tech Stack:** Three.js (GLTFLoader, PerspectiveCamera), Vue 3 Composition API, CSS transitions

**Spec:** `docs/superpowers/specs/2026-03-25-terminal-scene-design.md`

---

### Task 1: TerminalScene — load model and basic render

**Files:**
- Create: `src/three/terminal/TerminalScene.ts`

- [ ] **Step 1: Create TerminalScene class with GLB loading**

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Duration of intro/outro animations in seconds */
const INTRO_DURATION = 2.5
const OUTRO_DURATION = 2.0
const BOOT_DELAY = 0.6

/** Camera settings for the "zoomed to screen" final position */
const CAMERA_FOV = 40
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 100

export type TerminalPhase = 'intro' | 'boot' | 'launch' | 'active' | 'exit' | 'outro' | 'done'

export class TerminalScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera

  private renderer: THREE.WebGLRenderer | null = null
  private model: THREE.Object3D | null = null
  private clock = new THREE.Clock(false)
  private rafId = 0
  private phase: TerminalPhase = 'intro'
  private phaseTime = 0

  // Animation: model start/end transforms
  private modelStartPos = new THREE.Vector3(0, -2, -8)
  private modelStartRot = new THREE.Euler(-0.3, Math.PI * 0.8, 0.2)
  private modelEndPos = new THREE.Vector3(0, 0, 0)
  private modelEndRot = new THREE.Euler(0, 0, 0)

  // Camera start (far) / end (zoomed to screen)
  private cameraStartPos = new THREE.Vector3(0, 0.5, 6)
  private cameraEndPos = new THREE.Vector3(0, 0.3, 2.8)

  // Screen corners in model-local space (determined empirically from GLB inspection)
  // These will be calibrated in Task 2 after inspecting the loaded model
  private screenCorners = {
    topLeft: new THREE.Vector3(-0.28, 0.42, 0.05),
    topRight: new THREE.Vector3(0.28, 0.42, 0.05),
    bottomLeft: new THREE.Vector3(-0.28, 0.08, 0.05),
    bottomRight: new THREE.Vector3(0.28, 0.08, 0.05),
  }

  // Callbacks
  private onPhaseChange: ((phase: TerminalPhase) => void) | null = null

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR)
    this.camera.position.copy(this.cameraStartPos)
    this.scene.background = new THREE.Color(0x000000)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambient)

    const directional = new THREE.DirectionalLight(0xfff0e0, 1.2)
    directional.position.set(2, 3, 4)
    this.scene.add(directional)
  }

  async init(canvas: HTMLCanvasElement, onPhaseChange: (phase: TerminalPhase) => void): Promise<void> {
    this.onPhaseChange = onPhaseChange

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync('/terminal.glb')
    this.model = gltf.scene

    // Center and normalize model
    this.model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(this.model)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 3.0 / maxDim // normalize to ~3 units wide
    this.model.scale.setScalar(scale)
    this.model.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

    // Wrap in group for animation transforms
    const wrapper = new THREE.Group()
    wrapper.add(this.model)
    wrapper.position.copy(this.modelStartPos)
    wrapper.rotation.copy(this.modelStartRot)
    this.model = wrapper
    this.scene.add(this.model)
  }

  startLoop(): void {
    this.clock.start()
    this.phase = 'intro'
    this.phaseTime = 0
    this.onPhaseChange?.('intro')
    const tick = () => {
      this.rafId = requestAnimationFrame(tick)
      const delta = this.clock.getDelta()
      this.update(delta)
      this.renderer?.render(this.scene, this.camera)
    }
    tick()
  }

  private update(delta: number): void {
    this.phaseTime += delta

    if (this.phase === 'intro') {
      const t = Math.min(this.phaseTime / INTRO_DURATION, 1)
      const ease = smoothstep(t)
      this.lerpModelTransform(ease)
      this.lerpCameraPosition(ease)
      if (t >= 1) this.setPhase('boot')
    } else if (this.phase === 'boot') {
      if (this.phaseTime >= BOOT_DELAY) this.setPhase('launch')
    } else if (this.phase === 'outro') {
      const t = Math.min(this.phaseTime / OUTRO_DURATION, 1)
      const ease = smoothstep(t)
      // Reverse: from end position back to a "gone" position
      this.lerpModelTransform(1 - ease)
      this.lerpCameraPosition(1 - ease)
      if (t >= 1) this.setPhase('done')
    }
    // 'active', 'launch', 'exit' phases: no 3D animation, handled by Vue overlay
  }

  private lerpModelTransform(t: number): void {
    if (!this.model) return
    this.model.position.lerpVectors(this.modelStartPos, this.modelEndPos, t)
    this.model.rotation.set(
      this.modelStartRot.x * (1 - t) + this.modelEndRot.x * t,
      this.modelStartRot.y * (1 - t) + this.modelEndRot.y * t,
      this.modelStartRot.z * (1 - t) + this.modelEndRot.z * t,
    )
  }

  private lerpCameraPosition(t: number): void {
    this.camera.position.lerpVectors(this.cameraStartPos, this.cameraEndPos, t)
    this.camera.lookAt(0, 0.2, 0)
  }

  private setPhase(phase: TerminalPhase): void {
    this.phase = phase
    this.phaseTime = 0
    this.onPhaseChange?.(phase)
  }

  /** Trigger the outro animation. Called when form is done. */
  startOutro(): void {
    this.setPhase('outro')
  }

  /**
   * Project the screen area to viewport pixel coordinates.
   * Returns { x, y, width, height } in CSS pixels relative to the canvas.
   */
  getScreenRect(canvasWidth: number, canvasHeight: number): { x: number; y: number; width: number; height: number } {
    const project = (v: THREE.Vector3) => {
      const world = v.clone()
      // screenCorners are in the wrapper's local space — transform to world
      this.model?.localToWorld(world)
      world.project(this.camera)
      return {
        x: (world.x * 0.5 + 0.5) * canvasWidth,
        y: (-world.y * 0.5 + 0.5) * canvasHeight,
      }
    }

    const tl = project(this.screenCorners.topLeft)
    const br = project(this.screenCorners.bottomRight)

    return {
      x: Math.min(tl.x, br.x),
      y: Math.min(tl.y, br.y),
      width: Math.abs(br.x - tl.x),
      height: Math.abs(br.y - tl.y),
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer?.setSize(width, height)
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId)
    this.clock.stop()
    this.renderer?.dispose()
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((m) => m.dispose())
      }
    })
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/terminal/TerminalScene.ts
git commit -m "feat(terminal): add TerminalScene class with GLB loading and intro/outro animation"
```

---

### Task 2: Calibrate screen corners from the GLB

**Files:**
- Modify: `src/three/terminal/TerminalScene.ts`

This task requires running the dev server and visually inspecting the model to find the correct screen corner positions and camera positions. The values in Task 1 are placeholder estimates.

- [ ] **Step 1: Add temporary debug helpers to TerminalScene**

Add a temporary method at the end of `init()` that logs the model's bounding box and child mesh names so we can identify the screen mesh:

```typescript
// --- DEBUG: remove after calibration ---
this.model.traverse((child: THREE.Object3D) => {
  if (child instanceof THREE.Mesh) {
    const box = new THREE.Box3().setFromObject(child)
    console.log(`Mesh: ${child.name}`, {
      min: box.min.toArray().map(n => +n.toFixed(3)),
      max: box.max.toArray().map(n => +n.toFixed(3)),
    })
  }
})
```

- [ ] **Step 2: Create a minimal test harness in CharacterCreateView to render the scene**

Temporarily modify `CharacterCreateView.vue` to add a canvas and mount the scene. Add to template before `.create-view`:

```html
<canvas ref="terminalCanvas" class="terminal-canvas" />
```

Add to script setup:

```typescript
import { onMounted, onUnmounted, ref as vueRef } from 'vue'
import { TerminalScene } from '@/three/terminal/TerminalScene'

const terminalCanvas = vueRef<HTMLCanvasElement | null>(null)
let terminalScene: TerminalScene | null = null

onMounted(async () => {
  if (!terminalCanvas.value) return
  const canvas = terminalCanvas.value
  terminalScene = new TerminalScene(canvas.clientWidth / canvas.clientHeight)
  await terminalScene.init(canvas, (phase) => {
    console.log('Phase:', phase)
  })
  terminalScene.startLoop()
})

onUnmounted(() => {
  terminalScene?.dispose()
})
```

Add to style:

```css
.terminal-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}
```

- [ ] **Step 3: Run dev server and inspect the model**

Run: `npm run dev`
Open `/create` in the browser. Check the console for mesh names and bounding boxes. Visually inspect where the CRT screen is relative to the model center.

Adjust the following values in `TerminalScene.ts` based on what you see:
- `screenCorners` — the 4 corners of the CRT screen in the wrapper's local space
- `modelEndPos` / `modelEndRot` — where the model should rest when zoomed in
- `cameraEndPos` — how close the camera should be to frame the screen
- `modelStartPos` / `modelStartRot` — where the model starts (off-screen, rotated)
- Model `scale` factor if 3.0/maxDim is too big or too small

The goal: after intro animation completes, the CRT screen should be roughly centered in the viewport, taking up about 60-80% of the viewport width. The terminal bezel should be visible around the edges.

- [ ] **Step 4: Remove debug logging, keep calibrated values**

Remove the `console.log` traversal from `init()`. Keep the calibrated position/rotation values.

- [ ] **Step 5: Commit**

```bash
git add src/three/terminal/TerminalScene.ts src/views/CharacterCreateView.vue
git commit -m "feat(terminal): calibrate screen corners and camera positions from GLB inspection"
```

---

### Task 3: Integrate phase state machine into CharacterCreateView

**Files:**
- Modify: `src/views/CharacterCreateView.vue`

- [ ] **Step 1: Rewrite CharacterCreateView with canvas + phase state machine + overlay**

Replace the entire file. The form logic (steps, archetype/motivation/origin/foundation/position refs, canAdvance, onAccept) stays the same. The template gains the canvas layer, overlay, and phase-driven visibility.

```vue
<template>
  <div class="create-root">
    <!-- Layer 0: Three.js canvas -->
    <canvas ref="terminalCanvas" class="terminal-canvas" />

    <!-- Layer 1+2: Overlay + Form (visible during launch/active/exit phases) -->
    <div
      class="screen-overlay"
      :class="{ visible: overlayVisible, exiting: phase === 'exit' }"
      :style="overlayStyle"
    >
      <div class="form-content">
        <header v-if="currentStep <= 5" class="header">
          <p class="org">MARS EXPLORATION CONSORTIUM — OPERATOR APPLICATION PORTAL v7.3.1</p>
          <p class="form-id">Form MEC-7720-B | Remote Vehicle Operations Division</p>
          <p class="section">SECTION {{ currentStep }} OF 5 — {{ sectionTitle }}</p>
        </header>

        <main class="content">
          <Transition name="fade" mode="out-in">
            <StepArchetype
              v-if="currentStep === 1"
              key="archetype"
              v-model="archetype"
            />
            <StepMotivation
              v-else-if="currentStep === 2"
              key="motivation"
              v-model="motivation"
            />
            <StepOrigin
              v-else-if="currentStep === 3"
              key="origin"
              v-model="origin"
            />
            <StepFoundation
              v-else-if="currentStep === 4"
              key="foundation"
              v-model="foundation"
            />
            <StepPosition
              v-else-if="currentStep === 5"
              key="position"
              v-model="position"
            />
            <ProcessingSequence
              v-else-if="currentStep === 6"
              key="processing"
              :position-choice="position!"
              @continue="currentStep = 7"
            />
            <AcceptanceScreen
              v-else-if="currentStep === 7"
              key="acceptance"
              @accept="onAccept"
            />
          </Transition>
        </main>

        <footer v-if="currentStep <= 5" class="nav">
          <button
            v-if="currentStep > 1"
            class="nav-btn"
            @click="currentStep--"
          >[ &lt; BACK ]</button>
          <span v-else />
          <button
            class="nav-btn"
            :disabled="!canAdvance"
            @click="currentStep++"
          >[ NEXT &gt; ]</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile, type ArchetypeId, type FoundationId, type OriginId, type MotivationId } from '@/composables/usePlayerProfile'
import { TerminalScene, type TerminalPhase } from '@/three/terminal/TerminalScene'
import StepArchetype from '@/components/create/StepArchetype.vue'
import StepMotivation from '@/components/create/StepMotivation.vue'
import StepOrigin from '@/components/create/StepOrigin.vue'
import StepFoundation from '@/components/create/StepFoundation.vue'
import StepPosition from '@/components/create/StepPosition.vue'
import type { PositionId } from '@/components/create/StepPosition.vue'
import ProcessingSequence from '@/components/create/ProcessingSequence.vue'
import AcceptanceScreen from '@/components/create/AcceptanceScreen.vue'

const router = useRouter()
const { setProfile, setIdentity } = usePlayerProfile()

// --- Phase state ---
const phase = ref<TerminalPhase>('intro')
const overlayVisible = ref(false)
const overlayStyle = ref<Record<string, string>>({})

// --- Form state (unchanged) ---
const currentStep = ref(1)
const archetype = ref<ArchetypeId | null>(null)
const motivation = ref<MotivationId | null>(null)
const origin = ref<OriginId | null>(null)
const foundation = ref<FoundationId | null>(null)
const position = ref<PositionId | null>(null)

const sectionTitles: Record<number, string> = {
  1: 'OPERATOR PROFILE',
  2: 'PSYCHOLOGICAL EVALUATION',
  3: 'BIOGRAPHICAL DATA',
  4: 'PROFESSIONAL BACKGROUND',
  5: 'POSITION PREFERENCE',
}

const sectionTitle = computed(() => sectionTitles[currentStep.value] ?? '')

const canAdvance = computed(() => {
  switch (currentStep.value) {
    case 1: return archetype.value !== null
    case 2: return motivation.value !== null
    case 3: return origin.value !== null
    case 4: return foundation.value !== null
    case 5: return position.value !== null
    default: return false
  }
})

// --- Three.js scene ---
const terminalCanvas = ref<HTMLCanvasElement | null>(null)
let scene: TerminalScene | null = null

function onPhaseChange(newPhase: TerminalPhase): void {
  phase.value = newPhase

  if (newPhase === 'launch') {
    // Position overlay to match screen, then fade in
    updateOverlayPosition()
    overlayVisible.value = true
  } else if (newPhase === 'done') {
    router.push('/patron')
  }
}

function updateOverlayPosition(): void {
  if (!scene || !terminalCanvas.value) return
  const canvas = terminalCanvas.value
  const rect = scene.getScreenRect(canvas.clientWidth, canvas.clientHeight)
  overlayStyle.value = {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

function onAccept(): void {
  setIdentity(origin.value!, motivation.value!)
  setProfile(archetype.value!, foundation.value!, null)
  // Trigger exit → outro → done → navigate
  phase.value = 'exit'
  overlayVisible.value = false
  // After overlay fade-out (500ms), start 3D outro
  setTimeout(() => {
    scene?.startOutro()
  }, 500)
}

function onResize(): void {
  if (!scene || !terminalCanvas.value) return
  const canvas = terminalCanvas.value
  scene.resize(canvas.clientWidth, canvas.clientHeight)
  if (phase.value === 'active' || phase.value === 'launch') {
    updateOverlayPosition()
  }
}

onMounted(async () => {
  if (!terminalCanvas.value) return
  const canvas = terminalCanvas.value

  scene = new TerminalScene(canvas.clientWidth / canvas.clientHeight)
  await scene.init(canvas, onPhaseChange)
  scene.startLoop()

  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  scene?.dispose()
  scene = null
})
</script>

<style scoped>
.create-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.terminal-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.screen-overlay {
  position: absolute;
  z-index: 1;
  background: #000;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  overflow: hidden;
}

.screen-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

.screen-overlay.exiting {
  opacity: 0;
  transition: opacity 0.5s ease;
  pointer-events: none;
}

.form-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  padding: 24px 32px;
  box-sizing: border-box;
  overflow-y: auto;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}

.org {
  font-size: 11px;
  letter-spacing: 0.15em;
  color: rgba(196, 149, 106, 0.4);
  margin: 0;
}

.form-id {
  font-size: 11px;
  color: rgba(196, 149, 106, 0.25);
  margin: 0;
}

.section {
  margin-top: 12px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(196, 149, 106, 0.6);
}

.content {
  flex: 1;
}

.nav {
  display: flex;
  justify-content: space-between;
  padding-top: 20px;
}

.nav-btn {
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 13px;
  color: #c4956a;
  cursor: pointer;
  padding: 8px 0;
  letter-spacing: 0.1em;
  transition: color 0.15s;
}

.nav-btn:hover {
  color: rgba(196, 149, 106, 1);
}

.nav-btn:disabled {
  color: rgba(196, 149, 106, 0.2);
  cursor: not-allowed;
}

/* Fade transition for step content */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
```

Key changes from the previous version:
- Root element is now `.create-root` (relative positioning container)
- Canvas element added as Layer 0
- Form wrapped in `.screen-overlay` + `.form-content` (positioned absolutely via JS)
- Phase state machine drives visibility
- `onAccept` triggers exit phase → setTimeout → outro → done → navigate
- Resize listener updates overlay position
- Padding reduced (was 48px 64px, now 24px 32px) since form lives inside the screen area
- `.form` class renamed to `.form-id` to avoid conflict with the HTML `<form>` element (was already `form` in CSS)

- [ ] **Step 2: Verify type check passes**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Verify in browser**

Run dev server. Navigate to `/create`. Should see:
1. Terminal model rotates in from void
2. Brief pause (green screen visible)
3. Black overlay fades in over screen area
4. Form content appears
5. Complete all steps → accept → overlay fades → terminal recedes → navigate to `/patron`

- [ ] **Step 4: Commit**

```bash
git add src/views/CharacterCreateView.vue
git commit -m "feat(create): integrate TerminalScene with phase state machine and overlay"
```

---

### Task 4: Polish and resize handling

**Files:**
- Modify: `src/three/terminal/TerminalScene.ts`
- Modify: `src/views/CharacterCreateView.vue`

- [ ] **Step 1: Ensure canvas fills viewport properly on mount**

In `CharacterCreateView.vue`, update the `onMounted` to handle initial canvas sizing:

```typescript
onMounted(async () => {
  if (!terminalCanvas.value) return
  const canvas = terminalCanvas.value
  // Ensure canvas dimensions match its CSS size before creating renderer
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * Math.min(window.devicePixelRatio, 2)
  canvas.height = rect.height * Math.min(window.devicePixelRatio, 2)

  scene = new TerminalScene(rect.width / rect.height)
  await scene.init(canvas, onPhaseChange)
  scene.startLoop()

  window.addEventListener('resize', onResize)
})
```

- [ ] **Step 2: Add the `active` phase transition**

In `onPhaseChange`, when phase becomes `launch`, set a timeout to transition to `active` after the overlay fade completes (300ms):

```typescript
function onPhaseChange(newPhase: TerminalPhase): void {
  phase.value = newPhase

  if (newPhase === 'launch') {
    updateOverlayPosition()
    overlayVisible.value = true
    // After overlay fade-in completes, mark as active
    setTimeout(() => {
      phase.value = 'active'
    }, 350)
  } else if (newPhase === 'done') {
    router.push('/patron')
  }
}
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (form logic unchanged).

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/CharacterCreateView.vue src/three/terminal/TerminalScene.ts
git commit -m "feat(terminal): polish resize handling and phase transitions"
```

---

### Task 5: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Type check**

Run: `npx vue-tsc --noEmit`
Expected: Clean.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 3: Manual end-to-end walkthrough**

1. Navigate to `/` → BEGIN MISSION → `/create`
2. Terminal rotates in from black void (~2.5s)
3. Green CRT screen visible briefly (~0.6s boot pause)
4. Black overlay fades in over screen area (~0.3s)
5. Form appears — walk through all 5 steps
6. Processing animation plays with correct snark
7. Accept application
8. Form fades out, green screen briefly visible
9. Terminal recedes into void (~2s)
10. Navigate to `/patron`
11. Resize browser during form — overlay repositions correctly
12. Refresh on `/` — continue/new mission buttons work correctly

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during terminal scene verification"
```
