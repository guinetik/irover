import { beforeEach, describe, expect, it } from 'vitest'
import { useInventory, resetInventoryForTests, devSpawnRandomInventoryItems } from '../useInventory'

describe('useInventory batch component grants', () => {
  beforeEach(() => {
    resetInventoryForTests()
  })

  it('adds multiple component stacks in one batch', () => {
    const { addComponentsBatch, stacks, currentWeightKg } = useInventory()

    const result = addComponentsBatch([
      { itemId: 'engineering-components', quantity: 2 },
      { itemId: 'welding-wire', quantity: 1 },
    ])

    expect(result.ok).toBe(true)
    expect(result.applied).toEqual([
      { itemId: 'engineering-components', quantity: 2 },
      { itemId: 'welding-wire', quantity: 1 },
    ])
    expect(result.failed).toEqual([])
    expect(stacks.value).toEqual([
      { itemId: 'engineering-components', quantity: 2, totalWeightKg: 0.5 },
      { itemId: 'welding-wire', quantity: 1, totalWeightKg: 0.25 },
    ])
    expect(currentWeightKg.value).toBe(0.75)
  })

  it('returns partial success when a later component would exceed capacity', () => {
    const { addComponentsBatch, stacks, capacityKg, currentWeightKg } = useInventory()

    const result = addComponentsBatch([
      { itemId: 'engineering-components', quantity: 10 },
      { itemId: 'welding-wire', quantity: 11 },
    ])

    expect(capacityKg.value).toBe(5)
    expect(result.ok).toBe(false)
    expect(result.applied).toEqual([
      { itemId: 'engineering-components', quantity: 10 },
    ])
    expect(result.failed).toEqual([
      { itemId: 'welding-wire', quantity: 11, message: 'Cargo full.' },
    ])
    expect(stacks.value).toEqual([
      { itemId: 'engineering-components', quantity: 10, totalWeightKg: 2.5 },
    ])
    expect(currentWeightKg.value).toBe(2.5)
  })
})

describe('devSpawnRandomInventoryItems', () => {
  beforeEach(() => {
    resetInventoryForTests()
  })

  it('adds three distinct random catalog items without capacity errors', () => {
    const ids = devSpawnRandomInventoryItems(3)
    expect(ids.length).toBe(3)
    expect(new Set(ids).size).toBe(3)

    const { stacks } = useInventory()
    for (const id of ids) {
      expect(stacks.value.some((s) => s.itemId === id)).toBe(true)
    }
  })
})
