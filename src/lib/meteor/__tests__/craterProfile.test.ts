import { describe, it, expect } from 'vitest'
import { computeCraterDepth, rollCraterParams } from '../craterProfile'

describe('computeCraterDepth', () => {
  it('returns max depth at center (dist=0)', () => {
    const d = computeCraterDepth(0, 5, 2)
    expect(d).toBeCloseTo(-2, 1)
  })

  it('returns 0 at crater edge', () => {
    const d = computeCraterDepth(5, 5, 2)
    expect(d).toBeCloseTo(0, 1)
  })

  it('returns positive rim height just outside edge', () => {
    const d = computeCraterDepth(5.5, 5, 2, 0.3)
    expect(d).toBeGreaterThan(0)
  })

  it('returns 0 far beyond rim', () => {
    const d = computeCraterDepth(10, 5, 2, 0.3)
    expect(d).toBeCloseTo(0, 1)
  })
})

describe('rollCraterParams', () => {
  it('returns radius in range 3-8', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollCraterParams()
      expect(p.radius).toBeGreaterThanOrEqual(3)
      expect(p.radius).toBeLessThanOrEqual(8)
    }
  })

  it('returns depth proportional to radius', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollCraterParams()
      expect(p.depth).toBeGreaterThanOrEqual(0.8)
      expect(p.depth).toBeLessThanOrEqual(2.5)
    }
  })

  it('returns rim height in range', () => {
    for (let i = 0; i < 50; i++) {
      const p = rollCraterParams()
      expect(p.rimHeight).toBeGreaterThanOrEqual(0.15)
      expect(p.rimHeight).toBeLessThanOrEqual(0.5)
    }
  })
})
