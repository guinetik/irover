import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

/**
 * Low-gain antenna — direct-to-Earth link (status UI only for now).
 * Planned: downlink archived ChemCam spectra from `useChemCamArchive` (pending transmission) for mission funding.
 */
export class AntennaLGController extends InstrumentController {
  readonly id = 'antenna-lg'
  readonly name = 'LGA'
  readonly slot = 10
  readonly focusNodeName = 'antenna_LG'
  readonly focusOffset = new THREE.Vector3(0.0, 0.2, -0.2)
  readonly viewAngle = Math.PI * 0.85    // from behind, slightly right
  readonly viewPitch = 0.25

  // Fake comms data
  signalStrength = 72       // percent
  dataRate = 0.5            // kbps to Earth direct
  linkStatus = 'CONNECTED'  // CONNECTED | SEARCHING | NO SIGNAL
  targetBody = 'EARTH'
}
