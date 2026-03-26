import type { TerrainParams } from '@/types/terrain'
import {
  DUST_STORM_LEVEL_LABELS,
  diurnalAmbientC,
  peakStormWindMs,
  siteBaseWindMs,
  siteHumidityFraction,
  sitePressureHpa,
  siteRng01,
} from './rems'

// ── Types ──────────────────────────────────────────────────────────────

export type StormPhase = 'idle' | 'incoming' | 'active' | 'cooldown'

export type WeatherStormPhase = 'none' | 'incoming' | 'active'

export interface SiteWeatherSnapshot {
  windMs: number
  windDirDeg: number
  tempC: number
  pressureHpa: number
  humidityPct: number
  uvIndex: number
  dustStormPhase: WeatherStormPhase
  dustStormLevel: number | null
}

export interface StormState {
  phase: StormPhase
  timer: number
  idleCountdown: number
  salt: number
  level: number
}

export interface StormTickResult {
  state: StormState
  /** Non-null when a new storm starts approaching. */
  incomingText: string | null
  /** Non-null when storm becomes active. */
  activeText: string | null
  /** Whether the storm currently affects weather readings. */
  affectsReadouts: boolean
}

// ── Storm FSM ──────────────────────────────────────────────────────────

export function createStormState(): StormState {
  return { phase: 'idle', timer: 0, idleCountdown: 55, salt: 0, level: 1 }
}

/**
 * Advance the dust storm finite state machine by one frame.
 * Pure function — returns new state + text events without mutating the input.
 */
export function tickStormFSM(
  prev: StormState,
  dt: number,
  stormSeed: number,
  sol: number,
  stormChance: number,
): StormTickResult {
  // Shallow copy so we don't mutate the caller's object
  const s: StormState = { ...prev }
  let incomingText: string | null = null
  let activeText: string | null = null

  if (s.phase === 'idle') {
    s.idleCountdown -= dt
    if (s.idleCountdown <= 0) {
      if (siteRng01(stormSeed, sol, s.salt + 100) < stormChance) {
        s.phase = 'incoming'
        s.timer = 22
        s.level = 1 + Math.floor(siteRng01(stormSeed, sol, s.salt + 777) * 5)
        const label = DUST_STORM_LEVEL_LABELS[s.level] ?? 'Moderate'
        incomingText = `REMS: Level ${s.level} (${label}) dust storm approaching — expect high winds.`
      } else {
        s.salt += 1
        s.idleCountdown = 25 + siteRng01(stormSeed, sol, s.salt) * 95
      }
    }
  } else if (s.phase === 'incoming') {
    s.timer -= dt
    if (s.timer <= 0) {
      s.phase = 'active'
      s.timer = 48
      const label = DUST_STORM_LEVEL_LABELS[s.level] ?? 'Moderate'
      activeText = `Regional dust storm in progress — Level ${s.level} (${label}).`
    }
  } else if (s.phase === 'active') {
    s.timer -= dt
    if (s.timer <= 0) {
      s.phase = 'cooldown'
      s.timer = 75
    }
  } else if (s.phase === 'cooldown') {
    s.timer -= dt
    if (s.timer <= 0) {
      s.phase = 'idle'
      s.salt += 17
      s.idleCountdown = 40 + siteRng01(stormSeed, sol, s.salt) * 100
    }
  }

  const affectsReadouts = s.phase === 'incoming' || s.phase === 'active'
  return { state: s, incomingText, activeText, affectsReadouts }
}

// ── Weather computation ────────────────────────────────────────────────

/**
 * Compute full site weather for one frame. Pure function — no Vue, no Three.js.
 */
