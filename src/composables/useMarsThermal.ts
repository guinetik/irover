import { computed, ref } from 'vue'
import { MISSION_COOLDOWN_ID, missionCooldowns } from '@/lib/missionCooldowns'

export type ThermalZone = 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'

export interface ThermalTickInput {
  /** MarsSky.timeOfDay (0–1) */
  timeOfDay: number
  /** Site ambient bounds from landmarks.json / TerrainParams */
  temperatureMinK: number
  temperatureMaxK: number
  /** Max heater output in watts — from HeaterController.activePowerW (instruments.json). */
  maxHeaterW?: number
}

// --- TODO: Instrument durability & modifier system ---
// All instruments (including heater) will eventually support:
//  - Durability: degrades with use, operates less efficiently as it wears.
//    Fully broken = non-functional. Repair costs mined resources.
//    Some instruments are harder to repair than others.
//  - Upgrades: improve base efficiency (e.g. insulation upgrade reduces heat loss).
//  - Player class buffs/nerfs: percentage multipliers from RoverPowerProfile.
//  - Repair state: partially broken = reduced output, not binary on/off.
// For thermal specifically, these would affect:
//  - heaterMaxW, warmingRate, heatLossCoeff, insulationFactor
// Wire into RoverPowerProfile or a per-instrument modifier system when ready.

// --- tuning constants ---

/** RTG waste heat — constant warming bias (deg C/s, game-scaled) */
const RTG_WASTE_HEAT_CS = 0.35
/** Max heater output (W on power bus) */
const MAX_HEATER_W = 12
/** Heater warming rate at max output (deg C/s, game-scaled) */
const HEATER_MAX_WARM_CS = 0.55
/** Heat loss rate coefficient: loss = coeff * (internal - ambient) per second */
const HEAT_LOSS_COEFF = 0.02
/** Thermostat target floor — heater kicks in below this (deg C) */
const THERMOSTAT_FLOOR_C = -10
/** Thermostat target ceiling — heater shuts off above this (deg C) */
const THERMOSTAT_CEILING_C = 5
/** Insulation factor (1.0 = baseline; lower = better insulated, future upgrade) */
const INSULATION_FACTOR = 1.0

// --- singleton state ---
const internalTempC = ref(15) // start warm
const ambientEffectiveC = ref(-10)
/** Thermostat command 0…MAX_HEATER_W (bus W before overdrive). */
const heaterW = ref(0)
/** Billed / modeled heater draw including HTR overdrive double-output (0…2×MAX_HEATER_W). */
const heaterEffectiveW = ref(0)
const zone = ref<ThermalZone>('OPTIMAL')

function kelvinToCelsius(k: number): number {
  return k - 273.15
}

/**
 * Diurnal ambient curve: cosine-based so coldest near timeOfDay ~0.75 (deep night),
 * warmest near noon (~0.5). Endpoints are site min/max from landmarks.json.
 */
function diurnalAmbientC(timeOfDay: number, minK: number, maxK: number): number {
  const minC = kelvinToCelsius(minK)
  const maxC = kelvinToCelsius(maxK)
  // Phase so peak warmth is at timeOfDay=0.5 (noon), coldest at ~0.0/1.0 (midnight)
  // cos(0) = 1 at midnight (coldest), cos(pi) = -1 at noon (warmest)
  const phase = timeOfDay * Math.PI * 2
  const t = (Math.cos(phase) + 1) / 2 // 1 at midnight, 0 at noon
  return maxC + (minC - maxC) * t
}

function computeZone(tempC: number): ThermalZone {
  if (tempC >= 0) return 'OPTIMAL'
  if (tempC >= -20) return 'COLD'
  if (tempC >= -40) return 'FRIGID'
  return 'CRITICAL'
}

export function useMarsThermal() {
  function tickThermal(deltaSeconds: number, input: ThermalTickInput): void {
    const maxW = input.maxHeaterW ?? MAX_HEATER_W

    // --- Ambient ---
    ambientEffectiveC.value = diurnalAmbientC(
      input.timeOfDay,
      input.temperatureMinK,
      input.temperatureMaxK,
    )

    // --- Thermostat: bang-bang with hysteresis ---
    if (internalTempC.value < THERMOSTAT_FLOOR_C) {
      // Proportional ramp: colder = more heater
      const need = Math.min(1, (THERMOSTAT_FLOOR_C - internalTempC.value) / 20)
      heaterW.value = need * maxW
    } else if (internalTempC.value > THERMOSTAT_CEILING_C) {
      heaterW.value = 0
    }
    // Between floor and ceiling: hold current heater level (hysteresis)

    // --- Internal temp ODE ---
    const heaterOverdriveMul = missionCooldowns.isActive(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_HEAT) ? 2 : 1
    const effectiveW = heaterW.value * heaterOverdriveMul
    heaterEffectiveW.value = effectiveW
    const heaterWarmRate = (effectiveW / maxW) * HEATER_MAX_WARM_CS
    const heatIn = (RTG_WASTE_HEAT_CS + heaterWarmRate) * deltaSeconds
    const heatLoss = HEAT_LOSS_COEFF * INSULATION_FACTOR *
      (internalTempC.value - ambientEffectiveC.value) * deltaSeconds
    internalTempC.value += heatIn - heatLoss

    // --- Zone ---
    zone.value = computeZone(internalTempC.value)
  }

  return {
    internalTempC,
    ambientEffectiveC,
    heaterW,
    heaterEffectiveW,
    zone,
    MAX_HEATER_W,
    tickThermal,
  }
}
