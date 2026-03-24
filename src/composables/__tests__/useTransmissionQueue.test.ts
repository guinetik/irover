import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BANDWIDTH_SEC, type TransmissionQueueItem, type TransmissionSource } from '@/types/transmissionQueue'
import { resetForTests as resetDan } from '../useDanArchive'
import { resetForTests as resetSam } from '../useSamArchive'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

beforeEach(() => {
  localStorageMock.clear()
  resetDan()
  resetSam()
})

// ── Type exports ─────────────────────────────────────────────────────────────

describe('transmissionQueue types', () => {
  it('BANDWIDTH_SEC exports correct values for all rarities', () => {
    expect(BANDWIDTH_SEC.common).toBe(2)
    expect(BANDWIDTH_SEC.uncommon).toBe(4)
    expect(BANDWIDTH_SEC.rare).toBe(6)
    expect(BANDWIDTH_SEC.legendary).toBe(10)
  })

  it('BANDWIDTH_SEC has entries for all four rarity tiers', () => {
    const expected = ['common', 'uncommon', 'rare', 'legendary']
    for (const rarity of expected) {
      expect(BANDWIDTH_SEC).toHaveProperty(rarity)
      expect(typeof BANDWIDTH_SEC[rarity]).toBe('number')
    }
  })

  it('TransmissionQueueItem type has required fields (shape check via object literal)', () => {
    const item: TransmissionQueueItem = {
      archiveId: 'test-id',
      source: 'chemcam' as TransmissionSource,
      label: 'ChemCam: Basalt',
      rarity: 'common',
      bandwidthSec: 2,
      originalSP: 20,
    }
    expect(item.archiveId).toBe('test-id')
    expect(item.source).toBe('chemcam')
    expect(item.label).toBe('ChemCam: Basalt')
    expect(item.rarity).toBe('common')
    expect(item.bandwidthSec).toBe(2)
    expect(item.originalSP).toBe(20)
  })

  it('TransmissionSource accepts chemcam, dan, and sam values', () => {
    const sources: TransmissionSource[] = ['chemcam', 'dan', 'sam']
    expect(sources).toHaveLength(3)
    expect(sources).toContain('chemcam')
    expect(sources).toContain('dan')
    expect(sources).toContain('sam')
  })
})

// ── Composable import and basic call ─────────────────────────────────────────

describe('useTransmissionQueue', () => {
  it('can be imported and called without throwing', async () => {
    const { useTransmissionQueue } = await import('../useTransmissionQueue')
    expect(() => useTransmissionQueue()).not.toThrow()
  })

  it('returns queue, totalPendingCount, and markTransmitted', async () => {
    const { useTransmissionQueue } = await import('../useTransmissionQueue')
    const result = useTransmissionQueue()
    expect(result).toHaveProperty('queue')
    expect(result).toHaveProperty('totalPendingCount')
    expect(result).toHaveProperty('markTransmitted')
    expect(typeof result.markTransmitted).toBe('function')
  })

  it('queue is a computed ref (has .value)', async () => {
    const { useTransmissionQueue } = await import('../useTransmissionQueue')
    const { queue } = useTransmissionQueue()
    expect(queue).toHaveProperty('value')
    expect(Array.isArray(queue.value)).toBe(true)
  })

  it('totalPendingCount is a computed ref that equals queue length', async () => {
    const { useTransmissionQueue } = await import('../useTransmissionQueue')
    const { queue, totalPendingCount } = useTransmissionQueue()
    expect(totalPendingCount).toHaveProperty('value')
    expect(totalPendingCount.value).toBe(queue.value.length)
  })

  it('returns empty queue when no archives have pending items', async () => {
    const { useTransmissionQueue } = await import('../useTransmissionQueue')
    const { queue, totalPendingCount } = useTransmissionQueue()
    expect(queue.value).toHaveLength(0)
    expect(totalPendingCount.value).toBe(0)
  })

  it('markTransmitted does not throw for a non-existent archiveId', async () => {
    const { useTransmissionQueue } = await import('../useTransmissionQueue')
    const { markTransmitted } = useTransmissionQueue()
    const phantom: TransmissionQueueItem = {
      archiveId: 'does-not-exist',
      source: 'dan',
      label: 'DAN: Weak prospect',
      rarity: 'common',
      bandwidthSec: 2,
      originalSP: 100,
    }
    expect(() => markTransmitted(phantom)).not.toThrow()
  })
})

// ── DAN archive integration ───────────────────────────────────────────────────

