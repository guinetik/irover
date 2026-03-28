/**
 * Pure functions for radiation scalar field generation and sampling.
 *
 * No Three.js or Vue dependencies — safe for unit testing and lib reuse.
 */

import { SimplexNoise } from '@/lib/math/simplexNoise'
import type { RadiationZone, RadiationThresholds } from './radiationTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Zone Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a radiation scalar value into a zone tier.
 *
 * - value < safeMax          → 'safe'
 * - value >= safeMax and
 *   value < hazardousMin     → 'intermediate'   (safeMax boundary is intermediate)
 * - value >= hazardousMin    → 'hazardous'
 */
export function classifyZone(value: number, thresholds: RadiationThresholds): RadiationZone {
  if (value < thresholds.safeMax) return 'safe'
  if (value >= thresholds.hazardousMin) return 'hazardous'
  return 'intermediate'
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/** Linear interpolation helper. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Compute zone thresholds from a site's radiationIndex (0–1).
 *
 * Low index → generous safe band (safeMax ≈ 0.45, hazardousMin ≈ 0.75).
 * High index → tight safe band  (safeMax ≈ 0.12, hazardousMin ≈ 0.30).
 *
 * The gap (hazardousMin - safeMax) is always >= 0.10.
 */
export function computeZoneThresholds(radiationIndex: number): RadiationThresholds {
  const t = Math.max(0, Math.min(1, radiationIndex))
  const safeMax      = lerp(0.45, 0.12, t)
  const hazardousMin = lerp(0.75, 0.30, t)
  return { safeMax, hazardousMin }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a radiation scalar field over terrain.
 *
 * Three contributing layers:
 *   1. Elevation baseline — lower terrain = less cosmic-ray exposure.
 *   2. Medium-scale Perlin pockets — regional variation.
 *   3. Fine-scale noise — local hotspots.
 *
 * Output clamped to [0.05, 1.20].
 *
 * @param heightmap  Normalised elevation values (0–1) in row-major order.
 * @param gridSize   Width/height of the square grid.
 * @param radiationIndex  Site radiation intensity (0–1); shifts the overall level.
 * @param seed       Deterministic noise seed.
 */
export function generateRadiationField(
  heightmap: Float32Array,
  gridSize: number,
  radiationIndex: number,
  seed: number,
): Float32Array {
  const noise = new SimplexNoise(seed)
  const field = new Float32Array(gridSize * gridSize)

  // Scale noise coordinates so patterns span roughly the whole grid.
  const medScale  = 3.5 / gridSize
  const fineScale = 8.0 / gridSize

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col

      // 1. Elevation baseline: higher terrain → more radiation exposure.
      //    heightmap values in [0, 1]; contribute a baseline in [0, 0.5].
      const elev = heightmap[idx] ?? 0.5
      const elevBaseline = 0.10 + elev * 0.40

      // 2. Medium-scale noise pockets (regional features).
      const medNoise = noise.n2(col * medScale, row * medScale)       // [-1, 1]
      const medContrib = medNoise * 0.20

      // 3. Fine-scale noise (local hotspots).
      const fineNoise = noise.n2(col * fineScale + 100, row * fineScale + 100)
      const fineContrib = fineNoise * 0.10

      // 4. radiationIndex shifts the overall level upward.
      const indexBias = radiationIndex * 0.40

      const raw = elevBaseline + medContrib + fineContrib + indexBias
      field[idx] = Math.max(0.05, Math.min(1.20, raw))
    }
  }

  return field
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Sampling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bilinear-interpolated radiation value at a world-space position.
 *
 * Coordinate transform (matches terrain generators):
 *   gx = (worldX / terrainScale + 0.5) * (gridSize - 1)
 *   gz = (worldZ / terrainScale + 0.5) * (gridSize - 1)
 *
 * Positions outside the grid are edge-clamped.
 */
export function sampleRadiationAt(
  field: Float32Array,
  gridSize: number,
  terrainScale: number,
  worldX: number,
  worldZ: number,
): number {
  const gMax = gridSize - 1

  const gxRaw = (worldX / terrainScale + 0.5) * gMax
  const gzRaw = (worldZ / terrainScale + 0.5) * gMax

  // Clamp to grid.
  const gx = Math.max(0, Math.min(gMax, gxRaw))
  const gz = Math.max(0, Math.min(gMax, gzRaw))

  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const x1 = Math.min(x0 + 1, gMax)
  const z1 = Math.min(z0 + 1, gMax)

  const fx = gx - x0
  const fz = gz - z0

  const v00 = field[z0 * gridSize + x0]
  const v10 = field[z0 * gridSize + x1]
  const v01 = field[z1 * gridSize + x0]
  const v11 = field[z1 * gridSize + x1]

  // Bilinear interpolation.
  const top    = v00 + (v10 - v00) * fx
  const bottom = v01 + (v11 - v01) * fx
  return top + (bottom - top) * fz
}

// ─────────────────────────────────────────────────────────────────────────────
// Dose Rate Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the nearest safe zone position in world space from a given world position.
 * Returns `null` if no safe cell exists in the field.
 */
export function findNearestSafeZone(
  field: Float32Array,
  gridSize: number,
  terrainScale: number,
  worldX: number,
  worldZ: number,
  thresholds: RadiationThresholds,
): { x: number; z: number; dist: number } {
  // Convert world pos to grid coords
  const gMax = gridSize - 1
  const roverGx = (worldX / terrainScale + 0.5) * gMax
  const roverGz = (worldZ / terrainScale + 0.5) * gMax

  let bestDist2 = Infinity
  let bestGx = -1
  let bestGz = -1

  for (let gz = 0; gz < gridSize; gz++) {
    for (let gx = 0; gx < gridSize; gx++) {
      if (field[gz * gridSize + gx] >= thresholds.safeMax) continue
      const dx = gx - roverGx
      const dz = gz - roverGz
      const dist2 = dx * dx + dz * dz
      if (dist2 < bestDist2) {
        bestDist2 = dist2
        bestGx = gx
        bestGz = gz
      }
    }
  }

  if (bestGx < 0) {
    throw new Error('No safe zone found in radiation field — every map must have at least one safe cell')
  }

  // Convert back to world coords
  const wx = (bestGx / gMax - 0.5) * terrainScale
  const wz = (bestGz / gMax - 0.5) * terrainScale
  const dx = wx - worldX
  const dz = wz - worldZ
  return { x: wx, z: wz, dist: Math.sqrt(dx * dx + dz * dz) }
}

/**
 * Convert a normalised radiation field value to a dose rate in mGy/day.
 *
 * Linear mapping:
 *   0.0 → 0.05 mGy/day  (background GCR in well-shielded valley)
 *   1.0 → 1.00 mGy/day  (intense SEP exposure on exposed ridge)
 */
export function radiationToDoseRate(fieldValue: number): number {
  return 0.05 + fieldValue * 0.95
}