export function computeSiteWeather(
  terrain: TerrainParams | null,
  simulationTime: number,
  timeOfDay: number,
  sol: number,
  dustCover: number,
  ambientEffectiveC: number,
  storm: StormState,
  stormAffects: boolean,
): SiteWeatherSnapshot {
  const dustStormPhase: WeatherStormPhase =
    storm.phase === 'incoming' ? 'incoming' : storm.phase === 'active' ? 'active' : 'none'
  const dustStormLevel = stormAffects ? storm.level : null

  if (!terrain) {
    let windMs = 5
    const windDirDeg = 90
    let pressureHpa = 610
    let humidityPct = 2
    let tempC = ambientEffectiveC
    let uvIndex = 3
    if (stormAffects) {
      const peak = peakStormWindMs(storm.level, dustCover, simulationTime)
      const ramp =
        storm.phase === 'incoming' ? 1 - Math.max(0, Math.min(1, storm.timer / 22)) : 1
      windMs = storm.phase === 'incoming' ? 5 + (peak - 5) * ramp : peak
      pressureHpa -= 2 * storm.level
      humidityPct = Math.max(0.2, humidityPct - storm.level * 0.4)
      uvIndex = Math.max(0, uvIndex - storm.level * 0.8)
      tempC -= 0.15 * storm.level
    }
    return { windMs, windDirDeg, pressureHpa, humidityPct, tempC, uvIndex, dustStormPhase, dustStormLevel }
  }

  const seed = terrain.seed

  // Wind
  const wBase = siteBaseWindMs(terrain)
  let windMs = Math.max(
    0.2,
    wBase +
      Math.sin(simulationTime * 0.67 + seed * 0.01) * 2.2 +
      Math.sin(simulationTime * 2.1) * 0.9,
  )
  let windDirDeg =
    (terrain.seed * 0.37 + sol * 41.7 + simulationTime * 8.5 + Math.sin(simulationTime * 0.15) * 25) % 360

  // Temperature
  const t = diurnalAmbientC(timeOfDay, terrain.temperatureMinK, terrain.temperatureMaxK)
  const micro =
    Math.sin(simulationTime * 0.55) * 1.1 +
    Math.sin(simulationTime * 1.83) * 0.45 +
    Math.sin(simulationTime * 0.09 + seed) * 0.35
  let tempC = t + micro

  // Pressure
  const pBase = sitePressureHpa(terrain)
  let pressureHpa = pBase + Math.sin(simulationTime * 0.31 + seed) * 1.2 + siteRng01(seed, sol, 7) * 0.4

  // Humidity
  const humFrac = siteHumidityFraction(terrain)
  let humidityPct = Math.max(
    0.1,
    Math.min(
      20,
      humFrac * 100 + Math.sin(simulationTime * 0.42) * 0.35 - terrain.dustCover * 1.5,
    ),
  )

  // UV
  const sunUp = 0.5 + 0.5 * Math.sin((timeOfDay - 0.25) * Math.PI * 2)
  let uvIndex = Math.max(
    0,
    Math.min(
      12,
      3 + sunUp * 5 - terrain.dustCover * 2 + siteRng01(seed, sol, 3) * 0.8,
    ),
  )

  // Storm effects on all readings
  if (stormAffects) {
    const peak = peakStormWindMs(storm.level, dustCover, simulationTime)
    const ramp = storm.phase === 'incoming' ? 1 - Math.max(0, Math.min(1, storm.timer / 22)) : 1
    windMs = storm.phase === 'incoming' ? windMs + (peak - windMs) * ramp : peak
    windDirDeg += Math.sin(simulationTime * (2.1 + storm.level * 0.4)) * (18 + storm.level * 6)
    pressureHpa -= 1.2 * storm.level + dustCover * 4
    humidityPct = Math.max(0.15, humidityPct - storm.level * 0.55)
    uvIndex = Math.max(0, uvIndex - storm.level * 1.1 - dustCover * 1.5)
    tempC -= 0.4 * storm.level + dustCover * 0.6
  }

  return { windMs, windDirDeg, pressureHpa, humidityPct, tempC, uvIndex, dustStormPhase, dustStormLevel }
}
