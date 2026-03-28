import { describe, it, expect, beforeEach } from 'vitest'
import { useMissions } from '../useMissions'

describe('Mission Zero objective checkers', () => {
  beforeEach(() => {
    const m = useMissions()
    m.resetForTests()
    m.wireArchiveCheckers()
  })

  it('power-boot checker returns false until notifyPowerBooted is called', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'm00-test',
        name: 'Test',
        patron: null,
        description: '',
        briefing: '',
        reward: { sp: 0 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'pb-1', type: 'power-boot', label: 'Boot power', params: {}, sequential: true },
        ],
      }],
    })
    m.accept('m00-test', 1)

    m.checkAllObjectives(0, 0, [], 1)
    const state = m.missionStates.value.find(s => s.missionId === 'm00-test')!
    expect(state.objectives[0].done).toBe(false)

    m.notifyPowerBooted()
    m.checkAllObjectives(0, 0, [], 1)
    expect(state.objectives[0].done).toBe(true)
  })

  it('ui-inspect checker completes when matching target is inspected', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'm00-test',
        name: 'Test',
        patron: null,
        description: '',
        briefing: '',
        reward: { sp: 0 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'ui-1', type: 'ui-inspect', label: 'Inspect profile', params: { target: 'profile' }, sequential: true },
          { id: 'ui-2', type: 'ui-inspect', label: 'Inspect heater', params: { target: 'heater' }, sequential: true },
        ],
      }],
    })
    m.accept('m00-test', 1)

    m.notifyUiInspected('profile')
    m.checkAllObjectives(0, 0, [], 1)
    const state = m.missionStates.value.find(s => s.missionId === 'm00-test')!
    expect(state.objectives[0].done).toBe(true)
    expect(state.objectives[1].done).toBe(false)

    m.notifyUiInspected('heater')
    m.checkAllObjectives(0, 0, [], 1)
    expect(state.objectives[1].done).toBe(true)
  })

  it('avionics-test checker completes when cumulative distance >= threshold', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'm00-test',
        name: 'Test',
        patron: null,
        description: '',
        briefing: '',
        reward: { sp: 0 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'av-1', type: 'avionics-test', label: 'Move 5m', params: { distanceM: 5 }, sequential: true },
        ],
      }],
    })
    m.accept('m00-test', 1)

    m.addAvionicsDistance(3)
    m.checkAllObjectives(0, 0, [], 1)
    const state = m.missionStates.value.find(s => s.missionId === 'm00-test')!
    expect(state.objectives[0].done).toBe(false)

    m.addAvionicsDistance(2.5)
    m.checkAllObjectives(0, 0, [], 1)
    expect(state.objectives[0].done).toBe(true)
  })
})
