import type { RadEventId, RadParticleType, RadQualityGrade } from './radiationTypes'
import { RAD_EVENT_DEFS } from './radiationTypes'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Simple seeded pseudo-random number generator (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s += 0x6D2B79F5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

/** Fisher-Yates shuffle using a provided RNG. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/** Ordered particle keys used for composition vectors. */
const PARTICLE_KEYS: RadParticleType[] = ['proton', 'neutron', 'gamma', 'hze']

/** Cosine similarity between two same-length numeric vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Minimum cosine-similarity confidence to consider a classification definitive. */
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.70

/**
 * Pick a random event from the weighted spawn table.
 * Weights: gcr-fluctuation=50, soft-sep=25, hard-sep=8, forbush-decrease=3.
 */
export function pickWeightedEvent(): RadEventId {
  const defs = Object.values(RAD_EVENT_DEFS)
  const totalWeight = defs.reduce((sum, d) => sum + d.spawnWeight, 0)
  let roll = Math.random() * totalWeight
  for (const def of defs) {
    roll -= def.spawnWeight
    if (roll <= 0) return def.id
  }
  return defs[defs.length - 1].id
}

/**
 * Auto-classify a decoded event using cosine similarity between the caught
 * particle composition vector and each event's expected composition.
 * Returns best match and confidence score.
 * If total caught is 0, returns gcr-fluctuation with confidence 0.
 */
export function classifyByComposition(
  caught: Record<RadParticleType, number>,
): { eventId: RadEventId; confidence: number } {
  const total = PARTICLE_KEYS.reduce((s, k) => s + caught[k], 0)
  if (total === 0) return { eventId: 'gcr-fluctuation', confidence: 0 }

  // Build caught vector (raw counts — cosine similarity is scale-invariant)
  const caughtVec = PARTICLE_KEYS.map(k => caught[k])

  let bestId: RadEventId = 'gcr-fluctuation'
  let bestSim = -Infinity

  for (const def of Object.values(RAD_EVENT_DEFS)) {
    const defVec = PARTICLE_KEYS.map(k => def.composition[k])
    const sim = cosineSimilarity(caughtVec, defVec)
    if (sim > bestSim) {
      bestSim = sim
      bestId = def.id
    }
  }

  return { eventId: bestId, confidence: Math.max(0, Math.min(1, bestSim)) }
}

/**
 * Compute quality grade from particle catch rate.
 * 95%+ = S, 80%+ = A, 70%+ = B, 50%+ = C, below = D.
 */
export function computeQualityGrade(caught: number, total: number): RadQualityGrade {
  if (total === 0) return 'D'
  const rate = caught / total
  if (rate >= 0.95) return 'S'
  if (rate >= 0.80) return 'A'
  if (rate >= 0.70) return 'B'
  if (rate >= 0.50) return 'C'
  return 'D'
}

const GRADE_MULTIPLIER: Record<RadQualityGrade, number> = {
  S: 1.4,
  A: 1.1,
  B: 1.0,
  C: 0.8,
  D: 0.5,
}

/**
 * Compute SP reward with grade multiplier.
 * If resolved is false, halve the SP. Defaults resolved=true.
 */
export function computeSPReward(
  baseSP: number,
  grade: RadQualityGrade,
  resolved = true,
): number {
  let sp = Math.round(baseSP * GRADE_MULTIPLIER[grade])
  if (!resolved) sp = Math.round(sp / 2)
  return sp
}

/**
 * Generate a deterministic particle spawn schedule for an event.
 * Uses the event's composition ratios to build a pool, shuffles it
 * deterministically, then distributes times based on rateCurve.
 */
export function generateParticleSchedule(
  eventId: RadEventId,
  seed: number,
): Array<{ timeSec: number; particleType: RadParticleType }> {
  const def = RAD_EVENT_DEFS[eventId]
  const rng = mulberry32(seed)

  // Build particle pool proportional to composition ratios.
  // Compute integer counts that sum to totalParticles using floor + remainder.
  const n = def.totalParticles
  const rawCounts = PARTICLE_KEYS.map(k => def.composition[k] * n)
  const floors = rawCounts.map(Math.floor)
  const remainder = n - floors.reduce((s, v) => s + v, 0)

  // Distribute remaining slots to keys with largest fractional parts
  const fracs = rawCounts.map((v, i) => ({ i, frac: v - floors[i] }))
  fracs.sort((a, b) => b.frac - a.frac)
  for (let r = 0; r < remainder; r++) floors[fracs[r].i]++

  const pool: RadParticleType[] = []
  for (let ki = 0; ki < PARTICLE_KEYS.length; ki++) {
    for (let j = 0; j < floors[ki]; j++) pool.push(PARTICLE_KEYS[ki])
  }

  // Deterministic shuffle
  const shuffled = shuffle(pool, rng)

  // Assign times based on rateCurve
  const d = def.durationSec

  function baseTime(idx: number, count: number): number {
    const t = idx / Math.max(count - 1, 1) // 0..1
    switch (def.rateCurve) {
      case 'steady':
        return t * d
      case 'ramp-up':
        return t * t * d
      case 'peak-mid':
        return (0.5 - 0.5 * Math.cos(Math.PI * t)) * d
      case 'front-loaded': {
        // Mostly at start (sqrt curve scaled to 0.25*d), with late stragglers
        if (t < 0.75) {
          return Math.sqrt(t / 0.75) * 0.25 * d
        } else {
          // Stragglers from 0.25*d to d
          const late = (t - 0.75) / 0.25
          return 0.25 * d + late * 0.75 * d
        }
      }
    }
  }

  const jitterRange = d * 0.02 // 2% of duration max jitter

  const schedule = shuffled.map((particleType, idx) => {
    const base = baseTime(idx, n)
    const jitter = (rng() - 0.5) * 2 * jitterRange
    const timeSec = Math.max(0, Math.min(d, base + jitter))
    return { timeSec, particleType }
  })

  schedule.sort((a, b) => a.timeSec - b.timeSec)
  return schedule
}
