import * as THREE from 'three'
import type { SiteScene } from './SiteScene'
import type { InstrumentController } from './instruments'
import { RTGController, MastCamController, ChemCamController, SAMController, RoverWheelsController } from './instruments'
import { mastState } from './instruments/MastState'

const CAMERA_DISTANCE_DEFAULT = 8
const CAMERA_DISTANCE_MIN = 4
const CAMERA_DISTANCE_MAX = 18
const ZOOM_SENSITIVITY = 0.8
const CAMERA_HEIGHT_OFFSET = 3
const CAMERA_LOOK_HEIGHT_OFFSET = 1
const CAMERA_LERP = 0.08
const GROUND_LERP = 0.2
const TILT_LERP = 0.1
const ORBIT_SENSITIVITY = 0.005
const TERRAIN_BOUNDARY = 380

const ORBIT_PITCH_MIN = -0.3 // look up at sky
const ORBIT_PITCH_MAX = 1.3  // look down at ground

const WHEEL_SPIN_SPEED = 8       // radians per second at full speed
const STEER_ANGLE_MAX = 0.4      // max steering angle in radians (~23°)
const STEER_LERP = 0.15          // steering return-to-center smoothing
const MAST_PAN_MAX = 0.5         // max mast pan range (radians)
const MAST_TILT_MIN = -0.4       // look up
const MAST_TILT_MAX = 0.5        // look down
const MAST_LERP = 0.03           // smooth mast tracking
const INSTRUMENT_CAMERA_DISTANCE_MIN = 1.0
const INSTRUMENT_CAMERA_DISTANCE_MAX = 6
const INSTRUMENT_CAMERA_DISTANCE_DEFAULT = 1.5
const INSTRUMENT_CAMERA_LERP = 0.06
const INSTRUMENT_SHAKE_FACTOR = 0.25

/** Default seconds to keep chase cam after selecting an instrument before orbiting to it (0 = immediate). */
export const DEFAULT_INSTRUMENT_ZOOM_DELAY_SECONDS = 2

export interface RoverConfig {
  moveSpeed: number
  turnSpeed: number
  /**
   * Seconds to wait before moving the camera to the instrument orbit after selection
   * from driving only. Switching between instruments (or from active back to another slot)
   * snaps immediately. Set to 0 for immediate zoom from driving too. Activatable
   * instruments can press E to skip the delay.
   */
  instrumentZoomDelaySeconds?: number
}

