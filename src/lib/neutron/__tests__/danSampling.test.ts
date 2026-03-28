import { describe, expect, it } from 'vitest'
import {
  danPassiveHitProbability,
  danSignalQualityLabel,
  danSiteIceMultiplier,
  danTierBonus,
  danSPBonus,
  danInconclusiveBonus,
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

  it('danSPBonus is flat below 50 SP and scales at high SP', () => {
    expect(danSPBonus(0)).toBe(1.0)
    expect(danSPBonus(50)).toBe(1.0)
    expect(danSPBonus(100)).toBeCloseTo(1.0, 0) // barely above 1.0
    expect(danSPBonus(500)).toBeGreaterThan(1.1)
    expect(danSPBonus(1000)).toBeGreaterThan(1.2)
    expect(danSPBonus(2000)).toBeGreaterThan(1.3)
  })

  it('danInconclusiveBonus scales with sqrt of failed prospects', () => {
    expect(danInconclusiveBonus(0)).toBe(1.0)
    expect(danInconclusiveBonus(1)).toBeCloseTo(1.1)
    expect(danInconclusiveBonus(4)).toBeCloseTo(1.2)
    expect(danInconclusiveBonus(9)).toBeCloseTo(1.3)
  })

  it('high SP boosts hit probability', () => {
    const base = danPassiveHitProbability(0.3, 'plain', 2, 0, 0)
    const highSP = danPassiveHitProbability(0.3, 'plain', 2, 1000, 0)
    expect(highSP).toBeGreaterThan(base)
  })

  it('inconclusive prospects boost hit probability', () => {
    const base = danPassiveHitProbability(0.3, 'plain', 2, 0, 0)
    const withFails = danPassiveHitProbability(0.3, 'plain', 2, 0, 4)
    expect(withFails).toBeGreaterThan(base)
  })
})
