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
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.15)

    event.level = 3
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.45)

    event.level = 5
    expect(computeDecayMultiplier([event], 'rugged')).toBeCloseTo(1.75)
  })

  it('returns correct multiplier for standard tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(1.25)

    event.level = 3
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(1.75)

    event.level = 5
    expect(computeDecayMultiplier([event], 'standard')).toBeCloseTo(2.25)
  })

  it('returns correct multiplier for sensitive tier', () => {
    const event: HazardEvent = { source: 'dust-storm', active: true, level: 1 }
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(1.35)

    event.level = 3
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(2.05)

    event.level = 5
    expect(computeDecayMultiplier([event], 'sensitive')).toBeCloseTo(2.75)
  })

  it('stacks multiple active hazards additively', () => {
    const events: HazardEvent[] = [
      { source: 'dust-storm', active: true, level: 5 },
      { source: 'dust-storm', active: true, level: 3 },
    ]
    // rugged: 1.0 + 5*0.15 + 3*0.15 = 1.0 + 0.75 + 0.45 = 2.20
    expect(computeDecayMultiplier(events, 'rugged')).toBeCloseTo(2.2)
  })

  it('ignores unknown source names', () => {
    const events: HazardEvent[] = [
      { source: 'alien-mind-control', active: true, level: 5 },
    ]
    expect(computeDecayMultiplier(events, 'sensitive')).toBe(1.0)
  })
})
