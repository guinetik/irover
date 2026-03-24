import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

/**
 * Low-gain antenna — direct-to-Earth link.
 * Receives mission updates from Earth via the mailbox composable. The tick handler
 * polls for unread messages each sol, sends a heartbeat once per sol, and sets
 * `linkStatus` based on whether the passive subsystem is enabled.
 */
export class AntennaLGController extends InstrumentController {
  readonly id = 'antenna-lg'
  readonly name = 'LGA'
  readonly slot = 11
  override readonly canActivate = true
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'antenna_LG'
  readonly focusOffset = new THREE.Vector3(0.0, 0.2, -0.2)
  readonly viewAngle = Math.PI * 0.85    // from behind, slightly right
  readonly viewPitch = 0.25
  override readonly selectionIdlePowerW = 2

  // Mailbox / heartbeat state — managed by tick handler
  heartbeatSentThisSol = false
  lastHeartbeatSol = -1
  unreadCount = 0
  linkStatus: 'LINKED' | 'OFF' = 'LINKED'
  targetBody = 'EARTH'
}
