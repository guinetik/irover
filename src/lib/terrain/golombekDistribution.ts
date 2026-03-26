import type { TerrainParams } from '@/types/terrain'

// ─────────────────────────────────────────────────────────────────────────────
// Golombek-Rapp Exponential Rock Size-Frequency Distribution Model
// ─────────────────────────────────────────────────────────────────────────────
//
// References:
//   Golombek & Rapp (1997) — Original exponential model from Viking data
//   Golombek et al. (2003) — MER landing site rock SFDs (your 2003 PDF)
//   Golombek et al. (2021) — InSight rock SFDs (your 2021 PDF)
//   Charalambous (2014) — Negative binomial fragmentation theory
//   Christensen (1986) — IRTM global rock abundance mapping
//   Nowicki & Christensen (2007) — TES rock abundance
//
// Core equation:
//   F_k(D) = k * exp[-q(k) * D]
//   where q(k) = 1.79 + 0.152 / k
//
// F_k(D) = cumulative fractional area covered by rocks of diameter D or larger
// k      = total rock abundance (fraction of surface covered by all rocks)
// q(k)   = controls how steeply the number of large rocks drops off
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 2D noise in roughly [-1, 1] (e.g. `SimplexNoise` from `@/lib/math/simplexNoise`). */
export interface TerrainNoise2D {
  n2(x: number, y: number): number
}

/** A single rock to be spawned, with diameter and world position. */
export interface RockSpawn {
  /** World X position */
  x: number
  /** World Z position */
  z: number
  /** Diameter in meters (game scale, not real Mars meters) */
  diameter: number
  /** Height-to-diameter ratio (0.24 for tabular flood rocks, ~0.5 for typical) */
  heightRatio: number
  /** Burial fraction: 0 = perched, 0.5 = half buried, 1 = deeply buried */
  burial: number
  /** Whether this rock is near a crater ejecta halo */
  isEjecta: boolean
}

