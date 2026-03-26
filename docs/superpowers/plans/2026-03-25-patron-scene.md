# Patron Particle Skull Scene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a particle morphing skull background scene for the `/patron` route — loads skull.glb, renders vertices as GPU particles that morph from random scatter to skull shape, tracks the mouse.

**Architecture:** `PatronScene.ts` loads the GLB, extracts vertex positions, creates a `Points` object with custom vertex/fragment shaders that morph between random and skull positions. Post-processing adds bloom + vignette. `PatronSelectView.vue` mounts the canvas and provides a placeholder form area for calibration.

**Tech Stack:** Three.js (GLTFLoader, ShaderMaterial, Points, EffectComposer), GLSL, Vue 3

**Spec:** `docs/superpowers/specs/2026-03-25-patron-scene-design.md`

---

### Task 1: PatronScene — load skull and extract vertices

**Files:**
- Create: `src/three/patron/PatronScene.ts`

- [ ] **Step 1: Create PatronScene with GLB loading and vertex extraction**

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const MAX_PARTICLES = 50000
const MORPH_DURATION = 2.5
const MOUSE_LERP = 0.05

const vertexShader = /* glsl */ `
  attribute vec3 aTargetPosition;
  attribute float aSize;
  attribute float aRandom;

  uniform float uProgress;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uPixelRatio;

  varying float vAlpha;

  void main() {
    // Morph between random (position) and skull (aTargetPosition)
    float progress = uProgress;
    vec3 morphed = mix(position, aTargetPosition, progress);

    // Subtle floating motion when morphed
    float drift = aRandom * 6.2831;
    morphed += vec3(
      sin(uTime * 0.5 + drift) * 0.02 * progress,
      cos(uTime * 0.7 + drift) * 0.02 * progress,
      sin(uTime * 0.3 + drift * 0.5) * 0.02 * progress
    );

    // Mouse influence — gentle rotation offset
    morphed.x += uMouse.x * 0.15 * progress;
    morphed.y += uMouse.y * 0.1 * progress;

    vec4 mvPosition = modelViewMatrix * vec4(morphed, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuation
    gl_PointSize = aSize * uPixelRatio * (80.0 / -mvPosition.z);

    // Alpha based on morph progress + randomness
    vAlpha = 0.3 + 0.7 * progress;
    vAlpha *= 0.6 + 0.4 * aRandom;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;

  void main() {
    // Soft circle
    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, dist) * vAlpha;

    // Warm amber/white color
    vec3 color = mix(vec3(0.9, 0.65, 0.35), vec3(1.0, 0.95, 0.9), vAlpha);

    gl_FragColor = vec4(color, alpha);
  }
`

export class PatronScene {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera

