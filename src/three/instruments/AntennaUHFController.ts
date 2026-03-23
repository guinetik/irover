import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

export class AntennaUHFController extends InstrumentController {
  readonly id = 'antenna-uhf'
  readonly name = 'UHF'
  readonly slot = 11
  override readonly canActivate = true
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'antenna_UHF'
  readonly focusOffset = new THREE.Vector3(0.0, 0.15, -0.1)
  readonly viewAngle = Math.PI * 1.15    // from behind, slightly left
  readonly viewPitch = 0.2
  override readonly selectionIdlePowerW = 8

  // Fake comms data
  signalStrength = 95        // percent
  dataRate = 128             // kbps via orbiter relay
  linkStatus = 'RELAY LOCK'  // RELAY LOCK | WAITING PASS | NO ORBITER
  relayOrbiter = 'MRO'      // Mars Reconnaissance Orbiter
  nextPass = '02:14'         // next overhead pass time
}
