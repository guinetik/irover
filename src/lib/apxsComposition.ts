/**
 * APXS (Alpha Particle X-Ray Spectrometer) composition math.
 * Pure data + math — no Vue or Three.js dependencies.
 */

export const APXS_ELEMENTS = [
  'Fe', 'Si', 'Ca', 'S', 'Mg', 'Al', 'Na', 'Mn', 'P', 'Ni',
] as const

export type APXSElementId = (typeof APXS_ELEMENTS)[number]

export type APXSComposition = Record<APXSElementId, number>

export type APXSGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export const ELEMENT_COLORS: Record<APXSElementId, string> = {
  Fe: '#ff7733',
  Si: '#6699ff',
  Ca: '#44dd88',
  S:  '#ffdd33',
  Mg: '#ff66cc',
  Al: '#99ddff',
  Na: '#ffaa55',
  Mn: '#cc55ff',
  P:  '#ff4466',
  Ni: '#55ffaa',
}

export const ELEMENT_KEV: Record<APXSElementId, number> = {
  Fe: 6.40,
  Si: 1.74,
  Ca: 3.69,
  S:  2.31,
  Mg: 1.25,
  Al: 1.49,
  Na: 1.04,
  Mn: 5.90,
  P:  2.01,
  Ni: 7.47,
}

/**
 * Generate a randomised composition from base weights.
 * Each element gets variance: base * (0.6 + Math.random() * 0.8)
 * Then all values are normalised to sum to 100%.
 */
export function generateComposition(
  baseWeights: Record<string, number>,
): APXSComposition {
  const raw = {} as Record<APXSElementId, number>
  let sum = 0

  for (const el of APXS_ELEMENTS) {
    const base = baseWeights[el] ?? 0
    const value = base * (0.6 + Math.random() * 0.8)
    raw[el] = value
    sum += value
  }

  // Normalise to 100%
  const comp = {} as APXSComposition
  for (const el of APXS_ELEMENTS) {
    comp[el] = (raw[el] / sum) * 100
  }

  return comp
}

/**
 * Cosine similarity between two compositions, scaled to 0-100.
 */
export function computeAccuracy(
  trueComp: APXSComposition,
  measuredComp: APXSComposition,
): number {
  let dot = 0
  let magA = 0
  let magB = 0

  for (const el of APXS_ELEMENTS) {
    const a = trueComp[el]
    const b = measuredComp[el]
    dot += a * b
    magA += a * a
    magB += b * b
  }

  if (magA === 0 || magB === 0) return 0

  const cosSim = dot / (Math.sqrt(magA) * Math.sqrt(magB))
  return cosSim * 100
}

/**
 * Map accuracy percentage to a letter grade and base SP.
 */
export function gradeFromAccuracy(
  accuracy: number,
): { grade: APXSGrade; baseSp: number } {
  if (accuracy >= 97) return { grade: 'S', baseSp: 10 }
  if (accuracy >= 92) return { grade: 'A', baseSp: 8 }
  if (accuracy >= 82) return { grade: 'B', baseSp: 6 }
  if (accuracy >= 65) return { grade: 'C', baseSp: 4 }
  return { grade: 'D', baseSp: 2 }
}

/**
 * Full SP computation: base from grade + anomaly bonus.
 * Anomaly bonus: +2 per trace element (<2% in true composition) that was caught,
 * but only for B/C/D grades. Capped at 10.
 */
export function computeAPXSSp(
  accuracy: number,
  trueComp: APXSComposition,
  caughtElements: APXSElementId[],
): { grade: APXSGrade; sp: number; anomalies: APXSElementId[] } {
  const { grade, baseSp } = gradeFromAccuracy(accuracy)

  // Find trace elements (< 2% in true composition) that were caught
  const anomalies = caughtElements.filter((el) => trueComp[el] < 2)

  // Anomaly bonus only for B/C/D grades
  const anomalyBonus =
    grade === 'S' || grade === 'A' ? 0 : anomalies.length * 2

  const sp = Math.min(10, baseSp + anomalyBonus)

  return { grade, sp, anomalies }
}