  private renderer: THREE.WebGLRenderer | null = null
  private composer: EffectComposer | null = null
  private clock = new THREE.Clock(false)
  private rafId = 0
  private material: THREE.ShaderMaterial | null = null
  private morphProgress = 0
  private mouseTarget = new THREE.Vector2(0, 0)
  private mouseCurrent = new THREE.Vector2(0, 0)

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 100)
    this.camera.position.set(0, 0.5, 4)
    this.camera.lookAt(0, 0.3, 0)
    this.scene.background = new THREE.Color(0x000000)
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)

    // Load skull and extract vertices
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync('/skull.glb')
    const skullPositions = this.extractVertices(gltf.scene)
    const particleCount = Math.min(skullPositions.length / 3, MAX_PARTICLES)

    // Build particle geometry
    const geometry = new THREE.BufferGeometry()
    const randomPositions = new Float32Array(particleCount * 3)
    const targetPositions = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)
    const randoms = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      // Random scattered spawn positions (sphere distribution)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 1.5 + Math.random() * 2.0
      randomPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      randomPositions[i * 3 + 1] = r * Math.cos(phi) + 0.3
      randomPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

      // Target = skull vertex (sample evenly if more verts than MAX_PARTICLES)
      const srcIdx = Math.floor((i / particleCount) * (skullPositions.length / 3))
      targetPositions[i * 3] = skullPositions[srcIdx * 3]
      targetPositions[i * 3 + 1] = skullPositions[srcIdx * 3 + 1]
      targetPositions[i * 3 + 2] = skullPositions[srcIdx * 3 + 2]

      sizes[i] = 0.8 + Math.random() * 1.2
      randoms[i] = Math.random()
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(randomPositions, 3))
    geometry.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPositions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geometry, this.material)
    this.scene.add(points)

    // Post-processing
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.8,   // strength
      0.5,   // radius
      0.3,   // threshold (low — particles are dim, we want them to glow)
    )
    this.composer.addPass(bloomPass)

    const vignettePass = new ShaderPass(VignetteShader)
    vignettePass.uniforms['offset'].value = 0.95
    vignettePass.uniforms['darkness'].value = 1.2
    this.composer.addPass(vignettePass)
  }

  private extractVertices(scene: THREE.Object3D): Float32Array {
    const allPositions: number[] = []
    scene.updateMatrixWorld(true)

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const geo = child.geometry as THREE.BufferGeometry
      const posAttr = geo.getAttribute('position')
      if (!posAttr) return

      // Apply world matrix to get vertices in world space
      const vertex = new THREE.Vector3()
      for (let i = 0; i < posAttr.count; i++) {
        vertex.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
        vertex.applyMatrix4(child.matrixWorld)
        allPositions.push(vertex.x, vertex.y, vertex.z)
      }
    })

    // Center and normalize
    const arr = new Float32Array(allPositions)
    const box = new THREE.Box3()
    const v = new THREE.Vector3()
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i], arr[i + 1], arr[i + 2])
      box.expandByPoint(v)
    }
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 2.0 / maxDim // normalize to ~2 units tall

    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = (arr[i] - center.x) * scale
      arr[i + 1] = (arr[i + 1] - center.y) * scale + 0.5 // offset upward
      arr[i + 2] = (arr[i + 2] - center.z) * scale
    }

    return arr
  }

  startLoop(): void {
    this.clock.start()
    this.morphProgress = 0
    const tick = () => {
      this.rafId = requestAnimationFrame(tick)
      const delta = this.clock.getDelta()
      const elapsed = this.clock.getElapsedTime()
      this.update(delta, elapsed)
      this.composer?.render()
    }
    tick()
  }

  private update(delta: number, elapsed: number): void {
    if (!this.material) return

    // Morph progress
    if (this.morphProgress < 1) {
      this.morphProgress = Math.min(this.morphProgress + delta / MORPH_DURATION, 1)
    }
    const eased = smoothstep(this.morphProgress)
    this.material.uniforms.uProgress.value = eased
    this.material.uniforms.uTime.value = elapsed

    // Smooth mouse follow
    this.mouseCurrent.lerp(this.mouseTarget, MOUSE_LERP)
    this.material.uniforms.uMouse.value.copy(this.mouseCurrent)
  }

  /** Update mouse position — normalized -1 to 1 */
  setMouse(x: number, y: number): void {
    this.mouseTarget.set(x, y)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer?.setSize(width, height)
    this.composer?.setSize(width, height)
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId)
    this.clock.stop()
    this.renderer?.dispose()
    this.scene.traverse((child) => {
      if (child instanceof THREE.Points) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    })
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/patron/PatronScene.ts
git commit -m "feat(patron): add PatronScene with particle morphing skull"
```

---

### Task 2: PatronSelectView — canvas + placeholder form area

**Files:**
- Modify: `src/views/PatronSelectView.vue`

- [ ] **Step 1: Replace PatronSelectView with canvas mount and placeholder overlay**

Read the current file first, then replace entirely:

```vue
<template>
  <div class="patron-root">
    <canvas ref="patronCanvas" class="patron-canvas" />

    <!-- Placeholder form area for calibration -->
    <div class="form-area">
      <p class="placeholder-label">PATRON SELECTION — FORM AREA</p>
      <button class="skip-btn" @click="skipToGlobe">[ SKIP TO GLOBE ]</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { PatronScene } from '@/three/patron/PatronScene'

const router = useRouter()
const { setProfile, profile } = usePlayerProfile()

const patronCanvas = ref<HTMLCanvasElement | null>(null)
let scene: PatronScene | null = null

function skipToGlobe(): void {
  setProfile(profile.archetype!, profile.foundation!, 'trc')
  router.push('/globe')
}

