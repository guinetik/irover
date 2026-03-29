import { describe, it, expect } from 'vitest'
import { computeShockwaveDamage, SHOCKWAVE_RADIUS_MULTIPLIER, KILL_RADIUS } from '../shockwaveDamage'

describe('computeShockwaveDamage', () => {
  const shockwaveRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER

  it('returns 0 beyond shockwave radius', () => {
    expect(computeShockwaveDamage(shockwaveRadius + 1, shockwaveRadius, 'sensitive')).toBe(0)
  })

  it('returns max damage at kill zone edge', () => {
    const dmg = computeShockwaveDamage(0, shockwaveRadius, 'sensitive')
    expect(dmg).toBeCloseTo(0.15, 2)
  })

  it('falls off linearly with distance', () => {
    const half = shockwaveRadius / 2
    const dmg = computeShockwaveDamage(half, shockwaveRadius, 'sensitive')
    expect(dmg).toBeCloseTo(0.075, 2)
  })

  it('scales by instrument tier', () => {
    const dist = 0
    expect(computeShockwaveDamage(dist, shockwaveRadius, 'rugged')).toBeCloseTo(0.03, 2)
    expect(computeShockwaveDamage(dist, shockwaveRadius, 'standard')).toBeCloseTo(0.08, 2)
    expect(computeShockwaveDamage(dist, shockwaveRadius, 'sensitive')).toBeCloseTo(0.15, 2)
  })
})

describe('constants', () => {
  it('KILL_RADIUS matches waypoint ring radius', () => {
    expect(KILL_RADIUS).toBe(1.5)
  })

  it('SHOCKWAVE_RADIUS_MULTIPLIER is 10x', () => {
    expect(SHOCKWAVE_RADIUS_MULTIPLIER).toBe(10)
  })
})
