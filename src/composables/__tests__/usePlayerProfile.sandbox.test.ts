import { describe, it, expect, beforeEach } from 'vitest'
import {
  usePlayerProfile,
  ORIGINS,
  MOTIVATIONS,
  type OriginId,
  type MotivationId,
} from '../usePlayerProfile'

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