function onMouseMove(e: MouseEvent): void {
  if (!scene) return
  // Normalize to -1..1
  const x = (e.clientX / window.innerWidth) * 2 - 1
  const y = -((e.clientY / window.innerHeight) * 2 - 1)
  scene.setMouse(x, y)
}

function onResize(): void {
  if (!scene || !patronCanvas.value) return
  const rect = patronCanvas.value.getBoundingClientRect()
  scene.resize(rect.width, rect.height)
}

onMounted(async () => {
  if (!patronCanvas.value) return
  const canvas = patronCanvas.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * Math.min(window.devicePixelRatio, 2)
  canvas.height = rect.height * Math.min(window.devicePixelRatio, 2)

  scene = new PatronScene(rect.width / rect.height)
  await scene.init(canvas)
  scene.startLoop()

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  scene?.dispose()
  scene = null
})
</script>

<style scoped>
.patron-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.patron-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.form-area {
  position: absolute;
  z-index: 1;
  left: 50%;
  top: 55%;
  transform: translateX(-50%);
  width: 40%;
  height: 35%;
  border: 1px dashed rgba(196, 149, 106, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.placeholder-label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.15em;
  color: rgba(196, 149, 106, 0.4);
}

.skip-btn {
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.skip-btn:hover {
  border-color: rgba(196, 149, 106, 0.6);
  color: rgba(196, 149, 106, 1);
}
</style>
```

- [ ] **Step 2: Verify type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Verify in browser**

Run dev server. Navigate through character creation to `/patron`. Should see:
1. Particles scattered randomly, then morph into skull shape over ~2.5s
2. Skull positioned upper-center
3. Mouse movement causes skull to subtly follow
4. Bloom glow on particles
5. Vignette darkening edges
6. Dashed placeholder box below the skull with "SKIP TO GLOBE" button
7. Skip button works (navigates to `/globe`)

- [ ] **Step 4: Commit**

```bash
git add src/views/PatronSelectView.vue
git commit -m "feat(patron): add PatronSelectView with canvas and placeholder form area"
```

---

### Task 3: Calibrate skull positioning and particle aesthetics

**Files:**
- Modify: `src/three/patron/PatronScene.ts`
- Modify: `src/views/PatronSelectView.vue`

This task requires running the dev server and visually tuning values.

- [ ] **Step 1: Run dev server and inspect the scene**

Navigate to `/patron`. Check:
- Is the skull centered horizontally?
- Is it in the upper 40-50% of the viewport?
- Are particles visible and glowing?
- Does mouse tracking feel smooth and eerie?
- Is the placeholder form area below the eyes?

- [ ] **Step 2: Adjust camera and skull positioning if needed**

In `PatronScene.ts`, the key tuning values are:
- `this.camera.position.set(0, 0.5, 4)` — camera distance and height
- `this.camera.lookAt(0, 0.3, 0)` — what the camera aims at
- `arr[i + 1] = ... + 0.5` in `extractVertices` — vertical offset of skull vertices
- `const scale = 2.0 / maxDim` — skull size
- Bloom strength/radius/threshold
- Vignette offset/darkness

In `PatronSelectView.vue`, the form area positioning:
- `top: 55%` — vertical position
- `width: 40%` — width
- `height: 35%` — height

Adjust until the skull sits in the upper portion and the form area sits cleanly below the eye line.

- [ ] **Step 3: Commit calibrated values**

```bash
git add src/three/patron/PatronScene.ts src/views/PatronSelectView.vue
git commit -m "feat(patron): calibrate skull position and particle aesthetics"
```

---

### Task 4: Verification

**Files:** None (verification only)

- [ ] **Step 1: Type check**

Run: `npx vue-tsc --noEmit`
Expected: Clean.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All pass.

- [ ] **Step 3: Manual walkthrough**

1. `/` → BEGIN MISSION → complete character creation → accept
2. Terminal outro → arrive at `/patron`
3. Particles scatter → morph into skull (~2.5s)
4. Move mouse — skull follows smoothly
5. Placeholder form area visible below eyes
6. Click SKIP TO GLOBE → arrives at `/globe`
7. Resize browser — scene adapts
8. Go to `/` → CONTINUE → should go to `/patron` (profile has no patron yet)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during patron scene verification"
```
