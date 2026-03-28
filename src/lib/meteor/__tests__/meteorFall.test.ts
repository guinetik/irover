import { describe, it, expect } from 'vitest'
import {
  computeSkyOrigin,
  rollMarkerDuration,
  rollEntryAngle,
  rollAzimuth,
  computeSoundDelay,
  FALL_DURATION,
} from '../meteorFall'

describe('computeSkyOrigin', () => {
  it('returns a point above the target', () => {
    const origin = computeSkyOrigin(10, 20, 0, Math.PI / 4, 0)
    expect(origin.y).toBeGreaterThan(80)
    expect(origin.y).toBeLessThan(120)
  })

  it('offsets horizontally from the target', () => {
    const origin = computeSkyOrigin(0, 0, 0, Math.PI / 4, 0)
    expect(Math.abs(origin.x)).toBeGreaterThan(10)
  })
})

describe('rollMarkerDuration', () => {
  it('returns values between 10 and 20', () => {
    for (let i = 0; i < 100; i++) {
      const d = rollMarkerDuration()
      expect(d).toBeGreaterThanOrEqual(10)
      expect(d).toBeLessThanOrEqual(20)
    }
  })
})

describe('rollEntryAngle', () => {
  it('returns radians between 30 and 70 degrees', () => {
    const minRad = 30 * (Math.PI / 180)
    const maxRad = 70 * (Math.PI / 180)
    for (let i = 0; i < 100; i++) {
      const a = rollEntryAngle()
      expect(a).toBeGreaterThanOrEqual(minRad - 0.001)
      expect(a).toBeLessThanOrEqual(maxRad + 0.001)
    }
  })
})

describe('rollAzimuth', () => {
  it('returns values between 0 and 2pi', () => {
    for (let i = 0; i < 100; i++) {
      const a = rollAzimuth()
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(Math.PI * 2)
    }
  })
})

describe('computeSoundDelay', () => {
  it('computes delay based on Mars speed of sound (240 m/s)', () => {
    expect(computeSoundDelay(240)).toBeCloseTo(1.0)
    expect(computeSoundDelay(480)).toBeCloseTo(2.0)
    expect(computeSoundDelay(0)).toBe(0)
  })
})

describe('FALL_DURATION', () => {
  it('is approximately 8 seconds', () => {
    expect(FALL_DURATION).toBe(8)
  })
})
