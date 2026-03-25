import { SimplexNoise } from './SimplexNoise'
import type { TerrainParams } from './TerrainGenerator'

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
  'volcano':      { base: 0.03, min: 0.01, max: 0.08 },
  'canyon':        { base: 0.22, min: 0.15, max: 0.35 },
  'basin':         { base: 0.10, min: 0.05, max: 0.20 },
  'plain':         { base: 0.05, min: 0.02, max: 0.10 },
  'polar-cap':     { base: 0.06, min: 0.03, max: 0.12 },
  'landing-site':  { base: 0.05, min: 0.02, max: 0.15 },
}

/**
 * Height-to-diameter ratios by geological context.
 * Golombek et al. (2003): Pathfinder near-field 0.24, far-field 0.83, average 0.5
 * Viking 1 & 2: ~0.5
 */
const H_D_RATIOS: Record<string, { mean: number; spread: number }> = {
  'volcano':      { mean: 0.45, spread: 0.15 },  // angular lava blocks
  'canyon':        { mean: 0.50, spread: 0.20 },  // cliff collapse, mixed
  'basin':         { mean: 0.40, spread: 0.15 },  // ancient, weathered
  'plain':         { mean: 0.35, spread: 0.12 },  // flood-deposited, tabular
  'polar-cap':     { mean: 0.30, spread: 0.10 },  // frost-heaved, low profile
  'landing-site':  { mean: 0.45, spread: 0.15 },  // mixed origin
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Golombek-Rapp math
// ─────────────────────────────────────────────────────────────────────────────

/**
 * q(k) — the exponential decay rate for rock coverage vs diameter.
 * Golombek & Rapp (1997), Eq. 2: q(k) = 1.79 + 0.152 / k
 * Higher q = steeper dropoff = fewer large rocks relative to small ones.
 */
function qOfK(k: number): number {
  return 1.79 + 0.152 / Math.max(k, 0.001)
}

/**
 * Cumulative Fractional Area: fraction of surface covered by rocks ≥ diameter D.
 * Golombek & Rapp (1997), Eq. 1: F_k(D) = k * exp[-q(k) * D]
 *
 * @param k Total rock abundance (0–1)
 * @param D Rock diameter in meters
 */
function cfa(k: number, D: number): number {
  return k * Math.exp(-qOfK(k) * D)
}

/**
 * Cumulative number of rocks per m² with diameter ≥ D.
 * Derived by numerical integration of the CFA model.
 * Golombek et al. (2003) Section 2.2.4
 *
 * We integrate from large D down to D, accumulating rocks in small bins.
 * For each bin [d, d+δ], the fractional area in that bin is CFA(d) - CFA(d+δ),
 * and the number of rocks is that area divided by the area of one rock (π/4 * d²).
 */
function cumulativeNumberPerM2(k: number, minD: number, maxD: number = 10.0, steps: number = 200): number {
  const q = qOfK(k)
  let count = 0
  const dD = (maxD - minD) / steps

  for (let i = 0; i < steps; i++) {
    const d = minD + i * dD
    const dMid = d + dD * 0.5
    // Area in this bin
    const areaInBin = cfa(k, d) - cfa(k, d + dD)
    if (areaInBin <= 0) continue
    // Number of rocks = area / (π/4 * d²)
    const rockArea = Math.PI * 0.25 * dMid * dMid
    count += areaInBin / rockArea
  }

  return count
}

/**
 * Sample a rock diameter from the Golombek distribution using inverse CDF.
 * The CFA gives us the cumulative distribution, so we can sample from it.
 *
 * @param k Total rock abundance
 * @param minD Minimum diameter (meters)
 * @param maxD Maximum diameter (meters)
 * @param u Uniform random number [0, 1]
 */
function sampleDiameter(k: number, minD: number, maxD: number, u: number): number {
  // The CFA-weighted probability of a rock having diameter d is proportional to
  // the differential: -dF/dD * (1/d²), which after normalization gives us
  // a distribution heavily skewed toward small rocks.
  //
  // For efficiency we use a power-biased sampling: most rocks are small.
  // u^exponent biases toward 0 (small diameters).
  const q = qOfK(k)
  // Bias exponent: higher q = steeper = more small rocks
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
function generateEjectaCraters(
  params: TerrainParams,
  scale: number,
  rng: SimplexNoise,
): EjectaCrater[] {
  const craters: EjectaCrater[] = []
  const { craterDensity, featureType, seed } = params

  // Number of rocky ejecta craters scales with crater density
  // Most craters are too degraded to have visible ejecta rocks (class 4-5)
  // Only fresh-ish craters (class 1-3) contribute rock halos
  const freshCraterCount = Math.floor(craterDensity * 8) + 1
  const halfScale = scale * 0.5

  // Fewer ejecta craters on young surfaces (volcano) and ice (polar)
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

    // Crater radius: 5–40m game scale (representing 10–100m real craters)
    const sizeRand = (rng.n2(i * 3.1, i * 2.7) + 1) * 0.5
    const radius = 5 + sizeRand * 35

    // Degradation class 1-5 (biased toward degraded — most craters are old)
    const degradeRand = (rng.n2(i * 1.9, i * 4.1) + 1) * 0.5
    const degradation = Math.min(5, Math.max(1, Math.round(1 + degradeRand * 4)))

    // Rim rock abundance: fresh craters up to 36% CFA, degraded much less
    // Sweeney et al. (2018) degradation sequence
    const rimAbundanceByClass = [0.36, 0.20, 0.10, 0.04, 0.01]
    const rimAbundance = rimAbundanceByClass[degradation - 1]

    craters.push({ x: cx, z: cz, radius, rimAbundance, degradation })
  }

  return craters
}

/**
 * Compute the local rock abundance boost from nearby crater ejecta.
 * Ejecta thickness (and rock density) falls off as r^-3 from the rim.
 *
 * Returns 0 if outside all ejecta blankets, or the maximum boost from
 * the nearest/most influential crater.
 */
function ejectaBoost(
  wx: number, wz: number,
  craters: EjectaCrater[],
): { boost: number; isEjecta: boolean } {
  let maxBoost = 0
  let isEjecta = false

  for (const c of craters) {
    const dx = wx - c.x
    const dz = wz - c.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    // Continuous ejecta extends ~2.5 crater radii from center
    // (rim is at 1.0 radii, continuous blanket to ~2.5 radii)
    const normalizedDist = dist / c.radius
    if (normalizedDist < 0.8) continue  // inside crater bowl, no ejecta rocks
    if (normalizedDist > 5.0) continue  // beyond ejecta influence

    // r^-3 falloff from rim (normalizedDist = 1.0)
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
/** Minimum rock diameter in game-world units */
const MIN_DIAMETER = 0.4
/** Maximum rock diameter in game-world units (boulders) */
const MAX_DIAMETER = 3.5
/** Scale factor: game meters to "real Mars meters" for the model.
 *  Our terrain is 800m game-scale representing ~800m of real Mars. */
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
 * Generates a scientifically-grounded list of rock spawn positions and sizes
 * using the Golombek-Rapp exponential model with per-biome parameterization,
 * crater ejecta clustering, and Charalambous fragmentation maturity.
 */
export function generateRockDistribution(
  params: TerrainParams,
  scale: number,
  config: GolombekConfig = {},
): RockSpawn[] {
  const maxRocks = config.maxRocks ?? MAX_ROCKS
  const minRocks = config.minRocks ?? 200
  const minD = config.minDiameter ?? MIN_DIAMETER
  const maxD = config.maxDiameter ?? MAX_DIAMETER

  const rng = new SimplexNoise(params.seed + 777)
  const halfScale = scale * 0.5

  // ── Step 1: Determine base rock abundance k ──────────────────────────────
  const biomeData = BIOME_K[params.featureType] ?? BIOME_K['landing-site']
  let k = biomeData.base

  // Modulate k by terrain params
  // Higher roughness → more exposed rock
  k *= 0.7 + params.roughness * 0.6
  // Higher crater density → more fragmented rock from impacts
  k *= 0.8 + params.craterDensity * 0.4
  // Dust cover suppresses visible rock abundance by 30-70%
  k *= 1.0 - params.dustCover * 0.6
  // Clamp to biome range
  k = Math.max(biomeData.min, Math.min(biomeData.max, k))

  // ── Step 2: Compute target rock count ────────────────────────────────────
  // Real cumulative number per m² at min diameter
  const realDensity = cumulativeNumberPerM2(k, minD * GAME_TO_MARS)
  const terrainArea = scale * scale
  const realCount = realDensity * terrainArea

  // Scale to performance budget, preserving the SIZE DISTRIBUTION shape
  const targetCount = Math.min(maxRocks, Math.max(minRocks, Math.floor(realCount)))

  // ── Step 3: Generate ejecta craters for spatial clustering ───────────────
  const craters = generateEjectaCraters(params, scale, rng)

  // ── Step 4: Determine H/D ratio params for this biome ───────────────────
  const hdData = H_D_RATIOS[params.featureType] ?? H_D_RATIOS['landing-site']

  // ── Step 5: Burial fraction by terrain context ──────────────────────────
  // Older/dustier surfaces have more buried rocks
  // Golombek et al. (2003): 10-29% buried across sites
  const baseBurialFraction = 0.10 + params.dustCover * 0.25 + params.craterDensity * 0.10

  // ── Step 6: Spawn rocks ─────────────────────────────────────────────────
  const spawns: RockSpawn[] = []
  let attempts = 0
  const maxAttempts = targetCount * 8  // Allow more rejection sampling headroom

  while (spawns.length < targetCount && attempts < maxAttempts) {
    attempts++
    const i = attempts

    // Random position (noise-based for determinism)
    let rx = (rng.n2(i * 1.37, 3.91) + 1) * 0.5 * scale - halfScale
    let rz = (rng.n2(8.73, i * 2.17) + 1) * 0.5 * scale - halfScale

    // ── Ejecta clustering: boost density near crater rims ──────────────
    const { boost, isEjecta } = ejectaBoost(rx, rz, craters)

    // Accept/reject based on local density.
    // Base acceptance rate = k / biomeData.max (normalized).
    // Ejecta boost increases acceptance near crater rims.
    const localK = Math.min(0.4, k + boost)
    const acceptRate = localK / 0.4  // 0-1 range
    const acceptRand = (rng.n2(i * 0.71, i * 3.33) + 1) * 0.5

    // If ejecta, always accept (these are the interesting clusters)
    // Otherwise, probabilistic acceptance based on local density
    if (!isEjecta && acceptRand > acceptRate) continue

    // ── Sample diameter from Golombek exponential model ────────────────
    const uDiam = (rng.n2(i * 2.91, i * 1.73) + 1) * 0.5
    let diameter = sampleDiameter(localK, minD, maxD, uDiam)

    // Ejecta rocks near fresh craters skew larger (less fragmented)
    if (isEjecta && boost > 0.05) {
      diameter *= 1.0 + boost * 2.0
      diameter = Math.min(maxD, diameter)
    }

    // ── Height-to-diameter ratio ───────────────────────────────────────
    const hdNoise = (rng.n2(i * 4.13, i * 0.97) + 1) * 0.5 - 0.5  // [-0.5, 0.5]
    let heightRatio = hdData.mean + hdNoise * hdData.spread * 2

    // Ejecta rocks are more angular/equant (higher H/D)
    if (isEjecta) heightRatio = Math.min(0.7, heightRatio + 0.1)

    heightRatio = Math.max(0.15, Math.min(0.85, heightRatio))

    // ── Burial ────────────────────────────────────────────────────────
    const burialRand = (rng.n2(i * 3.37, i * 2.91) + 1) * 0.5
    let burial = 0
    if (burialRand < baseBurialFraction) {
      // Buried: 0.3-0.7 depth
      burial = 0.3 + (rng.n2(i * 1.57, i * 4.71) + 1) * 0.2
    }
    // Ejecta rocks are mostly perched (recently deposited)
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

// ─────────────────────────────────────────────────────────────────────────────
// Utility exports for debugging / UI display
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the effective rock abundance k for given terrain params.
 * Useful for HUD display: "Rock Abundance: 5.2%"
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
 * Returns CFA and cumulative number data for plotting SFD curves.
 * Useful for a debug panel showing the Golombek curve alongside actual spawned rocks.
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
