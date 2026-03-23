import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class RADController extends InstrumentController {
  readonly id = 'rad'
  readonly name = 'RAD'
  readonly slot = 9
  override readonly canActivate = true
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'RAD'
  readonly focusOffset = new THREE.Vector3(0.2, 0.15, 0.2)
  readonly viewAngle = 0.45
  /** Same deck framing as REMS — orbit from above the chassis. */
  readonly viewPitch = 1.0
  override readonly selectionIdlePowerW = 2

  // Fake radiation data
  doseMsvPerSol = 0.67       // millisieverts per sol
  cumulativeMsv = 12.4       // total accumulated
  particleRate = 23           // counts per minute
  solarActivity = 'NOMINAL'  // NOMINAL | ELEVATED | STORM
  shieldIntegrity = 96        // percent
}
