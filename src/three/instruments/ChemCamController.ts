import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import { ROCK_TYPES, type RockTypeId } from '@/three/terrain/RockTypes'
import { mastPanTiltKeysHeld, mastState, MAST_ACTUATOR_HOLD_POWER_W } from './MastState'

// --- Timing (base values — modified by durationMultiplier) ---
const BASE_PULSE_TRAIN_DURATION = 7.0   // seconds of pulsed laser fire
const BASE_INTEGRATE_DURATION = 6.0     // spectrometer processing
const COOLDOWN_DURATION = 0.8           // gap before next shot
const SHOTS_MAX = 10

// --- Targeting ---
const MAX_RANGE = 7                // meters from mast head
const PAN_SPEED = 0.5
const TILT_SPEED = 0.35
const TILT_MIN = -0.5
const TILT_MAX = 0.6
const FOV_MIN = 20
const FOV_MAX = 65
const FOV_DEFAULT = 50
const ZOOM_STEP = 3

// --- Calibration ---
/** SP needed for fully calibrated LIBS results */
const FULL_CALIBRATION_SP = 250

// --- Power (LIBS + mast chain — heavy while E holds pulse; hurts on 50 Wh + weak gen) ---
const PULSE_POWER_W = 102
const INTEGRATE_POWER_W = 28
const IDLE_POWER_W = 6

// --- Beam VFX ---
const CORE_RADIUS = 0.003
const GLOW_RADIUS = 0.012
const BEAM_SEGMENTS = 6
const PULSE_INTERVAL = 0.12       // seconds between laser pulses
const PULSE_ON_TIME = 0.06        // each pulse visible duration
const FLASH_COUNT = 8             // impact flash particles
const FLASH_SIZE = 0.08

// --- Plasma colors by rock type ---
const PLASMA_COLORS: Record<string, number> = {
  basalt: 0xcc44ff,          // magenta/purple — Si-rich
  hematite: 0xff8833,        // orange-yellow — iron-heavy
  olivine: 0xcc44ff,         // magenta — silicate
  sulfate: 0x44aaff,         // blue-white — aluminum/light elements
  mudstone: 0xff8833,        // orange — iron-bearing
  'iron-meteorite': 0xff6622, // deep orange — iron
}

export type ChemCamPhase = 'ARMED' | 'PULSE_TRAIN' | 'INTEGRATING' | 'READY' | 'IDLE' | 'COOLDOWN'

export interface ChemCamReadout {
  id: string
  rockMeshUuid: string
  rockType: RockTypeId
  rockLabel: string
  /** Unix ms when LIBS acquisition finished (spectrum ready). */
  timestamp: number
  /** Mission sol when acquisition finished — set from `ChemCamController.currentSol`. */
  capturedSol: number
  /** Procedural spectrum peaks — [{wavelength, intensity, element}] */
  peaks: SpectrumPeak[]
  /** 0–1 calibration at time of scan. Affects peak visibility & labels. */
  calibration: number
  read: boolean
}

export interface SpectrumPeak {
  wavelength: number   // nm (380–780 range)
  intensity: number    // 0–1
  element: string      // e.g. 'Fe', 'Si', 'Mn'
}

export class ChemCamController extends InstrumentController {
  /** Minimum bus draw while ChemCam hardware is engaged (orbit, armed, or background sequence). */
  static readonly BUS_IDLE_W = IDLE_POWER_W

  readonly id = 'chemcam'
  readonly name = 'ChemCam'
  readonly slot = 2
  readonly focusNodeName = 'mast_03001'
  readonly altNodeNames = ['mast_03.001']
  readonly focusOffset = new THREE.Vector3(0.1, -0.05, 0.2)
  readonly viewAngle = 0.2
  readonly viewPitch = 0.4
  override readonly canActivate = true

