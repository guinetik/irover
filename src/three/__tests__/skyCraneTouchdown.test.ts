import { describe, expect, it } from 'vitest'

describe('sky crane touchdown timing', () => {
  it('keeps the tether rig visible through descent', async () => {
    const mod = await import('../skyCraneTouchdown')

    expect(mod.isInTouchdownTetherWindow(0)).toBe(true)
    expect(mod.isInTouchdownTetherWindow(0.35)).toBe(true)
    expect(mod.isInTouchdownTetherWindow(1)).toBe(true)
  })

  it('keeps tether tension high before touchdown and drops it during release', async () => {
    const mod = await import('../skyCraneTouchdown')

    expect(mod.getTouchdownTetherTension(0)).toBe(1)
    expect(mod.getTouchdownTetherTension(mod.TOUCHDOWN_RELEASE_DURATION * 0.5)).toBeLessThan(1)
    expect(mod.getTouchdownTetherTension(mod.TOUCHDOWN_RELEASE_DURATION)).toBe(0)
  })

  it('completes the release beat after the configured window', async () => {
    const mod = await import('../skyCraneTouchdown')

    expect(mod.getTouchdownReleaseProgress(0)).toBe(0)
    expect(mod.getTouchdownReleaseProgress(mod.TOUCHDOWN_RELEASE_DURATION * 0.5)).toBeCloseTo(0.5, 5)
    expect(mod.getTouchdownReleaseProgress(mod.TOUCHDOWN_RELEASE_DURATION * 2)).toBe(1)
  })

  it('retracts the tethers upward after the release cut', async () => {
    const mod = await import('../skyCraneTouchdown')

    expect(mod.getTouchdownTetherRetractProgress(0)).toBe(0)
    expect(mod.getTouchdownTetherRetractProgress(mod.TOUCHDOWN_RELEASE_DURATION)).toBe(0)
    expect(
      mod.getTouchdownTetherRetractProgress(
        mod.TOUCHDOWN_RELEASE_DURATION + mod.TOUCHDOWN_TETHER_RETRACT_DURATION * 0.5,
      ),
    ).toBeCloseTo(0.5, 5)
    expect(
      mod.getTouchdownTetherRetractProgress(
        mod.TOUCHDOWN_RELEASE_DURATION + mod.TOUCHDOWN_TETHER_RETRACT_DURATION * 2,
      ),
    ).toBe(1)
  })
})
