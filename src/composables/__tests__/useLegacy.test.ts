import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLegacy } from '../useLegacy'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

describe('useLegacy', () => {
  beforeEach(() => {
    localStorage.removeItem('mars-legacy')
    useLegacy()._resetForTests()
  })

  it('starts at 0 when no localStorage value', () => {
    const { legacyLevel } = useLegacy()
    expect(legacyLevel.value).toBe(0)
  })

  it('reads existing value from localStorage', () => {
    localStorage.setItem('mars-legacy', '2')
    const { legacyLevel, _resetForTests } = useLegacy()
    _resetForTests()
    expect(legacyLevel.value).toBe(2)
  })

  it('incrementLegacy bumps from 0 to 1 when completing on tier 1', () => {
    const { legacyLevel, incrementLegacy } = useLegacy()
    incrementLegacy(1)
    expect(legacyLevel.value).toBe(1)
    expect(localStorage.getItem('mars-legacy')).toBe('1')
  })

  it('incrementLegacy bumps from 1 to 2 when completing on tier 2', () => {
    localStorage.setItem('mars-legacy', '1')
    const { legacyLevel, incrementLegacy, _resetForTests } = useLegacy()
    _resetForTests()
    incrementLegacy(2)
    expect(legacyLevel.value).toBe(2)
    expect(localStorage.getItem('mars-legacy')).toBe('2')
  })

  it('does not increment when completing on same or lower tier', () => {
    localStorage.setItem('mars-legacy', '1')
    const { legacyLevel, incrementLegacy, _resetForTests } = useLegacy()
    _resetForTests()
    incrementLegacy(1)
    expect(legacyLevel.value).toBe(1)
  })

  it('does not increment beyond 2', () => {
    localStorage.setItem('mars-legacy', '2')
    const { legacyLevel, incrementLegacy, _resetForTests } = useLegacy()
    _resetForTests()
    incrementLegacy(3)
    expect(legacyLevel.value).toBe(2)
  })

  it('isTierUnlocked returns true for tier <= legacy + 1', () => {
    localStorage.setItem('mars-legacy', '1')
    const { isTierUnlocked, _resetForTests } = useLegacy()
    _resetForTests()
    expect(isTierUnlocked(1)).toBe(true)
    expect(isTierUnlocked(2)).toBe(true)
    expect(isTierUnlocked(3)).toBe(false)
  })

  it('tier 1 is always unlocked', () => {
    const { isTierUnlocked } = useLegacy()
    expect(isTierUnlocked(1)).toBe(true)
    expect(isTierUnlocked(2)).toBe(false)
    expect(isTierUnlocked(3)).toBe(false)
  })
})
