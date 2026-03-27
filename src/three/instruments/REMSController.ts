import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'
import type { InstrumentTier } from '@/lib/hazards'

/** Instrument toolbar / overlay slot index for REMS. */
export const REMS_SLOT = 8

/**
 * REMS on Curiosity lives on the Remote Sensing Mast (horizontal sensor booms), not the deck.
 * The GLB still contains a mislabeled `REMS` mesh under Chassis; gameplay targets mast geometry instead.
 */
export class REMSController extends InstrumentController {
  readonly id = 'rems'
  readonly name = 'REMS'
  readonly slot = REMS_SLOT
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.40
  override readonly repairComponentId = 'science-components'
  override readonly tier: InstrumentTier = 'sensitive'
  override readonly usageDecayChance = 0.10
  override readonly usageDecayAmount = 0.5
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Start OFF — player activates during REMS mission. */
  override passiveSubsystemEnabled = false
  /** Lower mast assembly that carries the REMS booms in `nasa_curiosity_clean.glb`. */
  readonly focusNodeName = 'mast_01.001'
  readonly altNodeNames = ['mast_01001']
  /**
   * REMS boom hardware: group `mast_01000` → mesh `mast_01000_0` in the Three.js editor (uuid `e234e0ce-09ac-4809-8a32-55e9fe2810e4`);
   * shipped GLB uses glTF names `mast_01.000` / `mast_01.000_0`. `mast_01.001_0` is the full lower mast column — do not add.
   */
  override readonly selectionHighlightRootNames = ['mast_01000', 'mast_01.000'] as const
  override readonly selectionHighlightResolveFirstOnly = true
  readonly focusOffset = new THREE.Vector3(0.08, 0.06, 0.18)
  /** Orbit azimuth; same side as 0.22 framing, nudged a bit further (see RoverController instrument orbit). */
  readonly viewAngle = 0.12
  /** Side-ish orbit to frame mast booms (not deck-top-down). */
  readonly viewPitch = 0.52
  override readonly selectionIdlePowerW = 1

  /** Air temperature (°C) from site REMS model while surveying. */
  temperature = -23
  /** Wind speed (m/s). */
  windSpeed = 12
  /** Meteorological wind direction (deg): direction wind blows **from**, 0 = north. */
  windDirectionDeg = 0
  /** Typical surface pressure (hPa). */
  pressure = 636
  /** Water vapour as fraction 0–1. */
  humidity = 0.03
  uvIndex = 4.2

  // Quality buff
  readonly buffRadius = 3        // meters
  readonly qualityBuff = 0.10    // +10% sample quality in radius

  /** False when player has put REMS on STANDBY (no passive bus draw). */
  get surveying(): boolean {
    return this.passiveSubsystemEnabled
  }

  /**
   * Orbit around the lower mast pivot (`mast_01.001`), not the REMS boom highlight subtree alone.
   */
  override getWorldFocusPosition(): THREE.Vector3 {
    if (!this.node) return new THREE.Vector3()
    const worldPos = new THREE.Vector3()
    this.node.getWorldPosition(worldPos)
    return worldPos
  }
}