describe('useTransmissionQueue — DAN integration', () => {
  it('includes DAN prospects in the queue with correct rarity mapping', async () => {
    const { useDanArchive } = await import('../useDanArchive')
    const { useTransmissionQueue } = await import('../useTransmissionQueue')

    const dan = useDanArchive()
    dan.archiveProspect({
      capturedAtMs: 1000,
      capturedSol: 1,
      solAcknowledged: 1,
      siteId: 'site-a',
      latitudeDeg: 0,
      longitudeDeg: 0,
      quality: 'Strong',
      waterConfirmed: true,
      waterFraction: 0.6,
    })
    dan.archiveProspect({
      capturedAtMs: 2000,
      capturedSol: 1,
      solAcknowledged: 1,
      siteId: 'site-a',
      latitudeDeg: 0,
      longitudeDeg: 0,
      quality: 'Weak',
      waterConfirmed: false,
      waterFraction: 0.05,
    })

    const { queue } = useTransmissionQueue()
    const danItems = queue.value.filter((i) => i.source === 'dan')
    expect(danItems).toHaveLength(2)

    const confirmed = danItems.find((i) => i.label === 'DAN: Strong prospect')
    expect(confirmed?.rarity).toBe('uncommon')
    expect(confirmed?.bandwidthSec).toBe(BANDWIDTH_SEC.uncommon)
    expect(confirmed?.originalSP).toBe(100)

    const unconfirmed = danItems.find((i) => i.label === 'DAN: Weak prospect')
    expect(unconfirmed?.rarity).toBe('common')
    expect(unconfirmed?.bandwidthSec).toBe(BANDWIDTH_SEC.common)
  })

  it('marks a DAN item as transmitted and removes it from the queue', async () => {
    const { useDanArchive } = await import('../useDanArchive')
    const { useTransmissionQueue } = await import('../useTransmissionQueue')

    const dan = useDanArchive()
    dan.archiveProspect({
      capturedAtMs: 3000,
      capturedSol: 2,
      solAcknowledged: 2,
      siteId: 'site-b',
      latitudeDeg: 10,
      longitudeDeg: 20,
      quality: 'Moderate',
      waterConfirmed: false,
      waterFraction: 0.1,
    })

    const { queue, markTransmitted } = useTransmissionQueue()
    expect(queue.value).toHaveLength(1)

    markTransmitted(queue.value[0])
    expect(queue.value).toHaveLength(0)
  })
})

// ── SAM archive integration ───────────────────────────────────────────────────

describe('useTransmissionQueue — SAM integration', () => {
  it('includes SAM discoveries with correct rarity and spEarned', async () => {
    const { useSamArchive } = await import('../useSamArchive')
    const { useTransmissionQueue } = await import('../useTransmissionQueue')

    const sam = useSamArchive()
    sam.archiveDiscovery({
      capturedAtMs: 5000,
      capturedSol: 3,
      solAcknowledged: 3,
      siteId: 'site-c',
      latitudeDeg: -5,
      longitudeDeg: 30,
      discoveryName: 'Perchlorate Signature',
      rarity: 'rare',
      spEarned: 300,
    })

    const { queue } = useTransmissionQueue()
    const samItems = queue.value.filter((i) => i.source === 'sam')
    expect(samItems).toHaveLength(1)

    const item = samItems[0]
    expect(item.label).toBe('SAM: Perchlorate Signature')
    expect(item.rarity).toBe('rare')
    expect(item.bandwidthSec).toBe(BANDWIDTH_SEC.rare)
    expect(item.originalSP).toBe(300)
  })
})

// ── FIFO sort ─────────────────────────────────────────────────────────────────

describe('useTransmissionQueue — FIFO sort', () => {
  it('sorts mixed-source items by capturedAtMs ascending', async () => {
    const { useDanArchive } = await import('../useDanArchive')
    const { useSamArchive } = await import('../useSamArchive')
    const { useTransmissionQueue } = await import('../useTransmissionQueue')

    const dan = useDanArchive()
    const sam = useSamArchive()

    // Insert out of chronological order
    sam.archiveDiscovery({
      capturedAtMs: 9000,
      capturedSol: 5,
      solAcknowledged: 5,
      siteId: 'site-x',
      latitudeDeg: 0,
      longitudeDeg: 0,
      discoveryName: 'Late Discovery',
      rarity: 'common',
      spEarned: 50,
    })
    dan.archiveProspect({
      capturedAtMs: 1000,
      capturedSol: 1,
      solAcknowledged: 1,
      siteId: 'site-x',
      latitudeDeg: 0,
      longitudeDeg: 0,
      quality: 'Weak',
      waterConfirmed: false,
      waterFraction: 0,
    })
    sam.archiveDiscovery({
      capturedAtMs: 5000,
      capturedSol: 3,
      solAcknowledged: 3,
      siteId: 'site-x',
      latitudeDeg: 0,
      longitudeDeg: 0,
      discoveryName: 'Mid Discovery',
      rarity: 'uncommon',
      spEarned: 150,
    })

    const { queue } = useTransmissionQueue()
    expect(queue.value).toHaveLength(3)

    // Should be sorted oldest → newest: DAN(1000), SAM-mid(5000), SAM-late(9000)
    expect(queue.value[0].source).toBe('dan')
    expect(queue.value[1].label).toBe('SAM: Mid Discovery')
    expect(queue.value[2].label).toBe('SAM: Late Discovery')
  })
})
