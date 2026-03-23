import type { RockTypeId } from '@/three/terrain/RockTypes'
import type { SpectrumPeak } from '@/three/instruments/ChemCamController'

/**
 * Immutable ChemCam LIBS record saved when the player acknowledges a spectrum.
 * Intended for future LGA transmit / funding hooks (see AntennaLGController).
 */
export interface ArchivedChemCamSpectrum {
  /** Stable id for this archive row */
  archiveId: string
  /** Original readout id from {@link ChemCamController} */
  sourceReadoutId: string
  /** Unix ms when the player acknowledged the spectrum in the UI. */
  acknowledgedAtMs: number
  /** Mission sol when the player acknowledged (review / archive commit). */
  solAcknowledged: number
  /** Mission sol when LIBS acquisition finished (same as readout.capturedSol). */
  capturedSol: number
  /** Unix ms when LIBS acquisition finished (same as readout.timestamp). */
  capturedAtMs: number
  siteId: string
  /** Best-effort areographic coordinates (site + rover offset from landing spawn). */
  latitudeDeg: number
  longitudeDeg: number
  /** Rover world XZ when acknowledged (scene units). */
  roverWorldX: number
  roverWorldZ: number
  rockMeshUuid: string
  rockType: RockTypeId
  rockLabel: string
  calibration: number
  peaks: SpectrumPeak[]
  /** After LGA (or UHF) transmit succeeds — for funding / mission report UI. */
  transmitted: boolean
}
