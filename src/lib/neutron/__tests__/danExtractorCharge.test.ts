import { describe, expect, test } from 'vitest'
import { calcExtractorCharge } from '../danExtractorCharge'

describe('calcExtractorCharge', () => {
  const base = {
    storedKg: 0,
    lastChargedSol: 0,
    currentSol: 0,
    reservoirQuality: 0.5,
    danChargeRateMod: 1.0,
    danStorageCapMod: 1.0,
  }

  test('zero elapsed sols returns unchanged storage', () => {
    const r = calcExtractorCharge({ ...base, storedKg: 0.3, lastChargedSol: 5, currentSol: 5 })
    expect(r.storedKg).toBe(0.3)
    expect(r.lastChargedSol).toBe(5)
  })

  test('average quality site (0.5) accumulates 0.5 kg/sol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 2 })
    expect(r.storedKg).toBeCloseTo(1.0)
  })

  test('strong site (1.0) accumulates 1.0 kg/sol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 1, reservoirQuality: 1.0 })
    expect(r.storedKg).toBeCloseTo(1.0)
  })

  test('weak site (0.3) accumulates 0.3 kg/sol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 1, reservoirQuality: 0.3 })
    expect(r.storedKg).toBeCloseTo(0.3)
  })

  test('caps at base maxStorage (1.0 kg)', () => {
    const r = calcExtractorCharge({ ...base, storedKg: 0.9, currentSol: 10, reservoirQuality: 1.0 })
    expect(r.storedKg).toBe(1.0)
  })

  test('danStorageCapMod buffs max storage', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 10, reservoirQuality: 1.0, danStorageCapMod: 1.5 })
    expect(r.storedKg).toBe(1.5)
  })

  test('danChargeRateMod 0.5 halves the rate', () => {
    // quality 0.5 × rate 0.5 = 0.25 kg/sol; over 4 sols = 1.0 kg
    const r = calcExtractorCharge({ ...base, currentSol: 4, danChargeRateMod: 0.5 })
    expect(r.storedKg).toBeCloseTo(1.0)
  })

  test('negative elapsed sol (time travel guard) treated as zero', () => {
    const r = calcExtractorCharge({ ...base, storedKg: 0.2, lastChargedSol: 10, currentSol: 8 })
    expect(r.storedKg).toBe(0.2)
  })

  test('updates lastChargedSol to currentSol', () => {
    const r = calcExtractorCharge({ ...base, currentSol: 7 })
    expect(r.lastChargedSol).toBe(7)
  })
})
