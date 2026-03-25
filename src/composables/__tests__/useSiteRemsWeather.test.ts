import { describe, expect, it } from 'vitest'
import {
  peakStormWindMs,
  windFromDegToCompass,
  useSiteRemsWeather,
} from '@/composables/useSiteRemsWeather'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'

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

describe('useSiteRemsWeather', () => {
  const baseTerrain: TerrainParams = {
    roughness: 0.4,
    craterDensity: 0.3,
    dustCover: 0.5,
    elevation: 0.5,
    ironOxide: 0.5,
    basalt: 0.5,
    seed: 42,
    siteId: 'test-site',
    featureType: 'plain',
    waterIceIndex: 0.2,
    silicateIndex: 0.3,
    temperatureMaxK: 260,
    temperatureMinK: 180,
  }

  it('clears ambient and storm text when REMS off', () => {
    const w = useSiteRemsWeather()
    w.tickRemsWeather({
      deltaSeconds: 0.016,
      timeOfDay: 0.5,
      sol: 1,
      simulationTime: 10,
      terrain: baseTerrain,
      remsOn: true,
      ambientEffectiveC: -20,
    })
    expect(w.solClockAmbientC.value).toBe(-20)
    w.tickRemsWeather({
      deltaSeconds: 0.016,
      timeOfDay: 0.5,
      sol: 1,
      simulationTime: 10,
      terrain: baseTerrain,
      remsOn: false,
      ambientEffectiveC: -20,
    })
    expect(w.solClockAmbientC.value).toBeNull()
    expect(w.remsStormIncomingText.value).toBeNull()
    expect(w.remsStormActiveText.value).toBeNull()
    expect(w.remsHud.value.available).toBe(false)
  })

  it('exposes stable readouts when REMS on', () => {
    const w = useSiteRemsWeather()
    w.tickRemsWeather({
      deltaSeconds: 0.016,
      timeOfDay: 0.5,
      sol: 3,
      simulationTime: 100,
      terrain: baseTerrain,
      remsOn: true,
      ambientEffectiveC: -15,
    })
    const h = w.remsHud.value
    expect(h.available).toBe(true)
    expect(h.pressureHpa).toBeGreaterThan(400)
    expect(h.pressureHpa).toBeLessThan(750)
    expect(h.windMs).toBeGreaterThan(0)
    expect(h.humidityPct).toBeGreaterThan(0)
    expect(h.windDirCompass.length).toBeGreaterThan(0)
    expect(h.dustStormPhase).toBe('none')
    expect(h.dustStormLevel).toBeNull()
  })

  it('peak storm wind scales with level and dust', () => {
    expect(peakStormWindMs(1, 0.2, 0)).toBeGreaterThan(25)
    expect(peakStormWindMs(5, 0.9, 1)).toBeGreaterThan(peakStormWindMs(2, 0.2, 1))
  })
})
