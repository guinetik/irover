import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useChemCamArchive } from './useChemCamArchive'
import { useDanArchive } from './useDanArchive'
import { useSamArchive } from './useSamArchive'
import { useAPXSArchive } from './useAPXSArchive'
import { useRadArchive } from './useRadArchive'
import { useCraterArchive } from './useCraterArchive'
import type { TransmissionQueueItem } from '@/types/transmissionQueue'
import { BANDWIDTH_SEC } from '@/types/transmissionQueue'

/**
 * Aggregates all pending (untransmitted) discoveries from the ChemCam, DAN,
 * and SAM archives into a unified FIFO-sorted transmission queue.
 *
 * The tick handler pops items from this queue during UHF passes.
 */
export function useTransmissionQueue(): {
  queue: ComputedRef<TransmissionQueueItem[]>
  totalPendingCount: ComputedRef<number>
  markTransmitted: (item: TransmissionQueueItem) => void
} {
  const chemcam = useChemCamArchive()
  const dan = useDanArchive()
  const sam = useSamArchive()
  const apxs = useAPXSArchive()
  const rad = useRadArchive()
  const crater = useCraterArchive()

  const queue = computed<TransmissionQueueItem[]>(() => {
    const items: (TransmissionQueueItem & { _capturedAtMs: number })[] = []

    // ChemCam spectra — always 'common', fixed 20 SP
    for (const spectrum of chemcam.pendingTransmission.value) {
      items.push({
        archiveId: spectrum.archiveId,
        source: 'chemcam',
        label: `ChemCam: ${spectrum.rockLabel}`,
        rarity: 'common',
        bandwidthSec: BANDWIDTH_SEC.common,
        originalSP: 20,
        _capturedAtMs: spectrum.capturedAtMs,
      })
    }

    // DAN prospects — 'uncommon' if waterConfirmed, else 'common'
    for (const prospect of dan.pendingTransmission.value) {
      const rarity = prospect.waterConfirmed ? 'uncommon' : 'common'
      items.push({
        archiveId: prospect.archiveId,
        source: 'dan',
        label: `DAN: ${prospect.quality} prospect`,
        rarity,
        bandwidthSec: BANDWIDTH_SEC[rarity],
        originalSP: 100,
        _capturedAtMs: prospect.capturedAtMs,
      })
    }

    // SAM discoveries — rarity and spEarned come directly from the archive record
    for (const discovery of sam.pendingTransmission.value) {
      items.push({
        archiveId: discovery.archiveId,
        source: 'sam',
        label: `SAM: ${discovery.discoveryName}`,
        rarity: discovery.rarity,
        bandwidthSec: BANDWIDTH_SEC[discovery.rarity],
        originalSP: discovery.spEarned,
        _capturedAtMs: discovery.capturedAtMs,
      })
    }

    // APXS analyses — always 'common'
    for (const analysis of apxs.pendingTransmission.value) {
      items.push({
        archiveId: analysis.archiveId,
        source: 'apxs',
        label: `APXS: ${analysis.rockLabel}`,
        rarity: 'common',
        bandwidthSec: BANDWIDTH_SEC.common,
        originalSP: analysis.spEarned,
        _capturedAtMs: analysis.capturedAtMs,
      })
    }

    // RAD events — rarity comes from archive row
    for (const event of rad.pendingTransmission.value) {
      items.push({
        archiveId: event.archiveId,
        source: 'rad',
        label: `RAD: ${event.eventName}`,
        rarity: event.rarity,
        bandwidthSec: BANDWIDTH_SEC[event.rarity],
        originalSP: event.spEarned,
        _capturedAtMs: event.capturedAtMs,
      })
    }

    // Crater discoveries — rarity from discovery table
    for (const disc of crater.pendingTransmission.value) {
      const rarity = disc.rarity.toLowerCase() as 'common' | 'uncommon' | 'rare'
      items.push({
        archiveId: disc.archiveId,
        source: 'crater',
        label: `Crater: ${disc.discoveryName}`,
        rarity,
        bandwidthSec: BANDWIDTH_SEC[rarity],
        originalSP: disc.spEarned,
        _capturedAtMs: disc.capturedAtMs,
      })
    }

    // FIFO sort by capture time (oldest first)
    items.sort((a, b) => a._capturedAtMs - b._capturedAtMs)

    // Strip internal sort key before returning
    return items.map(({ _capturedAtMs: _unused, ...item }) => item)
  })

  const totalPendingCount = computed(() => queue.value.length)

  function markTransmitted(item: TransmissionQueueItem): void {
    if (item.source === 'chemcam') {
      chemcam.markTransmitted(item.archiveId)
    } else if (item.source === 'dan') {
      dan.markTransmitted(item.archiveId)
    } else if (item.source === 'sam') {
      sam.markTransmitted(item.archiveId)
    } else if (item.source === 'apxs') {
      apxs.markTransmitted(item.archiveId)
    } else if (item.source === 'rad') {
      rad.markTransmitted(item.archiveId)
    } else if (item.source === 'crater') {
      crater.markTransmitted(item.archiveId)
    }
  }

  return { queue, totalPendingCount, markTransmitted }
}
