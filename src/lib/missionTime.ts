/**
 * Mission time scaling — all scene-second durations that represent “Mars time” should derive from
 * {@link SOL_DURATION} and the HUD sol clock so changing day length is a single constant change.
 *
 * @see MarsSky.SOL_DURATION — real-time seconds for one full in-game sol (timeOfDay 0→1).
 * @see MarsSky.MARS_SOL_CLOCK_MINUTES — length of that sol on the sol clock (24h 37m).
 */

import { MARS_SOL_CLOCK_MINUTES, SOL_DURATION } from '@/three/MarsSky'

/** Real-time seconds representing one full in-game sol. */
export function secondsPerSol(): number {
  return SOL_DURATION
}

/**
 * Converts a fraction of one sol (0–1) to scene seconds (same units as `getSceneDelta`).
 * Example: `0.5` → half a sol of real time.
 */
export function sceneSecondsFromSolFraction(fraction: number): number {
  return fraction * SOL_DURATION
}

/**
 * Converts “Mars sol clock” hours (as shown on HUD — 24h37m per sol) to scene seconds.
 * Example: `3` ≈ three Mars-clock hours; `24` ≈ one sol minus 37 minutes — prefer {@link sceneSecondsFromSolFraction} for whole sols.
 */
export function sceneSecondsFromMarsClockHours(hours: number): number {
  const hoursPerSol = MARS_SOL_CLOCK_MINUTES / 60
  return (hours / hoursPerSol) * SOL_DURATION
}

/**
 * Converts Mars-clock hours to a sol-fraction (0–1 timeOfDay units).
 * Example: `8` → the fraction of the sol at 08:00 on the HUD clock.
 */
export function solFractionFromMarsClockHours(hours: number): number {
  return (hours * 60) / MARS_SOL_CLOCK_MINUTES
}

/**
 * Converts Mars-clock minutes to a sol-fraction (0–1 timeOfDay units).
 */
export function solFractionFromMarsClockMinutes(minutes: number): number {
  return minutes / MARS_SOL_CLOCK_MINUTES
}

/**
 * RTG and other balance knobs — expressed in mission language, resolved to scene seconds here.
 * Tweak fractions/hours only; do not scatter raw second literals for mission-timed effects.
 */
export const RTG_MISSION_DURATIONS = {
  /** Emergency overdrive burst — Mars-clock hours of “full burn”. */
  overdriveBurstMarsClockHours: 2,
  /** Instrument lockout after burst — fraction of one sol. */
  overdriveInstrumentLockSolFraction: 0.5,
  /** Cannot re-overdrive until this much of a sol passes. */
  overdriveRechargeSolFraction: 1,
  /** Power shunt: drive offline + half load — Mars-clock hours. */
  powerShuntEffectMarsClockHours: 3,
  /** Before shunt can be used again — Mars-clock hours (24 ≈ one sol on the clock). */
  powerShuntRecoveryMarsClockHours: 24,
} as const

/** When true, RTG overdrive durations are shortened to a few seconds for the tutorial mission. */
let rtgTutorialMode = false

export function setRtgTutorialMode(on: boolean): void {
  rtgTutorialMode = on
}

/** Scene-second lengths for RTG timers (use with {@link missionCooldowns}). */
export function getRtgPhaseSceneSeconds(): {
  overdriveBurst: number
  overdriveInstrumentLock: number
  overdriveRecharge: number
  powerShuntEffect: number
  powerShuntRecovery: number
} {
  if (rtgTutorialMode) {
    return {
      overdriveBurst: 8,          // 8 seconds burst — enough to see the waypoint appear
      overdriveInstrumentLock: 3,  // 3 seconds cooldown
      overdriveRecharge: 3,        // 3 seconds recharge
      powerShuntEffect: 5,
      powerShuntRecovery: 5,
    }
  }
  const d = RTG_MISSION_DURATIONS
  return {
    overdriveBurst: sceneSecondsFromMarsClockHours(d.overdriveBurstMarsClockHours),
    overdriveInstrumentLock: sceneSecondsFromSolFraction(d.overdriveInstrumentLockSolFraction),
    overdriveRecharge: sceneSecondsFromSolFraction(d.overdriveRechargeSolFraction),
    powerShuntEffect: sceneSecondsFromMarsClockHours(d.powerShuntEffectMarsClockHours),
    powerShuntRecovery: sceneSecondsFromMarsClockHours(d.powerShuntRecoveryMarsClockHours),
  }
}

/**
 * Heater emergency overdrive — mission-language knobs resolved to scene seconds (same units as
 * `getSceneDelta` from the site game clock / `missionCooldowns.tick`).
 */
export const HEATER_MISSION_DURATIONS = {
  /** Doubled heater thermal output — Mars-clock hours. */
  overdriveHeatMarsClockHours: 12,
  /** Cannot re-engage until this many full sols after activation. */
  overdriveLockoutSols: 2,
} as const

/** Scene-second lengths for heater overdrive (use with {@link missionCooldowns}). */
export function getHeaterOverdriveSceneSeconds(): {
  heatBoost: number
  lockoutCooldown: number
} {
  const d = HEATER_MISSION_DURATIONS
  return {
    heatBoost: sceneSecondsFromMarsClockHours(d.overdriveHeatMarsClockHours),
    lockoutCooldown: sceneSecondsFromSolFraction(d.overdriveLockoutSols),
  }
}
