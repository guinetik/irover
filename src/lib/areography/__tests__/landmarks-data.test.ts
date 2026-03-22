import { describe, it, expect } from 'vitest'
import landmarksJson from '../../../../public/data/landmarks.json'
import type { Landmark } from '@/types/landmark'

const landmarks = landmarksJson as Landmark[]

describe('landmarks.json data validation', () => {
  it('has at least 20 landmarks', () => {
    expect(landmarks.length).toBeGreaterThanOrEqual(20)
  })

  it('all latitudes are in valid range [-90, 90]', () => {
    for (const l of landmarks) {
      expect(l.lat).toBeGreaterThanOrEqual(-90)
      expect(l.lat).toBeLessThanOrEqual(90)
    }
  })

  it('all longitudes are in valid range [-180, 180]', () => {
    for (const l of landmarks) {
      expect(l.lon).toBeGreaterThanOrEqual(-180)
      expect(l.lon).toBeLessThanOrEqual(180)
    }
  })

  it('has no duplicate IDs', () => {
    const ids = landmarks.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all landmarks have required base fields', () => {
    for (const l of landmarks) {
      expect(l.id).toBeTruthy()
      expect(l.name).toBeTruthy()
      expect(l.description).toBeTruthy()
      expect(l.accent).toBeTruthy()
      expect(l.type).toMatch(/^(landing-site|geological)$/)
    }
  })
})
