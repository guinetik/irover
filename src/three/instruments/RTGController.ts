import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

type RTGPhase = 'idle' | 'overdrive' | 'cooldown' | 'recharging'

const OVERDRIVE_DURATION = 20   // seconds (represents ~2h in game time)
const COOLDOWN_DURATION = 30    // seconds (represents half a sol)
const RECHARGE_DURATION = 60    // seconds (represents 1 sol before can activate again)

export class RTGController extends InstrumentController {
  readonly id = 'rtg'
  readonly name = 'RTG'
  readonly slot = 6
  readonly focusNodeName = 'RTG'
  readonly focusOffset = new THREE.Vector3(-0.2, 0.2, -0.3)
  readonly viewAngle = Math.PI
  readonly viewPitch = 0.25
  override readonly canActivate = true

  // Fake power stats
  totalPowerW = 110
  currentPowerW = 87
  chargeRateWPerHr = 2.4

  // Overdrive state
  phase: RTGPhase = 'idle'
  private phaseElapsed = 0
  private phaseDuration = 0

  /** 0..1 progress through current phase (overdrive or cooldown) */
  get phaseProgress(): number {
    if (this.phaseDuration <= 0) return 0
    return Math.min(1, this.phaseElapsed / this.phaseDuration)
  }

  /** Time remaining in current phase (seconds) */
  get phaseTimeRemaining(): number {
    return Math.max(0, this.phaseDuration - this.phaseElapsed)
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

  override update(delta: number): void {
    if (this.phase === 'idle') {
      // Slow charge
      this.currentPowerW = Math.min(this.totalPowerW, this.currentPowerW + this.chargeRateWPerHr * delta * 0.01)
      return
    }

    this.phaseElapsed += delta
    this.currentPowerW = Math.max(0, this.currentPowerW - 15 * delta)

    if (this.phase === 'overdrive' && this.phaseElapsed >= this.phaseDuration) {
      // Overdrive finished → enter cooldown
      this.phase = 'cooldown'
      this.phaseElapsed = 0
      this.phaseDuration = COOLDOWN_DURATION
      this.currentPowerW = 5
    } else if (this.phase === 'cooldown' && this.phaseElapsed >= this.phaseDuration) {
      // Cooldown finished → recharging (can't overdrive again for 1 sol)
      this.phase = 'recharging'
      this.phaseElapsed = 0
      this.phaseDuration = RECHARGE_DURATION
      this.currentPowerW = 20
    } else if (this.phase === 'recharging') {
      // Slow charge during recharge
      this.currentPowerW = Math.min(this.totalPowerW, this.currentPowerW + this.chargeRateWPerHr * delta * 0.05)
      if (this.phaseElapsed >= this.phaseDuration) {
        this.phase = 'idle'
        this.phaseElapsed = 0
        this.phaseDuration = 0
      }
    }
  }

  activateOverdrive(): void {
    if (this.phase !== 'idle') return
    this.phase = 'overdrive'
    this.phaseElapsed = 0
    this.phaseDuration = OVERDRIVE_DURATION
  }
}
