import { describe, it, expect } from 'vitest'
import type {
  MissionDef,
  ObjectiveDef,
  MissionReward,
  MissionState,
  ObjectiveType,
} from '../missions'

describe('Mission types', () => {
  it('MissionDef shape is valid', () => {
    const def: MissionDef = {
      id: 'm01-triangulate',
      name: 'Triangulate Position',
      patron: null,
      description: 'Navigate to three survey markers.',
      briefing: 'Rover, we need to confirm coordinates.',
      reward: { sp: 25 },
      unlocks: [],
      chain: 'm02-rtg',
      objectives: [
        {
          id: 'tri-1',
          type: 'go-to',
          label: 'Reach marker Alpha',
          params: { poiId: 'tri-alpha' },
          sequential: false,
        },
      ],
    }
    expect(def.id).toBe('m01-triangulate')
    expect(def.objectives[0].type).toBe('go-to')
  })

  it('MissionState shape is valid', () => {
    const state: MissionState = {
      missionId: 'm01-triangulate',
      status: 'active',
      acceptedAtSol: 1,
      objectives: [{ id: 'tri-1', done: false }],
    }
    expect(state.status).toBe('active')
    expect(state.objectives[0].done).toBe(false)
  })

  it('MissionState completed shape includes completedAtSol', () => {
    const state: MissionState = {
      missionId: 'm01-triangulate',
      status: 'completed',
      acceptedAtSol: 1,
      completedAtSol: 3,
      objectives: [{ id: 'tri-1', done: true }],
    }
    expect(state.completedAtSol).toBe(3)
  })

  it('MissionReward supports sp and items', () => {
    const reward: MissionReward = {
      sp: 50,
      items: [{ id: 'welding-wire', quantity: 2 }],
    }
    expect(reward.sp).toBe(50)
    expect(reward.items![0].quantity).toBe(2)
  })
})
