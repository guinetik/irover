import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDSNArchive } from '../useDSNArchive'
import type { DSNTransmission } from '@/types/dsnArchive'

const MOCK_TRANSMISSIONS: DSNTransmission[] = [
  {
    id: 'TX-001', category: 'colonist', frequencyMHz: 457.3,
    date: '2031-03-14', sender: 'VASQUEZ, E.', senderRole: 'Commander',
    senderKey: 'vasquez', body: 'Sol 1 log.', rarity: 'common',
    year: 2031, sortOrder: 1,
  },
  {
    id: 'TX-018', category: 'colonist', frequencyMHz: 438.6,
    date: '2036-01-15', sender: 'NAKAMURA, R.', senderRole: 'Systems Engineer',
    senderKey: 'nakamura', body: 'Battery at 58%.', rarity: 'uncommon',
    year: 2036, sortOrder: 18,
  },
  {
    id: 'TX-024', category: 'colonist', frequencyMHz: 457.3,
    date: '2038-01-10', sender: 'VASQUEZ, E.', senderRole: 'Commander',
    senderKey: 'vasquez', body: '19 crew remaining.', rarity: 'rare',
    year: 2038, sortOrder: 24,
  },
  {
    id: 'TX-035', category: 'colonist', frequencyMHz: 399.1,
    date: 'CORRUPTED', sender: 'UNKNOWN', senderKey: 'unknown',
    body: '[CORRUPTED] the boy runs...', rarity: 'legendary',
    sortOrder: 35,
  },
  {
    id: 'TX-039', category: 'colonist', frequencyMHz: 0,
    date: 'NULL', sender: 'UNKNOWN', senderKey: 'unknown',
    body: 'Hello. You found everything.', rarity: 'legendary',
    sortOrder: 39,
  },
  {
    id: 'ECHO-01', category: 'echo', frequencyMHz: 381.2,
    date: '1965-07-15', sender: 'MARINER 4', senderKey: 'historical',
    body: 'First close-range images.', rarity: 'common',
    year: 1965, sortOrder: 40,
  },
]

describe('useDSNArchive', () => {
  beforeEach(() => {
    const { resetForTests } = useDSNArchive()
    resetForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with empty discoveries and locked', () => {
    const { discoveries, unlocked } = useDSNArchive()
    expect(discoveries.value).toEqual([])
    expect(unlocked.value).toBe(false)
  })

  it('loadCatalog stores transmissions', () => {
    const { loadCatalog, allTransmissions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    expect(allTransmissions.value.length).toBe(6)
  })

  it('unlock enables archaeology mode', () => {
    const { unlock, unlocked } = useDSNArchive()
    unlock()
    expect(unlocked.value).toBe(true)
  })

  it('pullTransmissions returns 1-2 from weighted pool, never TX-039', () => {
    // pullTransmissions uses ~30% chance of zero results; force a non-empty pass band
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    const { loadCatalog, unlock, pullTransmissions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    const pulled = pullTransmissions(1)
    expect(pulled.length).toBeGreaterThanOrEqual(1)
    expect(pulled.length).toBeLessThanOrEqual(2)
    for (const p of pulled) {
      expect(p.id).not.toBe('TX-039')
    }
  })

  it('pullTransmissions does not return already-discovered entries', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    const { loadCatalog, unlock, pullTransmissions } = useDSNArchive()
    const small: DSNTransmission[] = [
      MOCK_TRANSMISSIONS[0], // TX-001
      MOCK_TRANSMISSIONS[4], // TX-039 (not pullable)
      MOCK_TRANSMISSIONS[5], // ECHO-01
    ]
    loadCatalog({ version: 1, transmissions: small })
    unlock()
    const first = pullTransmissions(1)
    expect(first.length).toBeGreaterThanOrEqual(1)
    const second = pullTransmissions(2)
    for (const s of second) {
      for (const f of first) {
        expect(s.id).not.toBe(f.id)
      }
    }
  })

  it('first pull always includes TX-001 if not yet discovered', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    const { loadCatalog, unlock, pullTransmissions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    const pulled = pullTransmissions(1)
    expect(pulled.some(p => p.id === 'TX-001')).toBe(true)
  })

  it('markRead updates discovery read state', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    const { loadCatalog, unlock, pullTransmissions, markRead, discoveries } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    pullTransmissions(1)
    const id = discoveries.value[0].transmissionId
    expect(discoveries.value[0].read).toBe(false)
    markRead(id)
    expect(discoveries.value.find(d => d.transmissionId === id)!.read).toBe(true)
  })

  it('unlocks TX-039 when all other colonist logs are discovered', () => {
    const { loadCatalog, unlock, discoverTransmission, discoveries } = useDSNArchive()
    const small: DSNTransmission[] = [
      MOCK_TRANSMISSIONS[0], // TX-001
      MOCK_TRANSMISSIONS[1], // TX-018
      MOCK_TRANSMISSIONS[4], // TX-039
    ]
    loadCatalog({ version: 1, transmissions: small })
    unlock()
    discoverTransmission('TX-001', 1)
    expect(discoveries.value.some(d => d.transmissionId === 'TX-039')).toBe(false)
    discoverTransmission('TX-018', 2)
    expect(discoveries.value.some(d => d.transmissionId === 'TX-039')).toBe(true)
  })

  it('colonistCount and echoCount are correct', () => {
    const { loadCatalog, unlock, discoverTransmission, colonistCount, echoCount } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    discoverTransmission('TX-001', 1)
    discoverTransmission('ECHO-01', 1)
    expect(colonistCount.value).toEqual({ found: 1, total: 5 })
    expect(echoCount.value).toEqual({ found: 1, total: 1 })
  })

  it('unreadCount tracks unread discoveries', () => {
    const { loadCatalog, unlock, discoverTransmission, markRead, unreadCount } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    unlock()
    discoverTransmission('TX-001', 1)
    discoverTransmission('ECHO-01', 1)
    expect(unreadCount.value).toBe(2)
    markRead('TX-001')
    expect(unreadCount.value).toBe(1)
  })

  it('senderCompletions tracks per-sender progress', () => {
    const { loadCatalog, discoverTransmission, senderCompletions } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    discoverTransmission('TX-001', 1)
    expect(senderCompletions.value['vasquez']).toEqual({ found: 1, total: 2 })
    expect(senderCompletions.value['nakamura']).toEqual({ found: 0, total: 1 })
  })

  it('corruptedAllFound is true when all unknown colonist logs found', () => {
    const { loadCatalog, discoverTransmission, corruptedAllFound } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    expect(corruptedAllFound.value).toBe(false)
    discoverTransmission('TX-035', 1)
    expect(corruptedAllFound.value).toBe(true) // Only one unknown non-039 in mock
  })

  it('tx039Read tracks whether TX-039 has been read', () => {
    const { loadCatalog, discoverTransmission, markRead, tx039Read } = useDSNArchive()
    loadCatalog({ version: 1, transmissions: MOCK_TRANSMISSIONS })
    expect(tx039Read.value).toBe(false)
    // Discover all colonist to trigger TX-039 auto-unlock
    discoverTransmission('TX-001', 1)
    discoverTransmission('TX-018', 1)
    discoverTransmission('TX-024', 1)
    discoverTransmission('TX-035', 1)
    // TX-039 should be discovered now
    expect(tx039Read.value).toBe(false) // discovered but not read
    markRead('TX-039')
    expect(tx039Read.value).toBe(true)
  })
})
