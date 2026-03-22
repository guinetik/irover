import { ref, computed } from 'vue'
import { usePlayerProfile } from './usePlayerProfile'

const { mod } = usePlayerProfile()

// --- Singleton state ---
const totalSP = ref(0)
const sessionSP = ref(0)

/** Track which rocks have been scored per instrument to prevent double-counting */
const scored = {
  mastcam: new Set<string>(),
  chemcam: new Set<string>(),
  apxs: new Set<string>(),
}

// --- SP yield ranges (from GDD spec) ---
const YIELDS = {
  mastcam: { min: 5, max: 15 },
  chemcam: { min: 15, max: 40 },
  apxs: { min: 30, max: 80 },
} as const

// --- Multi-instrument bonus ---
function multiBonus(rockId: string): number {
  let count = 0
  if (scored.mastcam.has(rockId)) count++
  if (scored.chemcam.has(rockId)) count++
  if (scored.apxs.has(rockId)) count++
  if (count >= 3) return 3.0
  if (count >= 2) return 1.5
  return 1.0
}

function rollYield(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

export type SPSource = 'mastcam' | 'chemcam' | 'apxs'

export interface SPGain {
  amount: number
  source: SPSource
  rockLabel: string
  bonus: number
}

/** Last gain — read once by the view for toast, then cleared */
const lastGain = ref<SPGain | null>(null)

export function useSciencePoints() {
  function award(source: SPSource, rockId: string, rockLabel: string): SPGain | null {
    // Idempotent — no double-count
    if (scored[source].has(rockId)) return null
    scored[source].add(rockId)

    const range = YIELDS[source]
    const base = rollYield(range.min, range.max)
    const bonus = multiBonus(rockId)
    const spYieldMult = mod('spYield')
    const amount = Math.round(base * bonus * spYieldMult)

    totalSP.value += amount
    sessionSP.value += amount

    const gain: SPGain = { amount, source, rockLabel, bonus }
    lastGain.value = gain
    return gain
  }

  function consumeLastGain(): SPGain | null {
    const g = lastGain.value
    lastGain.value = null
    return g
  }

  return {
    totalSP,
    sessionSP,
    lastGain,
    award,
    consumeLastGain,
  }
}
