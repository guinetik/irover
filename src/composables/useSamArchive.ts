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

export function useSamArchive() {
  const pendingTransmission = computed(() => discoveries.value.filter((s) => !s.transmitted))

  function archiveDiscovery(params: {
    discoveryId: string
    discoveryName: string
    rarity: DiscoveryRarity
    modeId: string
    modeName: string
    sampleId: string
    sampleLabel: string
    quality: number
    spEarned: number
    sideProducts: { itemId: string; quantity: number }[]
    capturedSol: number
    siteId: string
    siteLatDeg: number
    siteLonDeg: number
    roverWorldX: number
    roverWorldZ: number
    roverSpawnX: number
    roverSpawnZ: number
    description: string
    siteUnitsPerMeter?: number
  }): ArchivedSAMDiscovery {
    const { latitudeDeg, longitudeDeg } = approximateLatLonFromTangentOffset(
      params.siteLatDeg,
      params.siteLonDeg,
      params.roverWorldX - params.roverSpawnX,
      params.roverWorldZ - params.roverSpawnZ,
      params.siteUnitsPerMeter ?? 1,
    )

    const row: ArchivedSAMDiscovery = {
      archiveId: newArchiveId(),
      discoveryId: params.discoveryId,
      discoveryName: params.discoveryName,
      rarity: params.rarity,
      modeId: params.modeId,
      modeName: params.modeName,
      sampleId: params.sampleId,
      sampleLabel: params.sampleLabel,
      quality: params.quality,
      spEarned: params.spEarned,
      sideProducts: params.sideProducts,
      capturedSol: params.capturedSol,
      capturedAtMs: Date.now(),
      siteId: params.siteId,
      latitudeDeg,
      longitudeDeg,
      description: params.description,
      transmitted: false,
    }

    const next = [...discoveries.value, row]
    discoveries.value = next
    saveToStorage(next)
    return row
  }

  function markTransmitted(archiveId: string): void {
    const next = discoveries.value.map((s) =>
      s.archiveId === archiveId ? { ...s, transmitted: true } : s,
    )
    discoveries.value = next
    saveToStorage(next)
  }

  return {
    discoveries,
    pendingTransmission,
    archiveDiscovery,
    markTransmitted,
  }
}
