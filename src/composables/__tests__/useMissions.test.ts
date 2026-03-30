import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  grantMissionCatalogProgressForDevUpTo,
  resetMissionProgressForDev,
  useMissions,
} from '../useMissions'
import type { MissionCatalog } from '@/types/missions'
import { resetForTests as resetRadArchive, useRadArchive } from '../useRadArchive'
import { resetForTests as resetChemCamArchive, useChemCamArchive } from '../useChemCamArchive'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

const mockMissions: MissionCatalog = {
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

  it('grantMissionCatalogProgressForDevUpTo completes prior catalog missions with rewards and unlocks', () => {
    const { loadCatalog, completedMissions, unlockedInstruments } = useMissions()
    loadCatalog(mockMissions)
    resetMissionProgressForDev()
    const granted = grantMissionCatalogProgressForDevUpTo(2, 7)
    expect(granted).toEqual(['m01-test', 'm02-test'])
    expect(completedMissions.value.length).toBe(2)
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
    const seqMissions: MissionCatalog = {
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

describe('RAD objective checkers', () => {
  beforeEach(() => {
    localStorage.clear()
    resetRadArchive()
    const { resetForTests } = useMissions()
    resetForTests()
  })

  it('rad-activate completes when notifyRadActivated is called', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'rad-test', name: 'RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'r1', type: 'rad-activate', label: 'Activate RAD', params: {}, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('rad-test', 1)

    // Not yet activated
    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)

    // Activate
    m.notifyRadActivated()
    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('rad-decode completes retroactively when archive already has events', () => {
    // Populate the rad archive BEFORE wiring checkers — simulates a player
    // who decoded RAD events organically before this mission arrived.
    const { archiveRadEvent } = useRadArchive()
    archiveRadEvent({
      eventId: 'gcr-fluctuation', classifiedAs: 'gcr-fluctuation',
      eventName: 'GCR Fluctuation', rarity: 'common', resolved: true, confidence: 0.85,
      caught: 10, total: 15, grade: 'B', spEarned: 20, sideProducts: [],
      capturedSol: 5, siteId: 'test', latitudeDeg: 0, longitudeDeg: 0,
    })

    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'rad-test', name: 'RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'r1', type: 'rad-decode', label: 'Decode event', params: {}, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('rad-test', 1)

    // Should auto-complete because archive already has an entry
    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('rad-decode does not complete with empty archive', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'rad-test', name: 'RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'r1', type: 'rad-decode', label: 'Decode event', params: {}, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('rad-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)
  })
})

// Helper: build a minimal mission catalog with a single queue-transmission objective
function makeQueueTransmitCatalog(source: string): MissionCatalog {
  return {
    version: 1,
    missions: [{
      id: 'transmit-test', name: 'Transmit Test', patron: null, description: 'test', briefing: 'test',
      reward: { sp: 10 }, unlocks: [], chain: null,
      objectives: [
        { id: 'qt1', type: 'queue-transmission', label: 'Queue for transmission', params: { source }, sequential: false },
      ],
    }],
  }
}

describe('queue-transmission checker', () => {
  beforeEach(() => {
    localStorage.clear()
    resetRadArchive()
    resetChemCamArchive()
    const { resetForTests } = useMissions()
    resetForTests()
  })

  it('returns false when no items exist for source=rad', () => {
    const m = useMissions()
    m.loadCatalog(makeQueueTransmitCatalog('rad'))
    m.wireArchiveCheckers()
    m.accept('transmit-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)
  })

  it('returns true when a rad event has queuedForTransmission === true', () => {
    const { archiveRadEvent, queueForTransmission } = useRadArchive()
    const event = archiveRadEvent({
      eventId: 'gcr-fluctuation', classifiedAs: 'gcr-fluctuation',
      eventName: 'GCR Fluctuation', rarity: 'common', resolved: true, confidence: 0.85,
      caught: 10, total: 15, grade: 'B', spEarned: 20, sideProducts: [],
      capturedSol: 5, siteId: 'test', latitudeDeg: 0, longitudeDeg: 0,
    })
    queueForTransmission(event.archiveId)

    const m = useMissions()
    m.loadCatalog(makeQueueTransmitCatalog('rad'))
    m.wireArchiveCheckers()
    m.accept('transmit-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('returns true retroactively when a rad event has transmitted === true', () => {
    const { archiveRadEvent, markTransmitted } = useRadArchive()
    const event = archiveRadEvent({
      eventId: 'gcr-fluctuation', classifiedAs: 'gcr-fluctuation',
      eventName: 'GCR Fluctuation', rarity: 'common', resolved: true, confidence: 0.85,
      caught: 10, total: 15, grade: 'B', spEarned: 20, sideProducts: [],
      capturedSol: 3, siteId: 'test', latitudeDeg: 0, longitudeDeg: 0,
    })
    markTransmitted(event.archiveId)

    const m = useMissions()
    m.loadCatalog(makeQueueTransmitCatalog('rad'))
    m.wireArchiveCheckers()
    m.accept('transmit-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('returns false when no items exist for source=chemcam', () => {
    const m = useMissions()
    m.loadCatalog(makeQueueTransmitCatalog('chemcam'))
    m.wireArchiveCheckers()
    m.accept('transmit-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)
  })

  it('returns true when a chemcam spectrum has queuedForTransmission === true', () => {
    const { spectra, queueForTransmission } = useChemCamArchive()
    // Manually insert a minimal spectrum row into the reactive ref
    const fakeSpectrum = {
      archiveId: 'cc-test-1', sourceReadoutId: 'r1', acknowledgedAtMs: 1000, solAcknowledged: 1,
      capturedSol: 1, capturedAtMs: 1000, siteId: 'test', latitudeDeg: 0, longitudeDeg: 0,
      roverWorldX: 0, roverWorldZ: 0, rockMeshUuid: 'mesh-1', rockType: 'basalt' as const,
      rockLabel: 'Basalt', calibration: 1, peaks: [],
      queuedForTransmission: false, transmitted: false,
    }
    spectra.value = [fakeSpectrum]
    queueForTransmission('cc-test-1')

    const m = useMissions()
    m.loadCatalog(makeQueueTransmitCatalog('chemcam'))
    m.wireArchiveCheckers()
    m.accept('transmit-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })

  it('returns false when unknown source is given', () => {
    const m = useMissions()
    m.loadCatalog(makeQueueTransmitCatalog('unknown-source'))
    m.wireArchiveCheckers()
    m.accept('transmit-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(false)
  })
})

describe('transmit checker — RAD counting', () => {
  beforeEach(() => {
    localStorage.clear()
    resetRadArchive()
    const { resetForTests } = useMissions()
    resetForTests()
  })

  it('counts RAD transmitted events when archive=rad is specified', () => {
    const { archiveRadEvent, markTransmitted } = useRadArchive()
    const event = archiveRadEvent({
      eventId: 'gcr-fluctuation', classifiedAs: 'gcr-fluctuation',
      eventName: 'GCR Fluctuation', rarity: 'common', resolved: true, confidence: 0.85,
      caught: 10, total: 15, grade: 'B', spEarned: 20, sideProducts: [],
      capturedSol: 2, siteId: 'site-a', latitudeDeg: 0, longitudeDeg: 0,
    })
    markTransmitted(event.archiveId)

    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'transmit-rad-test', name: 'Transmit RAD Test', patron: null, description: 'test', briefing: 'test',
        reward: { sp: 10 }, unlocks: [], chain: null,
        objectives: [
          { id: 'tx1', type: 'transmit', label: 'Transmit data', params: { archive: 'rad', count: 1 }, sequential: false },
        ],
      }],
    })
    m.wireArchiveCheckers()
    m.accept('transmit-rad-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    expect(m.activeMissions.value[0].objectives[0].done).toBe(true)
  })
})
