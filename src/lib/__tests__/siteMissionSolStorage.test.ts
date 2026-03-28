import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SITE_MISSION_SOL_STORAGE_KEY,
  getMissionSolForSite,
  readSiteMissionSolMap,
  setMissionSolForSite,
} from '@/lib/siteMissionSolStorage'

const store: Record<string, string> = {}

const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v
  },
  removeItem: (k: string) => {
    delete store[k]
  },
}

describe('siteMissionSolStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.keys(store).forEach((k) => delete store[k])
  })

  it('returns 1 for unknown site', () => {
    vi.stubGlobal('localStorage', localStorageMock)
    expect(getMissionSolForSite('gale')).toBe(1)
  })

  it('round-trips sol per site', () => {
    vi.stubGlobal('localStorage', localStorageMock)
    setMissionSolForSite('gale', 5)
    expect(getMissionSolForSite('gale')).toBe(5)
    setMissionSolForSite('jezero', 2)
    const map = readSiteMissionSolMap()
    expect(map.gale).toBe(5)
    expect(map.jezero).toBe(2)
  })

  it('floors sol and enforces minimum 1', () => {
    vi.stubGlobal('localStorage', localStorageMock)
    setMissionSolForSite('x', 3.9)
    expect(getMissionSolForSite('x')).toBe(3)
    setMissionSolForSite('y', 0)
    expect(getMissionSolForSite('y')).toBe(1)
  })

  it('ignores corrupt JSON', () => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorageMock.setItem(SITE_MISSION_SOL_STORAGE_KEY, 'not-json')
    expect(readSiteMissionSolMap()).toEqual({})
  })
})
