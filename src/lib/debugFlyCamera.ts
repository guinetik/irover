import * as THREE from 'three'

const FLY_SPEED = 80
const FAST_MULT = 3
const LOOK_SENSITIVITY = 0.003

/**
 * Free-fly debug camera. WASD to move, mouse drag to look, Shift for speed boost.
 * Call `enable()` to detach from rover, `disable()` to return control.
 */
export class DebugFlyCamera {
  private camera: THREE.PerspectiveCamera
  private canvas: HTMLCanvasElement
  private enabled = false
  private keys = new Set<string>()
  private yaw = 0
  private pitch = -0.3
  private pointerLocked = false

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return
    this.keys.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || !this.pointerLocked) return
    this.yaw -= e.movementX * LOOK_SENSITIVITY
    this.pitch -= e.movementY * LOOK_SENSITIVITY
    this.pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this.pitch))
  }

  private onClick = () => {
    if (!this.enabled) return
    this.canvas.requestPointerLock()
  }

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas
  }

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera
    this.canvas = canvas
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    // Derive initial yaw/pitch from current camera orientation
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    this.yaw = Math.atan2(-dir.x, -dir.z)
    this.pitch = Math.asin(dir.y)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    this.canvas.addEventListener('click', this.onClick)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)

    console.log('[DebugFlyCamera] Enabled — WASD move, mouse look, Shift fast, ESC exits pointer lock')
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.keys.clear()

    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('click', this.onClick)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock()
    }

    console.log('[DebugFlyCamera] Disabled — control returned to rover')
  }

  /**
   * Call each frame. Returns true if the debug camera handled the update
   * (caller should skip normal camera logic).
   */
  update(delta: number): boolean {
    if (!this.enabled) return false

    const speed = FLY_SPEED * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? FAST_MULT : 1) * delta

    // Forward/back/strafe directions from yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw))

    if (this.keys.has('KeyW')) this.camera.position.addScaledVector(forward, speed)
    if (this.keys.has('KeyS')) this.camera.position.addScaledVector(forward, -speed)
    if (this.keys.has('KeyA')) this.camera.position.addScaledVector(right, -speed)
    if (this.keys.has('KeyD')) this.camera.position.addScaledVector(right, speed)
    if (this.keys.has('Space')) this.camera.position.y += speed
    if (this.keys.has('KeyC')) this.camera.position.y -= speed

    // Look direction from yaw + pitch
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    )
    const target = this.camera.position.clone().add(lookDir)
    this.camera.lookAt(target)

    return true
  }

  dispose(): void {
    this.disable()
  }
}