  // --- Phase machine ---
  phase: ChemCamPhase = 'ARMED'
  private phaseTimer = 0
  shotsRemaining = SHOTS_MAX
  shotsMax = SHOTS_MAX
  /** External multiplier on sequence duration (thermal + player buffs). <1 = faster. */
  durationMultiplier = 1.0
  /** Current total SP — set by view each frame for calibration curve */
  currentSP = 0
  /** Mission sol — set by view each frame; stamped on new readouts at capture. */
  currentSol = 1

  /** 0–1 calibration level derived from accumulated SP */
  get calibration(): number {
    return Math.min(1, this.currentSP / FULL_CALIBRATION_SP)
  }

  // --- Readout queue ---
  readouts: ChemCamReadout[] = []
  get unreadCount(): number { return this.readouts.filter(r => !r.read).length }

  // --- Mast head (shared with MastCam pattern) ---
  private mastHead: THREE.Object3D | null = null
  // Pan/tilt state — shared with MastCam via mastState
  get panAngle() { return mastState.panAngle }
  set panAngle(v: number) { mastState.panAngle = v }
  get tiltAngle() { return mastState.tiltAngle }
  set tiltAngle(v: number) { mastState.tiltAngle = v }
  get fov() { return mastState.fov }
  set fov(v: number) { mastState.fov = v }

  // Camera state for RoverController
  readonly mastWorldPos = new THREE.Vector3()
  private readonly mastOrigin = new THREE.Vector3()
  readonly mastLookDir = new THREE.Vector3()
  readonly targetWorldPos = new THREE.Vector3()

  // --- Targeting ---
  private rocks: THREE.Mesh[] = []
  private scene: THREE.Scene | null = null
  currentTarget: THREE.Mesh | null = null
  /** True if current target is valid for firing (scanned + in range + not already analyzed) */
  targetValid = false

  // --- VFX ---
  private beamCore: THREE.Mesh | null = null
  private beamGlow: THREE.Mesh | null = null
  private coreMat: THREE.MeshBasicMaterial | null = null
  private glowMat: THREE.MeshBasicMaterial | null = null
  private impactLight: THREE.PointLight | null = null
  private flashParticles: THREE.Points | null = null
  private flashPositions: Float32Array = new Float32Array(FLASH_COUNT * 3)
  private flashVelocities: Float32Array = new Float32Array(FLASH_COUNT * 3)
  private flashLifetimes: Float32Array = new Float32Array(FLASH_COUNT)
  private pulseElapsed = 0
  private currentPlasmaColor = 0xcc44ff

  // --- Callbacks (set by view) ---
  onReady: ((readout: ChemCamReadout) => void) | null = null

  /** True while E is held — IR pulse train runs only while this is true (same idea as arm drill hold-to-fire). */
  private _eFireHeld = false

  override attach(rover: THREE.Group): void {
    super.attach(rover)
    this.mastHead = rover.getObjectByName('MastCam')
      ?? rover.getObjectByName('mast_03001')
      ?? rover.getObjectByName('mast_03.001')
      ?? null
  }

  initTargeting(scene: THREE.Scene, rocks: THREE.Mesh[]): void {
    this.scene = scene
    this.rocks = rocks
  }

  /** Power draw depends on phase */
  get powerDrawW(): number {
    switch (this.phase) {
      case 'PULSE_TRAIN': return PULSE_POWER_W
      case 'INTEGRATING': return INTEGRATE_POWER_W
      case 'ARMED': return IDLE_POWER_W
      default: return 0
    }
  }

  override getInstrumentBusPowerW(phase: 'instrument' | 'active'): number {
    return phase === 'active' ? Math.max(ChemCamController.BUS_IDLE_W, this.powerDrawW) : 0
  }

  /**
   * True while a shot is in flight (laser, integration, hand-off to cooldown).
   * Rover ticks the controller in the background when this is true but ChemCam is not the active instrument,
   * so sequences finish after ESC or when viewing another instrument card.
   */
  get isSequenceAdvancing(): boolean {
    return (
      this.phase === 'PULSE_TRAIN'
      || this.phase === 'INTEGRATING'
      || this.phase === 'READY'
      || this.phase === 'COOLDOWN'
    )
  }

