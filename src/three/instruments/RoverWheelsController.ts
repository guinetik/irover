import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

/**
 * Mobility / wheel motors — billed on the main bus while the chassis translates.
 * `baseDriveW` is synced from {@link useMarsPower} profile each frame; durability and
 * upgrades scale effective draw and (at 0% durability) disable drive in {@link RoverController}.
 */
export class RoverWheelsController extends InstrumentController {
  readonly id = 'wheels'
  readonly name = 'WHLS'
  readonly slot = 12
  /**
   * Left rocker-bogie root under `body` — arms, rods, steer pivots, and wheels (see GLTF:
   * `suspension_axel_L` → `suspension_arm_*`, `suspension_rod_*`, `wheel_*`). Selection glow
   * applies to this whole subtree instead of a single tire.
   */
  readonly focusNodeName = 'suspension_axel_L'
  override readonly altNodeNames = [
    'suspension_axel_R',
    'suspension_xmember',
    'wheel_02_L',
    'wheel_02_R',
    'Chassis',
    'body001',
    'body',
  ]
  /** Nudge look-at slightly inboard / up toward the linkage mass. */
  readonly focusOffset = new THREE.Vector3(0.06, 0.1, 0)
  /** Default orbit azimuth when opening the panel (rover heading added in RoverController). */
  readonly viewAngle = Math.PI * 0.92
  /**
   * Orbit elevation — slightly above horizontal so the near ground plane does not clip the lens
   * (negative pitch sat too low when focused on wheel height).
   */
  readonly viewPitch = 0.1
  override readonly canActivate = false
  /**
   * No main-bus draw for merely opening the WHLS card — mobility is billed only while translating
   * via {@link getDrivePowerW} in the site power tick (`driveMotorW`).
   */
  override readonly selectionIdlePowerW = 0

  /**
   * Nominal motor draw (W) while moving — mirror `RoverPowerProfile.baseDriveW`;
   * MartianSiteView copies from the live profile each frame.
   */
  baseDriveW = 5

  /** 0 = broken (no traction / no billed drive power); 100 = nominal. */
  durabilityPct = 100

  /** Upgrade tier for future track efficiency (each step +5% modeled draw ceiling). */
  upgradeLevel = 0

  /** True when durability allows drive and motor bus load. */
  get operational(): boolean {
    return this.durabilityPct > 0
  }

  /**
   * Scales billed motor power from wear and placeholder upgrade track.
   */
  get powerEfficiency(): number {
    if (!this.operational) return 0
    const wear = this.durabilityPct / 100
    const upg = 1 + this.upgradeLevel * 0.05
    return Math.min(1.25, wear * upg)
  }

  /**
   * Instantaneous wheel-motor draw (W) for the power tick while the rover is translating.
   */
  getDrivePowerW(): number {
    return this.baseDriveW * this.powerEfficiency
  }

  /**
   * Restore mobility hardware to full health (resource costs can be added later).
   */
  repair(): void {
    this.durabilityPct = 100
  }

  /**
   * Apply the next tier on the mobility upgrade track (stub for future mechanics).
   */
  applyUpgrade(): void {
    if (this.upgradeLevel < 5) this.upgradeLevel += 1
  }
}
