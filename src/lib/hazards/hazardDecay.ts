import type { HazardEvent, InstrumentTier } from './hazardTypes'

const TIER_COEFFICIENTS: Record<string, Record<InstrumentTier, number>> = {
  'dust-storm': { rugged: 0.15, standard: 0.25, sensitive: 0.35 },
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