const DEFAULT_CONFIG: RoverConfig = {
  moveSpeed: 5,
  turnSpeed: 2,
  instrumentZoomDelaySeconds: DEFAULT_INSTRUMENT_ZOOM_DELAY_SECONDS,
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
  private siteScene: SiteScene
  config: RoverConfig

  // Rover heading (Y rotation) — model rotated PI so "forward" = +Z in model space
  heading = 0

  // Orbit angle around the rover (mouse drag)
  private orbitAngle = Math.PI
  private orbitPitch = 0.3 // slight downward look
  private cameraDistance = CAMERA_DISTANCE_MIN
  private instrumentCameraDistance = INSTRUMENT_CAMERA_DISTANCE_DEFAULT
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
  /** True while W/S drive input requests movement (updated each frame). */
  isMoving = false

  // Wheel animation state
  private wheelAngle = 0
  private currentSteerAngle = 0

  // Mast tracking state
  private mastPanAngle = 0
  private mastTiltAngle = 0

  // Instrument mode
  mode: 'driving' | 'instrument' | 'active' = 'driving'
  activeInstrument: InstrumentController | null = null
  instruments: InstrumentController[] = []

  /** When set (e.g. to Vue `handleActivate`), Key E in instrument mode invokes the same flow as the Activate button (RTG confirm, etc.). */
  onInstrumentActivateRequest: (() => void) | null = null

  private instrumentZoomPending = false
  private instrumentZoomElapsed = 0

  constructor(
    rover: THREE.Group,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    heightAt: HeightFn,
    normalAt: NormalFn,
    config?: Partial<RoverConfig>,
    siteScene?: SiteScene,
  ) {
    this.rover = rover
    this.camera = camera
    this.canvas = canvas
    this.heightAt = heightAt
    this.normalAt = normalAt
    this.siteScene = siteScene!
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onContextMenu = this.onContextMenu.bind(this)
    this.onWheel = this.onWheel.bind(this)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    canvas.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private onContextMenu(e: Event) {
    e.preventDefault()
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()
    if (this.mode === 'active' && this.activeInstrument instanceof MastCamController) {
      this.activeInstrument.handleWheel(e.deltaY)
    } else if (this.mode === 'active' && this.activeInstrument instanceof ChemCamController) {
      this.activeInstrument.handleWheel(e.deltaY)
    } else if (this.mode === 'instrument') {
      if (this.instrumentZoomPending) {
        this.cameraDistance = Math.max(
          CAMERA_DISTANCE_MIN,
          Math.min(CAMERA_DISTANCE_MAX, this.cameraDistance + e.deltaY * 0.01 * ZOOM_SENSITIVITY),
        )
      } else {
        this.instrumentCameraDistance = Math.max(
          INSTRUMENT_CAMERA_DISTANCE_MIN,
          Math.min(INSTRUMENT_CAMERA_DISTANCE_MAX, this.instrumentCameraDistance + e.deltaY * 0.01 * ZOOM_SENSITIVITY),
        )
      }
    } else {
      this.cameraDistance = Math.max(
        CAMERA_DISTANCE_MIN,
        Math.min(CAMERA_DISTANCE_MAX, this.cameraDistance + e.deltaY * 0.01 * ZOOM_SENSITIVITY),
      )
    }
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

    // Instrument hotkeys (only when rover is ready)
    if (this.siteScene.roverState !== 'ready') return

    if (e.code === 'KeyE' && !e.repeat) {
      if (this.mode === 'instrument' && this.activeInstrument?.canActivate) {
        this.instrumentZoomPending = false
        if (this.onInstrumentActivateRequest) {
          this.onInstrumentActivateRequest()
        } else {
          this.enterActiveMode()
        }
        e.preventDefault()
        return
      }
    }

    if (e.code === 'Escape') {
      if (this.mode === 'active') {
        if (this.activeInstrument instanceof MastCamController) {
          // Carry mast look direction into orbit angle, skip instrument view
          const mc = this.activeInstrument
          this.orbitAngle = this.heading + mc.panAngle + Math.PI
          this.orbitPitch = Math.max(0.1, mc.tiltAngle + 0.3)
          mc.deactivate()
          this.camera.fov = 50
          this.camera.updateProjectionMatrix()
          this.mode = 'driving'
          this.activeInstrument = null
          return
        }
        if (this.activeInstrument instanceof ChemCamController) {
          const cc = this.activeInstrument
          this.orbitAngle = this.heading + cc.panAngle + Math.PI
          this.orbitPitch = Math.max(0.1, cc.tiltAngle + 0.3)
          cc.deactivate()
          this.camera.fov = 50
          this.camera.updateProjectionMatrix()
          this.mode = 'driving'
          this.activeInstrument = null
          return
        }
        if (this.activeInstrument instanceof SAMController) {
          this.activeInstrument.deactivate()
        }
        this.mode = 'instrument'
        return
      }
      if (this.mode === 'instrument') {
        this.instrumentZoomPending = false
        this.instrumentZoomElapsed = 0
        this.mode = 'driving'
        this.activeInstrument = null
        return
      }
    }

    // Map keys to instrument slots: Digit1-9, R=10, T=11
    const LETTER_SLOTS: Record<string, number> = { KeyR: 10, KeyT: 11, KeyB: 12 }
    const slotMatch = e.code.match(/^Digit([1-9])$/)
    const slot = slotMatch ? parseInt(slotMatch[1]) : LETTER_SLOTS[e.code]
    if (slot !== undefined) {
      const instrument = this.instruments.find(i => i.slot === slot)
      if (!instrument || instrument === this.activeInstrument) return

      // When RTG overdrive/cooldown is active, only RTG itself can be selected
      const rtg = this.instruments.find(i => i instanceof RTGController) as RTGController | undefined
      if (rtg?.instrumentsLocked && instrument !== rtg) return

      // Deactivate current instrument if switching away from active mode
      if (this.mode === 'active') {
        if (this.activeInstrument instanceof MastCamController) {
          this.activeInstrument.deactivate()
        } else if (this.activeInstrument instanceof ChemCamController) {
          this.activeInstrument.deactivate()
        } else if (this.activeInstrument instanceof SAMController) {
          this.activeInstrument.deactivate()
        }
        this.camera.fov = 50
        this.camera.updateProjectionMatrix()
      }

      this.setInstrument(instrument)
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code)
  }

  activateInstrument(slot: number | null): void {
    // Deactivate MastCam if leaving it
    if (this.activeInstrument instanceof MastCamController && (slot === null || slot !== this.activeInstrument.slot)) {
      this.activeInstrument.deactivate()
      this.camera.fov = 50
      this.camera.updateProjectionMatrix()
    }
    // Deactivate ChemCam if leaving it
    if (this.activeInstrument instanceof ChemCamController && (slot === null || slot !== this.activeInstrument.slot)) {
      this.activeInstrument.deactivate()
      this.camera.fov = 50
      this.camera.updateProjectionMatrix()
    }
    // Deactivate SAM if leaving it
    if (this.activeInstrument instanceof SAMController && (slot === null || slot !== this.activeInstrument.slot)) {
      this.activeInstrument.deactivate()
    }
    if (slot === null) {
      this.instrumentZoomPending = false
      this.instrumentZoomElapsed = 0
      this.mode = 'driving'
      this.activeInstrument = null
      return
    }
    const instrument = this.instruments.find(i => i.slot === slot)
    if (instrument) {
      this.setInstrument(instrument)
    }
  }

  private setInstrument(instrument: InstrumentController): void {
    // Zoom delay only when opening an instrument from driving; switching slots snaps immediately.
    const fromDriving = this.mode === 'driving'
    this.mode = 'instrument'
    this.activeInstrument = instrument
    this.instrumentCameraDistance = INSTRUMENT_CAMERA_DISTANCE_DEFAULT
    this.instrumentZoomElapsed = 0
    const delaySec = this.config.instrumentZoomDelaySeconds ?? 0
    if (delaySec > 0 && fromDriving) {
      this.instrumentZoomPending = true
      // Keep current chase orbit until delay elapses or user activates / UI zoom completes
    } else {
      this.instrumentZoomPending = false
      this.orbitAngle = instrument.viewAngle + this.heading
      this.orbitPitch = instrument.viewPitch
    }
  }

  enterActiveMode(): void {
    if (this.mode !== 'instrument' || !this.activeInstrument?.canActivate) return
    // Block activation for non-RTG instruments during overdrive/cooldown
    const rtg = this.instruments.find(i => i instanceof RTGController) as RTGController | undefined
    if (rtg?.instrumentsLocked && this.activeInstrument !== rtg) return

    this.instrumentZoomPending = false

    // Passive payloads (DAN, REMS, RAD, comms): ACTIVATE toggles bus power, stay in instrument UI
    if (this.activeInstrument.passiveSubsystemOnly) {
      this.activeInstrument.togglePassiveSubsystemEnabled()
      return
    }

    this.mode = 'active'

    // Open SAM covers on activation
    if (this.activeInstrument instanceof SAMController) {
      this.activeInstrument.openCovers()
    }
  }

  update(delta: number) {
    // During descent/deployment, only update camera — no movement or wheel control
    if (this.siteScene.roverState !== 'ready') {
      this.updateCamera(delta)
      return
    }

    // Mast power: one frame flag — MastCam/ChemCam set in handleInput when pan/tilt keys held
    mastState.actuatorKeysHeld = false

    // Always tick RTG (overdrive/cooldown/recharge run regardless of mode)
    const rtgInst = this.instruments.find(i => i.id === 'rtg')
    if (rtgInst) rtgInst.update(delta)

    // Always tick SAM (cover animation runs regardless of mode)
    const samInst = this.instruments.find(i => i.id === 'sam')
    if (samInst && samInst !== this.activeInstrument) samInst.update(delta)

    // ChemCam laser/integration continues if the player leaves active mode (e.g. ESC mid-sequence)
    const chemCam = this.instruments.find((i): i is ChemCamController => i instanceof ChemCamController)
    if (chemCam?.isSequenceAdvancing) {
      const activeChemCam = this.mode === 'active' && this.activeInstrument === chemCam
      const instrumentZoomTicksChemCam =
        this.mode === 'instrument' && this.instrumentZoomPending && this.activeInstrument === chemCam
      if (!activeChemCam && !instrumentZoomTicksChemCam) {
        chemCam.update(delta)
      }
    }

    if (this.mode === 'instrument' && this.instrumentZoomPending && this.activeInstrument) {
      const delaySec = this.config.instrumentZoomDelaySeconds ?? 0
      if (delaySec > 0) {
        this.instrumentZoomElapsed += delta
        if (this.instrumentZoomElapsed >= delaySec) {
          this.instrumentZoomPending = false
          this.orbitAngle = this.activeInstrument.viewAngle + this.heading
          this.orbitPitch = this.activeInstrument.viewPitch
        }
      }
      this.activeInstrument.update(delta)
    }

    // In active mode, route input to instrument and skip rover controls
    if (this.mode === 'active' && this.activeInstrument) {
      this.activeInstrument.handleInput(this.keys, delta)
      if (this.activeInstrument !== rtgInst) this.activeInstrument.update(delta)
      this.updateCamera(delta)
      return
    }

    const rtgCtrl = rtgInst instanceof RTGController ? rtgInst : null
    const drivingDisengaged = rtgCtrl?.isDrivingDisengaged ?? false
    const wheelsCtrl = this.instruments.find((i): i is RoverWheelsController => i instanceof RoverWheelsController)
    const wheelsMobilityDead = wheelsCtrl != null && !wheelsCtrl.operational

    // Keyboard turn + translation (WASD) — disabled during RTG power shunt or broken wheels
    let driveSign = 0
    let steerSign = 0
    let moveDir = new THREE.Vector3()

    if (!drivingDisengaged && !wheelsMobilityDead) {
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
        this.heading += this.config.turnSpeed * delta
      }
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
        this.heading -= this.config.turnSpeed * delta
      }

      const forward = new THREE.Vector3(
        -Math.sin(this.heading),
        0,
        -Math.cos(this.heading),
      )

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
        moveDir.sub(forward)
      }
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
        moveDir.add(forward)
      }

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) driveSign += 1
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) driveSign -= 1
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steerSign += 1
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steerSign -= 1
    }

    this.isMoving = !drivingDisengaged && moveDir.lengthSq() > 0

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

    // Animate wheels (read dynamically — set after deployment finishes)
    const wheels = this.siteScene.roverWheels
    if (wheels) {
      // Spin all 6 wheels based on drive direction
      this.wheelAngle += driveSign * WHEEL_SPIN_SPEED * delta
      for (const wheel of wheels.wheels) {
        wheel.rotation.x = this.wheelAngle
      }

      // Steer front and rear wheels (Curiosity steers front + rear, not middle)
      const targetSteer = steerSign * STEER_ANGLE_MAX
      this.currentSteerAngle += (targetSteer - this.currentSteerAngle) * STEER_LERP
      // Front wheels steer in the turn direction
      if (wheels.steerFL) wheels.steerFL.rotation.y = this.currentSteerAngle
      if (wheels.steerFR) wheels.steerFR.rotation.y = this.currentSteerAngle
      // Rear wheels steer opposite (like real Curiosity)
      if (wheels.steerBL) wheels.steerBL.rotation.y = -this.currentSteerAngle
      if (wheels.steerBR) wheels.steerBR.rotation.y = -this.currentSteerAngle
    }

    // Animate mast — tracks camera orbit angle and steering
    // Freeze mast when viewing mast-mounted instruments (slots 1-2) to prevent feedback loops
    const mastFrozen = this.mode === 'instrument' && this.activeInstrument !== null && this.activeInstrument.slot <= 2
    const mast = this.siteScene.roverMast
    if (mast && !mastFrozen) {
      // Pan: driven only by A/D steering
      const targetPan = steerSign * MAST_PAN_MAX
      this.mastPanAngle += (targetPan - this.mastPanAngle) * MAST_LERP
      const panDelta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.mastPanAngle)
      mast.pan.quaternion.copy(mast.panBaseQuat).multiply(panDelta)

      // Tilt: follow camera pitch
      const targetTilt = Math.max(MAST_TILT_MIN, Math.min(MAST_TILT_MAX, this.orbitPitch * 1.0))
      this.mastTiltAngle += (targetTilt - this.mastTiltAngle) * MAST_LERP
      const tiltDelta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.mastTiltAngle)
      mast.tilt.quaternion.copy(mast.tiltBaseQuat).multiply(tiltDelta)
    }

    // Ground follow — lerp rover Y to terrain height
    const groundY = this.heightAt(this.rover.position.x, this.rover.position.z)
    this.rover.position.y += (groundY - this.rover.position.y) * GROUND_LERP

    // Tilt rover to match terrain slope
    const normal = this.normalAt(this.rover.position.x, this.rover.position.z)
    const headingQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.heading,
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
      const shakeScale = this.mode === 'instrument' ? INSTRUMENT_SHAKE_FACTOR : 1.0
      const intensity = (0.012 + slope * 0.03) * shakeScale
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

    this.updateCamera(delta)
  }

  private updateCamera(_delta: number) {
    // Smoothly zoom out to default distance after deployment
    if (this.siteScene.roverState === 'ready' && this.mode === 'driving' && this.cameraDistance < CAMERA_DISTANCE_DEFAULT) {
      this.cameraDistance += (CAMERA_DISTANCE_DEFAULT - this.cameraDistance) * 0.02
    }

    let desiredPos: THREE.Vector3
    let desiredTarget: THREE.Vector3

    if (
      this.mode === 'active' &&
      this.activeInstrument instanceof MastCamController
    ) {
      // MastCam first-person: camera at mast head, looking along mast direction
      const mc = this.activeInstrument
      mc.update(_delta)
      desiredPos = mc.mastWorldPos.clone()
      desiredTarget = mc.mastWorldPos.clone().add(mc.mastLookDir.clone().multiplyScalar(10))
      this.camera.fov = mc.fov
      this.camera.updateProjectionMatrix()
    } else if (
      this.mode === 'active' &&
      this.activeInstrument instanceof ChemCamController
    ) {
      // ChemCam first-person: same mast camera, different instrument
      const cc = this.activeInstrument
      cc.update(_delta)
      desiredPos = cc.mastWorldPos.clone()
      desiredTarget = cc.mastWorldPos.clone().add(cc.mastLookDir.clone().multiplyScalar(10))
      this.camera.fov = cc.fov
      this.camera.updateProjectionMatrix()
    } else if (
      ((this.mode === 'instrument' && !this.instrumentZoomPending) || this.mode === 'active') &&
      this.activeInstrument?.node
    ) {
      // Camera orbits around the instrument node (MastCam/ChemCam only hit this in instrument mode — active uses branches above)
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

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.instruments.forEach(i => i.dispose())
  }
}
