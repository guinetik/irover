/**
 * Central registry for mission-timed windows (cooldowns, bursts, lockouts).
 *
 * - Call {@link missionCooldowns.tick} once per frame with **`getSceneDelta(rawDelta)`** so pause / clock stops apply.
 * - Use stable string ids (see {@link MISSION_COOLDOWN_ID}) — add new instruments here instead of ad-hoc `elapsed` fields.
 * - Optional `onComplete` runs when a timer reaches zero (chain phases, e.g. RTG overdrive → lock → recharge).
 */

export const MISSION_COOLDOWN_ID = {
  RTG_OVERDRIVE_BURST: 'rtg.overdrive.burst',
  RTG_OVERDRIVE_INSTRUMENT_LOCK: 'rtg.overdrive.instrumentLock',
  RTG_OVERDRIVE_RECHARGE: 'rtg.overdrive.recharge',
  RTG_POWER_SHUNT_EFFECT: 'rtg.powerShunt.effect',
  RTG_POWER_SHUNT_RECOVERY: 'rtg.powerShunt.recovery',
} as const

export type MissionCooldownId = (typeof MISSION_COOLDOWN_ID)[keyof typeof MISSION_COOLDOWN_ID]

type Entry = {
  remaining: number
  total: number
  onComplete?: () => void
}

class MissionCooldownStore {
  private readonly timers = new Map<string, Entry>()

  /**
   * Starts or replaces a timer. When it elapses (after {@link tick}), `onComplete` runs and the entry is removed.
   */
  start(id: string, durationSec: number, onComplete?: () => void): void {
    const d = Math.max(0, durationSec)
    this.timers.set(id, { remaining: d, total: d > 0 ? d : 1, onComplete })
  }

  /** Remove without firing callback. */
  clear(id: string): void {
    this.timers.delete(id)
  }

  clearAll(): void {
    this.timers.clear()
  }

  isActive(id: string): boolean {
    const t = this.timers.get(id)
    return t !== undefined && t.remaining > 0
  }

  remaining(id: string): number {
    const t = this.timers.get(id)
    return t ? Math.max(0, t.remaining) : 0
  }

  /** 0–1 elapsed (for fill bars that grow as time passes). */
  progressElapsed01(id: string): number {
    const t = this.timers.get(id)
    if (!t || t.total <= 0) return 0
    return Math.min(1, 1 - t.remaining / t.total)
  }

  /** 0–1 remaining (for bars that shrink). */
  progressRemaining01(id: string): number {
    const t = this.timers.get(id)
    if (!t || t.total <= 0) return 0
    return Math.min(1, t.remaining / t.total)
  }

  /**
   * Advance all timers. Prefer **`sceneDelta` from `useMarsGameClock().getSceneDelta`**.
   * Completed entries are removed before `onComplete` runs so callbacks can safely start new timers.
   */
  tick(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return
    const callbacks: Array<() => void> = []
    for (const [id, t] of this.timers) {
      t.remaining -= deltaSeconds
      if (t.remaining <= 0) {
        t.remaining = 0
        const cb = t.onComplete
        this.timers.delete(id)
        if (cb) callbacks.push(cb)
      }
    }
    for (const cb of callbacks) {
      cb()
    }
  }
}

/** Singleton — tick from the site animate loop. */
export const missionCooldowns = new MissionCooldownStore()
