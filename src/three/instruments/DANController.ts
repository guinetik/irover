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

  // --- VFX ---
  private particles: THREE.Points | null = null
  private particlePositions: Float32Array | null = null
  private particleSpeeds: Float32Array | null = null
  private sceneRef: THREE.Scene | null = null
  private readonly PARTICLE_COUNT = 32
  vfxVisible = false
  private groundY = 0

  initVFX(scene: THREE.Scene): void {
    this.sceneRef = scene
    const count = this.PARTICLE_COUNT
    this.particlePositions = new Float32Array(count * 3)
    this.particleSpeeds = new Float32Array(count)

    // Seed particles spread across the column so they don't all start at one spot
    for (let i = 0; i < count; i++) {
      this.particleSpeeds[i] = 2.0 + Math.random() * 3.0
      const i3 = i * 3
      this.particlePositions[i3] = (Math.random() - 0.5) * 0.1
      this.particlePositions[i3 + 1] = -Math.random() * 1.0  // spread down from 0
      this.particlePositions[i3 + 2] = (Math.random() - 0.5) * 0.1
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.particlePositions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x44aaff,
      size: 0.12,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    this.particles = new THREE.Points(geo, mat)
    this.particles.visible = false
    scene.add(this.particles)
  }

  private resetParticle(i: number, startY: number, endY: number): void {
    if (!this.particlePositions || !this.particleSpeeds) return
    const i3 = i * 3
    // Random XZ offset from center (0,0) — particles live in local space
    this.particlePositions[i3] = (Math.random() - 0.5) * 0.1
    // Random Y between source and ground so they don't all spawn at top
    this.particlePositions[i3 + 1] = startY - Math.random() * (startY - endY)
    this.particlePositions[i3 + 2] = (Math.random() - 0.5) * 0.1
    this.particleSpeeds[i] = 2.0 + Math.random() * 3.0
  }

  updateVFX(delta: number, groundY: number): void {
    if (!this.particles || !this.particlePositions || !this.particleSpeeds || !this.node) return
    this.groundY = groundY
    this.particles.visible = this.vfxVisible && this.passiveSubsystemEnabled
    if (!this.particles.visible) return

    // Attach particles to DAN node so they follow the rover
    const wp = new THREE.Vector3()
    this.node.getWorldPosition(wp)
    this.particles.position.set(wp.x, 0, wp.z)

    const sourceY = wp.y
    const endY = groundY

    const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < this.PARTICLE_COUNT; i++) {
      const i3 = i * 3
      // Fall straight down
      this.particlePositions[i3 + 1] -= this.particleSpeeds[i] * delta
      // Tiny XZ jitter for visual interest
      this.particlePositions[i3] += (Math.random() - 0.5) * 0.02 * delta
      this.particlePositions[i3 + 2] += (Math.random() - 0.5) * 0.02 * delta
      // Reset when hitting ground
      if (this.particlePositions[i3 + 1] <= endY) {
        this.resetParticle(i, sourceY, endY)
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
