export interface CraterParams {
  radius: number    // 3-8m
  depth: number     // 0.8-2.5m
  rimHeight: number // 0.15-0.5m
}

/**
 * Compute the height offset at a given distance from crater center.
 * Returns negative inside the bowl, positive at the rim, zero beyond.
 */
export function computeCraterDepth(
  dist: number,
  radius: number,
  depth: number,
  rimHeight: number = 0.3,
): number {
  if (dist > radius * 1.3) return 0

  // Inside bowl: cosine falloff
  if (dist <= radius) {
    const t = dist / radius
    return -depth * (0.5 + 0.5 * Math.cos(t * Math.PI))
  }

  // Rim zone: gaussian bump
  const rimT = (dist - radius) / (radius * 0.3)
  return rimHeight * Math.exp(-rimT * rimT * 4)
}

/** Roll random crater parameters within GDD ranges. */
export function rollCraterParams(): CraterParams {
  const radius = 3 + Math.random() * 5
  const depth = 0.8 + (radius - 3) / 5 * 1.7
  const rimHeight = 0.15 + Math.random() * 0.35
  return { radius, depth, rimHeight }
}
