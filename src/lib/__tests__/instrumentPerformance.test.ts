import { describe, it, expect } from 'vitest'
import {
  resolveInstrumentPerformance,
  type InstrumentEnvironment,
} from '../instrumentPerformance'

const CALM_ENV: InstrumentEnvironment = {
  thermalZone: 'OPTIMAL',
  stormLevel: 0,
  radiationLevel: 0,
}

describe('resolveInstrumentPerformance', () => {
  it('returns baseline factors with neutral inputs', () => {
    const ctx = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.0, 1.0)
    expect(ctx.speedFactor).toBeCloseTo(1.0)
    expect(ctx.accuracyFactor).toBeCloseTo(1.0)
    expect(ctx.thermalMult).toBe(1.0)
    expect(ctx.stormPenalty).toBe(1.0)
    expect(ctx.radiationPenalty).toBe(1.0)
  })

  it('applies profile speed boost', () => {
    const ctx = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.15, 1.0)
    expect(ctx.speedFactor).toBeCloseTo(1.15)
    expect(ctx.accuracyFactor).toBeCloseTo(1.0)
  })

  it('applies profile accuracy boost', () => {
    const ctx = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.0, 1.10)
    expect(ctx.speedFactor).toBeCloseTo(1.0)
    expect(ctx.accuracyFactor).toBeCloseTo(1.10)
  })

  it('applies FRIGID thermal penalty to speed only', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, thermalZone: 'FRIGID' }
    const ctx = resolveInstrumentPerformance('standard', 1.0, env, 1.0, 1.0)
    expect(ctx.thermalMult).toBe(1.25)
    expect(ctx.speedFactor).toBeCloseTo(0.8)
    expect(ctx.accuracyFactor).toBeCloseTo(1.0)
  })

  it('applies COLD thermal bonus to speed', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, thermalZone: 'COLD' }
    const ctx = resolveInstrumentPerformance('standard', 1.0, env, 1.0, 1.0)
    expect(ctx.thermalMult).toBe(0.85)
    expect(ctx.speedFactor).toBeCloseTo(1 / 0.85)
  })

  it('applies storm penalty scaled by tier', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, stormLevel: 3 }
    const sensitive = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    const rugged = resolveInstrumentPerformance('rugged', 1.0, env, 1.0, 1.0)
    expect(sensitive.stormPenalty).toBeGreaterThan(rugged.stormPenalty)
    expect(sensitive.speedFactor).toBeLessThan(rugged.speedFactor)
    expect(sensitive.accuracyFactor).toBeLessThan(rugged.accuracyFactor)
  })

  it('applies radiation penalty above safe threshold', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, radiationLevel: 0.75 }
    const ctx = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    expect(ctx.radiationPenalty).toBeGreaterThan(1.0)
    expect(ctx.speedFactor).toBeLessThan(1.0)
    expect(ctx.accuracyFactor).toBeLessThan(1.0)
  })

  it('no radiation penalty in safe zone (≤ 0.25)', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, radiationLevel: 0.20 }
    const ctx = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    expect(ctx.radiationPenalty).toBe(1.0)
  })

  it('scales with durability factor', () => {
    const full = resolveInstrumentPerformance('standard', 1.0, CALM_ENV, 1.0, 1.0)
    const half = resolveInstrumentPerformance('standard', 0.5, CALM_ENV, 1.0, 1.0)
    expect(half.speedFactor).toBeCloseTo(full.speedFactor * 0.5)
    expect(half.accuracyFactor).toBeCloseTo(full.accuracyFactor * 0.5)
  })

  it('clamps durability to min 0.1', () => {
    const ctx = resolveInstrumentPerformance('standard', 0.0, CALM_ENV, 1.0, 1.0)
    expect(ctx.speedFactor).toBeCloseTo(0.1)
    expect(ctx.accuracyFactor).toBeCloseTo(0.1)
  })

  it('stacks storm + thermal + radiation multiplicatively', () => {
    const env: InstrumentEnvironment = { thermalZone: 'FRIGID', stormLevel: 2, radiationLevel: 0.5 }
    const ctx = resolveInstrumentPerformance('standard', 1.0, env, 1.0, 1.0)
    expect(ctx.speedFactor).toBeLessThan(0.8)
    const expected = 1.0 / (ctx.thermalMult * ctx.stormPenalty * ctx.radiationPenalty)
    expect(ctx.speedFactor).toBeCloseTo(expected)
  })

  it('exposes thermalZone for controller decisions', () => {
    const env: InstrumentEnvironment = { ...CALM_ENV, thermalZone: 'CRITICAL' }
    const ctx = resolveInstrumentPerformance('sensitive', 1.0, env, 1.0, 1.0)
    expect(ctx.thermalZone).toBe('CRITICAL')
  })
})
