import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import { getRtgPhaseSceneSeconds } from '@/lib/missionTime'
import { MISSION_COOLDOWN_ID, missionCooldowns } from '@/lib/missionCooldowns'

type RTGPhase = 'idle' | 'overdrive' | 'cooldown' | 'recharging'

export type RTGConservationState = 'off' | 'active' | 'cooldown'

export class RTGController extends InstrumentController {
  readonly id = 'rtg'
  readonly name = 'RTG'
  readonly slot = 6
  readonly focusNodeName = 'RTG'
  readonly focusOffset = new THREE.Vector3(-0.2, 0.2, -0.3)
  readonly viewAngle = Math.PI
  readonly viewPitch = 0.25
  override readonly canActivate = true
  /** Overdrive uses the same subtree — avoid cyan selection fighting orange burst VFX. */
  override readonly selectionHighlightColor = null
  /** RTG management UI / telemetry — not the RTG thermal output (that is generation). */
  override readonly selectionIdlePowerW = 2

  // Fake power stats
  totalPowerW = 110
  currentPowerW = 87
  chargeRateWPerHr = 2.4

  // Overdrive state (phase); durations live in missionCooldowns + missionTime
  phase: RTGPhase = 'idle'
  /** True after we clone materials under the RTG node (GLTF often shares one mat across the whole rover). */
  private rtgMaterialsIsolated = false

  /** 0..1 progress through current overdrive sub-phase (burst / lock / recharge). */
  get phaseProgress(): number {
    const id = this.currentOverdriveTimerId
    if (!id || !missionCooldowns.isActive(id)) return 0
    return missionCooldowns.progressElapsed01(id)
  }

  /** Time remaining in current overdrive sub-phase (seconds). */
  get phaseTimeRemaining(): number {
    const id = this.currentOverdriveTimerId
    return id ? missionCooldowns.remaining(id) : 0
  }

  private get currentOverdriveTimerId(): string | null {
    switch (this.phase) {
      case 'overdrive':
        return MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST
      case 'cooldown':
        return MISSION_COOLDOWN_ID.RTG_OVERDRIVE_INSTRUMENT_LOCK
      case 'recharging':
        return MISSION_COOLDOWN_ID.RTG_OVERDRIVE_RECHARGE
      default:
        return null
    }
  }

  /** Whether all other instruments should be locked */
  get instrumentsLocked(): boolean {
    return this.phase === 'overdrive' || this.phase === 'cooldown'
  }

  get speedMultiplier(): number {
    return this.phase === 'overdrive' ? 2.0 : 1.0
  }

  get powerPct(): number {
    return Math.round((this.currentPowerW / this.totalPowerW) * 100)
  }

  /** WASD drive / steer disengaged while power shunt effect timer runs. */
  get isDrivingDisengaged(): boolean {
    return missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)
  }

  /** Multiply modeled power bus consumption while shunt effect is active. */
  get powerLoadFactor(): number {
    return this.isDrivingDisengaged ? 0.5 : 1
  }

  get conservationMode(): RTGConservationState {
    if (missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)) return 'active'
    if (missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_RECOVERY)) return 'cooldown'
    return 'off'
  }

  /** 0–1 elapsed for shunt effect or recovery timer (banner bars). */
  get conservationProgress01(): number {
    if (missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)) {
      return missionCooldowns.progressElapsed01(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)
    }
    if (missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_RECOVERY)) {
      return missionCooldowns.progressElapsed01(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_RECOVERY)
    }
    return 0
  }

  get conservationActiveRemainingSec(): number {
    return missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)
  }

  get conservationCooldownRemainingSec(): number {
    return missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_RECOVERY)
  }

  get canActivateOverdrive(): boolean {
    return (
      this.phase === 'idle'
      && this.conservationMode === 'off'
    )
  }

  get canActivateConservation(): boolean {
    return this.phase === 'idle' && this.conservationMode === 'off'
  }

  /** Binds the RTG scene node and clones its mesh materials so VFX cannot leak to shared GLTF mats. */
  override attach(rover: THREE.Group): void {
    super.attach(rover)
    this.isolateRtgBranchMaterials()
  }

  /**
   * Duplicate materials on meshes under the RTG node so overdrive emissive VFX do not mutate
   * a shared GLTF material (which would orange-glow the entire chassis).
   */
  private isolateRtgBranchMaterials(): void {
    if (!this.node || this.rtgMaterialsIsolated) return
    this.node.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      const m = mesh.material
      if (Array.isArray(m)) {
        mesh.material = m.map((mat) => (mat as THREE.Material).clone())
      } else {
        mesh.material = (m as THREE.Material).clone()
      }
    })
    this.rtgMaterialsIsolated = true
  }

  override update(delta: number): void {
    if (this.phase === 'idle') {
      this.currentPowerW = Math.min(this.totalPowerW, this.currentPowerW + this.chargeRateWPerHr * delta * 0.01)
      return
    }

    this.currentPowerW = Math.max(0, this.currentPowerW - 15 * delta)

    if (this.phase === 'recharging') {
      this.currentPowerW = Math.min(this.totalPowerW, this.currentPowerW + this.chargeRateWPerHr * delta * 0.05)
    }
  }

  activateOverdrive(): void {
    if (!this.canActivateOverdrive) return
    const d = getRtgPhaseSceneSeconds()
    this.phase = 'overdrive'

    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST, d.overdriveBurst, () => {
      this.phase = 'cooldown'
      this.currentPowerW = 5
      missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_INSTRUMENT_LOCK, d.overdriveInstrumentLock, () => {
        this.phase = 'recharging'
        this.currentPowerW = 20
        missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_RECHARGE, d.overdriveRecharge, () => {
          this.phase = 'idle'
        })
      })
    })
  }

  /**
   * Begin power shunt: caller should fill the game battery (`fillBatteryFull`) when this returns true.
   * Durations come from {@link getRtgPhaseSceneSeconds} (sol-relative).
   */
  activateConservation(): boolean {
    if (!this.canActivateConservation) return false
    const d = getRtgPhaseSceneSeconds()
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT, d.powerShuntEffect, () => {
      missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_RECOVERY, d.powerShuntRecovery)
    })
    return true
  }
}
