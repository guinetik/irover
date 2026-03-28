/**
 * Immutable meteor observation record saved when a meteor is captured.
 */
export interface ArchivedMeteorObservation {
  archiveId: string
  /** Mission sol when observation was captured */
  capturedSol: number
  /** Unix ms when observation was captured */
  capturedAtMs: number
  siteId: string
  /** Rover world XZ when observation was captured (scene units) */
  roverWorldX: number
  roverWorldZ: number
  subject: 'meteorite'
  showerId: string
  meteoriteVariant: string
  /** Estimated mass in kg (from iron-meteorite weightRange 0.5–1.5) */
  weightKg: number
  sp: number
  /** Player has queued this item for UHF transmission */
  queuedForTransmission: boolean
  /** After UHF transmit — for future funding flow */
  transmitted: boolean
}
