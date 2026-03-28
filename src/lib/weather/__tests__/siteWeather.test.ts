import { describe, expect, it } from 'vitest'
import type { TerrainParams } from '@/types/terrain'
import { computeSiteWeather, createStormState, tickStormFSM } from '../siteWeather'

const testTerrain: TerrainParams = {
  roughness: 0.5,
  craterDensity: 0.3,
  dustCover: 0.5,
  elevation: 0,
  elevationKm: 0,
  ironOxide: 0.2,
  basalt: 0.3,
  seed: 42,
  siteId: 'test',
  featureType: 'plain',
  waterIceIndex: 0,
  silicateIndex: 1,
  temperatureMaxK: 250,
  temperatureMinK: 200,
}

describe('computeSiteWeather', () => {
  it('keeps render wind and storm level at pre-active levels during incoming (warning-only phase)', () => {
    const storm = { ...createStormState(), phase: 'incoming' as const, timer: 11, level: 4 }
    const baseline = computeSiteWeather(testTerrain, 10, 0.35, 100, 0.45, -20, createStormState(), false)
    const w0 = computeSiteWeather(testTerrain, 10, 0.35, 100, 0.45, -20, storm, true)
    expect(w0.dustStormPhase).toBe('incoming')
    expect(w0.dustStormLevel).toBe(4)
    expect(w0.renderDustStormLevel).toBe(0)
    expect(w0.windMs).toBeGreaterThan(w0.renderWindMs)
    expect(w0.renderWindMs).toBeCloseTo(baseline.windMs, 4)
    expect(w0.renderWindDirDeg).toBeCloseTo(baseline.windDirDeg, 4)
    expect(w0.windDirDeg).not.toBeCloseTo(baseline.windDirDeg, 0)
  })

  it('applies full storm level to render fields only in active phase', () => {
    const storm = { ...createStormState(), phase: 'active' as const, timer: 30, level: 3 }
    const w = computeSiteWeather(testTerrain, 10, 0.35, 100, 0.45, -20, storm, true)
    expect(w.dustStormPhase).toBe('active')
    expect(w.renderDustStormLevel).toBe(3)
    expect(w.renderWindMs).toBe(w.windMs)
    expect(w.renderWindDirDeg).toBe(w.windDirDeg)
  })
})

describe('tickStormFSM + computeSiteWeather', () => {
  it('incoming from FSM yields zero renderDustStormLevel until transition to active', () => {
    let storm = createStormState()
    storm = { ...storm, phase: 'idle', idleCountdown: 0, salt: 0 }
    const after = tickStormFSM(storm, 0.1, 1, 1, 1.0)
    expect(after.state.phase).toBe('incoming')
    const w = computeSiteWeather(
      testTerrain,
      0,
      0.25,
      1,
      0.45,
      -22,
      after.state,
      after.affectsReadouts,
    )
    expect(w.dustStormLevel).not.toBeNull()
    expect(w.renderDustStormLevel).toBe(0)
  })
})
