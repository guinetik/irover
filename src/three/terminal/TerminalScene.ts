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
  private cameraEndPos = new THREE.Vector3(0, 0.45, 0.65)

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
    this.camera.lookAt(0, 0.35, 0)
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
