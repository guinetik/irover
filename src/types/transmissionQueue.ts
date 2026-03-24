export type TransmissionSource = 'chemcam' | 'dan' | 'sam'

export interface TransmissionQueueItem {
  archiveId: string
  source: TransmissionSource
  label: string
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  /** Mars-clock seconds to transmit: common=2, uncommon=4, rare=6, legendary=10 */
  bandwidthSec: number
  /** Estimated SP the discovery originally earned (for transmission bonus calc) */
  originalSP: number
}

export const BANDWIDTH_SEC: Record<string, number> = {
  common: 2,
  uncommon: 4,
  rare: 6,
  legendary: 10,
}
