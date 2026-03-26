import { afterEach, describe, expect, it, vi } from 'vitest'
import { MISSION_COOLDOWN_ID, missionCooldowns } from '@/lib/missionCooldowns'

describe('missionCooldowns', () => {
  afterEach(() => {
    missionCooldowns.clearAll()
  })

  it('start tracks remaining time and isActive', () => {
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST, 10)
    expect(missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST)).toBe(true)
    expect(missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST)).toBe(10)
  })

  it('tick advances timers and clears finished entries', () => {
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST, 5)
    missionCooldowns.tick(2)
    expect(missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST)).toBe(3)
    missionCooldowns.tick(5)
    expect(missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST)).toBe(false)
    expect(missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST)).toBe(0)
  })

  it('tick with non-positive delta is a no-op', () => {
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST, 5)
    missionCooldowns.tick(0)
    missionCooldowns.tick(-1)
    expect(missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST)).toBe(5)
  })

  it('progressElapsed01 and progressRemaining01 reflect elapsed fraction', () => {
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT, 10)
    missionCooldowns.tick(4)
    expect(missionCooldowns.progressElapsed01(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)).toBeCloseTo(0.4, 5)
    expect(missionCooldowns.progressRemaining01(MISSION_COOLDOWN_ID.RTG_POWER_SHUNT_EFFECT)).toBeCloseTo(0.6, 5)
    expect(missionCooldowns.progressElapsed01('unknown')).toBe(0)
  })

  it('clear removes timer without firing onComplete', () => {
    const cb = vi.fn()
    missionCooldowns.start(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_HEAT, 1, cb)
    missionCooldowns.clear(MISSION_COOLDOWN_ID.HEATER_OVERDRIVE_HEAT)
    missionCooldowns.tick(2)
    expect(cb).not.toHaveBeenCalled()
  })

  it('onComplete runs after elapse and may start another timer safely', () => {
    const order: string[] = []
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_BURST, 1, () => {
      order.push('burst-done')
      missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_INSTRUMENT_LOCK, 2, () => {
        order.push('lock-done')
      })
    })
    missionCooldowns.tick(1)
    expect(order).toEqual(['burst-done'])
    expect(missionCooldowns.isActive(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_INSTRUMENT_LOCK)).toBe(true)
    missionCooldowns.tick(2)
    expect(order).toEqual(['burst-done', 'lock-done'])
  })

  it('clamps negative duration to 0 remaining but keeps positive total for progress', () => {
    missionCooldowns.start(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_RECHARGE, -5)
    expect(missionCooldowns.remaining(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_RECHARGE)).toBe(0)
    expect(missionCooldowns.progressElapsed01(MISSION_COOLDOWN_ID.RTG_OVERDRIVE_RECHARGE)).toBe(1)
  })
})
