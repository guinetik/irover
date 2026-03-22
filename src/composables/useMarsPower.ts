import { computed, ref } from 'vue'

/** Damaged RTG baseline (W), per GDD. */
const DEFAULT_RTG_W = 15
/** Starter solar peak at noon (W) before mission upgrades. */
const DEFAULT_SOLAR_PEAK_W = 30
/** Core avionics / life-support (W). */
const CORE_W = 8
/** Drive motors while moving (W). */
const DRIVE_W = 5
/** APXS laser drill sustained draw (W). */
export const APXS_DRILL_W = 6

/**
 * Scales Wh integration so battery changes are visible with an accelerated sol.
 * See docs/superpowers/specs/gdd-power-simulation-mvp-design.md
 */
const ECONOMY_WH_PER_W_SEC = 1 / 90

const batteryWh = ref(42)
const capacityWh = ref(50)
const solarPeakW = ref(DEFAULT_SOLAR_PEAK_W)
const rtgW = ref(DEFAULT_RTG_W)

const generationW = ref(0)
const consumptionW = ref(0)

const netW = computed(() => generationW.value - consumptionW.value)

export interface PowerTickInput {
  /** MarsSky.nightFactor — 1 = full night. */
  nightFactor: number
  /** SiteScene.roverInSunlight — reduces solar when sun up but shadowed. */
  roverInSunlight: boolean
  /** RoverController.isMoving */
  moving: boolean
  /** True while APXS drill is firing. */
  apxsDrilling: boolean
}

/**
 * Reactive rover power budget (singleton). Integrates battery from generation − load.
 */
export function useMarsPower() {
  function tickPower(deltaSeconds: number, input: PowerTickInput): void {
    const daylight = 1 - input.nightFactor
    const shadowFactor = input.roverInSunlight ? 1 : 0.28
    const solarW = solarPeakW.value * daylight * shadowFactor
    generationW.value = rtgW.value + solarW

    let use = CORE_W
    if (input.moving) use += DRIVE_W
    if (input.apxsDrilling) use += APXS_DRILL_W
    consumptionW.value = use

    const net = generationW.value - consumptionW.value
    batteryWh.value = Math.max(
      0,
      Math.min(capacityWh.value, batteryWh.value + net * deltaSeconds * ECONOMY_WH_PER_W_SEC),
    )
  }

  return {
    batteryWh,
    capacityWh,
    solarPeakW,
    rtgW,
    generationW,
    consumptionW,
    netW,
    tickPower,
    /** GDD constants for UI / other systems */
    APXS_DRILL_W,
  }
}
