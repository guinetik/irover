import { describe, it, expect } from 'vitest'
import {
  normalizeCompassDeg,
  roverHeadingRadToCompassDeg,
  worldBearingDegToPoi,
  signedRelativeBearingDeg,
} from '../sitePoiBearing'

describe('sitePoiBearing', () => {
  it('normalizeCompassDeg wraps negatives', () => {
    expect(normalizeCompassDeg(-90)).toBeCloseTo(270, 5)
    expect(normalizeCompassDeg(450)).toBeCloseTo(90, 5)
  })

  it('roverHeadingRadToCompassDeg: 0 rad → 0°', () => {
    expect(roverHeadingRadToCompassDeg(0)).toBeCloseTo(0, 5)
  })

  // Rover forward = +Z (heading 0), so POI on +Z = straight ahead = 0°
  it('worldBearingDegToPoi: POI on +Z from rover is 0° (forward)', () => {
    expect(worldBearingDegToPoi(0, 0, 0, 50)).toBeCloseTo(0, 5)
  })

  it('worldBearingDegToPoi: POI on +X from rover is 90° (right)', () => {
    expect(worldBearingDegToPoi(0, 0, 100, 0)).toBeCloseTo(90, 5)
  })

  it('worldBearingDegToPoi: POI on −Z from rover is 180° (behind)', () => {
    expect(worldBearingDegToPoi(0, 0, 0, -80)).toBeCloseTo(180, 5)
  })

  it('worldBearingDegToPoi: POI on −X from rover is 270° (left)', () => {
    expect(worldBearingDegToPoi(0, 0, -100, 0)).toBeCloseTo(270, 5)
  })

  it('signedRelativeBearingDeg: shortest turn', () => {
    expect(signedRelativeBearingDeg(350, 10)).toBeCloseTo(20, 5)
    expect(signedRelativeBearingDeg(10, 350)).toBeCloseTo(-20, 5)
  })
})
