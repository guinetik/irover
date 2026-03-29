import * as THREE from 'three'
import { getHeaterOverdriveSceneSeconds } from '@/lib/missionTime'
import { MISSION_COOLDOWN_ID, missionCooldowns } from '@/lib/missionCooldowns'
import { InstrumentController } from './InstrumentController'
import type { ThermalZone } from '@/composables/useMarsThermal'

/** Toolbar / overlay slot for HTR — use in Vue bindings instead of a magic number. */
export const HEATER_SLOT = 10

/** Instant SOC cost for emergency heater overdrive (0–1). */
export const HEATER_OVERDRIVE_BATTERY_COST = 0.2

export class HeaterController extends InstrumentController {
  readonly id = 'heater'
  readonly name = 'HTR'
  readonly slot = HEATER_SLOT
  readonly focusNodeName = 'radiators'
  override readonly altNodeNames = ['body001', 'Chassis']
  readonly focusOffset = new THREE.Vector3(0, 0.2, 0.1)
  readonly viewAngle = -0.6
  readonly viewPitch = 0.4
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.15
  override readonly repairComponentId = 'mechatronics-components'
  override readonly usageDecayChance = 0.10
  override readonly usageDecayAmount = 0.5
  override readonly selectionIdlePowerW = 0

  // Thermal state — updated from useMarsThermal each frame by the view
  internalTempC = 15
  ambientC = -10
  heaterW = 0
  zone: ThermalZone = 'OPTIMAL'

  /** Thermostat heating contribution is doubled while this is true (see `useMarsThermal`). */
  get heatBoostActive(): boolean {
    return missionCooldowns.isActive(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_HEAT)
  }

  /** 0–1 elapsed through the heat-boost window (for HUD). */
  get heatBoostProgressElapsed01(): number {
    return missionCooldowns.progressElapsed01(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_HEAT)
  }

  /** True when overdrive can be engaged (not in sol lockout). */
  get canActivateOverdrive(): boolean {
    return !missionCooldowns.isActive(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_LOCKOUT)
  }

  /**
   * Starts heat boost + lockout timers. Caller must apply {@link HEATER_OVERDRIVE_BATTERY_COST}
   * to the pack before or after this call.
   */
  activateOverdrive(): void {
    if (!this.canActivateOverdrive) return
    const d = getHeaterOverdriveSceneSeconds()
    missionCooldowns.start(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_HEAT, d.heatBoost)
    missionCooldowns.start(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_LOCKOUT, d.lockoutCooldown)
  }

  override getInstrumentBusPowerW(_phase: 'instrument' | 'active'): number {
    return 0
  }
}
