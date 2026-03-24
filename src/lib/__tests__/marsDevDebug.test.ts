import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMarsDevDebugApi } from '../marsDevDebug'
import type { MarsDevDebugApi } from '@/types/marsDev'

describe('installMarsDevDebugApi', () => {
  afterEach(() => {
    delete (globalThis as { MarsDev?: unknown }).MarsDev
  })

  it('installs MarsDev API and forwards inventory and science helpers', () => {
    const spawnRandomInventoryItems = vi.fn(() => ['a', 'b', 'c'])
    const spawnInventoryItemById = vi.fn(() => ({ ok: true as const }))
    const addSciencePoints = vi.fn(() => ({ ok: true as const, amount: 100 }))

    const dispose = installMarsDevDebugApi({
      spawnRandomInventoryItems,
      spawnInventoryItemById,
      addSciencePoints,
    })

    const api = (globalThis as { MarsDev?: MarsDevDebugApi }).MarsDev

    expect(api).toBeDefined()
    expect(api?.inventory.spawnRandom(5)).toEqual(['a', 'b', 'c'])
    expect(spawnRandomInventoryItems).toHaveBeenCalledWith(5)

    expect(api?.inventory.spawnById('basalt', 2)).toEqual({ ok: true })
    expect(spawnInventoryItemById).toHaveBeenCalledWith('basalt', 2)

    expect(api?.science.addSP(50)).toEqual({ ok: true, amount: 100 })
    expect(addSciencePoints).toHaveBeenCalledWith(50)

    dispose()
    expect((globalThis as { MarsDev?: unknown }).MarsDev).toBeUndefined()
  })
})
