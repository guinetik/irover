import { ref } from 'vue'
import { usePlayerProfile } from './usePlayerProfile'

const { mod } = usePlayerProfile()

// --- Singleton state ---
const totalSP = ref(0)
const sessionSP = ref(0)

/** Track which rocks have been scored per instrument to prevent double-counting */
const scored = {
  mastcam: new Set<string>(),
  chemcam: new Set<string>(),
  drill: new Set<string>(),
}

// --- SP yield ranges (from GDD spec) ---
const YIELDS = {
  mastcam: { min: 5, max: 15 },
  chemcam: { min: 15, max: 40 },
  drill: { min: 30, max: 80 },
} as const

// --- Multi-instrument bonus ---
function multiBonus(rockId: string): number {
  let count = 0
  if (scored.mastcam.has(rockId)) count++
  if (scored.chemcam.has(rockId)) count++
  if (scored.drill.has(rockId)) count++
  if (count >= 3) return 3.0
  if (count >= 2) return 1.5
  return 1.0
}

function rollYield(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

const ACK_SP = { min: 5, max: 15 }

/** Track acknowledged readouts to prevent double-count */
const acknowledgedReadouts = new Set<string>()

export type SPSource = 'mastcam' | 'chemcam' | 'drill' | 'chemcam-ack' | 'dan' | 'sam' | 'survival' | 'dev'
type InstrumentSource = 'mastcam' | 'chemcam' | 'drill'

export interface SPGain {
  amount: number
  source: SPSource
  rockLabel: string
  bonus: number
}

/**
 * One append-only row in the session Science Points ledger (newest first in {@link spLedger}).
 */
export interface SPLedgerEntry {
  /** Stable key for list rendering */
  id: string
  /** Wall-clock ms when the gain was recorded */
  atMs: number
  amount: number
  source: SPSource
  /** Rock label, DAN reason string, etc. */
  detail: string
  /** Multi-instrument multiplier for instruments; 1 for ack/DAN */
  bonusMult: number
}

/** Last gain — read once by the view for toast, then cleared */
const lastGain = ref<SPGain | null>(null)

/** Session ledger of SP gains, newest entries first */
const spLedger = ref<SPLedgerEntry[]>([])

function pushLedger(gain: SPGain): void {
  spLedger.value.unshift({
    id: crypto.randomUUID(),
    atMs: Date.now(),
    amount: gain.amount,
    source: gain.source,
    detail: gain.rockLabel,
    bonusMult: gain.bonus,
  })
}

export function useSciencePoints() {
  function award(source: InstrumentSource, rockId: string, rockLabel: string): SPGain | null {
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
    pushLedger(gain)
    return gain
  }

  /** Bonus SP for reviewing a ChemCam readout */
  function awardAck(readoutId: string, rockLabel: string): SPGain | null {
    if (acknowledgedReadouts.has(readoutId)) return null
    acknowledgedReadouts.add(readoutId)

    const base = rollYield(ACK_SP.min, ACK_SP.max)
    const spYieldMult = mod('spYield')
    const amount = Math.round(base * spYieldMult)

    totalSP.value += amount
    sessionSP.value += amount

    const gain: SPGain = { amount, source: 'chemcam-ack', rockLabel, bonus: 1 }
    lastGain.value = gain
    pushLedger(gain)
    return gain
  }

  const DAN_SP = 100

  function awardDAN(reason: string): SPGain {
    const spYieldMult = mod('spYield')
    const amount = Math.round(DAN_SP * spYieldMult)
    totalSP.value += amount
    sessionSP.value += amount
    const gain: SPGain = { amount, source: 'dan', rockLabel: reason, bonus: 1.0 }
    lastGain.value = gain
    pushLedger(gain)
    return gain
  }

  /**
   * Science points for Mars survival milestones (full sols survived). Scales with profile `spYield`.
   * @param detail Ledger label (e.g. milestone title)
   * @param baseSp Design-time SP before spYield multiplier
   */
  function awardSurvival(detail: string, baseSp: number): SPGain {
    const spYieldMult = mod('spYield')
    const amount = Math.round(baseSp * spYieldMult)
    totalSP.value += amount
    sessionSP.value += amount
    const gain: SPGain = { amount, source: 'survival', rockLabel: detail, bonus: 1.0 }
    lastGain.value = gain
    pushLedger(gain)
    return gain
  }

  const samScored = new Set<string>()

  function awardSAM(discoveryId: string, baseSp: number, label: string): SPGain | null {
    if (samScored.has(discoveryId)) return null
    samScored.add(discoveryId)
    const spYieldMult = mod('spYield')
    const amount = Math.round(baseSp * spYieldMult)
    totalSP.value += amount
    sessionSP.value += amount
    const gain: SPGain = { amount, source: 'sam', rockLabel: label, bonus: 1.0 }
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
    spLedger,
    award,
    awardAck,
    awardDAN,
    awardSAM,
    awardSurvival,
    consumeLastGain,
  }
}

/**
 * Development helper: grants SP by a flat amount (no `spYield` modifier), records ledger + `lastGain`.
 *
 * @param amount - Positive integer science points to add.
 * @returns Gain payload, or `null` if `amount` is invalid.
 */
export function devAwardSciencePoints(amount: number): SPGain | null {
  const n = Math.floor(Number(amount))
  if (!Number.isFinite(n) || n < 1) return null

  totalSP.value += n
  sessionSP.value += n
  const gain: SPGain = { amount: n, source: 'dev', rockLabel: 'Console grant', bonus: 1.0 }
  lastGain.value = gain
  pushLedger(gain)
  return gain
}

/**
 * Clears singleton SP state. Used by unit tests only; resets totals, idempotency sets, and ledger.
 */
export function resetSciencePointsForTests(): void {
  totalSP.value = 0
  sessionSP.value = 0
  lastGain.value = null
  spLedger.value = []
  scored.mastcam.clear()
  scored.chemcam.clear()
  scored.drill.clear()
  acknowledgedReadouts.clear()
}
