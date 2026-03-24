import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

const ARM_SWING_SPEED = 0.8
const ARM_EXTEND_SPEED = 0.6
const ARM_SWING_MAX = 1.0
const ARM_EXTEND_MIN = -0.3
const ARM_EXTEND_MAX = 0.8
const ARM_LERP = 0.1

/** Turret head rotation angle (radians) to swing APXS from side to front. Tweak to taste. */
const TURRET_ROTATION = (225 / 180) * Math.PI
const TURRET_LERP = 0.06

/**
 * Alpha Particle X-ray Spectrometer on the arm turret (slot 4). Stub: arm aim only; no contact
 * science simulation yet. Power rises when ACTIVATE'd (active mode) vs orbit card idle.
 *
 * When activated, the turret head (`arm_05_head001`) rotates so the APXS sensor faces forward.
 * When deactivated, the head lerps back to its rest position (drill facing front).
 */
export class APXSController extends InstrumentController {
  readonly id = 'apxs'
  readonly name = 'APXS'
  readonly slot = 4
  readonly focusNodeName = 'APXS'
  readonly focusOffset = new THREE.Vector3(0.3, 0.1, 0.3)
  readonly viewAngle = Math.PI * 0.4
  readonly viewPitch = 0.3
  override readonly canActivate = true
  /** Turret / detector idle while the card is open (orbit). */
  override readonly selectionIdlePowerW = 5
  /** Contact-science style load stub while active (no sample logic yet). */
  private static readonly ACTIVE_BUS_W = 18

  private shoulder: THREE.Object3D | null = null
  private elbow: THREE.Object3D | null = null
  private shoulderBaseQuat = new THREE.Quaternion()
  private elbowBaseQuat = new THREE.Quaternion()

  private turretHead: THREE.Object3D | null = null
  private turretBaseQuat = new THREE.Quaternion()
  private turretAngle = 0
  /** True while this instrument is the active one — set by RoverController lifecycle. */
  isActive = false

  private swingAngle = 0
  private extendAngle = 0
  private targetSwing = 0
  private targetExtend = 0

  override attach(rover: THREE.Group): void {
    super.attach(rover)
    this.shoulder = rover.getObjectByName('arm_01001') ?? null
    this.elbow = rover.getObjectByName('arm_02001') ?? null
    this.turretHead = rover.getObjectByName('arm_05_head001') ?? null

    if (this.shoulder) this.shoulderBaseQuat.copy(this.shoulder.quaternion)
    if (this.elbow) this.elbowBaseQuat.copy(this.elbow.quaternion)
    if (this.turretHead) this.turretBaseQuat.copy(this.turretHead.quaternion)

    if (!this.shoulder) console.warn('[APXS] arm_01001 not found')
    if (!this.elbow) console.warn('[APXS] arm_02001 not found')
    if (!this.turretHead) console.warn('[APXS] arm_05_head001 not found')
    if (!this.node) console.warn('[APXS] APXS node not found')
  }

  override getInstrumentBusPowerW(phase: 'instrument' | 'active'): number {
    return phase === 'active' ? APXSController.ACTIVE_BUS_W : 0
  }

  override handleInput(keys: Set<string>, delta: number): void {
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      this.targetSwing = Math.min(ARM_SWING_MAX, this.targetSwing + ARM_SWING_SPEED * delta)
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      this.targetSwing = Math.max(-ARM_SWING_MAX, this.targetSwing - ARM_SWING_SPEED * delta)
    }
    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      this.targetExtend = Math.min(ARM_EXTEND_MAX, this.targetExtend + ARM_EXTEND_SPEED * delta)
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      this.targetExtend = Math.max(ARM_EXTEND_MIN, this.targetExtend - ARM_EXTEND_SPEED * delta)
    }
  }

  override update(delta: number): void {
    // Arm swing/extend (only meaningful when active, but runs always for lerp-back)
    this.swingAngle += (this.targetSwing - this.swingAngle) * ARM_LERP
    this.extendAngle += (this.targetExtend - this.extendAngle) * ARM_LERP

    if (this.shoulder) {
      const swingDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.swingAngle,
      )
      this.shoulder.quaternion.copy(this.shoulderBaseQuat).multiply(swingDelta)
    }

    if (this.elbow) {
      const extendDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        this.extendAngle,
      )
      this.elbow.quaternion.copy(this.elbowBaseQuat).multiply(extendDelta)
    }

    // Turret head rotation: lerp toward target based on active state
    const targetAngle = this.isActive ? TURRET_ROTATION : 0
    this.turretAngle += (targetAngle - this.turretAngle) * TURRET_LERP

    if (this.turretHead) {
      const turretDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        this.turretAngle,
      )
      this.turretHead.quaternion.copy(this.turretBaseQuat).multiply(turretDelta)
    }
  }
}
