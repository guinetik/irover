import { describe, it, expect } from 'vitest'
import { rewardItemsForOrbitalDrop } from '../missionRewardOrbital'

describe('rewardItemsForOrbitalDrop', () => {
  it('returns only component items that are valid orbital-drop ids', () => {
    expect(
      rewardItemsForOrbitalDrop({
        sp: 10,
        items: [
          { id: 'welding-wire', quantity: 2 },
          { id: 'basalt', quantity: 1 },
        ],
      }),
    ).toEqual([{ id: 'welding-wire', quantity: 2 }])
  })

  it('floors quantity to at least 1', () => {
    expect(
      rewardItemsForOrbitalDrop({
        items: [{ id: 'engineering-components', quantity: 0 }],
      }),
    ).toEqual([{ id: 'engineering-components', quantity: 1 }])
  })

  it('returns empty when no items or no orbital stacks', () => {
    expect(rewardItemsForOrbitalDrop({})).toEqual([])
    expect(rewardItemsForOrbitalDrop({ items: [{ id: 'trace-Fe', quantity: 1 }] })).toEqual([])
  })
})
