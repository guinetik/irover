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
 * Mission-timed effects (RTG, etc.) should use `src/lib/missionTime.ts` + `missionCooldowns`, not parallel magic seconds.
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

/** Last-tick generation split (for HUD tooltips). */
const powerGenerationDetail = reactive<PowerGenerationDetail>({
  rtgW: 0,
  solarW: 0,
  daylight01: 0,
  arraysUnshadowed: true,
  solarShadeMul: 1,
})

/** Last-tick consumption lines summing to billed load (for HUD tooltips). */
const powerConsumptionLines = ref<PowerConsumptionLine[]>([])

/** Last `powerLoadFactor` from tick (1 = normal; below 1 = RTG conservation, etc.). */
const powerBusLoadFactor = ref(1)

/** One line item on the power HUD (effective billed watts after multipliers). */
export interface PowerConsumptionLine {
  id: string
  label: string
  /** Watts after profile / player mods and bus load factor */
  w: number
}

/** Generation split matching the last `tickPower` (display = model). */
export interface PowerGenerationDetail {
  rtgW: number
  solarW: number
  /** 1 − nightFactor from sky */
  daylight01: number
  /** `PowerTickInput.roverInSunlight` — false means arrays use shadow factor */
  arraysUnshadowed: boolean
  /** Effective multiplier on solar (1 or `profile.shadowFactor`) */
  solarShadeMul: number
}

export interface PowerTickInput {
  /** MarsSky.nightFactor — 1 = full night. */
  nightFactor: number
  /** SiteScene.roverInSunlight — reduces solar when sun up but shadowed. */
  roverInSunlight: boolean
  /** RoverController.isMoving */
  moving: boolean
  /** True while APXS drill is firing. */
  apxsDrilling: boolean
  /**
   * Wheel motor draw (W) while translating — from {@link RoverWheelsController};
   * replaces adding `baseDriveW` inside the composable when non-zero.
   */
  driveMotorW?: number
  /** HUD label for the drive consumption line. */
  driveMotorHudLabel?: string
  /** Extra instrument draw (W) — MastCam, ChemCam, etc. */
  instrumentW?: number
  /** HUD label for `instrumentW` when non-zero (e.g. "MastCam", "ChemCam"). */
  instrumentHudLabel?: string
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

    const rtgWFinal = profile.baseRtgW * profile.generationMult
    const solarWFinal = solarW * profile.generationMult
    powerGenerationDetail.rtgW = rtgWFinal
    powerGenerationDetail.solarW = solarWFinal
    powerGenerationDetail.daylight01 = daylight
    powerGenerationDetail.arraysUnshadowed = input.roverInSunlight
    powerGenerationDetail.solarShadeMul = shadow

    // --- Consumption (apply consumptionMult to every load) ---
    const heaterRaw = (input.heaterW ?? 0) * mod('heaterDraw')
    let baseUse: number
    let heaterBusW: number

    if (isSleeping.value) {
      baseUse = SLEEP_HIBERNATION_CORE_W
      heaterBusW = heaterRaw * SLEEP_HEATER_BUS_FRACTION
    } else {
      baseUse = profile.baseCoreW
      baseUse += input.driveMotorW ?? 0
      if (input.apxsDrilling) baseUse += APXS_DRILL_BASE_W
      baseUse += (input.instrumentW ?? 0)
      heaterBusW = heaterRaw
    }
    // Stack rover class mult * player profile mult on non-heater bus loads
    const loadFactor = input.powerLoadFactor ?? 1
    const consMod = profile.consumptionMult * mod('powerConsumption')
    consumptionW.value = (baseUse * consMod + heaterBusW) * loadFactor
    powerBusLoadFactor.value = loadFactor

    /** Build HUD lines (effective W after consMod and loadFactor). */
    const lines: PowerConsumptionLine[] = []
    if (isSleeping.value) {
      lines.push({
        id: 'hibernation',
        label: 'Sleep / hibernation bus',
        w: SLEEP_HIBERNATION_CORE_W * consMod * loadFactor,
      })
      const heatSleep = heaterBusW * loadFactor
      if (heatSleep > 1e-6) {
        lines.push({
          id: 'heater',
          label: 'Battery heater (reduced while asleep)',
          w: heatSleep,
        })
      }
    } else {
      lines.push({
        id: 'core',
        label: 'Core avionics',
        w: profile.baseCoreW * consMod * loadFactor,
      })
      const driveW = input.driveMotorW ?? 0
      if (driveW > 1e-6) {
        lines.push({
          id: 'drive',
          label: input.driveMotorHudLabel ?? 'Wheel drive',
          w: driveW * consMod * loadFactor,
        })
      }
      if (input.apxsDrilling) {
        lines.push({
          id: 'apxs',
          label: 'APXS drill',
          w: APXS_DRILL_BASE_W * consMod * loadFactor,
        })
      }
      const inst = input.instrumentW ?? 0
      if (inst > 1e-6) {
        lines.push({
          id: 'instruments',
          label: input.instrumentHudLabel?.trim() || 'Active instruments',
          w: inst * consMod * loadFactor,
        })
      }
      if (heaterBusW > 1e-6) {
        lines.push({
          id: 'heater',
          label: 'Battery heater',
          w: heaterBusW * loadFactor,
        })
      }
    }
    powerConsumptionLines.value = lines

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
    powerGenerationDetail,
    powerConsumptionLines,
    powerBusLoadFactor,
    tickPower,
    setProfile,
    fillBatteryFull,
    APXS_DRILL_BASE_W,
  }
}
