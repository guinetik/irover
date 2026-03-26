import { describe, expect, it } from 'vitest'
import type { TerrainParams } from '@/types/terrain'
import {
  cfa,
  ejectaBoost,
  generateEjectaCraters,
  generateRockDistribution,
  getEffectiveK,
  getSFDCurve,
  qOfK,
  sampleDiameter,
} from '../golombekDistribution'

/** Minimal noise stub: deterministic “random” in [0, 1) from coordinates. */
const stubRng = {
  n2(x: number, y: number): number {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return 2 * (s - Math.floor(s)) - 1
  },
}

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

describe('golombekDistribution', () => {
  it('qOfK increases as k shrinks (steeper SFD for sparse rock)', () => {
    expect(qOfK(0.05)).toBeGreaterThan(qOfK(0.2))
  })

  it('cfa falls off with diameter', () => {
    const k = 0.1
    expect(cfa(k, 0.5)).toBeGreaterThan(cfa(k, 2.0))
  })

  it('sampleDiameter respects bounds', () => {
    const d = sampleDiameter(0.1, 0.4, 3.5, 0.5)
    expect(d).toBeGreaterThanOrEqual(0.4)
    expect(d).toBeLessThanOrEqual(3.5)
  })

  it('getEffectiveK clamps to biome range', () => {
    const k = getEffectiveK(baseTerrain)
    expect(k).toBeGreaterThanOrEqual(0.02)
    expect(k).toBeLessThanOrEqual(0.10)
  })

  it('generateEjectaCraters returns non-empty list for typical terrain', () => {
    const craters = generateEjectaCraters(baseTerrain, 800, stubRng)
    expect(craters.length).toBeGreaterThanOrEqual(1)
  })

  it('ejectaBoost is zero far from all craters', () => {
    const craters = generateEjectaCraters(baseTerrain, 100, stubRng)
    const { boost, isEjecta } = ejectaBoost(1e6, 1e6, craters)
    expect(boost).toBe(0)
    expect(isEjecta).toBe(false)
  })

  it('generateRockDistribution returns rocks within configured caps', () => {
    const rocks = generateRockDistribution(baseTerrain, 120, stubRng, {
      maxRocks: 12,
      minRocks: 4,
      minDiameter: 0.15,
      maxDiameter: 2.5,
    })
    expect(rocks.length).toBeGreaterThanOrEqual(4)
    expect(rocks.length).toBeLessThanOrEqual(12)
    for (const r of rocks) {
      expect(r.diameter).toBeGreaterThanOrEqual(0.15)
      expect(r.diameter).toBeLessThanOrEqual(2.5)
      expect(r.heightRatio).toBeGreaterThanOrEqual(0.15)
      expect(r.heightRatio).toBeLessThanOrEqual(0.85)
    }
  })

  it('getSFDCurve samples diameters with decreasing CFA', () => {
    const curve = getSFDCurve(0.08, 0.05, 2.0, 12)
    expect(curve).toHaveLength(12)
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].diameter).toBeGreaterThan(curve[i - 1].diameter)
      expect(curve[i].cfa).toBeLessThanOrEqual(curve[i - 1].cfa)
    }
  })

  it('getEffectiveK uses biome table for non-plain feature types', () => {
    const canyon: TerrainParams = { ...baseTerrain, featureType: 'canyon' }
    const plainK = getEffectiveK(baseTerrain)
    const canyonK = getEffectiveK(canyon)
    expect(canyonK).toBeGreaterThan(plainK)
  })
})
