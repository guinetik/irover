/** Duration of the fall animation in seconds (matched to meteor-fall.mp3). */
export const FALL_DURATION = 8

/** Speed of sound on Mars in m/s. */
const MARS_SPEED_OF_SOUND = 240

export function computeSkyOrigin(
  targetX: number,
  targetZ: number,
  groundY: number,
  entryAngle: number,
  azimuth: number,
): { x: number; y: number; z: number } {
  const height = 80 + Math.random() * 40
  const horizontalOffset = height / Math.tan(entryAngle)
  return {
    x: targetX + Math.cos(azimuth) * horizontalOffset,
    y: groundY + height,
    z: targetZ + Math.sin(azimuth) * horizontalOffset,
  }
}

export function rollMarkerDuration(): number {
  return 10 + Math.random() * 10
}

export function rollEntryAngle(): number {
  const deg = 30 + Math.random() * 40
  return deg * (Math.PI / 180)
}

export function rollAzimuth(): number {
  return Math.random() * Math.PI * 2
}

export function computeSoundDelay(distanceM: number): number {
  return distanceM / MARS_SPEED_OF_SOUND
}
