import { describe, it, expect } from 'vitest'
import {
  getShowerChancePerSol,
  rollShowerSeverity,
  rollMeteorCount,
  rollTriggerFraction,
  pickMeteoriteVariant,
} from '../meteorShower'

describe('getShowerChancePerSol', () => {
  it('returns ~0.05 for low meteorRisk (0.10)', () => {
    const chance = getShowerChancePerSol(0.10)
    expect(chance).toBeGreaterThan(0.03)
    expect(chance).toBeLessThan(0.08)
  })

  it('returns ~0.50 for high meteorRisk (0.65)', () => {
    const chance = getShowerChancePerSol(0.65)
    expect(chance).toBeGreaterThan(0.25)
    expect(chance).toBeLessThan(0.55)
  })

  it('returns base 0.03 for meteorRisk 0', () => {
    expect(getShowerChancePerSol(0)).toBeCloseTo(0.03, 2)
  })
})

describe('rollShowerSeverity', () => {
  it('returns a valid severity string', () => {
    for (let i = 0; i < 50; i++) {
      const sev = rollShowerSeverity(0.3)
      expect(['light', 'moderate', 'heavy']).toContain(sev)
    }
  })
})

describe('rollMeteorCount', () => {
  it('returns 1-2 for light', () => {
    for (let i = 0; i < 50; i++) {
      const n = rollMeteorCount('light')
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(2)
    }
  })

  it('returns 3-5 for moderate', () => {
    for (let i = 0; i < 50; i++) {
      const n = rollMeteorCount('moderate')
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(5)
    }
  })

  it('returns 6-10 for heavy', () => {
    for (let i = 0; i < 50; i++) {
      const n = rollMeteorCount('heavy')
      expect(n).toBeGreaterThanOrEqual(6)
      expect(n).toBeLessThanOrEqual(10)
    }
  })
})

describe('rollTriggerFraction', () => {
  it('returns values between 0.2 and 0.8', () => {
    for (let i = 0; i < 100; i++) {
      const f = rollTriggerFraction()
      expect(f).toBeGreaterThanOrEqual(0.2)
      expect(f).toBeLessThanOrEqual(0.8)
    }
  })
})

describe('pickMeteoriteVariant', () => {
  it('returns Lp01 through Lp10', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(pickMeteoriteVariant())
    }
    expect(seen.size).toBe(10)
    for (let i = 1; i <= 10; i++) {
      expect(seen).toContain(`Lp${String(i).padStart(2, '0')}`)
    }
  })
})
