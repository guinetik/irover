import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

const ARM_SWING_SPEED = 0.8
const ARM_EXTEND_SPEED = 0.6
const ARM_SWING_MAX = 1.0
const ARM_EXTEND_MIN = -0.3
const ARM_EXTEND_MAX = 0.8
const ARM_LERP = 0.1

/**
 * Alpha Particle X-ray Spectrometer on the arm turret (slot 4). Stub: arm aim only; no contact
 * science simulation yet. Power rises when ACTIVATE’d (active mode) vs orbit card idle.
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

  private swingAngle = 0
  private extendAngle = 0
  private targetSwing = 0
  private targetExtend = 0

  override attach(rover: THREE.Group): void {
    super.attach(rover)
    this.shoulder = rover.getObjectByName('arm_01001') ?? null
    this.elbow = rover.getObjectByName('arm_02001') ?? null

    if (this.shoulder) this.shoulderBaseQuat.copy(this.shoulder.quaternion)
    if (this.elbow) this.elbowBaseQuat.copy(this.elbow.quaternion)

    if (!this.shoulder) console.warn('[APXS] arm_01001 not found')
    if (!this.elbow) console.warn('[APXS] arm_02001 not found')
    if (!this.node) console.warn('[APXS] APXS node not found')
  }

  override getInstrumentBusPowerW(phase: 'instrument' | 'active'): number {
    return phase === 'active' ? APXSController.ACTIVE_BUS_W : this.selectionIdlePowerW
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
  }
}
