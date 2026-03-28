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
    const triggerStorm = vi.fn()
    const triggerMeteorShower = vi.fn()
    const setMissionForDev = vi.fn(() => ({
      ok: true as const,
      missionId: 'm01',
      name: 'Test',
      priorCompletedIds: [] as string[],
    }))

    const dispose = installMarsDevDebugApi({
      spawnRandomInventoryItems,
      spawnInventoryItemById,
      addSciencePoints,
      triggerStorm,
      triggerMeteorShower,
      setMissionForDev,
    })

    const api = (globalThis as { MarsDev?: MarsDevDebugApi }).MarsDev

    expect(api).toBeDefined()
    expect(api?.inventory.spawnRandom(5)).toEqual(['a', 'b', 'c'])
    expect(spawnRandomInventoryItems).toHaveBeenCalledWith(5)

    expect(api?.inventory.spawnById('basalt', 2)).toEqual({ ok: true })
    expect(spawnInventoryItemById).toHaveBeenCalledWith('basalt', 2)

    expect(api?.science.addSP(50)).toEqual({ ok: true, amount: 100 })
    expect(addSciencePoints).toHaveBeenCalledWith(50)

    expect(api?.mission(2)).toEqual({
      ok: true,
      missionId: 'm01',
      name: 'Test',
      priorCompletedIds: [],
    })
    expect(setMissionForDev).toHaveBeenCalledWith(2)

    api?.weather.triggerStorm(4)
    expect(triggerStorm).toHaveBeenCalledWith(4)

    api?.weather.triggerMeteorShower(3)
    expect(triggerMeteorShower).toHaveBeenCalledWith(3)

    dispose()
    expect((globalThis as { MarsDev?: unknown }).MarsDev).toBeUndefined()
  })
})
