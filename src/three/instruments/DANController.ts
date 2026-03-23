import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

// --- Sampling ---
const SAMPLE_INTERVAL_MOVING = 3.0
const SAMPLE_INTERVAL_STATIC = 5.0
const MIN_MOVE_DIST = 0.5
const BASE_HIT_RATE = 0.02

const FEATURE_MULT: Record<string, number> = {
  'polar-cap': 3.0,
  'canyon': 1.5,
  'basin': 1.5,
  'plain': 1.0,
  'volcano': 0.5,
}

function siteMultiplier(waterIceIndex: number): number {
  if (waterIceIndex >= 0.8) return 5.0
  if (waterIceIndex >= 0.5) return 3.5
  if (waterIceIndex >= 0.3) return 2.5
  if (waterIceIndex >= 0.1) return 1.5
  return 1.0
}

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
  readonly billsPassiveBackgroundPower = true
  readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'DAN_L'
  readonly focusOffset = new THREE.Vector3(0.0, 0.3, 0.0)
  readonly viewAngle = Math.PI * 0.5
  readonly viewPitch = 0.15
  readonly selectionIdlePowerW = 10

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
    const interval = isMoving ? SAMPLE_INTERVAL_MOVING : SAMPLE_INTERVAL_STATIC

    this.sampleTimer += delta
    if (this.sampleTimer < interval) return
    this.sampleTimer = 0
    if (isMoving) this.lastSamplePos.copy(this.roverPos)

    this.totalSamples++

    const siteMult = siteMultiplier(this.waterIceIndex)
    const featMult = FEATURE_MULT[this.featureType] ?? 1.0
    const p = Math.min(BASE_HIT_RATE * siteMult * featMult, 0.95)

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
    if (strength >= 0.7) return 'Strong'
    if (strength >= 0.5) return 'Moderate'
    return 'Weak'
  }

  static waterChance(strength: number, waterIceIndex: number): number {
    const base = strength >= 0.7 ? 0.70 : strength >= 0.5 ? 0.40 : 0.15
    return Math.min(base * (0.5 + waterIceIndex), 1.0)
  }

  rollWater(): boolean {
    const chance = DANController.waterChance(this.prospectStrength, this.waterIceIndex)
    return Math.random() < chance
  }

  // --- VFX: sequential pulse train ---
  // A series of dots fired one-at-a-time from the emitter downward to the ground.
  // Each dot travels straight down; when it hits ground it despawns and the next fires.
  private particles: THREE.Points | null = null
  private particlePositions: Float32Array | null = null
  private particleAlive: boolean[] = []
  private sceneRef: THREE.Scene | null = null
  /** Total dots in the pulse train */
  private readonly PULSE_COUNT = 6
  /** Seconds between sequential dot launches */
  private readonly PULSE_INTERVAL = 0.12
  /** Fall speed (scene units / sec) — tuned for ~0.5 unit source-to-ground gap */
  private readonly FALL_SPEED = 0.5
  private pulseTimer = 0
  private nextPulseIdx = 0
  vfxVisible = false

  initVFX(scene: THREE.Scene): void {
    this.sceneRef = scene
    const n = this.PULSE_COUNT
    this.particlePositions = new Float32Array(n * 3)
    this.particleAlive = new Array(n).fill(false)

    // All start hidden off-screen
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      this.particlePositions[i3] = 0
      this.particlePositions[i3 + 1] = -999
      this.particlePositions[i3 + 2] = 0
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.particlePositions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x44ccff,
      size: 8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: false,  // constant screen-space size so always visible
    })

    this.particles = new THREE.Points(geo, mat)
    this.particles.frustumCulled = false  // positions update dynamically; skip bounding-sphere check
    this.particles.visible = false
    scene.add(this.particles)
  }

  updateVFX(delta: number, groundY: number): void {
    if (!this.particles || !this.particlePositions || !this.node) return
    this.particles.visible = this.vfxVisible && this.passiveSubsystemEnabled
    if (!this.particles.visible) return

    // Position the Points mesh at the DAN emitter XZ; Y=0 so particle Y coords are world-space
    const wp = new THREE.Vector3()
    this.node.getWorldPosition(wp)
    this.particles.position.set(wp.x, 0, wp.z)

    const sourceY = wp.y
    const endY = groundY

    // Fire next dot on interval
    this.pulseTimer += delta
    if (this.pulseTimer >= this.PULSE_INTERVAL) {
      this.pulseTimer = 0
      const idx = this.nextPulseIdx
      const i3 = idx * 3
      // Spawn at emitter (local: x=0, y=sourceY, z=0)
      this.particlePositions[i3] = 0
      this.particlePositions[i3 + 1] = sourceY
      this.particlePositions[i3 + 2] = 0
      this.particleAlive[idx] = true
      this.nextPulseIdx = (this.nextPulseIdx + 1) % this.PULSE_COUNT
    }

    // Advance all alive dots downward
    const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < this.PULSE_COUNT; i++) {
      if (!this.particleAlive[i]) continue
      const i3 = i * 3
      this.particlePositions[i3 + 1] -= this.FALL_SPEED * delta
      // Despawn on ground hit
      if (this.particlePositions[i3 + 1] <= endY) {
        this.particleAlive[i] = false
        this.particlePositions[i3 + 1] = -999 // hide off-screen
      }
    }
    positions.needsUpdate = true
  }

  override dispose(): void {
    if (this.particles && this.sceneRef) {
      this.sceneRef.remove(this.particles)
      this.particles.geometry.dispose()
      ;(this.particles.material as THREE.PointsMaterial).dispose()
    }
    this.particles = null
    this.sceneRef = null
  }
}
