import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import {
  danPassiveHitProbability,
  danSignalQualityLabel,
  danWaterConfirmChance,
} from '@/lib/neutron/danSampling'
import type { InstrumentTier } from '@/lib/hazards'

// --- Sampling ---
const SAMPLE_INTERVAL_MOVING = 3.0
const SAMPLE_INTERVAL_STATIC = 5.0
const MIN_MOVE_DIST = 0.5

export interface DANHit {
  worldPosition: THREE.Vector3
  signalStrength: number
  timestamp: number
}

export type DANProspectPhase = 'idle' | 'drive-to-zone' | 'initiating' | 'prospecting' | 'complete'

export class DANController extends InstrumentController {
  readonly id = 'dan'
  readonly name = 'DAN'
  readonly slot = 5
  readonly canActivate = true
  override readonly passiveDecayPerSol = 0.40
  override readonly repairComponentId = 'science-components'
  override readonly tier: InstrumentTier = 'sensitive'
  override readonly usageDecayChance = 0.15
  override readonly usageDecayAmount = 0.8
  readonly billsPassiveBackgroundPower = true
  readonly passiveSubsystemOnly = true
  /** Higher bus draw than REMS/RAD — start STANDBY until the player ACTIVATEs. */
  override passiveSubsystemEnabled = false
  readonly focusNodeName = 'DAN_L'        // DAN detector panel on rover body
  readonly altNodeNames = ['DAN_R']
  readonly focusOffset = new THREE.Vector3(0.0, 0.3, 0.0)
  readonly viewAngle = Math.PI * 0.5
  readonly viewPitch = 0.15
  readonly selectionIdlePowerW = 10
  override get selectionHighlightColor(): number | null { return 0x44ccff }

  // --- Sampling state ---
  private sampleTimer = 0
  private lastSamplePos = new THREE.Vector3()
  totalSamples = 0
  totalHits = 0

  // --- Site priors (set by view each frame) ---
  waterIceIndex = 0.1
  featureType = 'plain'

  // --- Hit state ---
  pendingHit: DANHit | null = null
  hitConsumed = false

  // --- Prospect state ---
  prospectPhase: DANProspectPhase = 'idle'
  prospectProgress = 0
  prospectComplete = false
  waterConfirmed = false
  drillSitePosition: THREE.Vector3 | null = null
  reservoirQuality = 0
  prospectStrength = 0
  /** Instrument accuracy modifier from player profile (1.0 = baseline). */
  accuracyMod = 1.0
  /** Analysis speed modifier from player profile (1.0 = baseline, >1 = faster). */
  analysisSpeedMod = 1.0

  // --- Rover state (set by view each frame) ---
  private roverPos = new THREE.Vector3()
  roverMoving = false

  setRoverState(pos: THREE.Vector3, moving: boolean): void {
    this.roverPos.copy(pos)
    this.roverMoving = moving
  }

  /** Force off (sleep mode / power loss) */
  forceOff(): void {
    this.passiveSubsystemEnabled = false
    if (this.prospectPhase === 'prospecting' || this.prospectPhase === 'initiating') {
      this.prospectPhase = 'idle'
      this.prospectProgress = 0
    }
  }

  override update(delta: number): void {
    if (!this.passiveSubsystemEnabled) return
    this.tickSampling(delta)
  }

  private tickSampling(delta: number): void {
    const dist = this.roverPos.distanceTo(this.lastSamplePos)
    const isMoving = dist > MIN_MOVE_DIST
    const interval = (isMoving ? SAMPLE_INTERVAL_MOVING : SAMPLE_INTERVAL_STATIC) / this.analysisSpeedMod

    this.sampleTimer += delta
    if (this.sampleTimer < interval) return
    this.sampleTimer = 0
    if (isMoving) this.lastSamplePos.copy(this.roverPos)

    this.totalSamples++

    const p = danPassiveHitProbability(this.waterIceIndex, this.featureType)

    if (Math.random() < p) {
      const strength = Math.min(1.0, Math.max(0.3,
        0.3 + Math.random() * 0.5 + this.waterIceIndex * 0.15,
      ))
      this.pendingHit = {
        worldPosition: this.roverPos.clone(),
        signalStrength: strength,
        timestamp: Date.now(),
      }
      this.hitConsumed = false
      this.totalHits++
    }
  }

  static qualityLabel(strength: number): string {
    return danSignalQualityLabel(strength)
  }

  static waterChance(strength: number, waterIceIndex: number): number {
    return danWaterConfirmChance(strength, waterIceIndex)
  }

  rollWater(): boolean {
    const chance = Math.min(
      danWaterConfirmChance(this.prospectStrength, this.waterIceIndex) * this.accuracyMod,
      1.0,
    )
    return Math.random() < chance
  }

  // --- VFX: sequential pulse dots (Mesh-based) ---
  // Dots fire from the DAN emitter diagonally toward the ground.
  private pulseDots: THREE.Mesh[] = []
  private pulseDotAlive: boolean[] = []
  private pulseDotVelocities: THREE.Vector3[] = []
  private sceneRef: THREE.Scene | null = null
  private readonly PULSE_COUNT = 12
  private readonly PULSE_INTERVAL = 0.07
  private readonly PULSE_SPEED = 0.8
  private pulseTimer = 0
  private nextPulseIdx = 0
  vfxVisible = false

  initVFX(scene: THREE.Scene): void {
    this.sceneRef = scene
    const dotGeo = new THREE.SphereGeometry(0.008, 4, 4)
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x44ccff,
      transparent: true,
      opacity: 0.9,
    })

    for (let i = 0; i < this.PULSE_COUNT; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat)
      dot.visible = false
      scene.add(dot)
      this.pulseDots.push(dot)
      this.pulseDotAlive.push(false)
      this.pulseDotVelocities.push(new THREE.Vector3())
    }
  }

  updateVFX(delta: number, groundY: number): void {
    if (this.pulseDots.length === 0 || !this.node) return
    const show = this.vfxVisible && this.passiveSubsystemEnabled
    if (!show) {
      for (const dot of this.pulseDots) dot.visible = false
      return
    }

    const wp = new THREE.Vector3()
    this.node.getWorldPosition(wp)

    // DAN fires neutrons straight down through the rover belly into the soil
    this._aimDir.set(0, -1, 0)

    // Fire next dot on interval
    this.pulseTimer += delta
    if (this.pulseTimer >= this.PULSE_INTERVAL) {
      this.pulseTimer = 0
      const idx = this.nextPulseIdx
      const dot = this.pulseDots[idx]
      dot.position.copy(wp)
      dot.visible = true
      this.pulseDotAlive[idx] = true
      this.pulseDotVelocities[idx].copy(this._aimDir).multiplyScalar(this.PULSE_SPEED)
      this.nextPulseIdx = (this.nextPulseIdx + 1) % this.PULSE_COUNT
    }

    // Advance all alive dots along their velocity
    for (let i = 0; i < this.PULSE_COUNT; i++) {
      if (!this.pulseDotAlive[i]) continue
      const dot = this.pulseDots[i]
      dot.position.addScaledVector(this.pulseDotVelocities[i], delta)
      if (dot.position.y <= groundY) {
        dot.visible = false
        this.pulseDotAlive[i] = false
      }
    }
  }
  private _aimDir = new THREE.Vector3(0, -1, 0)

  override dispose(): void {
    if (this.sceneRef) {
      for (const dot of this.pulseDots) {
        this.sceneRef.remove(dot)
        dot.geometry.dispose()
        ;(dot.material as THREE.MeshBasicMaterial).dispose()
      }
    }
    this.pulseDots = []
    this.sceneRef = null
  }
}
