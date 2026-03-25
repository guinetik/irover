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

/**
 * Arm-mounted powder drill (slot 3): laser VFX and sampling use the GLTF `Drill` node.
 * Shares the arm with APXS (slot 4) on the real rover; here APXS is a separate tool.
 */
export class DrillController extends InstrumentController {
  readonly id = 'drill'
  readonly name = 'Drill'
  readonly slot = 3
  readonly focusNodeName = 'Drill'
  readonly focusOffset = new THREE.Vector3(0.3, 0.1, 0.3)
  readonly viewAngle = Math.PI * 0.4
  readonly viewPitch = 0.3
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.25
  override readonly repairComponentId = 'engineering-components'
  override readonly usageDecayChance = 0.25
  override readonly usageDecayAmount = 1.5
  /** Arm electronics / turret — sustained drilling is billed separately on the power tick. */
  override readonly selectionIdlePowerW = 6

  private shoulder: THREE.Object3D | null = null
  private elbow: THREE.Object3D | null = null
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

  /** Trace element drops from last collection (read + cleared by view) */
  lastTraceDrops: { element: string; label: string }[] | null = null

  get drillProgress(): number { return this.drill?.progress ?? 0 }
  get isDrilling(): boolean { return this.drilling && (this.drill?.isDrilling ?? false) }
  get hasTarget(): boolean { return this.currentTarget !== null }
  get isInventoryFull(): boolean { return this.inventory.isFull.value }

  /** Instrument accuracy modifier — scales trace element drop count (set each frame by tick handler). */
  accuracyMod = 1.0

  /** Set drill duration multiplier (e.g. 1.25 in COLD thermal zone) */
  set drillDurationMultiplier(v: number) {
    if (this.drill) this.drill.durationMultiplier = v
  }

  override attach(rover: THREE.Group): void {
    super.attach(rover)
    this.shoulder = rover.getObjectByName('arm_01001') ?? null
    this.elbow = rover.getObjectByName('arm_02001') ?? null

    if (this.shoulder) this.shoulderBaseQuat.copy(this.shoulder.quaternion)
    if (this.elbow) this.elbowBaseQuat.copy(this.elbow.quaternion)

    if (!this.shoulder) console.warn('[Drill] arm_01001 not found')
    if (!this.elbow) console.warn('[Drill] arm_02001 not found')
    if (!this.node) console.warn('[Drill] Drill node not found')
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
      // MastCam scan buff: 40% faster drilling on tagged rocks
      if (this.currentTarget) {
        const scanned = this.currentTarget.rock.userData.mastcamScanned === true
        this.drill.scanSpeedMult = scanned ? 0.6 : 1.0
      }

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
    if (!this.node) return new THREE.Vector3()
    const pos = new THREE.Vector3()
    this.node.getWorldPosition(pos)
    return pos
  }

  private collectSample(rock: THREE.Mesh): void {
    const rockType = (rock.userData.rockType as RockTypeId) ?? 'basalt'
    const chemcamAnalyzed = rock.userData.chemcamAnalyzed === true
    const apxsAnalyzed = rock.userData.apxsAnalyzed === true

    // Stacking weight multipliers: ChemCam +30%, APXS +20%
    let weightMult = 1.0
    if (chemcamAnalyzed) weightMult += 0.3
    if (apxsAnalyzed) weightMult += 0.2
    const res = this.inventory.addRockSample(rockType, rock.uuid, weightMult)
    if (res.ok) {
      this.targeting?.depleteRock(rock)
      this.lastCollected = res.payload
      this.rollUsageDecay()

      // ChemCam trace element drops — pick from detected peaks
      this.lastTraceDrops = null
      if (chemcamAnalyzed) {
        const peaks = rock.userData.chemcamPeaks as { element: string }[] | undefined
        if (peaks && peaks.length > 0) {
          const drops: { element: string; label: string }[] = []
          // Drop 1-3 random identified elements (skip "??")
          const identified = peaks.filter(p => p.element !== '??')
          const dropCount = Math.min(identified.length, 1 + Math.floor(Math.random() * 3 * this.accuracyMod))
          const shuffled = [...identified].sort(() => Math.random() - 0.5)
          for (let i = 0; i < dropCount; i++) {
            const el = shuffled[i].element
            const traceRes = this.inventory.addTrace(el)
            if (traceRes.ok) {
              drops.push({ element: el, label: `${el} trace` })
            }
          }
          if (drops.length > 0) this.lastTraceDrops = drops
        }
      }

      // APXS bonus trace drops — from surface composition dominant elements
      if (apxsAnalyzed) {
        const apxsEls = rock.userData.apxsElements as string[] | undefined
        if (apxsEls && apxsEls.length > 0) {
          const apxsDrops: { element: string; label: string }[] = []
          // Drop 1-2 dominant surface elements
          const dropCount = Math.min(apxsEls.length, 1 + Math.floor(Math.random() * 2 * this.accuracyMod))
          const shuffled = [...apxsEls].sort(() => Math.random() - 0.5)
          for (let i = 0; i < dropCount; i++) {
            const el = shuffled[i]
            const traceRes = this.inventory.addTrace(el)
            if (traceRes.ok) {
              apxsDrops.push({ element: el, label: `${el} trace (APXS)` })
            }
          }
          if (apxsDrops.length > 0) {
            this.lastTraceDrops = [...(this.lastTraceDrops ?? []), ...apxsDrops]
          }
        }
      }
    } else {
      this.lastInventoryError = res.message
    }
  }

  setRoverPosition(pos: THREE.Vector3): void {
    this.targeting?.setRoverPosition(pos)
  }

  /**
   * Stops drilling and removes beam/spark VFX — call when leaving active mode or clearing selection
   * (e.g. sleep mode, Escape) so {@link LaserDrill} is not left frozen without {@link update} ticks.
   */
  deactivate(): void {
    this.drilling = false
    this.drill?.cancelDrill()
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
