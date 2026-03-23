import { afterEach, describe, expect, it, vi } from 'vitest'
import { installOrbitalDropDebugApi } from '../orbitalDropDebug'
import type { OrbitalDropDebugApi } from '@/types/orbitalDrop'

describe('installOrbitalDropDebugApi', () => {
  afterEach(() => {
    delete (globalThis as { OrbitalDrop?: unknown }).OrbitalDrop
  })

  it('installs the OrbitalDrop debug API and forwards commands', () => {
    const dropItem = vi.fn(() => 'drop-a')
    const dropRandom = vi.fn(() => 'drop-random')
    const listComponentItems = vi.fn(() => ['engineering-components', 'welding-wire'])

    const dispose = installOrbitalDropDebugApi({
      dropItem,
      dropRandom,
      listComponentItems,
    })

    const api = (globalThis as { OrbitalDrop?: OrbitalDropDebugApi }).OrbitalDrop

    expect(api).toBeDefined()
    expect(api?.listComponentItems()).toEqual(['engineering-components', 'welding-wire'])
    expect(api?.dropItem('welding-wire', { x: 4, z: 8, quantity: 2 })).toBe('drop-a')
    expect(dropItem).toHaveBeenCalledWith('welding-wire', { x: 4, z: 8, quantity: 2 })

    dispose()
    expect((globalThis as { OrbitalDrop?: unknown }).OrbitalDrop).toBeUndefined()
  })
})
