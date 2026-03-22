import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class ChemCamController extends InstrumentController {
  readonly id = 'chemcam'
  readonly name = 'ChemCam'
  readonly slot = 2
  readonly focusNodeName = 'mast_03001'
  readonly altNodeNames = ['mast_03.001']
  readonly focusOffset = new THREE.Vector3(0.1, -0.05, 0.2)
  readonly viewAngle = 0.2              // same as MastCam
  readonly viewPitch = 0.4              // looking down at the white box from above
}