/** Crater for ejecta rock clustering */
interface EjectaCrater {
  x: number
  z: number
  radius: number
  /** Rock abundance multiplier at the rim (up to 0.36 CFA) */
  rimAbundance: number
  /** Degradation class 1-5 (1 = fresh, 5 = nearly obliterated) */
  degradation: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-biome rock abundance (k) from orbital thermal mapping & landing sites
// ─────────────────────────────────────────────────────────────────────────────

/** Base rock abundance k for each feature type, derived from TES/IRTM data. */
const BIOME_K: Record<string, { base: number; min: number; max: number }> = {
  'volcano': { base: 0.03, min: 0.01, max: 0.08 },
  'canyon': { base: 0.22, min: 0.15, max: 0.35 },
  'basin': { base: 0.10, min: 0.05, max: 0.20 },
  'plain': { base: 0.05, min: 0.02, max: 0.10 },
  'polar-cap': { base: 0.06, min: 0.03, max: 0.12 },
  'landing-site': { base: 0.05, min: 0.02, max: 0.15 },
}

/**
 * Height-to-diameter ratios by geological context.
 * Golombek et al. (2003): Pathfinder near-field 0.24, far-field 0.83, average 0.5
 * Viking 1 & 2: ~0.5
 */
const H_D_RATIOS: Record<string, { mean: number; spread: number }> = {
  'volcano': { mean: 0.45, spread: 0.15 },
  'canyon': { mean: 0.50, spread: 0.20 },
  'basin': { mean: 0.40, spread: 0.15 },
  'plain': { mean: 0.35, spread: 0.12 },
  'polar-cap': { mean: 0.30, spread: 0.10 },
  'landing-site': { mean: 0.45, spread: 0.15 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Golombek-Rapp math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * q(k) — the exponential decay rate for rock coverage vs diameter.
 * Golombek & Rapp (1997), Eq. 2: q(k) = 1.79 + 0.152 / k
 * Higher q = steeper dropoff = fewer large rocks relative to small ones.
 */
export function qOfK(k: number): number {
  return 1.79 + 0.152 / Math.max(k, 0.001)
}

/**
 * Cumulative Fractional Area: fraction of surface covered by rocks ≥ diameter D.
 * Golombek & Rapp (1997), Eq. 1: F_k(D) = k * exp[-q(k) * D]
 *
 * @param k Total rock abundance (0–1)
 * @param D Rock diameter in meters
 */
export function cfa(k: number, D: number): number {
  return k * Math.exp(-qOfK(k) * D)
}

/**
 * Cumulative number of rocks per m² with diameter ≥ D.
 * Derived by numerical integration of the CFA model.
 * Golombek et al. (2003) Section 2.2.4
 */
export function cumulativeNumberPerM2(
  k: number,
  minD: number,
  maxD: number = 10.0,
  steps: number = 200,
): number {
  let count = 0
  const dD = (maxD - minD) / steps

  for (let i = 0; i < steps; i++) {
    const d = minD + i * dD
    const dMid = d + dD * 0.5
    const areaInBin = cfa(k, d) - cfa(k, d + dD)
    if (areaInBin <= 0) continue
    const rockArea = Math.PI * 0.25 * dMid * dMid
    count += areaInBin / rockArea
  }

  return count
}

/**
 * Sample a rock diameter from the Golombek distribution using inverse CDF.
 *
 * @param k Total rock abundance
 * @param minD Minimum diameter (meters)
 * @param maxD Maximum diameter (meters)
 * @param u Uniform random number [0, 1]
 */
export function sampleDiameter(k: number, minD: number, maxD: number, u: number): number {
  const q = qOfK(k)
  const bias = 1.0 + q * 0.3
  const t = Math.pow(u, bias)
  return minD + t * (maxD - minD)
}

// ─────────────────────────────────────────────────────────────────────────────
// Crater ejecta clustering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates crater positions for ejecta rock clustering.
 * Number and freshness controlled by craterDensity param.
 *
 * Ejecta rock abundance falls off as r^-3 from the rim
 * (Golombek et al. 2021, Sweeney et al. 2018).
 */
export function generateEjectaCraters(
  params: TerrainParams,
  scale: number,
  rng: TerrainNoise2D,
): EjectaCrater[] {
  const craters: EjectaCrater[] = []
  const { craterDensity, featureType, seed } = params

  const freshCraterCount = Math.floor(craterDensity * 8) + 1
  const halfScale = scale * 0.5

  const featureMultiplier =
    featureType === 'volcano' ? 0.3 :
      featureType === 'polar-cap' ? 0.2 :
        featureType === 'canyon' ? 0.8 :
          featureType === 'basin' ? 1.8 :
            1.0

  const adjustedCount = Math.max(1, Math.floor(freshCraterCount * featureMultiplier))

  for (let i = 0; i < adjustedCount; i++) {
    const cx = (rng.n2(i * 5.7 + seed * 0.01, 13.3) + 1) * 0.5 * scale - halfScale
    const cz = (rng.n2(17.1, i * 4.3 + seed * 0.01) + 1) * 0.5 * scale - halfScale

    const sizeRand = (rng.n2(i * 3.1, i * 2.7) + 1) * 0.5
    const radius = 5 + sizeRand * 35

    const degradeRand = (rng.n2(i * 1.9, i * 4.1) + 1) * 0.5
    const degradation = Math.min(5, Math.max(1, Math.round(1 + degradeRand * 4)))

    const rimAbundanceByClass = [0.36, 0.20, 0.10, 0.04, 0.01]
    const rimAbundance = rimAbundanceByClass[degradation - 1]

    craters.push({ x: cx, z: cz, radius, rimAbundance, degradation })
  }

  return craters
}

/**
 * Local rock abundance boost from nearby crater ejecta (r^-3 from rim).
 */
export function ejectaBoost(
  wx: number,
  wz: number,
  craters: EjectaCrater[],
): { boost: number; isEjecta: boolean } {
  let maxBoost = 0
  let isEjecta = false

  for (const c of craters) {
    const dx = wx - c.x
    const dz = wz - c.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    const normalizedDist = dist / c.radius
    if (normalizedDist < 0.8) continue
    if (normalizedDist > 5.0) continue

    const rimDist = Math.max(0.1, normalizedDist - 0.8)
    const falloff = 1.0 / (rimDist * rimDist * rimDist)
    const boost = c.rimAbundance * Math.min(1.0, falloff)

    if (boost > maxBoost) {
      maxBoost = boost
      isEjecta = true
    }
  }

  return { boost: maxBoost, isEjecta }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main distribution generator
// ─────────────────────────────────────────────────────────────────────────────

/** Performance budget — max rocks to spawn regardless of area/abundance. */
const MAX_ROCKS = 1500
const MIN_DIAMETER = 0.4
const MAX_DIAMETER = 3.5
const GAME_TO_MARS = 1.0

export interface GolombekConfig {
  /** Override max rock count for performance tuning */
  maxRocks?: number
  /** Minimum rock count — ensures enough rocks for gameplay */
  minRocks?: number
  /** Minimum diameter in game meters */
  minDiameter?: number
  /** Maximum diameter in game meters */
  maxDiameter?: number
}

/**
 * Generates a list of rock spawn positions and sizes (Golombek–Rapp model,
 * per-biome k, ejecta clustering).
 *
 * @param rng Deterministic noise (e.g. `new SimplexNoise(params.seed + 777)` from `@/lib/math/simplexNoise`).
 */
export function generateRockDistribution(
  params: TerrainParams,
  scale: number,
  rng: TerrainNoise2D,
  config: GolombekConfig = {},
): RockSpawn[] {
  const maxRocks = config.maxRocks ?? MAX_ROCKS
  const minRocks = config.minRocks ?? 200
  const minD = config.minDiameter ?? MIN_DIAMETER
  const maxD = config.maxDiameter ?? MAX_DIAMETER

  const halfScale = scale * 0.5

  const biomeData = BIOME_K[params.featureType] ?? BIOME_K['landing-site']
  let k = biomeData.base

  k *= 0.7 + params.roughness * 0.6
  k *= 0.8 + params.craterDensity * 0.4
  k *= 1.0 - params.dustCover * 0.6
  k = Math.max(biomeData.min, Math.min(biomeData.max, k))

  const realDensity = cumulativeNumberPerM2(k, minD * GAME_TO_MARS)
  const terrainArea = scale * scale
  const realCount = realDensity * terrainArea

  const targetCount = Math.min(maxRocks, Math.max(minRocks, Math.floor(realCount)))

  const craters = generateEjectaCraters(params, scale, rng)

  const hdData = H_D_RATIOS[params.featureType] ?? H_D_RATIOS['landing-site']

  const baseBurialFraction = 0.10 + params.dustCover * 0.25 + params.craterDensity * 0.10

  const spawns: RockSpawn[] = []
  let attempts = 0
  const maxAttempts = targetCount * 8

  while (spawns.length < targetCount && attempts < maxAttempts) {
    attempts++
    const i = attempts

    let rx = (rng.n2(i * 1.37, 3.91) + 1) * 0.5 * scale - halfScale
    let rz = (rng.n2(8.73, i * 2.17) + 1) * 0.5 * scale - halfScale

    const { boost, isEjecta } = ejectaBoost(rx, rz, craters)

    const localK = Math.min(0.4, k + boost)
    const acceptRate = localK / 0.4
    const acceptRand = (rng.n2(i * 0.71, i * 3.33) + 1) * 0.5

    if (!isEjecta && acceptRand > acceptRate) continue

    const uDiam = (rng.n2(i * 2.91, i * 1.73) + 1) * 0.5
    let diameter = sampleDiameter(localK, minD, maxD, uDiam)

    if (isEjecta && boost > 0.05) {
      diameter *= 1.0 + boost * 2.0
      diameter = Math.min(maxD, diameter)
    }

    const hdNoise = (rng.n2(i * 4.13, i * 0.97) + 1) * 0.5 - 0.5
    let heightRatio = hdData.mean + hdNoise * hdData.spread * 2

    if (isEjecta) heightRatio = Math.min(0.7, heightRatio + 0.1)

    heightRatio = Math.max(0.15, Math.min(0.85, heightRatio))

    const burialRand = (rng.n2(i * 3.37, i * 2.91) + 1) * 0.5
    let burial = 0
    if (burialRand < baseBurialFraction) {
      burial = 0.3 + (rng.n2(i * 1.57, i * 4.71) + 1) * 0.2
    }
    if (isEjecta) burial *= 0.3

    spawns.push({
      x: rx,
      z: rz,
      diameter,
      heightRatio,
      burial,
      isEjecta,
    })
  }

  return spawns
}

/**
 * Effective rock abundance k for terrain params (e.g. HUD "Rock Abundance: 5.2%").
 */
export function getEffectiveK(params: TerrainParams): number {
  const biomeData = BIOME_K[params.featureType] ?? BIOME_K['landing-site']
  let k = biomeData.base
  k *= 0.7 + params.roughness * 0.6
  k *= 0.8 + params.craterDensity * 0.4
  k *= 1.0 - params.dustCover * 0.6
  return Math.max(biomeData.min, Math.min(biomeData.max, k))
}

/**
 * CFA and cumulative number samples for SFD debug plots.
 */
export function getSFDCurve(
  k: number,
  minD: number = 0.03,
  maxD: number = 5.0,
  points: number = 50,
): { diameter: number; cfa: number; cumNumber: number }[] {
  const result: { diameter: number; cfa: number; cumNumber: number }[] = []
  for (let i = 0; i < points; i++) {
    const d = minD * Math.pow(maxD / minD, i / (points - 1))
    result.push({
      diameter: d,
      cfa: cfa(k, d),
      cumNumber: cumulativeNumberPerM2(k, d),
    })
  }
  return result
}
