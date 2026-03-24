import { ref } from 'vue'
import { usePlayerProfile } from './usePlayerProfile'

const { mod } = usePlayerProfile()

// --- Singleton state ---
const SP_STORAGE_KEY = 'mars-lifetime-sp'
let storedSP = 0
try {
  const raw = localStorage.getItem(SP_STORAGE_KEY)
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed > 0) storedSP = parsed
} catch { /* private browsing / SSR safety */ }
const totalSP = ref(storedSP)
const sessionSP = ref(0)
/** SP earned from ChemCam + ChemCam ack only — used by LIBS calibration watcher */
const chemcamSP = ref(0)

function persistSP(): void {
  try { localStorage.setItem(SP_STORAGE_KEY, String(totalSP.value)) } catch { /* ignore */ }
}

/** Track which rocks have been scored per instrument to prevent double-counting */
const scored = {
  mastcam: new Set<string>(),
  chemcam: new Set<string>(),
  drill: new Set<string>(),
}

// --- SP yield ranges (rebalanced: ~5-8x reduction for slow-drip pacing) ---
const YIELDS = {
  mastcam: { min: 1, max: 3 },
  chemcam: { min: 2, max: 4 },
  drill: { min: 3, max: 5 },
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

const ACK_SP = { min: 1, max: 2 }

/** Track acknowledged readouts to prevent double-count */
const acknowledgedReadouts = new Set<string>()

/** Track transmitted archive IDs to prevent double-counting bonus SP */
const transmittedArchiveIds = new Set<string>()

/** Transmission bonus: 50% of original SP as bonus */
const TRANSMISSION_BONUS_MULT = 0.5

export type SPSource = 'mastcam' | 'chemcam' | 'drill' | 'chemcam-ack' | 'dan' | 'sam' | 'survival' | 'transmission' | 'dev'
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
    if (source === 'chemcam') chemcamSP.value += amount
    persistSP()

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
    chemcamSP.value += amount
    persistSP()

    const gain: SPGain = { amount, source: 'chemcam-ack', rockLabel, bonus: 1 }
    lastGain.value = gain
    pushLedger(gain)
    return gain
  }

  const DAN_SP = 15

  function awardDAN(reason: string): SPGain {
    const spYieldMult = mod('spYield')
    const amount = Math.round(DAN_SP * spYieldMult)
    totalSP.value += amount
    sessionSP.value += amount
    persistSP()
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
    persistSP()
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
    persistSP()
    const gain: SPGain = { amount, source: 'sam', rockLabel: label, bonus: 1.0 }
    lastGain.value = gain
    return gain
  }

  /**
   * Bonus SP awarded when a discovery is transmitted via UHF during an orbital pass.
   * @param archiveId Unique archive ID (prevents double-counting)
   * @param baseSP The estimated original SP the discovery earned
   * @param label Display label for the ledger entry
   */
  function awardTransmission(archiveId: string, baseSP: number, label: string): SPGain | null {
    if (transmittedArchiveIds.has(archiveId)) return null
    transmittedArchiveIds.add(archiveId)

    const spYieldMult = mod('spYield')
    const amount = Math.round(Math.floor(baseSP * TRANSMISSION_BONUS_MULT) * spYieldMult)
    if (amount < 1) return null

    totalSP.value += amount
    sessionSP.value += amount
    persistSP()

    const gain: SPGain = { amount, source: 'transmission', rockLabel: label, bonus: 1.0 }
    lastGain.value = gain
    pushLedger(gain)
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
    chemcamSP,
    lastGain,
    spLedger,
    award,
    awardAck,
    awardDAN,
    awardSAM,
    awardSurvival,
    awardTransmission,
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
  persistSP()
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
  chemcamSP.value = 0
  try { localStorage.removeItem(SP_STORAGE_KEY) } catch { /* ignore */ }
  lastGain.value = null
  spLedger.value = []
  scored.mastcam.clear()
  scored.chemcam.clear()
  scored.drill.clear()
  acknowledgedReadouts.clear()
  transmittedArchiveIds.clear()
}
