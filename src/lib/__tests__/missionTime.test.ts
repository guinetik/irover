import { afterEach, describe, expect, it } from 'vitest'
import { MARS_SOL_CLOCK_MINUTES, SOL_DURATION } from '@/lib/marsTimeConstants'
import {
  getHeaterOverdriveSceneSeconds,
  getRtgPhaseSceneSeconds,
  sceneSecondsFromMarsClockHours,
  sceneSecondsFromSolFraction,
  secondsPerSol,
  setRtgTutorialMode,
  solFractionFromMarsClockHours,
  solFractionFromMarsClockMinutes,
} from '@/lib/missionTime'

describe('missionTime', () => {
  afterEach(() => {
    setRtgTutorialMode(false)
  })

  it('secondsPerSol matches SOL_DURATION', () => {
    expect(secondsPerSol()).toBe(SOL_DURATION)
  })

  it('sceneSecondsFromSolFraction scales by SOL_DURATION', () => {
    expect(sceneSecondsFromSolFraction(0)).toBe(0)
    expect(sceneSecondsFromSolFraction(1)).toBe(SOL_DURATION)
    expect(sceneSecondsFromSolFraction(0.25)).toBe(SOL_DURATION * 0.25)
  })

  it('sceneSecondsFromMarsClockHours maps HUD hours to scene seconds', () => {
    const hoursPerSol = MARS_SOL_CLOCK_MINUTES / 60
    const oneHourScene = (1 / hoursPerSol) * SOL_DURATION
    expect(sceneSecondsFromMarsClockHours(1)).toBeCloseTo(oneHourScene, 10)
    expect(sceneSecondsFromMarsClockHours(0)).toBe(0)
  })

  it('solFractionFromMarsClockHours/minutes align with sol clock minutes', () => {
    expect(solFractionFromMarsClockHours(0)).toBe(0)
    expect(solFractionFromMarsClockHours(24)).toBeCloseTo((24 * 60) / MARS_SOL_CLOCK_MINUTES, 10)
    expect(solFractionFromMarsClockMinutes(MARS_SOL_CLOCK_MINUTES)).toBe(1)
    expect(solFractionFromMarsClockMinutes(37)).toBeCloseTo(37 / MARS_SOL_CLOCK_MINUTES, 10)
  })

  it('getRtgPhaseSceneSeconds uses mission knobs when tutorial mode is off', () => {
    const p = getRtgPhaseSceneSeconds()
    expect(p.overdriveBurst).toBe(sceneSecondsFromMarsClockHours(2))
    expect(p.overdriveInstrumentLock).toBe(sceneSecondsFromSolFraction(0.5))
    expect(p.overdriveRecharge).toBe(sceneSecondsFromSolFraction(1))
    expect(p.powerShuntEffect).toBe(sceneSecondsFromMarsClockHours(3))
    expect(p.powerShuntRecovery).toBe(sceneSecondsFromMarsClockHours(24))
  })

  it('getRtgPhaseSceneSeconds uses short tutorial timers when enabled', () => {
    setRtgTutorialMode(true)
    expect(getRtgPhaseSceneSeconds()).toEqual({
      overdriveBurst: 30,
      overdriveInstrumentLock: 3,
      overdriveRecharge: 3,
      powerShuntEffect: 5,
      powerShuntRecovery: 5,
    })
  })

  it('getHeaterOverdriveSceneSeconds maps heater mission durations to scene seconds', () => {
    const h = getHeaterOverdriveSceneSeconds()
    expect(h.heatBoost).toBe(sceneSecondsFromMarsClockHours(12))
    expect(h.lockoutCooldown).toBe(sceneSecondsFromSolFraction(2))
  })
})
