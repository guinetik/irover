import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  usePlayerProfile,
  ORIGINS,
  MOTIVATIONS,
  type OriginId,
  type MotivationId,
} from '../usePlayerProfile'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

describe('PlayerProfile origin & motivation', () => {
  it('profile has origin and motivation fields defaulting to null', () => {
    const { profile } = usePlayerProfile()
    expect(profile.origin).toBeNull()
    expect(profile.motivation).toBeNull()
  })

  it('ORIGINS has earth, metropolis, lunar entries', () => {
    expect(Object.keys(ORIGINS)).toEqual(['earth', 'metropolis', 'lunar'])
    expect(ORIGINS.earth.name).toBe('Earth')
  })

  it('MOTIVATIONS has legacy, therapist, commute entries', () => {
    expect(Object.keys(MOTIVATIONS)).toEqual(['legacy', 'therapist', 'commute'])
    expect(MOTIVATIONS.therapist.name).toBe('Therapist')
  })

  it('setIdentity stores origin and motivation without affecting modifiers', () => {
    const { profile, setIdentity, mod } = usePlayerProfile()
    setIdentity('earth', 'commute')
    expect(profile.origin).toBe('earth')
    expect(profile.motivation).toBe('commute')
    expect(mod('movementSpeed')).toBe(1)
  })
})

describe('PlayerProfile sandbox flag', () => {
  it('sandbox defaults to false (guided mode)', () => {
    const { profile } = usePlayerProfile()
    expect(profile.sandbox).toBe(false)
  })

  it('sandbox can be toggled', () => {
    const { profile } = usePlayerProfile()
    profile.sandbox = true
    expect(profile.sandbox).toBe(true)
    // Reset for other tests
    profile.sandbox = false
  })
})

describe('PlayerProfile localStorage persistence', () => {
  beforeEach(() => {
    localStorage.removeItem('mars-profile-v1')
    const { setProfile, setIdentity } = usePlayerProfile()
    setProfile(null, null, null)
    setIdentity(null as any, null as any)
  })

  it('saves profile to localStorage on setProfile', () => {
    const { setProfile } = usePlayerProfile()
    setProfile('maker', 'technologist', 'trc')
    const stored = JSON.parse(localStorage.getItem('mars-profile-v1')!)
    expect(stored.archetype).toBe('maker')
    expect(stored.foundation).toBe('technologist')
    expect(stored.patron).toBe('trc')
  })

  it('saves identity to localStorage on setIdentity', () => {
    const { setIdentity } = usePlayerProfile()
    setIdentity('earth', 'commute')
    const stored = JSON.parse(localStorage.getItem('mars-profile-v1')!)
    expect(stored.origin).toBe('earth')
    expect(stored.motivation).toBe('commute')
  })

  it('hydrates profile from localStorage on init', () => {
    localStorage.setItem(
      'mars-profile-v1',
      JSON.stringify({
        archetype: 'maker',
        foundation: 'technologist',
        patron: 'trc',
        origin: 'earth',
        motivation: 'legacy',
        sandbox: false,
      }),
    )
    const { hydrateProfile, profile } = usePlayerProfile()
    hydrateProfile()
    expect(profile.archetype).toBe('maker')
    expect(profile.origin).toBe('earth')
    expect(profile.motivation).toBe('legacy')
    expect(profile.modifiers.movementSpeed).toBe(1.05)
  })
})
