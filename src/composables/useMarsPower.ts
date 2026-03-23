import { computed, reactive, ref } from 'vue'
import { usePlayerProfile } from './usePlayerProfile'

/**
 * Rover power profile — swap this to change rover "class" / hero.
 * All wattages are game-tuned, not JPL-exact.
 *
 * Multipliers are percentage-based:
 *  - consumptionMult: 0.9 = 10% less consumption (buff), 1.1 = 10% more (nerf)
 *  - generationMult:  1.1 = 10% more generation (buff), 0.9 = 10% less (nerf)
 *  - capacityMult:    1.2 = 20% more battery capacity
 */
export interface RoverPowerProfile {
  /** Display name for UI */
  name: string
  /** Base max battery storage (Wh) — final = base * capacityMult */
  baseCapacityWh: number
  /** RTG steady-state baseline (W) — lower = damaged */
  baseRtgW: number
  /** Solar panel peak at noon (W) */
  baseSolarPeakW: number
  /** Core avionics / life-support always-on draw (W) */
  baseCoreW: number
  /** Drive motor draw while moving (W) */
  baseDriveW: number
  /** Solar output factor when rover is in shadow but sun is up */
  shadowFactor: number
  /** Multiplier on all consumption (< 1 = buff, > 1 = nerf) */
  consumptionMult: number
  /** Multiplier on all generation (> 1 = buff, < 1 = nerf) */
  generationMult: number
  /** Multiplier on battery capacity (> 1 = buff) */
  capacityMult: number
}

/**
 * Default "Curiosity-class" damaged rover — small pack + weak gen so mining/ChemCam
 * hurt and the pack does not snap back to full (tick uses accelerated scene time).
 */
export const CURIOSITY_PROFILE: RoverPowerProfile = {
  name: 'Curiosity',
  baseCapacityWh: 50,
  /** Low baseline — feels starved vs loads; upgrade missions can raise via profile swap */
  baseRtgW: 9,
  /** Reduced peak — noon should not erase a heavy instrument spike in seconds */
  baseSolarPeakW: 16,
  baseCoreW: 8,
  baseDriveW: 5,
  shadowFactor: 0.28,
  consumptionMult: 1.0,
  generationMult: 1.0,
  capacityMult: 1.0,
}

/** APXS laser drill sustained draw (W) while E held. Base value before profile mult. */
export const APXS_DRILL_BASE_W = 118

/**
 * Scales Wh integration so battery changes are visible with an accelerated sol.
 * Linked to MarsSky.SOL_DURATION — if sol length changes, retune this.
 * See docs/superpowers/specs/gdd-power-simulation-mvp-design.md
 */
const ECONOMY_WH_PER_W_SEC = 1 / 35

// --- sleep mode thresholds (SOC %) ---
/** SOC at or below which the rover enters sleep — exported for HUD copy */
export const POWER_SLEEP_THRESHOLD_PCT = 5
const SLEEP_THRESHOLD = POWER_SLEEP_THRESHOLD_PCT
const WAKE_THRESHOLD = 50
/**
 * While sleeping, full `baseCoreW` + max heater can exceed RTG (+ night solar), so the pack
 * stays clamped at 0% and never reaches `WAKE_THRESHOLD`. Hibernation uses a tiny bus draw
 * and only part of the heater is billed — the rest is treated as RTG waste-heat budget.
 */
const SLEEP_HIBERNATION_CORE_W = 2
const SLEEP_HEATER_BUS_FRACTION = 0.35

// --- singleton state ---
const profile = reactive<RoverPowerProfile>({ ...CURIOSITY_PROFILE })
const { mod } = usePlayerProfile()

/** Effective capacity after rover class + player profile multiplier */
const capacityWh = computed(() => profile.baseCapacityWh * profile.capacityMult * mod('batteryCapacity'))

