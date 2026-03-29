import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

/** Instrument toolbar / overlay slot index for MIC. */
export const MIC_SLOT = 14

/**
 * Rover microphone — passive audio sensor. When enabled, ambient Mars sounds
 * play with volumes driven by weather, time-of-day, and storm state.
 * Audio sourced from NASA Perseverance rover mic recordings (2021).
 */
export class MicController extends InstrumentController {
  readonly id = 'mic'
  readonly name = 'Microphone'
  readonly slot = MIC_SLOT
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.15
  override readonly repairComponentId = 'engineering-components'
  override readonly usageDecayChance = 0.05
  override readonly usageDecayAmount = 0.5
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Start OFF — player enables from overlay card. */
  override passiveSubsystemEnabled = false
  /** No dedicated mesh — fall back to rover body. */
  readonly focusNodeName = 'body001'
  readonly altNodeNames = ['Chassis']
  override readonly selectionHighlightRootNames = [] as const
  readonly focusOffset = new THREE.Vector3(0, 0.1, 0)
  readonly viewAngle = 0.0
  readonly viewPitch = 0.6
}
