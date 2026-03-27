import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import type { InstrumentTier } from '@/lib/hazards'

export class RADController extends InstrumentController {
  readonly id = 'rad'
  readonly name = 'RAD'
  readonly slot = 9
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.40
  override readonly repairComponentId = 'science-components'
  override readonly tier: InstrumentTier = 'sensitive'
  override readonly usageDecayChance = 0.10
  override readonly usageDecayAmount = 0.5
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Start STANDBY until the player ACTIVATEs (matches DAN / UHF opt-in). */
  override passiveSubsystemEnabled = false
  readonly focusNodeName = 'RAD'
  readonly focusOffset = new THREE.Vector3(0.2, 0.15, 0.2)
  readonly viewAngle = 0.45
  /** Deck orbit from above the chassis (REMS uses mast-side framing). */
  readonly viewPitch = 1.0
  override readonly selectionIdlePowerW = 2

  // Fake radiation data
  doseMsvPerSol = 0.67       // millisieverts per sol
  cumulativeMsv = 12.4       // total accumulated
  particleRate = 23           // counts per minute
  solarActivity = 'NOMINAL'  // NOMINAL | ELEVATED | STORM
  shieldIntegrity = 96        // percent
}
