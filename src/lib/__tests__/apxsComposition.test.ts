import { describe, it, expect } from 'vitest'
import {
  APXS_ELEMENTS,
  generateComposition,
  computeAccuracy,
  gradeFromAccuracy,
  computeAPXSSp,
  type APXSComposition,
  type APXSElementId,
} from '../apxsComposition'

// Base weights for testing
const basaltWeights: Record<string, number> = {
  Fe: 18, Si: 24, Ca: 8, S: 2, Mg: 6, Al: 9, Na: 3, Mn: 0.3, P: 0.2, Ni: 0.05,
}

const ironMeteoriteWeights: Record<string, number> = {
  Fe: 52, Si: 2, Ca: 1, S: 1, Mg: 1, Al: 1, Na: 0.5, Mn: 0.2, P: 0.3, Ni: 8,
}

// A fixed composition for anomaly testing (Mn, P, Ni all < 2%)
const trueCompWithTraces: APXSComposition = {
  Fe: 30, Si: 25, Ca: 15, S: 10, Mg: 8, Al: 7,
  Na: 2.5, Mn: 1.5, P: 1.0, Ni: 0.0,
}

// Helper to make a composition from partial values (fills rest with 0)
function makeComp(values: Partial<Record<APXSElementId, number>>): APXSComposition {
  const comp = {} as APXSComposition
  for (const el of APXS_ELEMENTS) {
    comp[el] = values[el] ?? 0
  }
  return comp
}

describe('generateComposition', () => {
  it('normalises to 100%', () => {
    const comp = generateComposition(basaltWeights)
    const sum = APXS_ELEMENTS.reduce((s, el) => s + comp[el], 0)
    expect(sum).toBeCloseTo(100, 1)
  })

  it('produces all positive values', () => {
    const comp = generateComposition(basaltWeights)
    for (const el of APXS_ELEMENTS) {
      expect(comp[el]).toBeGreaterThan(0)
    }
  })
})

describe('computeAccuracy', () => {
  it('returns 100 for identical compositions', () => {
    const comp = generateComposition(basaltWeights)
    const accuracy = computeAccuracy(comp, comp)
    expect(accuracy).toBeCloseTo(100, 5)
  })

  it('returns < 95 for very different compositions', () => {
    const basalt = generateComposition(basaltWeights)
    const iron = generateComposition(ironMeteoriteWeights)
    const accuracy = computeAccuracy(basalt, iron)
    expect(accuracy).toBeLessThan(95)
  })
})

describe('gradeFromAccuracy', () => {
  it('returns S at 97', () => {
    expect(gradeFromAccuracy(97).grade).toBe('S')
  })

  it('returns A at 92', () => {
    expect(gradeFromAccuracy(92).grade).toBe('A')
  })

  it('returns B at 82', () => {
    expect(gradeFromAccuracy(82).grade).toBe('B')
  })

  it('returns C at 65', () => {
    expect(gradeFromAccuracy(65).grade).toBe('C')
  })

  it('returns D at 50', () => {
    expect(gradeFromAccuracy(50).grade).toBe('D')
  })
})

describe('computeAPXSSp', () => {
  it('S grade gives 10 SP with no anomaly bonus even if traces caught', () => {
    const result = computeAPXSSp(98, trueCompWithTraces, ['Mn', 'P'])
    expect(result.grade).toBe('S')
    expect(result.sp).toBe(10)
  })

  it('D grade + 3 anomalies gives 2+6=8 SP', () => {
    // Mn=1.5, P=1.0, Ni=0.0 are all < 2%
    const result = computeAPXSSp(50, trueCompWithTraces, ['Mn', 'P', 'Ni'])
    expect(result.grade).toBe('D')
    expect(result.sp).toBe(8)
  })

  it('B grade + 3 anomalies gives min(10, 6+6) = 10 SP (capped)', () => {
    const result = computeAPXSSp(85, trueCompWithTraces, ['Mn', 'P', 'Ni'])
    expect(result.grade).toBe('B')
    expect(result.sp).toBe(10)
  })
})
