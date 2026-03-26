import type { TerrainParams } from '@/types/terrain'

/** Human-readable label for dust storm intensity (levels 1–5). */
export const DUST_STORM_LEVEL_LABELS = ['', 'Minor', 'Moderate', 'Strong', 'Severe', 'Extreme'] as const

function kelvinToCelsius(k: number): number {
  return k - 273.15
}

/**
 * Air temperature (°C) diurnal curve vs fractional sol.
 * Same cosine phase as the site thermal diurnal model so REMS matches heater ambient air.
 */
export function diurnalAmbientC(timeOfDay: number, minK: number, maxK: number): number {
  const minC = kelvinToCelsius(minK)
  const maxC = kelvinToCelsius(maxK)
  const phase = timeOfDay * Math.PI * 2
  const t = (Math.cos(phase) + 1) / 2
  return maxC + (minC - maxC) * t
}

/**
 * Deterministic 0..1 from site seed + sol + salt (stable replays).
 */
export function siteRng01(siteSeed: number, sol: number, salt: number): number {
  const x = Math.sin(siteSeed * 0.001 + sol * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

/**
 * Maps meteorological wind direction (deg, direction wind blows **from**) to compass label.
 */
export function windFromDegToCompass(deg: number): string {
  const d = ((deg % 360) + 360) % 360
  const idx = Math.round(d / 22.5) % 16
  return COMPASS[idx] ?? 'N'
}

/**
 * Baseline wind speed (m/s) from terrain parameters.
 */
export function siteBaseWindMs(p: TerrainParams): number {
  let w = 2.5 + p.roughness * 7 + p.dustCover * 5
  if (p.featureType === 'polar-cap') w += 3
  if (p.featureType === 'canyon') w += 1.5
  return w
}

/**
 * Reference surface pressure (hPa) from terrain.
 */
export function sitePressureHpa(p: TerrainParams): number {
  let base = 610 - p.elevation * 14
  if (p.featureType === 'polar-cap') base -= 8
  return base
}

/**
 * Humidity fraction 0..1 from terrain chemistry / dust (before % display).
 */
export function siteHumidityFraction(p: TerrainParams): number {
  const h = 0.015 + p.waterIceIndex * 0.1 - p.dustCover * 0.025 + p.silicateIndex * 0.012
  return Math.max(0.001, Math.min(0.12, h))
}

/**
 * Peak sustained wind (m/s) for a dust storm — scales with level and site dust cover.
 */
export function peakStormWindMs(level: number, dustCover: number, simulationTime: number): number {
  const L = Math.max(1, Math.min(5, level))
  const base = 14 + L * 16 + dustCover * 28
  const gust = Math.sin(simulationTime * (4.2 + L * 0.35)) * (6 + L * 5)
  const micro = Math.sin(simulationTime * 11.7) * (2 + L)
  return Math.max(18, base + gust + micro)
}
