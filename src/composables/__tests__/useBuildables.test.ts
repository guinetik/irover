import { describe, it, expect, beforeEach, vi } from 'vitest'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

import { useBuildables } from '../useBuildables'

describe('useBuildables', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    const { clearAll } = useBuildables()
    clearAll()
  })

  it('starts with no placed buildables', () => {
    const { placedBuildables, isShielded } = useBuildables()
    expect(placedBuildables.value).toEqual([])
    expect(isShielded.value).toBe(false)
  })

  it('persists placement to localStorage', () => {
    const { savePlacement } = useBuildables()
    savePlacement({
      id: 'shelter',
      siteId: 'curiosity',
      position: { x: 10, y: 0, z: 20 },
      rotationY: 0,
    })
    const raw = JSON.parse(store['mars-buildables-v1'])
    expect(raw.buildables).toHaveLength(1)
    expect(raw.buildables[0].id).toBe('shelter')
  })

  it('loads placements for current site', () => {
    store['mars-buildables-v1'] = JSON.stringify({
      buildables: [
        { id: 'shelter', siteId: 'curiosity', position: { x: 10, y: 0, z: 20 }, rotationY: 0 },
        { id: 'shelter', siteId: 'gale', position: { x: 5, y: 0, z: 5 }, rotationY: 1 },
      ],
    })
    const { loadForSite } = useBuildables()
    const placements = loadForSite('curiosity')
    expect(placements).toHaveLength(1)
    expect(placements[0].siteId).toBe('curiosity')
  })

  it('clearAll removes storage', () => {
    const { savePlacement, clearAll } = useBuildables()
    savePlacement({
      id: 'shelter',
      siteId: 'curiosity',
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
    })
    clearAll()
    expect(store['mars-buildables-v1']).toBeUndefined()
  })
})
