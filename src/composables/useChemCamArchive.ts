import { ref, computed } from 'vue'
import type { ArchivedChemCamSpectrum } from '@/types/chemcamArchive'
import type { ChemCamReadout } from '@/three/instruments/ChemCamController'
import { approximateLatLonFromTangentOffset } from '@/lib/areography'

const STORAGE_KEY = 'mars-chemcam-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cc-arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Migrates rows saved before `capturedSol` / `capturedAtMs` / `solAcknowledged` existed.
 */
function migrateChemCamArchiveRow(raw: unknown): ArchivedChemCamSpectrum | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.archiveId !== 'string' || typeof o.sourceReadoutId !== 'string') return null
  const legacySol = typeof o.sol === 'number' ? o.sol : 1
  const ackMs = typeof o.acknowledgedAtMs === 'number' ? o.acknowledgedAtMs : Date.now()
  const solAck = typeof o.solAcknowledged === 'number' ? o.solAcknowledged : legacySol
  const capSol = typeof o.capturedSol === 'number' ? o.capturedSol : solAck
  const capMs = typeof o.capturedAtMs === 'number' ? o.capturedAtMs : ackMs
  return {
    archiveId: o.archiveId,
    sourceReadoutId: o.sourceReadoutId,
    acknowledgedAtMs: ackMs,
    solAcknowledged: solAck,
    capturedSol: capSol,
    capturedAtMs: capMs,
    siteId: typeof o.siteId === 'string' ? o.siteId : '',
    latitudeDeg: typeof o.latitudeDeg === 'number' ? o.latitudeDeg : 0,
    longitudeDeg: typeof o.longitudeDeg === 'number' ? o.longitudeDeg : 0,
    roverWorldX: typeof o.roverWorldX === 'number' ? o.roverWorldX : 0,
    roverWorldZ: typeof o.roverWorldZ === 'number' ? o.roverWorldZ : 0,
    rockMeshUuid: typeof o.rockMeshUuid === 'string' ? o.rockMeshUuid : '',
    rockType: o.rockType as ArchivedChemCamSpectrum['rockType'],
    rockLabel: typeof o.rockLabel === 'string' ? o.rockLabel : '',
    calibration: typeof o.calibration === 'number' ? o.calibration : 0,
    peaks: Array.isArray(o.peaks) ? (o.peaks as ArchivedChemCamSpectrum['peaks']) : [],
    queuedForTransmission: o.queuedForTransmission === true,
    transmitted: o.transmitted === true,
  }
}

function loadFromStorage(): ArchivedChemCamSpectrum[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(migrateChemCamArchiveRow)
      .filter((r): r is ArchivedChemCamSpectrum => r !== null)
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedChemCamSpectrum[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* quota / private mode */
  }
}

const spectra = ref<ArchivedChemCamSpectrum[]>(loadFromStorage())

/** Clears singleton state. Used by unit tests only. */
export function resetForTests(): void {
  spectra.value = []
}

/**
 * Persisted ChemCam spectra acknowledged by the player (LIBS peaks + rock + location).
 * Call `markTransmitted` when AntennaLG (or UHF) downlink is implemented.
 */
export function useChemCamArchive() {
  /** Items the player has queued for UHF transmission (not yet transmitted) */
  const pendingTransmission = computed(() => spectra.value.filter((s) => s.queuedForTransmission && !s.transmitted))

  /**
   * Call when the player acknowledges a spectrum in the ChemCam panel.
   * Clones peak data; does not mutate the live controller readout.
   */
  function archiveAcknowledgedReadout(params: {
    readout: ChemCamReadout
    /** Mission sol when the player acknowledges the panel. */
    solAcknowledged: number
    siteId: string
    siteLatDeg: number
    siteLonDeg: number
    roverWorldX: number
    roverWorldZ: number
    roverSpawnX: number
    roverSpawnZ: number
    /** Scene units per meter for tangent offset (default 1). */
    siteUnitsPerMeter?: number
  }): ArchivedChemCamSpectrum {
    const {
      readout,
      solAcknowledged,
      siteId,
      siteLatDeg,
      siteLonDeg,
      roverWorldX,
      roverWorldZ,
      roverSpawnX,
      roverSpawnZ,
      siteUnitsPerMeter = 1,
    } = params

    const { latitudeDeg, longitudeDeg } = approximateLatLonFromTangentOffset(
      siteLatDeg,
      siteLonDeg,
      roverWorldX - roverSpawnX,
      roverWorldZ - roverSpawnZ,
      siteUnitsPerMeter,
    )

    const row: ArchivedChemCamSpectrum = {
      archiveId: newArchiveId(),
      sourceReadoutId: readout.id,
      acknowledgedAtMs: Date.now(),
      solAcknowledged,
      capturedSol: readout.capturedSol,
      capturedAtMs: readout.timestamp,
      siteId,
      latitudeDeg,
      longitudeDeg,
      roverWorldX,
      roverWorldZ,
      rockMeshUuid: readout.rockMeshUuid,
      rockType: readout.rockType,
      rockLabel: readout.rockLabel,
      calibration: readout.calibration,
      peaks: readout.peaks.map((p) => ({ ...p })),
      queuedForTransmission: false,
      transmitted: false,
    }

    const next = [...spectra.value, row]
    spectra.value = next
    saveToStorage(next)
    return row
  }

  /** Player queues an item for UHF transmission */
  function queueForTransmission(archiveId: string): void {
    const next = spectra.value.map((s) =>
      s.archiveId === archiveId ? { ...s, queuedForTransmission: true } : s,
    )
    spectra.value = next
    saveToStorage(next)
  }

  /** Player removes an item from the transmission queue */
  function dequeueFromTransmission(archiveId: string): void {
    const next = spectra.value.map((s) =>
      s.archiveId === archiveId ? { ...s, queuedForTransmission: false } : s,
    )
    spectra.value = next
    saveToStorage(next)
  }

  /** Mark one archived spectrum as successfully transmitted */
  function markTransmitted(archiveId: string): void {
    const next = spectra.value.map((s) =>
      s.archiveId === archiveId ? { ...s, transmitted: true, queuedForTransmission: false } : s,
    )
    spectra.value = next
    saveToStorage(next)
  }

  return {
    spectra,
    pendingTransmission,
    archiveAcknowledgedReadout,
    queueForTransmission,
    dequeueFromTransmission,
    markTransmitted,
  }
}
