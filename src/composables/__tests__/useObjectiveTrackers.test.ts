import { describe, it, expect, beforeEach } from 'vitest'
import { checkObjective } from '../useObjectiveTrackers'
import { tickPoiArrivals, resetPoiArrivalsForTests } from '../usePoiArrival'
import type { SiteMissionPoi } from '../useSiteMissionPois'

describe('useObjectiveTrackers', () => {
  beforeEach(() => {
    resetPoiArrivalsForTests()
  })

  describe('go-to', () => {
    const pois: SiteMissionPoi[] = [
      { id: 'tri-alpha', label: 'Alpha', x: 100, z: 200 },
    ]

    it('returns true after dwelling near POI for 2 seconds', () => {
      // Simulate 2 seconds of being within arrival radius (2.5 units)
      tickPoiArrivals(101, 200, pois, 1.0)
      tickPoiArrivals(101, 200, pois, 1.0)
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 101, roverZ: 200, pois,
      })
      expect(result).toBe(true)
    })

    it('returns false before dwell time completes', () => {
      tickPoiArrivals(103, 200, pois, 0.5)
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 101, roverZ: 200, pois,
      })
      expect(result).toBe(false)
    })

    it('returns false when rover is far from POI', () => {
      tickPoiArrivals(0, 0, pois, 2.0)
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 0, roverZ: 0, pois,
      })
      expect(result).toBe(false)
    })

    it('resets dwell when rover leaves radius', () => {
      tickPoiArrivals(103, 200, pois, 1.5) // almost there
      tickPoiArrivals(0, 0, pois, 0.1) // walk away — resets
      tickPoiArrivals(103, 200, pois, 1.0) // back, but only 1s
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 101, roverZ: 200, pois,
      })
      expect(result).toBe(false)
    })

    it('returns false for unknown POI', () => {
      const result = checkObjective('go-to', { poiId: 'unknown' }, {
        roverX: 100, roverZ: 200, pois,
      })
      expect(result).toBe(false)
    })
  })

  describe('unknown type', () => {
    it('returns false for unregistered objective type', () => {
      const result = checkObjective('unknown-type' as any, {}, {
        roverX: 0, roverZ: 0, pois: [],
      })
      expect(result).toBe(false)
    })
  })
})
