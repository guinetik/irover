import { describe, expect, it } from 'vitest'
import { resolveRandomOrbitalDropPosition } from '../orbitalDropSpawn'

describe('resolveRandomOrbitalDropPosition', () => {
  it('preserves explicit coordinates when provided', () => {
    const position = resolveRandomOrbitalDropPosition(
      { x: 10, z: 20 },
      { x: 3, z: 7 },
      () => 0.5,
    )

    expect(position).toEqual({ x: 3, z: 7 })
  })

  it('randomizes fallback coordinates around the rover when not provided', () => {
    const rolls = [0, 0.5]
    const position = resolveRandomOrbitalDropPosition(
      { x: 10, z: 20 },
      {},
      () => rolls.shift() ?? 0,
    )

    expect(position.x).toBeCloseTo(37, 5)
    expect(position.z).toBeCloseTo(20, 5)
  })
})
