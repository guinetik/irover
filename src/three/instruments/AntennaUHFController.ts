import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

/**
 * UHF relay antenna used for science data uplink to orbiting relay satellites
 * (e.g. MRO, MAVEN). Operates passively in the background, transmitting queued
 * science data during overhead relay windows.
 */
export class AntennaUHFController extends InstrumentController {
  readonly id = 'antenna-uhf'
  readonly name = 'UHF'
  readonly slot = 12
  override readonly canActivate = true
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'antenna_UHF'
  readonly focusOffset = new THREE.Vector3(0.0, 0.15, -0.1)
  readonly viewAngle = Math.PI * 1.15    // from behind, slightly left
  readonly viewPitch = 0.2
  override readonly selectionIdlePowerW = 6

  // Dynamic comms state — set and updated by the tick handler
  passActive = false                                          // currently in a relay window
  transmitting = false                                        // actively sending data
  currentOrbiter = ''                                        // which orbiter is overhead
  transmissionProgress = 0                                    // 0-1 for current item being transmitted
  queueLength = 0                                            // pending items count
  windowRemainingSec = 0                                     // scene-seconds left in current pass
  nextPassInSec = 0                                          // scene-seconds countdown to next pass
  transmittedThisPass = 0                                    // count of items transmitted in current pass
  linkStatus: 'RELAY LOCK' | 'WAITING PASS' | 'OFF' = 'WAITING PASS'
  relayOrbiter = ''                                          // set dynamically by tick handler
}
