import { describe, it, expect } from 'vitest'
import { computeDecayMultiplier } from '../hazardDecay'
import type { HazardEvent } from '../hazardTypes'

describe('computeDecayMultiplier', () => {
  it('returns 1.0 with no events', () => {
    expect(computeDecayMultiplier([], 'rugged')).toBe(1.0)
    expect(computeDecayMultiplier([], 'standard')).toBe(1.0)
    expect(computeDecayMultiplier([], 'sensitive')).toBe(1.0)
  })

  it('returns 1.0 with inactive events', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: false, level: 5 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })

  it('returns correct multiplier for rugged tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.30)

    event.level = 3
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.90)

    event.level = 5
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(2.50)
  })

  it('returns correct multiplier for standard tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(1.50)

    event.level = 3
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(2.50)

    event.level = 5
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(3.50)
  })

  it('returns correct multiplier for sensitive tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(1.70)

    event.level = 3
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(3.10)

    event.level = 5
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(4.50)
  })

  it('stacks multiple active hazards additively', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: true, level: 5 },
      { source: 'dust-storm', active: true, level: 3 },
    ]
    // rugged: 1.0 + 5*0.30 + 3*0.30 = 1.0 + 1.50 + 0.90 = 3.40
    expect(computeDecayMultiplier(events, 'rugged')).toBeCloseTo(3.4)
  })

  it('ignores unknown source names', () => {
    const events: HazardEvent[] = [
      { source: 'alien-mind-control', active: true, level: 5 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })
})
