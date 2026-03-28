import { describe, it, expect } from 'vitest'
import { computeDecayMultiplier, computeRadiationPerformancePenalty } from '../hazardDecay'
import type { HazardEvent } from '../hazardTypes'

describe('computeDecayMultiplier – radiation source', () => {
  it('sensitive tier level 3 → 1.0 + 3*0.60 = 2.80', () => {
    const events: HazardEvent[] = [
      { source: 'radiation', active: true, level: 3 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBeCloseTo(2.80)
  })

  it('rugged tier level 3 → 1.0 + 3*0.15 = 1.45', () => {
    const events: HazardEvent[] = [
      { source: 'radiation', active: true, level: 3 },
    ]
    expect(computeDecayMultiplier(events, 'rugged')).toBeCloseTo(1.45)
  })

  it('stacks with dust-storm: standard tier, dust level 2 + radiation level 3 → 3.05', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: true, level: 2 },
      { source: 'radiation', active: true, level: 3 },
    ]
    // 1.0 + (2*0.50) + (3*0.35) = 1.0 + 1.00 + 1.05 = 3.05
    expect(computeDecayMultiplier(events, 'standard')).toBeCloseTo(3.05)
  })

  it('inactive radiation event → 1.0', () => {
    const events: HazardEvent[] = [
      { source: 'radiation', active: false, level: 5 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })
})

describe('computeRadiationPerformancePenalty', () => {
  it('returns 1.0 for level at or below the 0.25 safe zone', () => {
    expect(computeRadiationPerformancePenalty(0, 'sensitive')).toBe(1.0)
    expect(computeRadiationPerformancePenalty(0.25, 'sensitive')).toBe(1.0)
    expect(computeRadiationPerformancePenalty(0.10, 'rugged')).toBe(1.0)
  })

  it('returns >1.0 for levels above 0.25 (intermediate zone)', () => {
    expect(computeRadiationPerformancePenalty(0.5, 'standard')).toBeGreaterThan(1.0)
    expect(computeRadiationPerformancePenalty(0.75, 'rugged')).toBeGreaterThan(1.0)
  })

  it('returns >1.0 for hazardous level (1.0)', () => {
    expect(computeRadiationPerformancePenalty(1.0, 'sensitive')).toBeGreaterThan(1.0)
    expect(computeRadiationPerformancePenalty(1.0, 'rugged')).toBeGreaterThan(1.0)
  })

  it('sensitive tier penalty is higher than rugged tier at the same level', () => {
    const level = 1.0
    const sensitive = computeRadiationPerformancePenalty(level, 'sensitive')
    const rugged = computeRadiationPerformancePenalty(level, 'rugged')
    expect(sensitive).toBeGreaterThan(rugged)
  })

  it('computes expected value at full level 1.0 for sensitive: 1.0 + 1*5*0.08 = 1.40', () => {
    // effectiveLevel = (1.0 - 0.25) / 0.75 = 1.0, coeff = 0.08
    // 1.0 + 1.0 * 5 * 0.08 = 1.40
    expect(computeRadiationPerformancePenalty(1.0, 'sensitive')).toBeCloseTo(1.40)
  })

  it('computes expected value at full level 1.0 for rugged: 1.0 + 1*5*0.01 = 1.05', () => {
    // effectiveLevel = 1.0, coeff = 0.01
    // 1.0 + 1.0 * 5 * 0.01 = 1.05
    expect(computeRadiationPerformancePenalty(1.0, 'rugged')).toBeCloseTo(1.05)
  })
})
