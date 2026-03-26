import { describe, it, expect } from 'vitest'
import catalogJson from '../../../public/data/dsn-transmissions.json'
import type { DSNTransmissionCatalog, TransmissionRarity } from '../dsnArchive'

const VALID_RARITIES: TransmissionRarity[] = ['common', 'uncommon', 'rare', 'legendary']
const VALID_CATEGORIES = ['colonist', 'echo']
const VALID_SENDER_KEYS = [
  'vasquez', 'oliveira', 'nakamura', 'al-rashid', 'tanaka', 'cortez', 'unknown', 'historical',
]

describe('dsn-transmissions.json', () => {
  const catalog = catalogJson as DSNTransmissionCatalog

  it('has version 1', () => {
    expect(catalog.version).toBe(1)
  })

  it('has 54 transmissions (39 colonist + 15 echoes)', () => {
    expect(catalog.transmissions.length).toBe(54)
  })

  it('no duplicate IDs', () => {
    const ids = catalog.transmissions.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all transmissions have required fields', () => {
    for (const t of catalog.transmissions) {
      expect(t.id).toBeTruthy()
      expect(VALID_CATEGORIES).toContain(t.category)
      expect(t.frequencyMHz).toBeGreaterThanOrEqual(0)
      expect(t.sender).toBeTruthy()
      expect(t.body).toBeTruthy()
      expect(VALID_RARITIES).toContain(t.rarity)
      expect(VALID_SENDER_KEYS).toContain(t.senderKey)
      expect(t.sortOrder).toBeGreaterThan(0)
    }
  })

  it('has exactly 39 colonist and 15 echo entries', () => {
    const colonist = catalog.transmissions.filter(t => t.category === 'colonist')
    const echo = catalog.transmissions.filter(t => t.category === 'echo')
    expect(colonist.length).toBe(39)
    expect(echo.length).toBe(15)
  })

  it('TX-039 is legendary rarity', () => {
    const tx039 = catalog.transmissions.find(t => t.id === 'TX-039')
    expect(tx039).toBeDefined()
    expect(tx039!.rarity).toBe('legendary')
  })

  it('sort orders are unique', () => {
    const orders = catalog.transmissions.map(t => t.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })
})
