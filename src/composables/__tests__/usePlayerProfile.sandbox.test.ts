import { describe, it, expect } from 'vitest'
import { usePlayerProfile } from '../usePlayerProfile'

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