/** Initial fill — stressed landing; not a topped-up endgame pack */
const START_SOC_FRACTION = 0.52
const batteryWh = ref(CURIOSITY_PROFILE.baseCapacityWh * START_SOC_FRACTION)
const generationW = ref(0)
const consumptionW = ref(0)
const netW = computed(() => generationW.value - consumptionW.value)
const socPct = computed(() =>
  capacityWh.value > 0 ? (batteryWh.value / capacityWh.value) * 100 : 0,
)

/** Sleep mode: rover shuts down at SLEEP_THRESHOLD%, wakes at WAKE_THRESHOLD% */
const isSleeping = ref(false)

export interface PowerTickInput {
  /** MarsSky.nightFactor — 1 = full night. */
  nightFactor: number
  /** SiteScene.roverInSunlight — reduces solar when sun up but shadowed. */
  roverInSunlight: boolean
  /** RoverController.isMoving */
  moving: boolean
  /** True while APXS drill is firing. */
  apxsDrilling: boolean
  /** Extra instrument draw (W) — MastCam, ChemCam, etc. */
  instrumentW?: number
  /** Heater draw from thermal system (W, 0–12). Added to consumption. */
  heaterW?: number
  /**
   * Multiplier on modeled bus consumption after profile + modifiers (e.g. RTG power shunt = 0.5).
   * Default 1 — does not affect generation.
   */
  powerLoadFactor?: number
}

/**
 * Reactive rover power budget (singleton). Integrates battery from generation - load.
 *
 * All base wattages are multiplied by the profile's percentage modifiers:
 *  - generation *= generationMult
 *  - consumption *= consumptionMult
 *  - capacity *= capacityMult
 */
export function useMarsPower() {
  function setProfile(p: RoverPowerProfile): void {
    Object.assign(profile, p)
    // clamp battery to new effective capacity
    batteryWh.value = Math.min(batteryWh.value, capacityWh.value)
  }

  /** Sets stored energy to current effective capacity (RTG emergency shunt, etc.). */
  function fillBatteryFull(): void {
    batteryWh.value = capacityWh.value
  }

  function tickPower(deltaSeconds: number, input: PowerTickInput): void {
    // --- Generation (apply generationMult) ---
    const daylight = 1 - input.nightFactor
    const shadow = input.roverInSunlight ? 1 : profile.shadowFactor
    const solarW = profile.baseSolarPeakW * daylight * shadow
    generationW.value = (profile.baseRtgW + solarW) * profile.generationMult

    // --- Consumption (apply consumptionMult to every load) ---
    const heaterRaw = (input.heaterW ?? 0) * mod('heaterDraw')
    let baseUse: number
    let heaterBusW: number

    if (isSleeping.value) {
      baseUse = SLEEP_HIBERNATION_CORE_W
      heaterBusW = heaterRaw * SLEEP_HEATER_BUS_FRACTION
    } else {
      baseUse = profile.baseCoreW
      if (input.moving) baseUse += profile.baseDriveW
      if (input.apxsDrilling) baseUse += APXS_DRILL_BASE_W
      baseUse += (input.instrumentW ?? 0)
      heaterBusW = heaterRaw
    }
    // Stack rover class mult * player profile mult on non-heater bus loads
    const loadFactor = input.powerLoadFactor ?? 1
    consumptionW.value = (baseUse * profile.consumptionMult * mod('powerConsumption') + heaterBusW) * loadFactor

    // --- Integrate battery ---
    const net = generationW.value - consumptionW.value
    const cap = capacityWh.value
    batteryWh.value = Math.max(
      0,
      Math.min(cap, batteryWh.value + net * deltaSeconds * ECONOMY_WH_PER_W_SEC),
    )

    // --- Sleep mode transitions ---
    if (!isSleeping.value && socPct.value <= SLEEP_THRESHOLD) {
      isSleeping.value = true
    } else if (isSleeping.value && socPct.value >= WAKE_THRESHOLD) {
      isSleeping.value = false
    }
  }

  return {
    profile,
    batteryWh,
    capacityWh,
    generationW,
    consumptionW,
    netW,
    socPct,
    isSleeping,
    tickPower,
    setProfile,
    fillBatteryFull,
    APXS_DRILL_BASE_W,
  }
}
