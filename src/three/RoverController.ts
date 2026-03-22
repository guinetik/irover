import * as THREE from 'three'

const CAMERA_DISTANCE = 8
const CAMERA_HEIGHT_OFFSET = 3
const CAMERA_LOOK_HEIGHT_OFFSET = 1
const CAMERA_LERP = 0.08
const GROUND_LERP = 0.2
const TILT_LERP = 0.1
const ORBIT_SENSITIVITY = 0.005
const TERRAIN_BOUNDARY = 380

const ORBIT_PITCH_MIN = -0.3 // look up at sky
const ORBIT_PITCH_MAX = 1.3  // look down at ground

export interface RoverConfig {
  moveSpeed: number
  turnSpeed: number
}

const DEFAULT_CONFIG: RoverConfig = {
  moveSpeed: 5,
  turnSpeed: 2,
}

export type HeightFn = (x: number, z: number) => number
export type NormalFn = (x: number, z: number) => THREE.Vector3

export class RoverController {
  private rover: THREE.Group
  private camera: THREE.PerspectiveCamera
  private keys = new Set<string>()
  private canvas: HTMLCanvasElement
  private heightAt: HeightFn
  private normalAt: NormalFn
  config: RoverConfig

  // Rover heading (Y rotation) — model rotated PI so "forward" = +Z in model space
  heading = 0

  // Orbit angle around the rover (mouse drag)
  private orbitAngle = 0
  private orbitPitch = 0.3 // slight downward look
  private isDragging = false
  private lastMouseX = 0
  private lastMouseY = 0

  // Smoothed camera
  private cameraPos = new THREE.Vector3()
  private cameraTarget = new THREE.Vector3()
  private initialized = false

  // Smoothed tilt quaternion
  private tiltQuat = new THREE.Quaternion()

  // Chassis shake
  private shakeTime = 0
  private isMoving = false

  constructor(
    rover: THREE.Group,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    heightAt: HeightFn,
    normalAt: NormalFn,
    config?: Partial<RoverConfig>,
  ) {
    this.rover = rover
    this.camera = camera
    this.canvas = canvas
    this.heightAt = heightAt
    this.normalAt = normalAt
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Rotate model 180° so it faces away from the default camera
    this.rover.rotation.y = Math.PI

    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onContextMenu = this.onContextMenu.bind(this)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    canvas.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('contextmenu', this.onContextMenu)
  }

  private onContextMenu(e: Event) {
    e.preventDefault()
  }

  private onMouseDown(e: MouseEvent) {
    this.isDragging = true
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY
  }

  private onMouseUp() {
    this.isDragging = false
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return
    const dx = e.clientX - this.lastMouseX
    const dy = e.clientY - this.lastMouseY
    this.lastMouseX = e.clientX
    this.lastMouseY = e.clientY

    this.orbitAngle -= dx * ORBIT_SENSITIVITY
    this.orbitPitch = Math.max(ORBIT_PITCH_MIN, Math.min(ORBIT_PITCH_MAX, this.orbitPitch + dy * ORBIT_SENSITIVITY))
  }

  private onKeyDown(e: KeyboardEvent) {
    this.keys.add(e.code)
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code)
  }

  update(delta: number) {
    // Keyboard turn (A/D or Arrow keys)
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.heading += this.config.turnSpeed * delta
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.heading -= this.config.turnSpeed * delta
    }

    // Movement direction based on heading
    const forward = new THREE.Vector3(
      -Math.sin(this.heading),
      0,
      -Math.cos(this.heading),
    )

    const moveDir = new THREE.Vector3()

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      moveDir.add(forward)
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      moveDir.sub(forward)
    }

    this.isMoving = moveDir.lengthSq() > 0

    if (this.isMoving) {
      moveDir.normalize()
      let nx = this.rover.position.x + moveDir.x * this.config.moveSpeed * delta
      let nz = this.rover.position.z + moveDir.z * this.config.moveSpeed * delta

      // Terrain bounds
      nx = Math.max(-TERRAIN_BOUNDARY, Math.min(TERRAIN_BOUNDARY, nx))
      nz = Math.max(-TERRAIN_BOUNDARY, Math.min(TERRAIN_BOUNDARY, nz))

      this.rover.position.x = nx
      this.rover.position.z = nz
    }

    // Ground follow — lerp rover Y to terrain height
    const groundY = this.heightAt(this.rover.position.x, this.rover.position.z)
    this.rover.position.y += (groundY - this.rover.position.y) * GROUND_LERP

    // Tilt rover to match terrain slope
    const normal = this.normalAt(this.rover.position.x, this.rover.position.z)
    const headingQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.heading + Math.PI,
    )
    const up = new THREE.Vector3(0, 1, 0)
    const tiltAxis = new THREE.Vector3().crossVectors(up, normal).normalize()
    const tiltAngle = Math.acos(Math.min(1, up.dot(normal)))
    const slopeQuat = new THREE.Quaternion()
    if (tiltAxis.lengthSq() > 0.001) {
      slopeQuat.setFromAxisAngle(tiltAxis, tiltAngle)
    }
    const targetQuat = slopeQuat.multiply(headingQuat)

    // Chassis shake when moving — bumpy terrain feel
    if (this.isMoving) {
      this.shakeTime += delta * 15
      const slope = 1 - Math.abs(normal.y) // rougher terrain = more shake
      const intensity = 0.012 + slope * 0.03
      const shakeX = Math.sin(this.shakeTime * 3.7) * intensity
      const shakeZ = Math.cos(this.shakeTime * 5.3) * intensity * 0.7
      const shakeY = Math.sin(this.shakeTime * 7.1) * intensity * 0.4
      const shakeQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(shakeX, shakeY, shakeZ),
      )
      targetQuat.multiply(shakeQuat)

      // Subtle vertical bounce
      this.rover.position.y += Math.sin(this.shakeTime * 6.3) * intensity * 0.3
    }

    this.tiltQuat.slerp(targetQuat, TILT_LERP)
    this.rover.quaternion.copy(this.tiltQuat)

    // Camera orbit around rover (orbit is independent of rover heading)
    const totalAngle = this.orbitAngle
    const camX = Math.sin(totalAngle) * CAMERA_DISTANCE * Math.cos(this.orbitPitch)
    const camZ = Math.cos(totalAngle) * CAMERA_DISTANCE * Math.cos(this.orbitPitch)
    const camY = this.rover.position.y + CAMERA_HEIGHT_OFFSET + Math.sin(this.orbitPitch) * CAMERA_DISTANCE * 0.5

    const desiredPos = new THREE.Vector3(
      this.rover.position.x + camX,
      camY,
      this.rover.position.z + camZ,
    )
    const desiredTarget = new THREE.Vector3(
      this.rover.position.x,
      this.rover.position.y + CAMERA_LOOK_HEIGHT_OFFSET,
      this.rover.position.z,
    )

    if (!this.initialized) {
      this.cameraPos.copy(desiredPos)
      this.cameraTarget.copy(desiredTarget)
      this.initialized = true
    }

    this.cameraPos.lerp(desiredPos, CAMERA_LERP)
    this.cameraTarget.lerp(desiredTarget, CAMERA_LERP)

    this.camera.position.copy(this.cameraPos)
    this.camera.lookAt(this.cameraTarget)
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
  }
}
