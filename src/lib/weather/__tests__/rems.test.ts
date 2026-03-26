import { describe, expect, it } from 'vitest'
import { peakStormWindMs, windFromDegToCompass } from '../rems'

describe('windFromDegToCompass', () => {
  it('maps cardinal directions', () => {
    expect(windFromDegToCompass(0)).toBe('N')
    expect(windFromDegToCompass(90)).toBe('E')
    expect(windFromDegToCompass(180)).toBe('S')
    expect(windFromDegToCompass(270)).toBe('W')
  })

  it('normalizes negative angles', () => {
    expect(windFromDegToCompass(-90)).toBe('W')
  })
})

describe('peakStormWindMs', () => {
  it('scales with level and dust', () => {
    expect(peakStormWindMs(1, 0.2, 0)).toBeGreaterThan(25)
    expect(peakStormWindMs(5, 0.9, 1)).toBeGreaterThan(peakStormWindMs(2, 0.2, 1))
  })
})
