import { describe, expect, it } from 'vitest'
import { generateChemCamSpectrum } from '../chemCamSpectrum'

describe('generateChemCamSpectrum', () => {
  it('returns sorted peaks with full calibration', () => {
    let i = 0
    const rnd = () => (i++ % 10) / 10
    const peaks = generateChemCamSpectrum('basalt', 1, rnd)
    expect(peaks.length).toBeGreaterThan(0)
    for (let k = 1; k < peaks.length; k++) {
      expect(peaks[k].wavelength).toBeGreaterThanOrEqual(peaks[k - 1].wavelength - 1e-6)
    }
  })

  it('uses fewer resolved lines at low calibration', () => {
    const fixed = () => 0.5
    const low = generateChemCamSpectrum('basalt', 0.1, fixed)
    const high = generateChemCamSpectrum('basalt', 1, fixed)
    expect(high.length).toBeGreaterThanOrEqual(low.length)
  })
})
