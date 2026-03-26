import { describe, expect, it } from 'vitest'
import {
  MARS_SOL_CLOCK_MINUTES,
  MARS_TIME_OF_DAY_06_00,
  SOL_DURATION,
} from '@/lib/marsTimeConstants'

describe('marsTimeConstants', () => {
  it('exposes a positive accelerated sol length and 24h37m clock', () => {
    expect(SOL_DURATION).toBeGreaterThan(0)
    expect(MARS_SOL_CLOCK_MINUTES).toBe(24 * 60 + 37)
  })

  it('MARS_TIME_OF_DAY_06_00 matches six Mars-clock hours as a sol fraction', () => {
    expect(MARS_TIME_OF_DAY_06_00).toBeCloseTo((6 * 60) / MARS_SOL_CLOCK_MINUTES, 10)
  })
})
