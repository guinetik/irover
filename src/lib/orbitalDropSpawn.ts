export interface OrbitalDropSpawnPosition {
  x: number
  z: number
}

const MIN_DROP_DISTANCE = 18
const MAX_DROP_DISTANCE = 36

/**
 * Resolves a randomized fallback drop position around the rover unless explicit coordinates are provided.
 */
export function resolveRandomOrbitalDropPosition(
  roverPosition: OrbitalDropSpawnPosition,
  options: Partial<OrbitalDropSpawnPosition>,
  random: () => number = Math.random,
): OrbitalDropSpawnPosition {
  if (options.x != null && options.z != null) {
    return { x: options.x, z: options.z }
  }

  const angle = random() * Math.PI * 2
  const distance = MIN_DROP_DISTANCE + (MAX_DROP_DISTANCE - MIN_DROP_DISTANCE) * random()
  return {
    x: roverPosition.x + Math.cos(angle) * distance,
    z: roverPosition.z + Math.sin(angle) * distance,
  }
}
