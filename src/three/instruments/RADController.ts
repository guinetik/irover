import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class RADController extends InstrumentController {
  readonly id = 'rad'
  readonly name = 'RAD'
  readonly slot = 8
  readonly focusNodeName = 'RAD'
  readonly focusOffset = new THREE.Vector3(0.2, 0.15, 0.2)
  readonly viewAngle = 0.4
  readonly viewPitch = 0.3

  // Fake radiation data
  doseMsvPerSol = 0.67       // millisieverts per sol
  cumulativeMsv = 12.4       // total accumulated
  particleRate = 23           // counts per minute
  solarActivity = 'NOMINAL'  // NOMINAL | ELEVATED | STORM
  shieldIntegrity = 96        // percent
}
