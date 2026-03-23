import { ref, computed } from 'vue'
import type { ArchivedDANProspect } from '@/types/danArchive'
import { approximateLatLonFromTangentOffset } from '@/lib/areography'

const STORAGE_KEY = 'mars-dan-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `dan-arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): ArchivedDANProspect[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is ArchivedDANProspect =>
      r && typeof r === 'object' && typeof r.archiveId === 'string',
    )
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedDANProspect[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch { /* quota / private mode */ }
}

const prospects = ref<ArchivedDANProspect[]>(loadFromStorage())

export function useDanArchive() {
  const pendingTransmission = computed(() => prospects.value.filter((s) => !s.transmitted))

  function archiveProspect(params: {
    capturedSol: number
    siteId: string
    siteLatDeg: number
    siteLonDeg: number
    roverWorldX: number
    roverWorldZ: number
    roverSpawnX: number
    roverSpawnZ: number
    siteUnitsPerMeter?: number
    signalStrength: number
    quality: 'Weak' | 'Moderate' | 'Strong'
    waterConfirmed: boolean
    reservoirQuality: number
  }): ArchivedDANProspect {
    const { latitudeDeg, longitudeDeg } = approximateLatLonFromTangentOffset(
      params.siteLatDeg,
      params.siteLonDeg,
      params.roverWorldX - params.roverSpawnX,
      params.roverWorldZ - params.roverSpawnZ,
      params.siteUnitsPerMeter ?? 1,
    )

    const row: ArchivedDANProspect = {
      archiveId: newArchiveId(),
      capturedSol: params.capturedSol,
      capturedAtMs: Date.now(),
      siteId: params.siteId,
      latitudeDeg,
      longitudeDeg,
      roverWorldX: params.roverWorldX,
      roverWorldZ: params.roverWorldZ,
      signalStrength: params.signalStrength,
      quality: params.quality,
      waterConfirmed: params.waterConfirmed,
      reservoirQuality: params.reservoirQuality,
      transmitted: false,
    }

    const next = [...prospects.value, row]
    prospects.value = next
    saveToStorage(next)
    return row
  }

  function markTransmitted(archiveId: string): void {
    const next = prospects.value.map((s) =>
      s.archiveId === archiveId ? { ...s, transmitted: true } : s,
    )
    prospects.value = next
    saveToStorage(next)
  }

  return {
    prospects,
    pendingTransmission,
    archiveProspect,
    markTransmitted,
  }
}
