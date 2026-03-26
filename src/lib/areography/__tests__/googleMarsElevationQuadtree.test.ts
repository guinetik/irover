import { describe, expect, it } from 'vitest'
import { latLonToQuadtree } from '../googleMarsElevationQuadtree'

describe('googleMarsElevationQuadtree', () => {
  it('starts every path at root t', () => {
    expect(latLonToQuadtree(0, 0, 0)).toBe('t')
  })

  it('subdivides predictably at zoom 1', () => {
    // Equator, east of prime meridian → northern hemisphere split, eastern half → 'r'
    expect(latLonToQuadtree(0, 45, 1)).toMatch(/^tr/)
    expect(latLonToQuadtree(0, -45, 1)).toMatch(/^tq/)
  })
})
