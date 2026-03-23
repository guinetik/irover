import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import { RockTargeting, type TargetResult } from './RockTargeting'
import { LaserDrill } from './LaserDrill'
import { useInventory } from '@/composables/useInventory'
import type { CollectedRockSample } from '@/types/inventory'
import type { RockTypeId } from '@/three/terrain/RockTypes'

const ARM_SWING_SPEED = 0.8
const ARM_EXTEND_SPEED = 0.6
const ARM_SWING_MAX = 1.0
const ARM_EXTEND_MIN = -0.3
const ARM_EXTEND_MAX = 0.8
const ARM_LERP = 0.1

export class APXSController extends InstrumentController {
  readonly id = 'apxs'
  readonly name = 'APXS'
  readonly slot = 3
  readonly focusNodeName = 'APXS'
  readonly focusOffset = new THREE.Vector3(0.3, 0.1, 0.3)
  readonly viewAngle = Math.PI * 0.4
  readonly viewPitch = 0.3
  override readonly canActivate = true

  private shoulder: THREE.Object3D | null = null
  private elbow: THREE.Object3D | null = null
  private drillNode: THREE.Object3D | null = null
  private shoulderBaseQuat = new THREE.Quaternion()
  private elbowBaseQuat = new THREE.Quaternion()

  private swingAngle = 0
  private extendAngle = 0
  private targetSwing = 0
  private targetExtend = 0

  targeting: RockTargeting | null = null
  private drill: LaserDrill | null = null
  private drilling = false  // E key held
  private currentTarget: TargetResult | null = null

  // 3D target indicator
  private targetDot: THREE.Mesh | null = null
  private targetDotMat: THREE.MeshBasicMaterial | null = null
  /** World position of current target point — read by view for screen projection */
  readonly targetWorldPos = new THREE.Vector3()

  private inventory = useInventory()

  /** Set after each successful sample collection; read + cleared by the view layer */
  lastCollected: CollectedRockSample | null = null
  /** Set when collection fails (e.g. cargo full); read + cleared by the view layer */
  lastInventoryError: string | null = null

  /** Updated each frame: pointed rock can still accept a worst-case mass sample */
  canCollectCurrentTarget = false

  get drillProgress(): number { return this.drill?.progress ?? 0 }
  get isDrilling(): boolean { return this.drilling && (this.drill?.isDrilling ?? false) }
  get hasTarget(): boolean { return this.currentTarget !== null }
  get isInventoryFull(): boolean { return this.inventory.isFull.value }

  /** Set drill duration multiplier (e.g. 1.25 in COLD thermal zone) */
  set drillDurationMultiplier(v: number) {
    if (this.drill) this.drill.durationMultiplier = v
  }

  override attach(rover: THREE.Group): void {
    super.attach(rover)
    this.shoulder = rover.getObjectByName('arm_01001') ?? null
    this.elbow = rover.getObjectByName('arm_02001') ?? null
    this.drillNode = rover.getObjectByName('Drill') ?? null

    if (this.shoulder) this.shoulderBaseQuat.copy(this.shoulder.quaternion)
    if (this.elbow) this.elbowBaseQuat.copy(this.elbow.quaternion)

    if (!this.shoulder) console.warn('[APXS] arm_01001 not found')
    if (!this.elbow) console.warn('[APXS] arm_02001 not found')
    if (!this.drillNode) console.warn('[APXS] Drill node not found')
  }

  initGameplay(scene: THREE.Scene, _camera: THREE.PerspectiveCamera, rocks: THREE.Mesh[]): void {
    this.targeting = new RockTargeting()
    this.targeting.setRocks(rocks)
    this.drill = new LaserDrill(scene)

    // 3D target dot
    this.targetDotMat = new THREE.MeshBasicMaterial({
      color: 0xe05030,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    })
    const dotGeo = new THREE.SphereGeometry(0.03, 8, 8)
    this.targetDot = new THREE.Mesh(dotGeo, this.targetDotMat)
    this.targetDot.visible = false
    this.targetDot.renderOrder = 999
    scene.add(this.targetDot)
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

    // E key triggers drill
    this.drilling = keys.has('KeyE')
  }

  override update(delta: number): void {
    this.swingAngle += (this.targetSwing - this.swingAngle) * ARM_LERP
    this.extendAngle += (this.targetExtend - this.extendAngle) * ARM_LERP

    if (this.shoulder) {
      const swingDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), this.swingAngle
      )
      this.shoulder.quaternion.copy(this.shoulderBaseQuat).multiply(swingDelta)
    }

    if (this.elbow) {
      const extendDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), this.extendAngle
      )
      this.elbow.quaternion.copy(this.elbowBaseQuat).multiply(extendDelta)
    }

    if (this.targeting) {
      const drillPos = this.getDrillWorldPosition()
      this.currentTarget = this.targeting.castFromDrillHead(drillPos)
    }

    let canCollect = false
    if (this.currentTarget) {
      const rt = (this.currentTarget.rock.userData.rockType as RockTypeId) ?? 'basalt'
      canCollect = this.inventory.canFitRockSampleMax(rt)
    }
    this.canCollectCurrentTarget = canCollect

    // Update 3D target dot
    if (this.targetDot && this.targetDotMat) {
      if (this.currentTarget) {
        this.targetDot.visible = true
        this.targetDot.position.copy(this.currentTarget.point)
        this.targetWorldPos.copy(this.currentTarget.point)
        this.targetDotMat.color.setHex(canCollect ? 0x5dc9a5 : 0xe05030)
      } else {
        this.targetDot.visible = false
        // Place at drill head when no target
        this.targetWorldPos.copy(this.getDrillWorldPosition())
      }
    }

    const drillActive = Boolean(this.drilling && this.currentTarget && canCollect)

    if (this.drill) {
      if (drillActive) {
        const drillOrigin = this.getDrillWorldPosition()
        if (!this.drill.isDrilling) {
          this.drill.startDrill(drillOrigin, this.currentTarget!.point)
        } else {
          this.drill.updateTarget(drillOrigin, this.currentTarget!.point)
        }
      } else if (this.drill.isDrilling && !this.drilling) {
        this.drill.cancelDrill()
      }

      this.drill.update(delta, drillActive)

      if (this.drill.isComplete && this.currentTarget) {
        this.collectSample(this.currentTarget.rock)
        this.drill.isComplete = false
      }
    }
  }

  private getDrillWorldPosition(): THREE.Vector3 {
    if (!this.drillNode) return this.getWorldFocusPosition()
    const pos = new THREE.Vector3()
    this.drillNode.getWorldPosition(pos)
    return pos
  }

  private collectSample(rock: THREE.Mesh): void {
    const rockType = (rock.userData.rockType as RockTypeId) ?? 'basalt'
    const res = this.inventory.addRockSample(rockType, rock.uuid)
    if (res.ok) {
      this.targeting?.depleteRock(rock)
      this.lastCollected = res.payload
    } else {
      this.lastInventoryError = res.message
    }
  }

  setRoverPosition(pos: THREE.Vector3): void {
    this.targeting?.setRoverPosition(pos)
  }

  override dispose(): void {
    this.drill?.dispose()
    this.targeting?.dispose()
    if (this.targetDot) {
      this.targetDot.geometry.dispose()
      this.targetDotMat?.dispose()
    }
  }
}
