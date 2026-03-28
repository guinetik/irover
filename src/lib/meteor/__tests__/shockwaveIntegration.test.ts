import { describe, it, expect } from 'vitest'
import { computeShockwaveDamage, KILL_RADIUS, SHOCKWAVE_RADIUS_MULTIPLIER } from '../shockwaveDamage'
import { rollCraterParams, computeCraterDepth } from '../craterProfile'

describe('shockwave + crater integration', () => {
  it('kill zone is inside shockwave zone', () => {
    const shockRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER
    expect(KILL_RADIUS).toBeLessThan(shockRadius)
  })

  it('shockwave damage is zero at blast edge', () => {
    const shockRadius = KILL_RADIUS * SHOCKWAVE_RADIUS_MULTIPLIER
    expect(computeShockwaveDamage(shockRadius, shockRadius, 'sensitive')).toBe(0)
  })

  it('crater depth at center exceeds rim height', () => {
    for (let i = 0; i < 20; i++) {
      const p = rollCraterParams()
      const centerDepth = Math.abs(computeCraterDepth(0, p.radius, p.depth, p.rimHeight))
      expect(centerDepth).toBeGreaterThan(p.rimHeight)
    }
  })

  it('crater profile is continuous (no jumps at boundary)', () => {
    const p = rollCraterParams()
    const atEdge = computeCraterDepth(p.radius - 0.01, p.radius, p.depth, p.rimHeight)
    const justPast = computeCraterDepth(p.radius + 0.01, p.radius, p.depth, p.rimHeight)
    expect(Math.abs(atEdge)).toBeLessThan(0.1)
    expect(justPast).toBeGreaterThanOrEqual(0)
  })
})
