import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class MastCamController extends InstrumentController {
  readonly id = 'mastcam'
  readonly name = 'MastCam'
  readonly slot = 1
  readonly focusNodeName = 'MastCam'
  readonly focusOffset = new THREE.Vector3(0.1, -0.05, 0.2)
  readonly viewAngle = 0.2               // front, slightly right
  readonly viewPitch = 0.05
}
