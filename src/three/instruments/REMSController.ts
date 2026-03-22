import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class REMSController extends InstrumentController {
  readonly id = 'rems'
  readonly name = 'REMS'
  readonly slot = 7
  readonly focusNodeName = 'REMS'
  readonly focusOffset = new THREE.Vector3(0.15, 0.1, 0.2)
  readonly viewAngle = 0.3
  readonly viewPitch = 0.2

  // Fake weather data (will be driven by a weather system later)
  temperature = -23
  windSpeed = 12
  pressure = 636
  humidity = 0.03
  uvIndex = 4.2

  // Quality buff
  readonly buffRadius = 3        // meters
  readonly qualityBuff = 0.10    // +10% sample quality in radius
  surveying = true               // always on when deployed
}
