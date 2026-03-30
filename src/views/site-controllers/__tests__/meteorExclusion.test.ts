import { describe, it, expect } from 'vitest'
import { isInsideBuildableFootprint } from '@/lib/buildableFootprint'

describe('meteor buildable exclusion', () => {
  const buildables = [
    {
      position: { x: 50, z: 50 },
      footprint: { x: 20, z: 20 },
      scale: 0.5,
      rotationY: 0,
    },
  ]

  it('rejects impact inside footprint', () => {
    expect(isInsideBuildableFootprint(50, 50, buildables)).toBe(true)
    expect(isInsideBuildableFootprint(54, 54, buildables)).toBe(true)
  })

  it('allows impact outside footprint', () => {
    expect(isInsideBuildableFootprint(100, 100, buildables)).toBe(false)
    expect(isInsideBuildableFootprint(0, 0, buildables)).toBe(false)
  })
})
