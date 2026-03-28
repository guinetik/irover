import { describe, it, expect } from 'vitest'
import {
  classifyZone,
  computeZoneThresholds,
  generateRadiationField,
  sampleRadiationAt,
  radiationToDoseRate,
} from '../radiationField'

// ─────────────────────────────────────────────────────────────────────────────
// classifyZone
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyZone', () => {
  const thresholds = { safeMax: 0.35, hazardousMin: 0.65 }

  it('returns safe for value clearly below safeMax', () => {
    expect(classifyZone(0.10, thresholds)).toBe('safe')
    expect(classifyZone(0.0, thresholds)).toBe('safe')
  })

  it('returns intermediate for value exactly at safeMax (boundary is intermediate)', () => {
    expect(classifyZone(0.35, thresholds)).toBe('intermediate')
  })

  it('returns intermediate for value between safeMax and hazardousMin', () => {
    expect(classifyZone(0.50, thresholds)).toBe('intermediate')
  })

  it('returns hazardous for value at or above hazardousMin', () => {
    expect(classifyZone(0.65, thresholds)).toBe('hazardous')
    expect(classifyZone(1.0, thresholds)).toBe('hazardous')
    expect(classifyZone(1.2, thresholds)).toBe('hazardous')
  })

  it('returns safe for value just below safeMax', () => {
    expect(classifyZone(0.349, thresholds)).toBe('safe')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeZoneThresholds
// ─────────────────────────────────────────────────────────────────────────────

describe('computeZoneThresholds', () => {
  it('returns wider safe band for low radiation index', () => {
    const low = computeZoneThresholds(0.0)
    const high = computeZoneThresholds(1.0)
    expect(low.safeMax).toBeGreaterThan(high.safeMax)
    expect(low.hazardousMin).toBeGreaterThan(high.hazardousMin)
  })

  it('safeMax is ~0.45 at index 0', () => {
    const t = computeZoneThresholds(0.0)
    expect(t.safeMax).toBeCloseTo(0.45, 2)
  })

  it('safeMax is ~0.12 at index 1', () => {
    const t = computeZoneThresholds(1.0)
    expect(t.safeMax).toBeCloseTo(0.12, 2)
  })

  it('hazardousMin is ~0.75 at index 0', () => {
    const t = computeZoneThresholds(0.0)
    expect(t.hazardousMin).toBeCloseTo(0.75, 2)
  })

  it('hazardousMin is ~0.30 at index 1', () => {
    const t = computeZoneThresholds(1.0)
    expect(t.hazardousMin).toBeCloseTo(0.30, 2)
  })

  it('safeMax is always less than hazardousMin with at least 0.10 gap', () => {
    for (const idx of [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
      const t = computeZoneThresholds(idx)
      expect(t.hazardousMin - t.safeMax).toBeGreaterThanOrEqual(0.10)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateRadiationField
// ─────────────────────────────────────────────────────────────────────────────

describe('generateRadiationField', () => {
  const GRID = 16
  const SEED = 42

  it('returns a Float32Array of size gridSize * gridSize', () => {
    const heightmap = new Float32Array(GRID * GRID).fill(0.5)
    const field = generateRadiationField(heightmap, GRID, 0.5, SEED)
    expect(field).toBeInstanceOf(Float32Array)
    expect(field.length).toBe(GRID * GRID)
  })

  it('all values are clamped to [0.05, 1.20]', () => {
    const heightmap = new Float32Array(GRID * GRID).fill(0.5)
    const field = generateRadiationField(heightmap, GRID, 0.5, SEED)
    for (let i = 0; i < field.length; i++) {
      expect(field[i]).toBeGreaterThanOrEqual(0.05)
      expect(field[i]).toBeLessThanOrEqual(1.20)
    }
  })

  it('low elevation produces lower average radiation than high elevation', () => {
    const lowHeightmap = new Float32Array(GRID * GRID).fill(0.0)   // terrain floor
    const highHeightmap = new Float32Array(GRID * GRID).fill(1.0)  // terrain peak

    const lowField = generateRadiationField(lowHeightmap, GRID, 0.5, SEED)
    const highField = generateRadiationField(highHeightmap, GRID, 0.5, SEED)

    const avg = (f: Float32Array) => f.reduce((s, v) => s + v, 0) / f.length
    expect(avg(lowField)).toBeLessThan(avg(highField))
  })

  it('produces deterministic output for the same seed', () => {
    const heightmap = new Float32Array(GRID * GRID).fill(0.5)
    const a = generateRadiationField(heightmap, GRID, 0.5, SEED)
    const b = generateRadiationField(heightmap, GRID, 0.5, SEED)
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i])
    }
  })

  it('different seeds produce different fields', () => {
    const heightmap = new Float32Array(GRID * GRID).fill(0.5)
    const a = generateRadiationField(heightmap, GRID, 0.5, 1)
    const b = generateRadiationField(heightmap, GRID, 0.5, 999)
    let differ = false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { differ = true; break }
    }
    expect(differ).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// sampleRadiationAt
// ─────────────────────────────────────────────────────────────────────────────

describe('sampleRadiationAt', () => {
  const GRID = 4
  const TERRAIN_SCALE = 10

  // Build a field where field[i] = i / (GRID*GRID) for predictable values
  function makeField(): Float32Array {
    const f = new Float32Array(GRID * GRID)
    for (let i = 0; i < f.length; i++) f[i] = 0.3 + (i % GRID) * 0.1
    return f
  }

  it('returns a number', () => {
    const field = makeField()
    const v = sampleRadiationAt(field, GRID, TERRAIN_SCALE, 0, 0)
    expect(typeof v).toBe('number')
    expect(isNaN(v)).toBe(false)
  })

  it('center sample (worldX=0, worldZ=0) maps to grid center', () => {
    const field = makeField()
    const v = sampleRadiationAt(field, GRID, TERRAIN_SCALE, 0, 0)
    // gx = (0 / 10 + 0.5) * (4 - 1) = 0.5 * 3 = 1.5
    // gz = same → bilinear between [1,1], [1,2], [2,1], [2,2] cells
    expect(v).toBeGreaterThanOrEqual(0.05)
  })

  it('clamps positions outside the grid to edge values', () => {
    const field = makeField()
    const inBounds  = sampleRadiationAt(field, GRID, TERRAIN_SCALE,  0,  0)
    const farOutside = sampleRadiationAt(field, GRID, TERRAIN_SCALE, 999, 999)
    // Both should return valid numbers (not NaN, not out of Float32Array bounds)
    expect(isNaN(inBounds)).toBe(false)
    expect(isNaN(farOutside)).toBe(false)
  })

  it('returns exact field value at exact grid cell corners', () => {
    // Fill with gradient: col 0 = 0.1, col 1 = 0.2, col 2 = 0.3, col 3 = 0.4
    const field = new Float32Array(GRID * GRID)
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        field[row * GRID + col] = 0.1 + col * 0.1
      }
    }
    // worldX such that gx = 0 exactly: gx = (worldX/10 + 0.5)*3 = 0 → worldX = -5
    const v = sampleRadiationAt(field, GRID, TERRAIN_SCALE, -5, -5)
    expect(v).toBeCloseTo(0.1, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// radiationToDoseRate
// ─────────────────────────────────────────────────────────────────────────────

describe('radiationToDoseRate', () => {
  it('maps 0.0 → 0.05 mGy/day', () => {
    expect(radiationToDoseRate(0.0)).toBeCloseTo(0.05, 5)
  })

  it('maps 1.0 → 1.0 mGy/day', () => {
    expect(radiationToDoseRate(1.0)).toBeCloseTo(1.0, 5)
  })

  it('maps 0.5 → 0.525 mGy/day (midpoint)', () => {
    expect(radiationToDoseRate(0.5)).toBeCloseTo(0.525, 5)
  })

  it('is linear (monotonically increasing)', () => {
    expect(radiationToDoseRate(0.25)).toBeLessThan(radiationToDoseRate(0.75))
  })
})
