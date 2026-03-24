/**
 * Immutable SAM (Sample Analysis at Mars) discovery record saved when the
 * player completes a SAM analysis. Intended for UHF transmission queue.
 */
export interface ArchivedSamDiscovery {
  /** Stable id for this archive row */
  archiveId: string
  /** Unix ms when SAM analysis completed */
  capturedAtMs: number
  /** Mission sol when SAM analysis completed */
  capturedSol: number
  /** Unix ms when the player acknowledged the result */
  acknowledgedAtMs: number
  /** Mission sol when acknowledged */
  solAcknowledged: number
  siteId: string
  latitudeDeg: number
  longitudeDeg: number
  /** Human-readable discovery name (e.g. "Perchlorate Signature") */
  discoveryName: string
  /** Rarity tier of this discovery */
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  /** Science points awarded when the discovery was made */
  spEarned: number
  /** After UHF downlink succeeds */
  transmitted: boolean
}
