import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useChemCamArchive } from './useChemCamArchive'
import { useDanArchive } from './useDanArchive'
import { useSamArchive } from './useSamArchive'
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
    }
  }

  return { queue, totalPendingCount, markTransmitted }
}
