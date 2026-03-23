import { describe, it, expect } from 'vitest'
import { approximateLatLonFromTangentOffset } from '../siteTangent'

describe('approximateLatLonFromTangentOffset', () => {
  it('returns base when deltas are zero', () => {
    const r = approximateLatLonFromTangentOffset(-4.6, 137.4, 0, 0)
    expect(r.latitudeDeg).toBeCloseTo(-4.6, 5)
    expect(r.longitudeDeg).toBeCloseTo(137.4, 5)
  })

  it('moves north with +Z offset (1 unit = 1 m)', () => {
    const r = approximateLatLonFromTangentOffset(0, 0, 0, 111_320)
    expect(r.latitudeDeg).toBeCloseTo(1, 3)
    expect(r.longitudeDeg).toBeCloseTo(0, 3)
  })
})
