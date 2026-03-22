import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class APXSController extends InstrumentController {
  readonly id = 'apxs'
  readonly name = 'APXS'
  readonly slot = 3
  readonly focusNodeName = 'APXS'
  readonly focusOffset = new THREE.Vector3(0.3, 0.1, 0.3)
  readonly viewAngle = Math.PI * 0.4
  readonly viewPitch = 0.3
}
