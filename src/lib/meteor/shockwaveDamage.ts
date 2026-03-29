import type { InstrumentTier } from '@/lib/hazards/hazardTypes'

/** Kill zone: same as waypoint marker ring radius. */
export const KILL_RADIUS = 1.5

/** Shockwave extends to this multiple of the kill radius. */
export const SHOCKWAVE_RADIUS_MULTIPLIER = 10

const SHOCKWAVE_BASE_DAMAGE: Record<InstrumentTier, number> = {
  rugged:    0.03,
  standard:  0.08,
  sensitive: 0.15,
}

/**
 * Flat durability deduction for a meteor shockwave.
 * Returns 0 if beyond the shockwave radius.
 * Applied directly via instrument.applyHazardDamage(), NOT through hazardDecay.
 */
export function computeShockwaveDamage(
  distanceToImpact: number,
  shockwaveRadius: number,
  instrumentTier: InstrumentTier,
): number {
  if (distanceToImpact >= shockwaveRadius) return 0
  const falloff = 1.0 - (distanceToImpact / shockwaveRadius)
  return SHOCKWAVE_BASE_DAMAGE[instrumentTier] * falloff
}
