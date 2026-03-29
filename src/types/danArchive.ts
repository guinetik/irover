/**
 * Immutable DAN prospect record saved when a prospect completes.
 */
export interface ArchivedDANProspect {
  archiveId: string
  /** Mission sol when prospect completed */
  capturedSol: number
  /** Unix ms when prospect completed */
  capturedAtMs: number
  siteId: string
  /** Best-effort areographic coordinates */
  latitudeDeg: number
  longitudeDeg: number
  /** Rover world XZ when prospect completed (scene units) */
  roverWorldX: number
  roverWorldZ: number
  /** 0–1 signal strength of the hit that triggered this prospect */
  signalStrength: number
  /** Quality label derived from signal strength */
  quality: 'Weak' | 'Moderate' | 'Strong'
  /** Whether the water roll succeeded */
  waterConfirmed: boolean
  /** 0–1 reservoir quality (= signal strength) */
  reservoirQuality: number
  /**
   * Terrain-frame scene coordinates of the drill marker when {@link waterConfirmed} — used to
   * restore the disc + model after reload.
   */
  drillSiteX?: number
  drillSiteY?: number
  drillSiteZ?: number
  /** Player has queued this item for UHF transmission */
  queuedForTransmission: boolean
  /** After UHF transmit — for future funding flow */
  transmitted: boolean
  /** Present only for DAN Crater Mode discoveries. */
  craterDiscovery?: {
    discoveryId: string
    discoveryName: string
    ventPlaced: boolean
    ventType?: 'co2' | 'methane'
  }
}
