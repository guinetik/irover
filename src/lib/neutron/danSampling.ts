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
 * Clamped passive hit probability for one DAN sample tick.
 */
export function danPassiveHitProbability(
  waterIceIndex: number,
  featureType: TerrainFeatureType | string,
): number {
  const siteMult = danSiteIceMultiplier(waterIceIndex)
  const featMult = DAN_FEATURE_ICE_MULT[featureType as TerrainFeatureType] ?? 1.0
  return Math.min(DAN_BASE_PASSIVE_HIT_RATE * siteMult * featMult, 0.95)
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
export function danWaterConfirmChance(strength: number, waterIceIndex: number): number {
  const base = strength >= 0.7 ? 0.70 : strength >= 0.5 ? 0.40 : 0.15
  return Math.min(base * (0.5 + waterIceIndex), 1.0)
}
