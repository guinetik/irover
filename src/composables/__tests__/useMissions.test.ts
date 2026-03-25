import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMissions } from '../useMissions'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

const mockMissions = {
  version: 1,
  missions: [
    {
      id: 'm01-test',
      name: 'Test Mission',
      patron: null,
      description: 'Test',
      briefing: 'Test briefing',
      reward: { sp: 25 },
      unlocks: ['mastcam'],
      chain: 'm02-test',
      objectives: [
        { id: 'obj-1', type: 'go-to', label: 'Go here', params: { poiId: 'poi-a' }, sequential: false },
        { id: 'obj-2', type: 'go-to', label: 'Go there', params: { poiId: 'poi-b' }, sequential: false },
      ],
    },
    {
      id: 'm02-test',
      name: 'Chained Mission',
      patron: null,
      description: 'Chained',
      briefing: 'Chained briefing',
      reward: { sp: 30 },
      unlocks: [],
      chain: null,
      objectives: [
        { id: 'obj-3', type: 'go-to', label: 'Final', params: { poiId: 'poi-c' }, sequential: false },
      ],
    },
  ],
}

describe('useMissions', () => {
  beforeEach(() => {
    localStorage.clear()
    const { resetForTests } = useMissions()
    resetForTests()
  })

  it('catalog loads mission definitions', () => {
    const { loadCatalog, catalog } = useMissions()
    loadCatalog(mockMissions)
    expect(catalog.value.length).toBe(2)
    expect(catalog.value[0].id).toBe('m01-test')
  })

  it('accept() creates active mission state', () => {
    const { loadCatalog, accept, activeMissions } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    expect(activeMissions.value.length).toBe(1)
    expect(activeMissions.value[0].missionId).toBe('m01-test')
    expect(activeMissions.value[0].status).toBe('active')
    expect(activeMissions.value[0].acceptedAtSol).toBe(1)
    expect(activeMissions.value[0].objectives).toEqual([
      { id: 'obj-1', done: false },
      { id: 'obj-2', done: false },
    ])
  })

  it('accept() auto-tracks when only one active mission', () => {
    const { loadCatalog, accept, trackedMissionId } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    expect(trackedMissionId.value).toBe('m01-test')
  })

  it('markObjectiveDone() marks a specific objective', () => {
    const { loadCatalog, accept, activeMissions, markObjectiveDone } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    markObjectiveDone('m01-test', 'obj-1')
    expect(activeMissions.value[0].objectives[0].done).toBe(true)
    expect(activeMissions.value[0].objectives[1].done).toBe(false)
  })

  it('complete() moves mission to completed and records sol', () => {
    const { loadCatalog, accept, complete, completedMissions } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    complete('m01-test', 5)
    expect(completedMissions.value.length).toBe(1)
    expect(completedMissions.value[0].status).toBe('completed')
    expect(completedMissions.value[0].completedAtSol).toBe(5)
  })

  it('unlockedInstruments is derived from completed missions', () => {
    const { loadCatalog, accept, complete, unlockedInstruments } = useMissions()
    loadCatalog(mockMissions)
    expect(unlockedInstruments.value).toEqual([])
    accept('m01-test', 1)
    complete('m01-test', 5)
    expect(unlockedInstruments.value).toContain('mastcam')
  })

  it('persists state to localStorage', () => {
    const { loadCatalog, accept } = useMissions()
    loadCatalog(mockMissions)
    accept('m01-test', 1)
    const raw = localStorage.getItem('mars-missions-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.length).toBe(1)
  })

  it('sequential objective is skipped if prior not done', () => {
    const seqMissions = {
      version: 1,
      missions: [{
        id: 'seq-test',
        name: 'Sequential',
        patron: null,
        description: 'Test',
        briefing: 'Test',
        reward: { sp: 10 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 's1', type: 'go-to', label: 'First', params: { poiId: 'a' }, sequential: true },
          { id: 's2', type: 'go-to', label: 'Second', params: { poiId: 'b' }, sequential: true },
        ],
      }],
    }
    const { loadCatalog, accept, isObjectiveEligible } = useMissions()
    loadCatalog(seqMissions)
    accept('seq-test', 1)
    expect(isObjectiveEligible('seq-test', 's2')).toBe(false)
    expect(isObjectiveEligible('seq-test', 's1')).toBe(true)
  })
})
