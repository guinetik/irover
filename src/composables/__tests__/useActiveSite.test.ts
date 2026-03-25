import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useActiveSite } from '../useActiveSite'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

describe('useActiveSite', () => {
  beforeEach(() => {
    localStorage.removeItem('mars-active-site-v1')
    const { clear } = useActiveSite()
    clear()
  })

  it('returns null when no site is saved', () => {
    const { activeSite } = useActiveSite()
    expect(activeSite.value).toBeNull()
  })

  it('saves and retrieves siteId + seed', () => {
    const { activeSite, setSite } = useActiveSite()
    setSite('jezero-crater', 42)
    expect(activeSite.value).toEqual({ siteId: 'jezero-crater', seed: 42 })
  })

  it('persists to localStorage', () => {
    const { setSite } = useActiveSite()
    setSite('gale-crater', 99)
    const stored = JSON.parse(localStorage.getItem('mars-active-site-v1')!)
    expect(stored.siteId).toBe('gale-crater')
    expect(stored.seed).toBe(99)
  })

  it('hydrates from localStorage', () => {
    localStorage.setItem(
      'mars-active-site-v1',
      JSON.stringify({ siteId: 'syrtis-major', seed: 7 }),
    )
    const { hydrate, activeSite } = useActiveSite()
    hydrate()
    expect(activeSite.value).toEqual({ siteId: 'syrtis-major', seed: 7 })
  })

  it('clear removes site and localStorage entry', () => {
    const { setSite, clear, activeSite } = useActiveSite()
    setSite('jezero-crater', 42)
    clear()
    expect(activeSite.value).toBeNull()
    expect(localStorage.getItem('mars-active-site-v1')).toBeNull()
  })
})
