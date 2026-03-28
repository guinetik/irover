import { describe, it, expect, vi, afterEach } from 'vitest'
import { DANController } from '@/three/instruments/DANController'

describe('DANController passive sampling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not take new samples while a pending hydrogen hit exists', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const dan = new DANController()
    dan.passiveSubsystemEnabled = true
    dan.waterIceIndex = 1
    dan.featureType = 'plain'

    dan.update(100)
    expect(dan.pendingHit).not.toBeNull()
    const first = dan.pendingHit
    const samplesAfterFirst = dan.totalSamples

    dan.update(100)
    expect(dan.pendingHit).toBe(first)
    expect(dan.totalSamples).toBe(samplesAfterFirst)
  })
})
