import type { HazardEvent, InstrumentTier } from './hazardTypes'

const TIER_COEFFICIENTS: Record<string, Record<InstrumentTier, number>> = {
  'dust-storm': { rugged: 0.30, standard: 0.50, sensitive: 0.70 },
  'radiation':  { rugged: 0.15, standard: 0.35, sensitive: 0.60 },
}

/** Per-level speed/accuracy penalty coefficients during active storms. */
const STORM_PERFORMANCE_COEFFICIENTS: Record<InstrumentTier, number> = {
  rugged: 0.02,
  standard: 0.05,
  sensitive: 0.08,
}

export function computeDecayMultiplier(
  events: HazardEvent[],
  tier: InstrumentTier,
): number {
  let bonus = 0
  for (const e of events) {
    if (!e.active) continue
    const coeffs = TIER_COEFFICIENTS[e.source]
    if (!coeffs) continue
    bonus += e.level * coeffs[tier]
  }
  return 1.0 + bonus
}

/**
 * Duration multiplier from active dust storms (>1 = slower).
 * Applied to analysis speed and accuracy in addition to durability decay.
 */
export function computeStormPerformancePenalty(stormLevel: number, tier: InstrumentTier): number {
  if (stormLevel <= 0) return 1.0
  return 1.0 + stormLevel * STORM_PERFORMANCE_COEFFICIENTS[tier]
}

/** Per-level speed/accuracy penalty coefficients during active radiation events. */
const RADIATION_PERFORMANCE_COEFFICIENTS: Record<InstrumentTier, number> = {
  rugged:    0.01,
  standard:  0.04,
  sensitive: 0.08,
}

/**
 * Duration multiplier from elevated radiation (>1 = slower).
 * Below 0.25 is a safe zone with no penalty.
 * Applied to analysis speed and accuracy in addition to durability decay.
 */
export function computeRadiationPerformancePenalty(
  radiationLevel: number,
  tier: InstrumentTier,
): number {
  if (radiationLevel <= 0.25) return 1.0
  const effectiveLevel = (radiationLevel - 0.25) / 0.75
  return 1.0 + effectiveLevel * 5 * RADIATION_PERFORMANCE_COEFFICIENTS[tier]
}
