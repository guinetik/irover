import { describe, it, expect } from 'vitest'
import {
  pickWeightedEvent,
  classifyByComposition,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  computeQualityGrade,
  computeSPReward,
  generateParticleSchedule,
} from '../radiationEvents'
import type { RadParticleType } from '../radiationTypes'

// ---------------------------------------------------------------------------
// pickWeightedEvent
// ---------------------------------------------------------------------------
describe('pickWeightedEvent', () => {
  const VALID_IDS = ['gcr-fluctuation', 'soft-sep', 'hard-sep', 'forbush-decrease']

  it('always returns a valid event id', () => {
    for (let i = 0; i < 100; i++) {
      expect(VALID_IDS).toContain(pickWeightedEvent())
    }
  })

  it('gcr-fluctuation is the most common (highest weight)', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      const id = pickWeightedEvent()
      counts[id] = (counts[id] ?? 0) + 1
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    expect(entries[0][0]).toBe('gcr-fluctuation')
  })
})

// ---------------------------------------------------------------------------
// classifyByComposition
// ---------------------------------------------------------------------------
describe('classifyByComposition', () => {
  it('returns gcr-fluctuation with confidence 0 for zero counts', () => {
    const result = classifyByComposition({ proton: 0, neutron: 0, gamma: 0, hze: 0 })
    expect(result.eventId).toBe('gcr-fluctuation')
    expect(result.confidence).toBe(0)
  })

  it('correctly identifies perfect GCR composition', () => {
    // GCR: proton=0.30, neutron=0.30, gamma=0.25, hze=0.15
    const caught: Record<RadParticleType, number> = {
      proton: 30, neutron: 30, gamma: 25, hze: 15,
    }
    const result = classifyByComposition(caught)
    expect(result.eventId).toBe('gcr-fluctuation')
    expect(result.confidence).toBeCloseTo(1.0, 5)
  })

  it('correctly identifies neutron-heavy soft SEP composition', () => {
    // soft-sep: proton=0.05, neutron=0.60, gamma=0.30, hze=0.05
    const caught: Record<RadParticleType, number> = {
      proton: 5, neutron: 60, gamma: 30, hze: 5,
    }
    const result = classifyByComposition(caught)
    expect(result.eventId).toBe('soft-sep')
    expect(result.confidence).toBeCloseTo(1.0, 5)
  })

  it('correctly identifies hard-sep composition', () => {
    // hard-sep: proton=0.30, neutron=0.25, gamma=0.25, hze=0.20
    const caught: Record<RadParticleType, number> = {
      proton: 30, neutron: 25, gamma: 25, hze: 20,
    }
    const result = classifyByComposition(caught)
    expect(result.eventId).toBe('hard-sep')
    expect(result.confidence).toBeCloseTo(1.0, 5)
  })

  it('correctly identifies forbush-decrease composition', () => {
    // forbush-decrease: proton=0.35, neutron=0.35, gamma=0.20, hze=0.10
    const caught: Record<RadParticleType, number> = {
      proton: 35, neutron: 35, gamma: 20, hze: 10,
    }
    const result = classifyByComposition(caught)
    expect(result.eventId).toBe('forbush-decrease')
    expect(result.confidence).toBeCloseTo(1.0, 5)
  })

  it('confidence is between 0 and 1 for any valid input', () => {
    const caught: Record<RadParticleType, number> = {
      proton: 10, neutron: 5, gamma: 3, hze: 2,
    }
    const result = classifyByComposition(caught)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// CLASSIFICATION_CONFIDENCE_THRESHOLD
// ---------------------------------------------------------------------------
describe('CLASSIFICATION_CONFIDENCE_THRESHOLD', () => {
  it('is 0.70', () => {
    expect(CLASSIFICATION_CONFIDENCE_THRESHOLD).toBe(0.70)
  })
})

// ---------------------------------------------------------------------------
// computeQualityGrade
// ---------------------------------------------------------------------------
describe('computeQualityGrade', () => {
  it('returns S for 100% catch rate', () => {
    expect(computeQualityGrade(100, 100)).toBe('S')
  })

  it('returns S at exactly 95%', () => {
    expect(computeQualityGrade(95, 100)).toBe('S')
  })

  it('returns A for 80% catch rate', () => {
    expect(computeQualityGrade(80, 100)).toBe('A')
  })

  it('returns A at exactly 80%', () => {
    expect(computeQualityGrade(80, 100)).toBe('A')
  })

  it('returns B at exactly 70%', () => {
    expect(computeQualityGrade(70, 100)).toBe('B')
  })

  it('returns B for 75% catch rate', () => {
    expect(computeQualityGrade(75, 100)).toBe('B')
  })

  it('returns C at exactly 50%', () => {
    expect(computeQualityGrade(50, 100)).toBe('C')
  })

  it('returns C for 60% catch rate', () => {
    expect(computeQualityGrade(60, 100)).toBe('C')
  })

  it('returns D for 49% catch rate', () => {
    expect(computeQualityGrade(49, 100)).toBe('D')
  })

  it('returns D for 0% catch rate', () => {
    expect(computeQualityGrade(0, 100)).toBe('D')
  })

  it('returns D when total is 0', () => {
    expect(computeQualityGrade(0, 0)).toBe('D')
  })
})

// ---------------------------------------------------------------------------
// computeSPReward
// ---------------------------------------------------------------------------
describe('computeSPReward', () => {
  it('applies 1.4x multiplier for S grade', () => {
    expect(computeSPReward(100, 'S')).toBe(140)
  })

  it('applies 1.1x multiplier for A grade', () => {
    expect(computeSPReward(100, 'A')).toBe(110)
  })

  it('applies 1.0x multiplier for B grade', () => {
    expect(computeSPReward(100, 'B')).toBe(100)
  })

  it('applies 0.8x multiplier for C grade', () => {
    expect(computeSPReward(100, 'C')).toBe(80)
  })

  it('applies 0.5x multiplier for D grade', () => {
    expect(computeSPReward(100, 'D')).toBe(50)
  })

  it('halves SP when resolved is false', () => {
    expect(computeSPReward(100, 'S', false)).toBe(70)
  })

  it('does not halve SP when resolved is true (default)', () => {
    expect(computeSPReward(100, 'S', true)).toBe(140)
  })

  it('resolved defaults to true', () => {
    expect(computeSPReward(100, 'B')).toBe(100)
  })

  it('halves D grade SP when unresolved', () => {
    expect(computeSPReward(100, 'D', false)).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// generateParticleSchedule
// ---------------------------------------------------------------------------
describe('generateParticleSchedule', () => {
  const PARTICLE_TYPES: RadParticleType[] = ['proton', 'neutron', 'gamma', 'hze']

  it('returns an array of particle spawn entries', () => {
    const schedule = generateParticleSchedule('gcr-fluctuation', 42)
    expect(Array.isArray(schedule)).toBe(true)
    expect(schedule.length).toBeGreaterThan(0)
  })

  it('each entry has timeSec and particleType', () => {
    const schedule = generateParticleSchedule('gcr-fluctuation', 42)
    for (const entry of schedule) {
      expect(typeof entry.timeSec).toBe('number')
      expect(PARTICLE_TYPES).toContain(entry.particleType)
    }
  })

  it('schedule is sorted by timeSec ascending', () => {
    const schedule = generateParticleSchedule('gcr-fluctuation', 42)
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].timeSec).toBeGreaterThanOrEqual(schedule[i - 1].timeSec)
    }
  })

  it('is deterministic with same seed', () => {
    const a = generateParticleSchedule('soft-sep', 123)
    const b = generateParticleSchedule('soft-sep', 123)
    expect(a).toEqual(b)
  })

  it('differs with different seeds', () => {
    const a = generateParticleSchedule('soft-sep', 1)
    const b = generateParticleSchedule('soft-sep', 2)
    // Very unlikely to be equal
    expect(a).not.toEqual(b)
  })

  it('total count equals the event totalParticles', () => {
    // gcr-fluctuation totalParticles = 18
    const schedule = generateParticleSchedule('gcr-fluctuation', 7)
    expect(schedule.length).toBe(18)
  })

  it('soft-sep generates correct particle count', () => {
    // soft-sep totalParticles = 28
    const schedule = generateParticleSchedule('soft-sep', 7)
    expect(schedule.length).toBe(28)
  })

  it('all times are within event durationSec', () => {
    // gcr-fluctuation durationSec = 20
    const schedule = generateParticleSchedule('gcr-fluctuation', 99)
    for (const entry of schedule) {
      expect(entry.timeSec).toBeGreaterThanOrEqual(0)
      expect(entry.timeSec).toBeLessThanOrEqual(20)
    }
  })

  it('works for all event types', () => {
    const eventIds: Array<import('../radiationTypes').RadEventId> = [
      'gcr-fluctuation', 'soft-sep', 'hard-sep', 'forbush-decrease',
    ]
    for (const id of eventIds) {
      const schedule = generateParticleSchedule(id, 42)
      expect(schedule.length).toBeGreaterThan(0)
    }
  })
})
