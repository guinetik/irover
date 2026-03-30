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
  override readonly passiveDecayPerSol = 0.25
  override readonly repairComponentId = 'digital-components'
  override readonly usageDecayChance = 0.15
  override readonly usageDecayAmount = 0.8
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Relay hardware off until the player ACTIVATEs (higher idle + burst draw). */
  override passiveSubsystemEnabled = false
  readonly focusNodeName = 'antenna_UHF'
  readonly focusOffset = new THREE.Vector3(0.0, 0.15, -0.1)
  readonly viewAngle = Math.PI * 1.15    // from behind, slightly left
  readonly viewPitch = 0.2
  /** Set by tick handler to scale power draw down as accuracy improves (1.0 = no bonus) */
  accuracyMod = 1.0

  // Dynamic comms state — set and updated by the tick handler
  passActive = false                                          // currently in a relay window
  transmitting = false                                        // actively sending data
  currentOrbiter = ''                                        // which orbiter is overhead
  transmissionProgress = 0                                    // 0-1 for current item being transmitted
  queueLength = 0                                            // pending items count
  windowRemainingSec = 0                                     // scene-seconds left in current pass
  nextPassInSec = 0                                          // scene-seconds countdown to next pass
  transmittedThisPass = 0                                    // count of items transmitted in current pass
  linkStatus: 'RELAY LOCK' | 'WAITING PASS' | 'OFF' = 'OFF'
  relayOrbiter = ''                                          // set dynamically by tick handler

  /** idle + activePowerW while transmitting — divided by accuracyMod (higher accuracy = less draw) */
  override getPassiveBackgroundPowerW(): number {
    if (!this.passiveSubsystemEnabled) return 0
    const base = this.transmitting
      ? this.selectionIdlePowerW + this.activePowerW
      : this.selectionIdlePowerW
    return base / this.accuracyMod
  }
}
