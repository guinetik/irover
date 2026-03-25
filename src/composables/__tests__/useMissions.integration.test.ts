import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMissions } from '../useMissions'
import { tickPoiArrivals, resetPoiArrivalsForTests } from '../usePoiArrival'
import type { SiteMissionPoi } from '../useSiteMissionPois'
import type { MissionCatalog } from '@/types/missions'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

const catalog: MissionCatalog = {
  version: 1,
  missions: [
    {
      id: 'int-01',
      name: 'Integration Test',
      patron: null,
      description: 'Test',
      briefing: 'Test',
      reward: { sp: 25 },
      unlocks: ['mastcam'],
      chain: null,
      objectives: [
        { id: 'g1', type: 'go-to', label: 'Go A', params: { poiId: 'a' }, sequential: false },
        { id: 'g2', type: 'go-to', label: 'Go B', params: { poiId: 'b' }, sequential: false },
      ],
    },
  ],
}

describe('Mission lifecycle integration', () => {
  const pois: SiteMissionPoi[] = [
    { id: 'a', label: 'A', x: 10, z: 10 },
    { id: 'b', label: 'B', x: 50, z: 50 },
  ]

  beforeEach(() => {
    localStorage.clear()
    const { resetForTests, loadCatalog } = useMissions()
    resetForTests()
    resetPoiArrivalsForTests()
    loadCatalog(catalog)
  })

  it('full lifecycle: accept -> dwell at POIs -> awaiting-transmit -> transmit -> complete', () => {
    const { accept, activeMissions, completedMissions, unlockedInstruments, checkAllObjectives, startTransmitCompletion, tickTransmit } = useMissions()

    accept('int-01', 1)
    expect(activeMissions.value.length).toBe(1)

    // Rover not near any POI
    tickPoiArrivals(0, 0, pois, 2.0)
    checkAllObjectives(0, 0, pois, 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(false)

    // Rover dwells at POI A for 2 seconds
    tickPoiArrivals(10, 10, pois, 1.0)
    tickPoiArrivals(10, 10, pois, 1.0)
    checkAllObjectives(10, 10, pois, 1)
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
    expect(activeMissions.value[0].objectives[1].done).toBe(false)

    // Rover dwells at POI B for 2 seconds
    tickPoiArrivals(50, 50, pois, 1.0)
    tickPoiArrivals(50, 50, pois, 1.0)
    checkAllObjectives(50, 50, pois, 2)

    // All objectives done -> awaiting transmit (not auto-completed)
    expect(activeMissions.value[0].status).toBe('awaiting-transmit')
    expect(completedMissions.value.length).toBe(0)

    // Start transmit and tick for 2 seconds
    startTransmitCompletion('int-01', 2)
    tickTransmit(1.0, 2)
    tickTransmit(1.0, 2)

    // Now completed
    expect(completedMissions.value.length).toBe(1)
    expect(unlockedInstruments.value).toContain('mastcam')
  })

  it('persists and restores across composable re-init', () => {
    const { accept } = useMissions()
    accept('int-01', 1)

    const { activeMissions } = useMissions()
    expect(activeMissions.value.length).toBe(1)
  })
})
