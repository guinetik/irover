import { describe, expect, it } from 'vitest'
import {
  danPassiveHitProbability,
  danSignalQualityLabel,
  danSiteIceMultiplier,
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
})
