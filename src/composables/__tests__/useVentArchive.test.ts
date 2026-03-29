import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useVentArchive } from '../useVentArchive'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

describe('useVentArchive', () => {
  beforeEach(() => {
    localStorage.clear()
    useVentArchive().resetForTests()
  })

  it('starts empty', () => {
    const { vents } = useVentArchive()
    expect(vents.value).toEqual([])
  })

  it('archives a vent and persists it', () => {
    const { archiveVent, vents } = useVentArchive()
    archiveVent({
      siteId: 'gale',
      ventType: 'co2',
      placedSol: 5,
      x: 10,
      z: 20,
    })
    expect(vents.value).toHaveLength(1)
    expect(vents.value[0].ventType).toBe('co2')
    expect(vents.value[0].siteId).toBe('gale')
    expect(vents.value[0].x).toBe(10)
    expect(vents.value[0].z).toBe(20)
    expect(vents.value[0].archiveId).toBeTruthy()

    // Verify localStorage persistence
    const raw = localStorage.getItem('mars-vent-archive-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed).toHaveLength(1)
  })

  it('returns vents for a specific site', () => {
    const { archiveVent, getVentsForSite } = useVentArchive()
    archiveVent({ siteId: 'gale', ventType: 'co2', placedSol: 1, x: 0, z: 0 })
    archiveVent({ siteId: 'jezero', ventType: 'methane', placedSol: 2, x: 5, z: 5 })
    archiveVent({ siteId: 'gale', ventType: 'methane', placedSol: 3, x: 10, z: 10 })

    expect(getVentsForSite('gale')).toHaveLength(2)
    expect(getVentsForSite('jezero')).toHaveLength(1)
    expect(getVentsForSite('nope')).toHaveLength(0)
  })

  it('checks if a vent type is active for a site', () => {
    const { archiveVent, hasActiveVent } = useVentArchive()
    expect(hasActiveVent('gale', 'co2')).toBe(false)

    archiveVent({ siteId: 'gale', ventType: 'co2', placedSol: 1, x: 0, z: 0 })
    expect(hasActiveVent('gale', 'co2')).toBe(true)
    expect(hasActiveVent('gale', 'methane')).toBe(false)
  })
})
