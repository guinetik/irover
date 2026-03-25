import { ref, computed } from 'vue'
import type { ArchivedSAMDiscovery } from '@/types/samArchive'
import type { DiscoveryRarity } from '@/types/samExperiments'
import { approximateLatLonFromTangentOffset } from '@/lib/areography'

const STORAGE_KEY = 'mars-sam-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `sam-arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): ArchivedSAMDiscovery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is ArchivedSAMDiscovery =>
      r && typeof r === 'object' && typeof r.archiveId === 'string',
    )
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedSAMDiscovery[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch { /* quota / private mode */ }
}

const discoveries = ref<ArchivedSAMDiscovery[]>(loadFromStorage())

/** Clears singleton state. Used by unit tests only. */
export function resetForTests(): void {
  discoveries.value = []
}

export function useSamArchive() {
  const pendingTransmission = computed(() => discoveries.value.filter((s) => s.queuedForTransmission && !s.transmitted))

  function archiveDiscovery(params: {
    discoveryId?: string
    discoveryName: string
    rarity: DiscoveryRarity
    modeId?: string
    modeName?: string
    sampleId?: string
    sampleLabel?: string
    quality?: number
    spEarned: number
    sideProducts?: { itemId: string; quantity: number }[]
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
    description?: string
    siteUnitsPerMeter?: number
    /** @deprecated use siteLatDeg/siteLonDeg */ latitudeDeg?: number
    /** @deprecated use siteLatDeg/siteLonDeg */ longitudeDeg?: number
  }): ArchivedSAMDiscovery {
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

    const row: ArchivedSAMDiscovery = {
      archiveId: newArchiveId(),
      discoveryId: params.discoveryId ?? '',
      discoveryName: params.discoveryName,
      rarity: params.rarity,
      modeId: params.modeId ?? '',
      modeName: params.modeName ?? '',
      sampleId: params.sampleId ?? '',
      sampleLabel: params.sampleLabel ?? '',
      quality: params.quality ?? 0,
      spEarned: params.spEarned,
      sideProducts: params.sideProducts ?? [],
      capturedSol: params.capturedSol,
      capturedAtMs: params.capturedAtMs ?? Date.now(),
      siteId: params.siteId,
      latitudeDeg,
      longitudeDeg,
      description: params.description ?? '',
      queuedForTransmission: false,
      transmitted: false,
    }

    const next = [...discoveries.value, row]
    discoveries.value = next
    saveToStorage(next)
    return row
  }

  function queueForTransmission(archiveId: string): void {
    const next = discoveries.value.map((s) =>
      s.archiveId === archiveId ? { ...s, queuedForTransmission: true } : s,
    )
    discoveries.value = next
    saveToStorage(next)
  }

  function dequeueFromTransmission(archiveId: string): void {
    const next = discoveries.value.map((s) =>
      s.archiveId === archiveId ? { ...s, queuedForTransmission: false } : s,
    )
    discoveries.value = next
    saveToStorage(next)
  }

  function markTransmitted(archiveId: string): void {
    const next = discoveries.value.map((s) =>
      s.archiveId === archiveId ? { ...s, transmitted: true, queuedForTransmission: false } : s,
    )
    discoveries.value = next
    saveToStorage(next)
  }

  return {
    discoveries,
    pendingTransmission,
    archiveDiscovery,
    queueForTransmission,
    dequeueFromTransmission,
    markTransmitted,
  }
}
