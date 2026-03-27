import { describe, expect, it } from 'vitest'
import type { TerrainParams } from '@/types/terrain'
import { pickDetailTextures } from '../detailTextures'

const base: TerrainParams = {
  roughness: 0.4,
  craterDensity: 0.3,
  dustCover: 0.5,
  elevation: 0.5,
  elevationKm: 0,
  ironOxide: 0.5,
  basalt: 0.5,
  seed: 99,
  siteId: 'utopia-planitia',
  featureType: 'plain',
  waterIceIndex: 0.2,
  silicateIndex: 0.3,
  temperatureMaxK: 260,
  temperatureMinK: 180,
}

describe('pickDetailTextures', () => {
  it('returns two distinct orbital URLs', () => {
    const [a, b] = pickDetailTextures(base)
    expect(a.startsWith('/')).toBe(true)
    expect(b.startsWith('/')).toBe(true)
    expect(a).not.toBe(`/${base.siteId}.jpg`)
    expect(b).not.toBe(`/${base.siteId}.jpg`)
  })
})
