/** Orbital period in Mars solar hours (24.6h per sol). */
const PHOBOS_PERIOD_H = 7.65
const DEIMOS_PERIOD_H = 30.3
const SOL_HOURS = 24.6

/** Phobos orbital inclination to Mars equator (~1.08°). */
const PHOBOS_INCLINATION_RAD = 1.08 * Math.PI / 180
/** Deimos orbital inclination (~1.79°). */
const DEIMOS_INCLINATION_RAD = 1.79 * Math.PI / 180

/** Maximum latitude (degrees) from which Phobos is visible (~70°). */
export const PHOBOS_VISIBILITY_LAT = 70

export interface MoonPosition {
  /** Azimuth in radians (0 = east, PI/2 = north, PI = west, 3PI/2 = south). */
  azimuthRad: number
  /** Elevation in radians above horizon. Negative = below horizon. */
  elevationRad: number
}

/**
 * Compute apparent position of Phobos from the Martian surface.
 * Phobos orbits in 7.65h — faster than Mars rotates (24.6h sol).
 * From the surface it rises in the west and sets in the east (retrograde apparent motion).
 */
export function phobosPosition(timeOfDay: number, sol: number): MoonPosition {
  const orbitalRate = (2 * Math.PI) / PHOBOS_PERIOD_H

  const hoursIntoSol = timeOfDay * SOL_HOURS
  const totalHours = sol * SOL_HOURS + hoursIntoSol

  // Azimuth tracks the orbital angle — Phobos completes one lap in 7.65h.
  // Because it orbits faster than Mars rotates, apparent motion is westward (retrograde).
  const orbitalPhase = (orbitalRate * totalHours) % (2 * Math.PI)
  const azimuthRad = ((orbitalPhase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

  const elevationBase = Math.sin(orbitalPhase) * PHOBOS_INCLINATION_RAD
  const transitElevation = 0.7
  const elevationRad = transitElevation * Math.cos(azimuthRad) + elevationBase

  return { azimuthRad, elevationRad }
}

/**
 * Compute apparent position of Deimos from the Martian surface.
 * Deimos orbits in 30.3h — slightly slower than Mars surface rotation.
 * Rises in the east, sets in the west (prograde), but very slowly.
 */
export function deimosPosition(timeOfDay: number, sol: number): MoonPosition {
  const orbitalRate = (2 * Math.PI) / DEIMOS_PERIOD_H
  const surfaceRate = (2 * Math.PI) / SOL_HOURS
  // Deimos orbits slower than Mars rotates — apparent drift is small and prograde (east to west slowly).
  const apparentRate = surfaceRate - orbitalRate

  const hoursIntoSol = timeOfDay * SOL_HOURS
  const totalHours = sol * SOL_HOURS + hoursIntoSol

  const azimuthRad = ((apparentRate * totalHours) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)

  const orbitalPhase = (orbitalRate * totalHours) % (2 * Math.PI)
  const elevationBase = Math.sin(orbitalPhase) * DEIMOS_INCLINATION_RAD
  const transitElevation = 0.6
  const elevationRad = transitElevation * Math.cos(azimuthRad) + elevationBase

  return { azimuthRad, elevationRad }
}

/**
 * Phase angle between sun direction and moon direction (0 = full, PI = new).
 */
export function moonPhaseAngle(
  sunDir: { x: number; y: number; z: number },
  moonDir: { x: number; y: number; z: number },
): number {
  const dot = sunDir.x * moonDir.x + sunDir.y * moonDir.y + sunDir.z * moonDir.z
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

/**
 * Convert azimuth + elevation to a unit direction vector (Three.js Y-up).
 */
export function moonDirFromAzEl(azimuthRad: number, elevationRad: number): { x: number; y: number; z: number } {
  const cosEl = Math.cos(elevationRad)
  return {
    x: Math.cos(azimuthRad) * cosEl,
    y: Math.sin(elevationRad),
    z: Math.sin(azimuthRad) * cosEl,
  }
}
