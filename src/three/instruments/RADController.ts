import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import type { RadiationZone, RadEventId } from '@/lib/radiation'

export class RADController extends InstrumentController {
  readonly id = 'rad'
  readonly name = 'RAD'
  readonly slot = 9
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.40
  override readonly repairComponentId = 'science-components'
  override readonly usageDecayChance = 0.10
  override readonly usageDecayAmount = 0.5
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Start STANDBY until the player ACTIVATEs. */
  override passiveSubsystemEnabled = false
  readonly focusNodeName = 'RAD'
  readonly focusOffset = new THREE.Vector3(0.2, 0.15, 0.2)
  readonly viewAngle = 0.45
  readonly viewPitch = 1.0
  override readonly selectionIdlePowerW = 2

  // --- Live radiation state (synced by RadHudController each frame) ---

  /** Current radiation scalar at rover position (0.0–1.2). */
  radiationLevel = 0.0

  /** Current zone classification. */
  zone: RadiationZone = 'safe'

  /** Current dose rate in mGy/day. */
  doseRate = 0.0

  /** Cumulative dose this sol (mGy). Resets each sol. */
  cumulativeDoseSol = 0.0

  /** Particle count rate (counts per minute), derived from radiation level. */
  particleRate = 0

  /** Active radiation event being decoded, or null. */
  activeEvent: RadEventId | null = null

  /** Whether an event alert is pending player response. */
  eventAlertPending = false

  /** Whether decode minigame is active. */
  decoding = false

  /** Last sol number for cumulative dose reset. */
  private lastSol = -1

  /**
   * Update dose accumulation. Called each frame by RadHudController.
   */
  accumulateDose(doseRateMGy: number, deltaSec: number, currentSol: number): void {
    if (currentSol !== this.lastSol) {
      this.cumulativeDoseSol = 0
      this.lastSol = currentSol
    }
    // doseRate is mGy/day; Mars sol ≈ 88775 seconds
    const dayFraction = deltaSec / 88775
    this.cumulativeDoseSol += doseRateMGy * dayFraction
  }
}
