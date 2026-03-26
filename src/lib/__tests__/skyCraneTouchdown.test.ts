import { describe, expect, it } from 'vitest'
import {
  getTouchdownReleaseProgress,
  getTouchdownTetherRetractProgress,
  getTouchdownTetherTension,
  isInTouchdownTetherWindow,
  TOUCHDOWN_RELEASE_DURATION,
  TOUCHDOWN_TETHER_RETRACT_DURATION,
} from '@/lib/skyCraneTouchdown'

describe('sky crane touchdown timing', () => {
  it('keeps the tether rig visible through descent', () => {
    expect(isInTouchdownTetherWindow(0)).toBe(true)
    expect(isInTouchdownTetherWindow(0.35)).toBe(true)
    expect(isInTouchdownTetherWindow(1)).toBe(true)
  })

  it('keeps tether tension high before touchdown and drops it during release', () => {
    expect(getTouchdownTetherTension(0)).toBe(1)
    expect(getTouchdownTetherTension(TOUCHDOWN_RELEASE_DURATION * 0.5)).toBeLessThan(1)
    expect(getTouchdownTetherTension(TOUCHDOWN_RELEASE_DURATION)).toBe(0)
  })

  it('completes the release beat after the configured window', () => {
    expect(getTouchdownReleaseProgress(0)).toBe(0)
    expect(getTouchdownReleaseProgress(TOUCHDOWN_RELEASE_DURATION * 0.5)).toBeCloseTo(0.5, 5)
    expect(getTouchdownReleaseProgress(TOUCHDOWN_RELEASE_DURATION * 2)).toBe(1)
  })

  it('retracts the tethers upward after the release cut', () => {
    expect(getTouchdownTetherRetractProgress(0)).toBe(0)
    expect(getTouchdownTetherRetractProgress(TOUCHDOWN_RELEASE_DURATION)).toBe(0)
    expect(
      getTouchdownTetherRetractProgress(
        TOUCHDOWN_RELEASE_DURATION + TOUCHDOWN_TETHER_RETRACT_DURATION * 0.5,
      ),
    ).toBeCloseTo(0.5, 5)
    expect(
      getTouchdownTetherRetractProgress(
        TOUCHDOWN_RELEASE_DURATION + TOUCHDOWN_TETHER_RETRACT_DURATION * 2,
      ),
    ).toBe(1)
  })
})
