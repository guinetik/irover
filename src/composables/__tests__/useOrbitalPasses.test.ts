import { describe, it, expect } from 'vitest'
import { useOrbitalPasses } from '../useOrbitalPasses'
import { solFractionFromMarsClockHours } from '@/lib/missionTime'
import { MARS_SOL_CLOCK_MINUTES } from '@/lib/marsTimeConstants'

const MIN_SPACING = solFractionFromMarsClockHours(3)
const MIN_DURATION = solFractionFromMarsClockHours(2)
const MAX_DURATION = solFractionFromMarsClockHours(3)

describe('useOrbitalPasses', () => {
  const { getPassesForSol, getActivePass, getNextPass } = useOrbitalPasses()

  // ── 1. Returns 2-3 passes per sol ─────────────────────────────────────────
  describe('getPassesForSol', () => {
    it('returns 2 or 3 passes for any sol', () => {
      const sols = [0, 1, 42, 100, 500, 999, 1234]
      for (const sol of sols) {
        const passes = getPassesForSol(sol)
        expect(passes.length, `sol ${sol}`).toBeGreaterThanOrEqual(2)
        expect(passes.length, `sol ${sol}`).toBeLessThanOrEqual(3)
      }
    })

    // ── 2. Deterministic ────────────────────────────────────────────────────
    it('returns the same passes on repeated calls for the same sol', () => {
      const sol = 77
      const first = getPassesForSol(sol)
      const second = getPassesForSol(sol)
      expect(first).toEqual(second)
    })

    // ── 3. Different sols produce different schedules ────────────────────────
    it('produces different schedules for different sols', () => {
      const a = getPassesForSol(10)
      const b = getPassesForSol(11)
      // At least one pass start time must differ
      const aTimes = a.map(p => p.startTimeOfDay)
      const bTimes = b.map(p => p.startTimeOfDay)
      expect(aTimes).not.toEqual(bTimes)
    })

    // ── 4. All timeOfDay values are in [0, 1] ───────────────────────────────
    it('all passes have startTimeOfDay and endTimeOfDay in [0, 1]', () => {
      for (const sol of [0, 50, 200, 800]) {
        for (const pass of getPassesForSol(sol)) {
          expect(pass.startTimeOfDay, `start sol ${sol}`).toBeGreaterThanOrEqual(0)
          expect(pass.startTimeOfDay, `start sol ${sol}`).toBeLessThanOrEqual(1)
          expect(pass.endTimeOfDay, `end sol ${sol}`).toBeGreaterThanOrEqual(0)
          expect(pass.endTimeOfDay, `end sol ${sol}`).toBeLessThanOrEqual(1)
        }
      }
    })

    // ── 5. Pass duration is within 2-3 Mars-clock hours ─────────────────
    it('pass duration is between 2 and 3 Mars-clock hours', () => {
      for (const sol of [1, 55, 333]) {
        for (const pass of getPassesForSol(sol)) {
          const durationMinutes = (pass.endTimeOfDay - pass.startTimeOfDay) * MARS_SOL_CLOCK_MINUTES
          expect(durationMinutes, `duration sol ${sol} pass ${pass.id}`).toBeGreaterThanOrEqual(120 - 1e-9)
          expect(durationMinutes, `duration sol ${sol} pass ${pass.id}`).toBeLessThanOrEqual(180 + 1e-9)
        }
      }
    })

    // ── 6. Passes don't overlap and have minimum 3-hour spacing ─────────────
    it('passes do not overlap and respect minimum 3-hour spacing', () => {
      for (const sol of [0, 42, 100, 500]) {
        const passes = getPassesForSol(sol)
        for (let i = 1; i < passes.length; i++) {
          const prev = passes[i - 1]
          const curr = passes[i]
          // No overlap: current start must be after previous end
          expect(curr.startTimeOfDay, `overlap check sol ${sol}`).toBeGreaterThan(prev.endTimeOfDay)
          // Minimum spacing between starts
          expect(curr.startTimeOfDay - prev.startTimeOfDay, `spacing sol ${sol}`).toBeGreaterThanOrEqual(
            MIN_SPACING - 1e-9,
          )
        }
      }
    })

    // ── ID format ───────────────────────────────────────────────────────────
    it('pass IDs follow the pass-sol{N}-{index} format', () => {
      const sol = 7
      const passes = getPassesForSol(sol)
      passes.forEach((pass, i) => {
        expect(pass.id).toBe(`pass-sol${sol}-${i}`)
        expect(pass.sol).toBe(sol)
      })
    })

    // ── Orbiter assignment ──────────────────────────────────────────────────
    it('assigns orbiters in MRO / MAVEN / ODY cycle by index', () => {
      const ORBITERS = ['MRO', 'MAVEN', 'ODY'] as const
      for (const sol of [1, 2, 3]) {
        const passes = getPassesForSol(sol)
        passes.forEach((pass, i) => {
          expect(pass.orbiter).toBe(ORBITERS[i % 3])
        })
      }
    })
  })

  // ── 7. getActivePass returns correct pass inside window ──────────────────
  describe('getActivePass', () => {
    it('returns the pass whose window contains timeOfDay', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      const target = passes[0]
      const midpoint = (target.startTimeOfDay + target.endTimeOfDay) / 2
      const active = getActivePass(sol, midpoint)
      expect(active).not.toBeNull()
      expect(active!.id).toBe(target.id)
    })

    it('returns pass when timeOfDay equals startTimeOfDay (inclusive)', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      const target = passes[0]
      expect(getActivePass(sol, target.startTimeOfDay)).not.toBeNull()
    })

    it('returns pass when timeOfDay equals endTimeOfDay (inclusive)', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      const target = passes[0]
      expect(getActivePass(sol, target.endTimeOfDay)).not.toBeNull()
    })

    // ── 8. Returns null outside all windows ──────────────────────────────────
    it('returns null when timeOfDay is before all passes', () => {
      const sol = 1
      const passes = getPassesForSol(sol)
      const before = passes[0].startTimeOfDay - 0.001
      if (before >= 0) {
        expect(getActivePass(sol, before)).toBeNull()
      }
    })

    it('returns null when timeOfDay is between passes', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      if (passes.length >= 2) {
        const between = (passes[0].endTimeOfDay + passes[1].startTimeOfDay) / 2
        expect(getActivePass(sol, between)).toBeNull()
      }
    })

    it('returns null when timeOfDay is after all passes', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      const last = passes[passes.length - 1]
      expect(getActivePass(sol, last.endTimeOfDay + 0.001)).toBeNull()
    })
  })

  // ── 9. getNextPass returns upcoming pass ─────────────────────────────────
  describe('getNextPass', () => {
    it('returns the first pass when timeOfDay is before all passes', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      const beforeAll = passes[0].startTimeOfDay - 0.01
      if (beforeAll >= 0) {
        const next = getNextPass(sol, beforeAll)
        expect(next).not.toBeNull()
        expect(next!.id).toBe(passes[0].id)
      }
    })

    it('returns the second pass when inside the first pass window', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      if (passes.length >= 2) {
        const midFirst = (passes[0].startTimeOfDay + passes[0].endTimeOfDay) / 2
        const next = getNextPass(sol, midFirst)
        expect(next).not.toBeNull()
        expect(next!.id).toBe(passes[1].id)
      }
    })

    // ── 10. Returns null after last pass ──────────────────────────────────────
    it('returns null when timeOfDay is after all pass start times', () => {
      const sol = 42
      const passes = getPassesForSol(sol)
      const last = passes[passes.length - 1]
      expect(getNextPass(sol, last.startTimeOfDay + 0.001)).toBeNull()
    })

    it('returns null at end of sol (timeOfDay = 1)', () => {
      expect(getNextPass(42, 1)).toBeNull()
    })
  })

  // ── endTimeOfDay > startTimeOfDay for every pass ─────────────────────────
  describe('pass time validity', () => {
    it('endTimeOfDay is always greater than startTimeOfDay', () => {
      for (const sol of [0, 1, 10, 100, 1000]) {
        for (const pass of getPassesForSol(sol)) {
          expect(pass.endTimeOfDay).toBeGreaterThan(pass.startTimeOfDay)
        }
      }
    })
  })
})
