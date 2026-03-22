import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class SAMController extends InstrumentController {
  readonly id = 'sam'
  readonly name = 'SAM'
  readonly slot = 5
  readonly focusNodeName = 'SAM'
  readonly focusOffset = new THREE.Vector3(0.0, 0.1, 0.1)
  readonly viewAngle = 0.1              // nearly front
  readonly viewPitch = 1.1              // steep top-down looking at the deck
}
