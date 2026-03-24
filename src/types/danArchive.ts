/**
 * Immutable DAN (Dynamic Albedo of Neutrons) prospect record saved when the
 * player acknowledges a DAN reading. Intended for UHF transmission queue.
 */
export interface ArchivedDanProspect {
  /** Stable id for this archive row */
  archiveId: string
  /** Unix ms when DAN acquisition finished */
  capturedAtMs: number
  /** Mission sol when DAN acquisition finished */
  capturedSol: number
  /** Unix ms when the player acknowledged the result */
  acknowledgedAtMs: number
  /** Mission sol when acknowledged */
  solAcknowledged: number
  siteId: string
  latitudeDeg: number
  longitudeDeg: number
  /** Qualitative signal strength */
  quality: 'Weak' | 'Moderate' | 'Strong'
  /** True if hydrogen/water signature was confirmed above threshold */
  waterConfirmed: boolean
  /** Estimated hydrogen equivalent water fraction (0–1) */
  waterFraction: number
  /** After UHF downlink succeeds */
  transmitted: boolean
}
