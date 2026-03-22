import { describe, it, expect } from 'vitest'
import { latLonToCartesian, cartesianToLatLon, surfaceNormal } from '../coordinates'

describe('latLonToCartesian', () => {
  it('places north pole at (0, radius, 0)', () => {
    const v = latLonToCartesian(90, 0, 10)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(10, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('places south pole at (0, -radius, 0)', () => {
    const v = latLonToCartesian(-90, 0, 10)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(-10, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('places equator/prime meridian at (0, 0, radius)', () => {
    const v = latLonToCartesian(0, 0, 10)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(10, 5)
  })

  it('places equator/90E at (radius, 0, 0)', () => {
    const v = latLonToCartesian(0, 90, 10)
    expect(v.x).toBeCloseTo(10, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(0, 4)
  })
})

describe('cartesianToLatLon', () => {
  it('round-trips through latLonToCartesian', () => {
    const testCases = [
      { lat: 45, lon: 30 },
      { lat: -23.5, lon: -46.6 },
      { lat: 0, lon: 180 },
      { lat: 89, lon: -120 },
    ]
    for (const { lat, lon } of testCases) {
      const v = latLonToCartesian(lat, lon, 10)
      const result = cartesianToLatLon(v, 10)
      expect(result.lat).toBeCloseTo(lat, 3)
      expect(result.lon).toBeCloseTo(lon, 3)
    }
  })
})

describe('surfaceNormal', () => {
  it('returns a unit vector', () => {
    const n = surfaceNormal(45, 90)
    expect(n.length()).toBeCloseTo(1, 5)
  })

  it('points outward from the sphere center', () => {
    const n = surfaceNormal(0, 0)
    expect(n.z).toBeCloseTo(1, 5)
  })
})
