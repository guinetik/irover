import type { InstrumentTier } from '@/lib/hazards'
import { computeStormPerformancePenalty, computeRadiationPerformancePenalty } from '@/lib/hazards'

export interface InstrumentEnvironment {
  thermalZone: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  stormLevel: number
  radiationLevel: number
}

export interface InstrumentPerformanceContext {
  /** Composite speed: profileSpeed * durability / (thermal * storm * radiation). >1 = faster. */
  speedFactor: number
  /** Composite accuracy: profileAccuracy * durability / (storm * radiation). */
  accuracyFactor: number
  /** Raw thermal zone — exposed for controllers with custom behavior (e.g. APXS CRITICAL block). */
  thermalZone: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  /** Duration multiplier from thermal zone (>1 = slower). */
  thermalMult: number
  /** Duration multiplier from dust storm (>1 = slower). */
  stormPenalty: number
  /** Duration multiplier from radiation (>1 = slower). */
  radiationPenalty: number
}

/** Duration multiplier per thermal zone (higher = slower). */
const THERMAL_DURATION_MULT: Record<string, number> = {
  OPTIMAL: 1.0,
  COLD: 0.85,
  FRIGID: 1.25,
  CRITICAL: 2.0,
}

export function resolveInstrumentPerformance(
  tier: InstrumentTier,
  durabilityFactor: number,
  env: InstrumentEnvironment,
  profileSpeedMod: number,
  profileAccuracyMod: number,
): InstrumentPerformanceContext {
  const thermalMult = THERMAL_DURATION_MULT[env.thermalZone] ?? 1.0
  const stormPenalty = computeStormPerformancePenalty(env.stormLevel, tier)
  const radiationPenalty = computeRadiationPerformancePenalty(env.radiationLevel, tier)
  const durability = Math.max(0.1, durabilityFactor)

  const speedFactor = profileSpeedMod * durability / (thermalMult * stormPenalty * radiationPenalty)
  const accuracyFactor = profileAccuracyMod * durability / (stormPenalty * radiationPenalty)

  return {
    speedFactor,
    accuracyFactor,
    thermalZone: env.thermalZone,
    thermalMult,
    stormPenalty,
    radiationPenalty,
  }
}
