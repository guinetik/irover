import { describe, expect, it } from 'vitest'
import {
  danPassiveHitProbability,
  danSignalQualityLabel,
  danSiteIceMultiplier,
  danTierBonus,
  danWaterConfirmChance,
} from '../danSampling'

describe('danSampling', () => {
  it('danSiteIceMultiplier increases with waterIceIndex', () => {
    expect(danSiteIceMultiplier(0.9)).toBeGreaterThan(danSiteIceMultiplier(0.05))
  })

  it('danPassiveHitProbability is capped', () => {
    expect(danPassiveHitProbability(1, 'polar-cap')).toBeLessThanOrEqual(0.95)
    expect(danPassiveHitProbability(0, 'plain')).toBeGreaterThan(0)
  })

  it('danSignalQualityLabel buckets strength', () => {
    expect(danSignalQualityLabel(0.8)).toBe('Strong')
    expect(danSignalQualityLabel(0.55)).toBe('Moderate')
    expect(danSignalQualityLabel(0.2)).toBe('Weak')
  })

  it('danWaterConfirmChance respects strength tiers', () => {
    expect(danWaterConfirmChance(0.8, 0.5)).toBeGreaterThan(danWaterConfirmChance(0.3, 0.5))
  })

  it('danTierBonus gives 1.5x for tier 1, 1.0x otherwise', () => {
    expect(danTierBonus(1)).toBe(1.5)
    expect(danTierBonus(2)).toBe(1.0)
    expect(danTierBonus(3)).toBe(1.0)
  })

  it('tier 1 sites have higher hit probability than tier 2 at same waterIceIndex', () => {
    const tier1 = danPassiveHitProbability(0.3, 'plain', 1)
    const tier2 = danPassiveHitProbability(0.3, 'plain', 2)
    expect(tier1).toBeGreaterThan(tier2)
    expect(tier1).toBeCloseTo(tier2 * 1.5)
  })

  it('tier 1 sites have higher water confirm chance', () => {
    const tier1 = danWaterConfirmChance(0.6, 0.3, 1)
    const tier2 = danWaterConfirmChance(0.6, 0.3, 2)
    expect(tier1).toBeGreaterThan(tier2)
  })
})
