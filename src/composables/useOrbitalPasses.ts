import { solFractionFromMarsClockHours } from '@/lib/missionTime'

export interface OrbitalPass {
  id: string               // `pass-sol${N}-${index}`
  sol: number
  startTimeOfDay: number   // 0-1 fraction of sol
  endTimeOfDay: number     // 0-1 fraction of sol
  orbiter: 'MRO' | 'MAVEN' | 'ODY'
}

const ORBITERS: OrbitalPass['orbiter'][] = ['MRO', 'MAVEN', 'ODY']

// Minimum spacing between pass starts: 3 Mars-clock hours
const MIN_SPACING = solFractionFromMarsClockHours(3)

// Pass duration range: 2-3 Mars-clock hours
// At SOL_DURATION=180s this gives ~90-120 real seconds of coverage
const MIN_DURATION = solFractionFromMarsClockHours(2)
const MAX_DURATION = solFractionFromMarsClockHours(3)

/**
 * Deterministic hash of a sol number returning a float in [0, 1).
 * Uses the same algorithm as the task spec.
 */
function hashSol(sol: number): number {
  let h = sol * 2654435761
  h = ((h >>> 16) ^ h) * 0x45d9f3b
  h = ((h >>> 16) ^ h) * 0x45d9f3b
  h = (h >>> 16) ^ h
  return (h >>> 0) / 0xffffffff // 0-1
}

/**
 * A tiny seeded PRNG built on top of hashSol.
 * Each call advances the seed by a fixed offset so successive calls
 * produce independent-looking values.
 */
function makePrng(sol: number) {
  let state = sol
  return function next(): number {
    state = (state + 1) | 0
    return hashSol(state)
  }
}

export function useOrbitalPasses(): {
  getPassesForSol(sol: number): OrbitalPass[]
  getActivePass(sol: number, timeOfDay: number): OrbitalPass | null
  getNextPass(sol: number, timeOfDay: number): OrbitalPass | null
} {
  function getPassesForSol(sol: number): OrbitalPass[] {
    const seed = hashSol(sol)
    const passCount = seed < 0.5 ? 2 : 3

    const prng = makePrng(sol)

    // Divide the usable sol window [0.05, 0.95] into `passCount` equal slots.
    // Each pass start is placed randomly within its slot so that the minimum
    // spacing between consecutive starts is always respected and every pass
    // fits comfortably — guaranteeing exactly `passCount` passes.
    const SOL_START = 0.05
    const SOL_END = 0.95
    const totalWindow = SOL_END - SOL_START // 0.90
    const slotSize = totalWindow / passCount // each slot gets an equal share

    const passes: OrbitalPass[] = []

    for (let i = 0; i < passCount; i++) {
      const slotStart = SOL_START + i * slotSize
      // Keep the start away from the slot boundary so the duration still fits
      const jitter = prng() * (slotSize - MAX_DURATION)
      const startTimeOfDay = slotStart + jitter

      // Randomise duration between MIN and MAX
      const durationFraction = MIN_DURATION + prng() * (MAX_DURATION - MIN_DURATION)
      const endTimeOfDay = startTimeOfDay + durationFraction

      passes.push({
        id: `pass-sol${sol}-${i}`,
        sol,
        startTimeOfDay,
        endTimeOfDay,
        orbiter: ORBITERS[i % ORBITERS.length],
      })
    }

    return passes
  }

  function getActivePass(sol: number, timeOfDay: number): OrbitalPass | null {
    const passes = getPassesForSol(sol)
    for (const pass of passes) {
      if (timeOfDay >= pass.startTimeOfDay && timeOfDay <= pass.endTimeOfDay) {
        return pass
      }
    }
    return null
  }

  function getNextPass(sol: number, timeOfDay: number): OrbitalPass | null {
    const passes = getPassesForSol(sol)
    for (const pass of passes) {
      if (pass.startTimeOfDay > timeOfDay) {
        return pass
      }
    }
    return null
  }

  return { getPassesForSol, getActivePass, getNextPass }
}
