import { describe, it, expect } from 'vitest'
import {
  CRATER_DISCOVERIES,
  rollCraterDiscovery,
} from '../craterDiscovery'

describe('CRATER_DISCOVERIES', () => {
  it('has 5 entries', () => {
    expect(CRATER_DISCOVERIES).toHaveLength(5)
  })

  it('discovery IDs are DC01-DC05', () => {
    const ids = CRATER_DISCOVERIES.map(d => d.id)
    expect(ids).toEqual(['DC01', 'DC02', 'DC03', 'DC04', 'DC05'])
  })

  it('weights sum to 100', () => {
    const total = CRATER_DISCOVERIES.reduce((s, d) => s + d.weight, 0)
    expect(total).toBe(100)
  })

  it('only DC01 and DC04 are placeable vents', () => {
    const vents = CRATER_DISCOVERIES.filter(d => d.ventType !== null)
    expect(vents).toHaveLength(2)
    expect(vents[0].id).toBe('DC01')
    expect(vents[0].ventType).toBe('co2')
    expect(vents[1].id).toBe('DC04')
    expect(vents[1].ventType).toBe('methane')
  })
})

describe('rollCraterDiscovery', () => {
  it('always returns a valid discovery', () => {
    for (let i = 0; i < 100; i++) {
      const d = rollCraterDiscovery()
      expect(d.id).toMatch(/^DC0[1-5]$/)
      expect(d.sp).toBeGreaterThan(0)
    }
  })

  it('returns the discovery matching a forced roll value', () => {
    // DC01 weight=40, cumulative 0-40
    expect(rollCraterDiscovery(0).id).toBe('DC01')
    expect(rollCraterDiscovery(39.9).id).toBe('DC01')
    // DC02 weight=15, cumulative 40-55
    expect(rollCraterDiscovery(40).id).toBe('DC02')
    // DC03 weight=15, cumulative 55-70
    expect(rollCraterDiscovery(55).id).toBe('DC03')
    // DC04 weight=15, cumulative 70-85
    expect(rollCraterDiscovery(70).id).toBe('DC04')
    // DC05 weight=15, cumulative 85-100
    expect(rollCraterDiscovery(85).id).toBe('DC05')
    expect(rollCraterDiscovery(99.9).id).toBe('DC05')
  })
})
