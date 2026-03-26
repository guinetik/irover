import { describe, expect, it } from 'vitest'
import { SimplexNoise } from '../simplexNoise'

describe('SimplexNoise', () => {
  it('returns finite values in a bounded range for n2', () => {
    const n = new SimplexNoise(42)
    for (let i = 0; i < 20; i++) {
      const v = n.n2(i * 0.13, i * 0.27)
      expect(Number.isFinite(v)).toBe(true)
      expect(Math.abs(v)).toBeLessThan(1.1)
    }
  })

  it('is deterministic for the same seed', () => {
    expect(new SimplexNoise(7).n2(1.2, 3.4)).toBe(new SimplexNoise(7).n2(1.2, 3.4))
  })
})
