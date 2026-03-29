import { ref, computed } from 'vue'
import type { ArchivedDANProspect } from '@/types/danArchive'
import { approximateLatLonFromTangentOffset } from '@/lib/areography'
import { findLatestPersistedDanDrillSite, type DanDrillSiteScene } from '@/lib/neutron/danDrillSitePersistence'

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

/** Clears singleton state. Used by unit tests only. */
export function resetForTests(): void {
  prospects.value = []
}

export function useDanArchive() {
  const pendingTransmission = computed(() => prospects.value.filter((s) => s.queuedForTransmission && !s.transmitted))

  function archiveProspect(params: {
    capturedSol: number
    capturedAtMs?: number
    /** @deprecated no-op, kept for test compatibility */ solAcknowledged?: number
    siteId: string
    siteLatDeg?: number
    siteLonDeg?: number
    roverWorldX?: number
    roverWorldZ?: number
    roverSpawnX?: number
    roverSpawnZ?: number
    siteUnitsPerMeter?: number
    signalStrength?: number
    quality: 'Weak' | 'Moderate' | 'Strong'
    waterConfirmed: boolean
    reservoirQuality?: number
    /** Scene drill marker position when `waterConfirmed` */
    drillSite?: { x: number; y: number; z: number }
    /** Present only for DAN Crater Mode discoveries. */
    craterDiscovery?: {
      discoveryId: string
      discoveryName: string
      ventPlaced: boolean
      ventType?: 'co2' | 'methane'
    }
    /** @deprecated use reservoirQuality */ waterFraction?: number
    /** @deprecated use siteLatDeg/siteLonDeg */ latitudeDeg?: number
    /** @deprecated use siteLatDeg/siteLonDeg */ longitudeDeg?: number
  }): ArchivedDANProspect {
    const siteLatDeg = params.siteLatDeg ?? params.latitudeDeg ?? 0
    const siteLonDeg = params.siteLonDeg ?? params.longitudeDeg ?? 0
    const roverWorldX = params.roverWorldX ?? 0
    const roverWorldZ = params.roverWorldZ ?? 0
    const roverSpawnX = params.roverSpawnX ?? 0
    const roverSpawnZ = params.roverSpawnZ ?? 0
    const { latitudeDeg, longitudeDeg } = approximateLatLonFromTangentOffset(
      siteLatDeg,
      siteLonDeg,
      roverWorldX - roverSpawnX,
      roverWorldZ - roverSpawnZ,
      params.siteUnitsPerMeter ?? 1,
    )

    const ds = params.drillSite
    const row: ArchivedDANProspect = {
      archiveId: newArchiveId(),
      capturedSol: params.capturedSol,
      capturedAtMs: params.capturedAtMs ?? Date.now(),
      siteId: params.siteId,
      latitudeDeg,
      longitudeDeg,
      roverWorldX,
      roverWorldZ,
      signalStrength: params.signalStrength ?? 0,
      quality: params.quality,
      waterConfirmed: params.waterConfirmed,
      reservoirQuality: params.reservoirQuality ?? 0,
      queuedForTransmission: false,
      transmitted: false,
      ...(ds ? { drillSiteX: ds.x, drillSiteY: ds.y, drillSiteZ: ds.z } : {}),
      ...(params.craterDiscovery ? { craterDiscovery: params.craterDiscovery } : {}),
    }

    const next = [...prospects.value, row]
    prospects.value = next
    saveToStorage(next)
    return row
  }

  function queueForTransmission(archiveId: string): void {
    const next = prospects.value.map((s) =>
      s.archiveId === archiveId ? { ...s, queuedForTransmission: true } : s,
    )
    prospects.value = next
    saveToStorage(next)
  }

  function dequeueFromTransmission(archiveId: string): void {
    const next = prospects.value.map((s) =>
      s.archiveId === archiveId ? { ...s, queuedForTransmission: false } : s,
    )
    prospects.value = next
    saveToStorage(next)
  }

  function markTransmitted(archiveId: string): void {
    const next = prospects.value.map((s) =>
      s.archiveId === archiveId ? { ...s, transmitted: true, queuedForTransmission: false } : s,
    )
    prospects.value = next
    saveToStorage(next)
  }

  /**
   * Latest water-confirmed drill placement for a site (from persisted archive rows with coords).
   */
  function getLatestPersistedDanDrillSiteForSite(siteId: string): DanDrillSiteScene | null {
    return findLatestPersistedDanDrillSite(prospects.value, siteId)
  }

  return {
    prospects,
    pendingTransmission,
    archiveProspect,
    queueForTransmission,
    dequeueFromTransmission,
    markTransmitted,
    getLatestPersistedDanDrillSiteForSite,
  }
}
