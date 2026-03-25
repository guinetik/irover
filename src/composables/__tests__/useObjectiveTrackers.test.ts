import { describe, it, expect } from 'vitest'
import { checkObjective } from '../useObjectiveTrackers'
import type { SiteMissionPoi } from '../useSiteMissionPois'

describe('useObjectiveTrackers', () => {
  describe('go-to', () => {
    const pois: SiteMissionPoi[] = [
      { id: 'tri-alpha', label: 'Alpha', x: 100, z: 200 },
    ]

    it('returns true when rover is within 5 units of POI', () => {
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 103, roverZ: 200, pois,
      })
      expect(result).toBe(true)
    })

    it('returns false when rover is far from POI', () => {
      const result = checkObjective('go-to', { poiId: 'tri-alpha' }, {
        roverX: 0, roverZ: 0, pois,
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
