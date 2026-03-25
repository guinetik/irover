import { describe, it, expect } from 'vitest'
import { usePlayerProfile } from '../usePlayerProfile'

describe('PlayerProfile sandbox flag', () => {
  it('sandbox defaults to true', () => {
    const { profile } = usePlayerProfile()
    expect(profile.sandbox).toBe(true)
  })

  it('sandbox can be set to false', () => {
    const { profile } = usePlayerProfile()
    profile.sandbox = false
    expect(profile.sandbox).toBe(false)
    // Reset for other tests
    profile.sandbox = true
  })
})
