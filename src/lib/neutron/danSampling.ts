/**
 * DAN passive neutron-hydrogen detection — site priors and hit probability (no Three.js).
 */

import type { TerrainFeatureType } from '@/types/terrain'

/** Base chance per sample interval before site / terrain multipliers. */
export const DAN_BASE_PASSIVE_HIT_RATE = 0.02

/** Terrain feature multiplier on neutron return / hydrogen sensitivity (game balance). */
export const DAN_FEATURE_ICE_MULT: Record<TerrainFeatureType, number> = {
  'polar-cap': 3.0,
  canyon: 1.5,
  basin: 1.5,
  plain: 1.0,
  volcano: 0.5,
  'landing-site': 1.0,
}

/**
 * Site water-ice prior multiplier on hit rate.
 */
export function danSiteIceMultiplier(waterIceIndex: number): number {
  if (waterIceIndex >= 0.8) return 5.0
  if (waterIceIndex >= 0.5) return 3.5
  if (waterIceIndex >= 0.3) return 2.5
  if (waterIceIndex >= 0.1) return 1.5
  return 1.0
}

/**
 * Tier-based DAN bonus: lower-tier sites give a detection/confirmation boost
 * so new players find water more easily during the tutorial phase.
 */
export function danTierBonus(tier: number): number {
  if (tier <= 1) return 1.5
  if (tier <= 2) return 1.0
  return 1.0
}

/**
 * Accumulated SP makes the rover's neutron detector slightly better calibrated.
 * Nearly flat below 200 SP, ramps slowly after. Legacy players with high SP
 * get a meaningful edge on harder maps: 500 SP ~1.12x, 1000 SP ~1.25x, 2000 SP ~1.38x.
 */
export function danSPBonus(totalSP: number): number {
  if (totalSP <= 50) return 1.0
  const effective = Math.max(0, totalSP - 50)
  return 1.0 + Math.log10(1 + effective / 100) * 0.25
}

/**
 * Each inconclusive prospect teaches DAN where hydrogen anomalies cluster,
 * making subsequent spot detection faster. Diminishing returns via sqrt.
 * 1 inconclusive = 1.1x, 4 = 1.2x, 9 = 1.3x.
 */
export function danInconclusiveBonus(inconclusiveCount: number): number {
  if (inconclusiveCount <= 0) return 1.0
  return 1.0 + Math.sqrt(inconclusiveCount) * 0.1
}

/**
 * Clamped passive hit probability for one DAN sample tick.
 */
export function danPassiveHitProbability(
  waterIceIndex: number,
  featureType: TerrainFeatureType | string,
  tier: number = 2,
  totalSP: number = 0,
  inconclusiveCount: number = 0,
): number {
  const siteMult = danSiteIceMultiplier(waterIceIndex)
  const featMult = DAN_FEATURE_ICE_MULT[featureType as TerrainFeatureType] ?? 1.0
  const spMult = danSPBonus(totalSP)
  const incMult = danInconclusiveBonus(inconclusiveCount)
  return Math.min(DAN_BASE_PASSIVE_HIT_RATE * siteMult * featMult * danTierBonus(tier) * spMult * incMult, 0.95)
}

/** HUD copy for hit / prospect signal strength. */
export function danSignalQualityLabel(strength: number): 'Strong' | 'Moderate' | 'Weak' {
  if (strength >= 0.7) return 'Strong'
  if (strength >= 0.5) return 'Moderate'
  return 'Weak'
}

/**
 * Base probability of confirming subsurface water after prospect (before accuracy mod).
 */
export function danWaterConfirmChance(strength: number, waterIceIndex: number, tier: number = 2): number {
  const base = strength >= 0.7 ? 0.70 : strength >= 0.5 ? 0.40 : 0.15
  return Math.min(base * (0.5 + waterIceIndex) * danTierBonus(tier), 1.0)
}