  /** Call from view's wheel handler when ChemCam is active */
  handleWheel(deltaY: number): void {
    const dir = deltaY > 0 ? 1 : -1
    this.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, this.fov + dir * ZOOM_STEP))
  }

  override handleInput(keys: Set<string>, delta: number): void {
    // Pan/tilt mast
    if (keys.has('KeyA') || keys.has('ArrowLeft')) this.panAngle += PAN_SPEED * delta
    if (keys.has('KeyD') || keys.has('ArrowRight')) this.panAngle -= PAN_SPEED * delta
    this.panAngle = Math.max(-Math.PI * 0.8, Math.min(Math.PI * 0.8, this.panAngle))

    if (keys.has('KeyW') || keys.has('ArrowUp')) this.tiltAngle = Math.max(TILT_MIN, this.tiltAngle - TILT_SPEED * delta)
    if (keys.has('KeyS') || keys.has('ArrowDown')) this.tiltAngle = Math.min(TILT_MAX, this.tiltAngle + TILT_SPEED * delta)

    // E hold to fire IR (release E aborts pulse train — mirrors arm drill hold-to-fire)
    this._eFireHeld = keys.has('KeyE')

    if (mastPanTiltKeysHeld(keys)) mastState.actuatorKeysHeld = true
  }

  override update(delta: number): void {
    this.updateMastPosition()
    this.updateTarget()
    this.updatePhase(delta)
    this.updateVFX(delta)
  }

  // --- Mast position + look direction ---
  private updateMastPosition(): void {
    if (this.mastHead) {
      this.mastHead.getWorldPosition(this.mastOrigin)
      this.mastWorldPos.copy(this.mastOrigin)
    }

    const roverParent = this.node?.parent
    let baseHeading = 0
    if (roverParent) {
      const euler = new THREE.Euler().setFromQuaternion(roverParent.quaternion, 'YXZ')
      baseHeading = euler.y
    }
    const lookAngle = baseHeading + this.panAngle + Math.PI
    const cosTilt = Math.cos(this.tiltAngle)
    this.mastLookDir.set(
      -Math.sin(lookAngle) * cosTilt,
      -Math.sin(this.tiltAngle),
      -Math.cos(lookAngle) * cosTilt,
    ).normalize()

    // Push camera forward past mast housing
    this.mastWorldPos.addScaledVector(this.mastLookDir, 0.35)
  }

  // --- Targeting ---
  private updateTarget(): void {
    const raycaster = new THREE.Raycaster(this.mastOrigin, this.mastLookDir, 0, MAX_RANGE)
    const hits = raycaster.intersectObjects(this.rocks, false)

    this.currentTarget = null
    this.targetValid = false

    for (const hit of hits) {
      const rock = hit.object as THREE.Mesh
      if (rock.userData.depleted) continue
      this.currentTarget = rock
      rock.getWorldPosition(this.targetWorldPos)

      // Valid = mastcamScanned AND not yet chemcamAnalyzed AND has shots
      const scanned = rock.userData.mastcamScanned === true
      const analyzed = rock.userData.chemcamAnalyzed === true
      this.targetValid = scanned && !analyzed && this.shotsRemaining > 0 && this.phase === 'ARMED'
      break
    }

    if (!this.currentTarget) {
      this.targetWorldPos.copy(this.mastOrigin).addScaledVector(this.mastLookDir, 20)
    }
  }

  /** Begin LIBS pulse: decrements shot and spawns beam — only from `updatePhase` when armed + E held. */
  private beginPulseTrain(): void {
    if (!this.currentTarget || !this.targetValid) return
    if (this.shotsRemaining <= 0) return

    this.shotsRemaining--
    this.phase = 'PULSE_TRAIN'
    this.phaseTimer = 0
    this.pulseElapsed = 0

    const rockType = this.currentTarget.userData.rockType as RockTypeId | undefined
    this.currentPlasmaColor = rockType ? (PLASMA_COLORS[rockType] ?? 0xcc44ff) : 0xcc44ff

    this.createBeamVFX()
  }

  /** User released E or lost target mid-pulse — refund shot, no spectrum. */
  private abortPulseTrain(): void {
    this.removeBeamVFX()
    this.shotsRemaining++
    this.phase = 'ARMED'
    this.phaseTimer = 0
    this.pulseElapsed = 0
  }

  /** Effective pulse train duration after multiplier */
  private get pulseDuration(): number { return BASE_PULSE_TRAIN_DURATION * this.durationMultiplier }
  /** Effective integrate duration after multiplier */
  private get integrateDuration(): number { return BASE_INTEGRATE_DURATION * this.durationMultiplier }

  // --- Phase machine ---
  private updatePhase(delta: number): void {
    if (this.phase === 'ARMED') {
      if (this._eFireHeld && this.targetValid && this.shotsRemaining > 0) {
        this.beginPulseTrain()
      }
      return
    }

    if (this.phase === 'IDLE') return

    if (this.phase === 'PULSE_TRAIN') {
      if (!this._eFireHeld || !this.currentTarget) {
        this.abortPulseTrain()
        return
      }
      this.phaseTimer += delta
      if (this.phaseTimer >= this.pulseDuration) {
        this.phase = 'INTEGRATING'
        this.phaseTimer = 0
        this.removeBeamVFX()
      }
      return
    }

    this.phaseTimer += delta

    if (this.phase === 'INTEGRATING') {
      if (this.phaseTimer >= this.integrateDuration) {
        this.phase = 'READY'
        this.phaseTimer = 0
        this.completeAnalysis()
      }
    } else if (this.phase === 'READY') {
      // Immediately transition to COOLDOWN after persisting data
      this.phase = 'COOLDOWN'
      this.phaseTimer = 0
    } else if (this.phase === 'COOLDOWN') {
      if (this.phaseTimer >= COOLDOWN_DURATION) {
        this.phase = 'ARMED'
        this.phaseTimer = 0
      }
    }
  }

  /** Get integration progress (0–1) during INTEGRATING phase */
  get integrateProgress(): number {
    if (this.phase === 'INTEGRATING') return Math.min(1, this.phaseTimer / this.integrateDuration)
    if (this.phase === 'READY' || this.phase === 'COOLDOWN' || this.phase === 'IDLE') return 1
    return 0
  }

  /** Get pulse train progress (0–1) during PULSE_TRAIN phase */
  get pulseProgress(): number {
    if (this.phase === 'PULSE_TRAIN') return Math.min(1, this.phaseTimer / this.pulseDuration)
    return 0
  }

  private completeAnalysis(): void {
    if (!this.currentTarget) return

    const rockType = (this.currentTarget.userData.rockType as RockTypeId) ?? 'basalt'
    const label = ROCK_TYPES[rockType]?.label ?? 'Unknown'

    // Generate procedural spectrum — quality depends on calibration
    const cal = this.calibration
    const peaks = generateSpectrum(rockType, cal)

    // Persist on rock
    this.currentTarget.userData.chemcamAnalyzed = true
    this.currentTarget.userData.chemcamRockType = rockType
    this.currentTarget.userData.chemcamPeaks = peaks

    const readout: ChemCamReadout = {
      id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rockMeshUuid: this.currentTarget.uuid,
      rockType,
      rockLabel: label,
      timestamp: Date.now(),
      capturedSol: this.currentSol,
      peaks,
      calibration: cal,
      read: false,
    }

    this.readouts.push(readout)
    this.onReady?.(readout)
  }

  markRead(readoutId: string): void {
    const r = this.readouts.find(x => x.id === readoutId)
    if (r) r.read = true
  }

  markAllRead(): void {
    this.readouts.forEach(r => { r.read = true })
  }

  getLatestUnread(): ChemCamReadout | null {
    for (let i = this.readouts.length - 1; i >= 0; i--) {
      if (!this.readouts[i].read) return this.readouts[i]
    }
    return null
  }

  // =============================================
  // VFX — Pulsed IR laser beam + plasma flashes
  // =============================================

  private createBeamVFX(): void {
    if (!this.scene) return

    // Teal/cyan core — IR-coded visible through rover camera
    this.coreMat = new THREE.MeshBasicMaterial({
      color: 0x66ffee,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    // Subtle outer glow, tinted by rock type plasma color
    this.glowMat = new THREE.MeshBasicMaterial({
      color: this.currentPlasmaColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const coreGeo = new THREE.CylinderGeometry(CORE_RADIUS, CORE_RADIUS, 1, BEAM_SEGMENTS, 1, true)
    this.beamCore = new THREE.Mesh(coreGeo, this.coreMat)

    const glowGeo = new THREE.CylinderGeometry(GLOW_RADIUS, GLOW_RADIUS, 1, BEAM_SEGMENTS, 1, true)
    this.beamGlow = new THREE.Mesh(glowGeo, this.glowMat)

    this.scene.add(this.beamCore)
    this.scene.add(this.beamGlow)

    // Impact light — plasma colored
    this.impactLight = new THREE.PointLight(this.currentPlasmaColor, 0, 4, 2)
    this.scene.add(this.impactLight)

    // Flash particles at impact
    this.createFlashParticles()
  }

  private createFlashParticles(): void {
    if (!this.scene) return
    for (let i = 0; i < FLASH_COUNT; i++) this.resetFlash(i)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.flashPositions, 3))
    const mat = new THREE.PointsMaterial({
      color: this.currentPlasmaColor,
      size: FLASH_SIZE,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.flashParticles = new THREE.Points(geo, mat)
    this.scene.add(this.flashParticles)
  }

  private resetFlash(i: number): void {
    const tp = this.targetWorldPos
    this.flashPositions[i * 3] = tp.x
    this.flashPositions[i * 3 + 1] = tp.y
    this.flashPositions[i * 3 + 2] = tp.z
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI * 0.5
    const speed = 1.0 + Math.random() * 3.0
    this.flashVelocities[i * 3] = Math.cos(theta) * Math.sin(phi) * speed
    this.flashVelocities[i * 3 + 1] = Math.cos(phi) * speed + 0.5
    this.flashVelocities[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * speed
    this.flashLifetimes[i] = 0.08 + Math.random() * 0.2
  }

  private updateVFX(delta: number): void {
    if (this.phase !== 'PULSE_TRAIN') return
    this.pulseElapsed += delta

    // Pulsed beam — on/off per PULSE_INTERVAL
    const inPulseCycle = this.pulseElapsed % PULSE_INTERVAL
    const pulseOn = inPulseCycle < PULSE_ON_TIME

    // Position beam from mast to target
    if (this.beamCore && this.beamGlow && this.currentTarget) {
      const targetPos = this.targetWorldPos
      const mid = new THREE.Vector3().addVectors(this.mastOrigin, targetPos).multiplyScalar(0.5)
      const dist = this.mastOrigin.distanceTo(targetPos)

      for (const mesh of [this.beamCore, this.beamGlow]) {
        if (!mesh) continue
        mesh.position.copy(mid)
        mesh.scale.set(1, dist, 1)
        mesh.lookAt(targetPos)
        mesh.rotateX(Math.PI / 2)
      }

      // Pulse opacity
      if (this.coreMat) this.coreMat.opacity = pulseOn ? 0.95 : 0
      if (this.glowMat) this.glowMat.opacity = pulseOn ? 0.4 : 0

      // Impact light
      if (this.impactLight) {
        this.impactLight.position.copy(targetPos)
        this.impactLight.intensity = pulseOn ? 2.5 : 0
      }
    }

    // Flash particles (only during pulse-on)
    if (this.flashParticles) {
      const positions = this.flashParticles.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < FLASH_COUNT; i++) {
        this.flashLifetimes[i] -= delta
        if (this.flashLifetimes[i] <= 0) {
          if (pulseOn) {
            this.resetFlash(i)
          }
          positions.setXYZ(i, this.targetWorldPos.x, this.targetWorldPos.y, this.targetWorldPos.z)
        } else {
          positions.setX(i, positions.getX(i) + this.flashVelocities[i * 3] * delta)
          positions.setY(i, positions.getY(i) + this.flashVelocities[i * 3 + 1] * delta)
          positions.setZ(i, positions.getZ(i) + this.flashVelocities[i * 3 + 2] * delta)
          this.flashVelocities[i * 3 + 1] -= 4 * delta // gravity
        }
      }
      positions.needsUpdate = true
    }
  }

  private removeBeamVFX(): void {
    if (this.beamCore) {
      this.scene?.remove(this.beamCore)
      this.beamCore.geometry.dispose()
      this.beamCore = null
    }
    if (this.beamGlow) {
      this.scene?.remove(this.beamGlow)
      this.beamGlow.geometry.dispose()
      this.beamGlow = null
    }
    if (this.impactLight) {
      this.scene?.remove(this.impactLight)
      this.impactLight = null
    }
    if (this.flashParticles) {
      this.scene?.remove(this.flashParticles)
      this.flashParticles.geometry.dispose()
      ;(this.flashParticles.material as THREE.PointsMaterial).dispose()
      this.flashParticles = null
    }
    this.coreMat?.dispose()
    this.coreMat = null
    this.glowMat?.dispose()
    this.glowMat = null
  }

  // --- Deactivation ---
  deactivate(): void {
    this.removeBeamVFX()
    this.fov = FOV_DEFAULT
    // Don't reset phase — integrating/ready should survive deactivation
    this._eFireHeld = false
  }

  override dispose(): void {
    this.removeBeamVFX()
  }
}

// =============================================
// Procedural spectrum generation
// =============================================

/** Element templates — wavelength ranges where peaks appear */
const ELEMENT_PEAKS: Record<string, { nm: number; spread: number }[]> = {
  Fe: [{ nm: 404, spread: 3 }, { nm: 438, spread: 4 }, { nm: 527, spread: 3 }],
  Si: [{ nm: 390, spread: 5 }, { nm: 634, spread: 4 }],
  Mn: [{ nm: 403, spread: 3 }, { nm: 475, spread: 4 }],
  Mg: [{ nm: 518, spread: 5 }, { nm: 552, spread: 3 }],
  Al: [{ nm: 396, spread: 4 }, { nm: 394, spread: 3 }],
  Ca: [{ nm: 422, spread: 4 }, { nm: 445, spread: 3 }],
  Na: [{ nm: 589, spread: 2 }, { nm: 590, spread: 2 }],
  Ti: [{ nm: 498, spread: 4 }, { nm: 506, spread: 3 }],
  S:  [{ nm: 545, spread: 5 }, { nm: 564, spread: 4 }],
  Ni: [{ nm: 508, spread: 3 }, { nm: 471, spread: 4 }],
}

/** Which elements dominate per rock type */
const ROCK_ELEMENT_PROFILES: Record<RockTypeId, { el: string; weight: number }[]> = {
  basalt: [
    { el: 'Fe', weight: 0.7 }, { el: 'Si', weight: 0.9 },
    { el: 'Mg', weight: 0.6 }, { el: 'Ca', weight: 0.5 },
    { el: 'Al', weight: 0.4 }, { el: 'Ti', weight: 0.3 },
  ],
  hematite: [
    { el: 'Fe', weight: 1.0 }, { el: 'Si', weight: 0.3 },
    { el: 'Mn', weight: 0.4 }, { el: 'Al', weight: 0.2 },
  ],
  olivine: [
    { el: 'Mg', weight: 0.9 }, { el: 'Fe', weight: 0.6 },
    { el: 'Si', weight: 0.8 }, { el: 'Mn', weight: 0.2 },
  ],
  sulfate: [
    { el: 'S', weight: 0.9 }, { el: 'Ca', weight: 0.7 },
    { el: 'Mg', weight: 0.5 }, { el: 'Fe', weight: 0.2 },
    { el: 'Na', weight: 0.3 },
  ],
  mudstone: [
    { el: 'Si', weight: 0.7 }, { el: 'Fe', weight: 0.5 },
    { el: 'Al', weight: 0.6 }, { el: 'Ca', weight: 0.4 },
    { el: 'Mn', weight: 0.5 },
  ],
  'iron-meteorite': [
    { el: 'Fe', weight: 1.0 }, { el: 'Ni', weight: 0.8 },
    { el: 'Mn', weight: 0.3 }, { el: 'Si', weight: 0.1 },
  ],
}

/**
 * Generate spectrum peaks with quality degraded by calibration level.
 *
 * cal 0.0 → only strongest 1-2 peaks visible, most labeled "??", high noise
 * cal 0.4 → ~half peaks visible, some "??", moderate noise
 * cal 0.7 → most peaks visible, rare "??", light noise
 * cal 1.0 → full clean spectrum, all elements labeled
 */
function generateSpectrum(rockType: RockTypeId, cal: number): SpectrumPeak[] {
  const profile = ROCK_ELEMENT_PROFILES[rockType] ?? ROCK_ELEMENT_PROFILES.basalt
  const allPeaks: { nm: number; intensity: number; element: string; weight: number }[] = []

  for (const { el, weight } of profile) {
    const templates = ELEMENT_PEAKS[el]
    if (!templates) continue
    for (const t of templates) {
      const nm = t.nm + (Math.random() - 0.5) * t.spread
      const intensity = weight * (0.7 + Math.random() * 0.3)
      allPeaks.push({ nm, intensity, element: el, weight })
    }
  }

  // Sort by weight (strongest first) to decide which are "visible"
  allPeaks.sort((a, b) => b.weight - a.weight)

  // How many peaks are resolved depends on calibration
  // cal 0 → ~20% of peaks, cal 1 → 100%
  const visibleFraction = 0.2 + cal * 0.8
  const visibleCount = Math.max(1, Math.ceil(allPeaks.length * visibleFraction))

  // Threshold below which element labels show as "??"
  // cal 0 → only weight > 0.8 gets labeled, cal 1 → everything labeled
  const labelThreshold = 1.0 - cal  // cal 0 → 1.0, cal 0.5 → 0.5, cal 1 → 0

  // Noise added to intensity at low cal
  const noiseMag = (1 - cal) * 0.25

  const peaks: SpectrumPeak[] = []
  for (let i = 0; i < allPeaks.length; i++) {
    const p = allPeaks[i]
    if (i >= visibleCount) continue

    // Add noise to intensity
    const noise = (Math.random() - 0.5) * 2 * noiseMag
    const noisyIntensity = Math.max(0.05, Math.min(1, p.intensity + noise))

    // Wavelength jitter increases at low calibration
    const extraJitter = (1 - cal) * 8
    const jitteredNm = p.nm + (Math.random() - 0.5) * extraJitter

    // Label: "??" if below threshold
    const labeled = p.weight >= labelThreshold
    const element = labeled ? p.element : '??'

    peaks.push({
      wavelength: Math.round(jitteredNm * 10) / 10,
      intensity: noisyIntensity,
      element,
    })
  }

  peaks.sort((a, b) => a.wavelength - b.wavelength)
  return peaks
}
