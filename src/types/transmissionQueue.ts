export type TransmissionSource = 'chemcam' | 'dan' | 'sam' | 'apxs' | 'rad'

export interface TransmissionQueueItem {
  archiveId: string
  source: TransmissionSource
  label: string
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  /** Real (scene) seconds to transmit this item */
  bandwidthSec: number
  /** Estimated SP the discovery originally earned (for transmission bonus calc) */
  originalSP: number
}

/** Real (scene) seconds to transmit one item, by rarity */
export const BANDWIDTH_SEC: Record<string, number> = {
  common: 5,
  uncommon: 8,
  rare: 12,
  legendary: 18,
}
