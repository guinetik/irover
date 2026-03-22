import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class DANController extends InstrumentController {
  readonly id = 'dan'
  readonly name = 'DAN'
  readonly slot = 4
  readonly focusNodeName = 'DAN_L'
  readonly focusOffset = new THREE.Vector3(0.0, 0.3, 0.0)
  readonly viewAngle = Math.PI * 0.5    // from the side
  readonly viewPitch = 0.15
}
