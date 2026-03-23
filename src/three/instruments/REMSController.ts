import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class REMSController extends InstrumentController {
  readonly id = 'rems'
  readonly name = 'REMS'
  readonly slot = 7
  override readonly canActivate = true
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'REMS'
  readonly focusOffset = new THREE.Vector3(0.15, 0.1, 0.2)
  /** Azimuth around the boom — deck sensors read best from a raised orbit (see viewPitch). */
  readonly viewAngle = 0.35
  /** Steep pitch: camera above the deck looking down, like standing over the rover. */
  readonly viewPitch = 1.02
  override readonly selectionIdlePowerW = 1

  // Fake weather data (will be driven by a weather system later)
  temperature = -23
  windSpeed = 12
  pressure = 636
  humidity = 0.03
  uvIndex = 4.2

  // Quality buff
  readonly buffRadius = 3        // meters
  readonly qualityBuff = 0.10    // +10% sample quality in radius

  /** False when player has put REMS on STANDBY (no passive bus draw). */
  get surveying(): boolean {
    return this.passiveSubsystemEnabled
  }
}
