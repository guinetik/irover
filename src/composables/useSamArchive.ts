import { ref, computed } from 'vue'
import type { ArchivedSamDiscovery } from '@/types/samArchive'

const STORAGE_KEY = 'mars-sam-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `sam-arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function migrateSamArchiveRow(raw: unknown): ArchivedSamDiscovery | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.archiveId !== 'string') return null
  const now = Date.now()
  const ackMs = typeof o.acknowledgedAtMs === 'number' ? o.acknowledgedAtMs : now
  const capMs = typeof o.capturedAtMs === 'number' ? o.capturedAtMs : ackMs
  return {
    archiveId: o.archiveId,
    capturedAtMs: capMs,
    capturedSol: typeof o.capturedSol === 'number' ? o.capturedSol : 1,
    acknowledgedAtMs: ackMs,
    solAcknowledged: typeof o.solAcknowledged === 'number' ? o.solAcknowledged : 1,
    siteId: typeof o.siteId === 'string' ? o.siteId : '',
    latitudeDeg: typeof o.latitudeDeg === 'number' ? o.latitudeDeg : 0,
    longitudeDeg: typeof o.longitudeDeg === 'number' ? o.longitudeDeg : 0,
    discoveryName: typeof o.discoveryName === 'string' ? o.discoveryName : 'Unknown',
    rarity: (o.rarity as ArchivedSamDiscovery['rarity']) ?? 'common',
    spEarned: typeof o.spEarned === 'number' ? o.spEarned : 0,
    transmitted: o.transmitted === true,
  }
}

function loadFromStorage(): ArchivedSamDiscovery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(migrateSamArchiveRow)
      .filter((r): r is ArchivedSamDiscovery => r !== null)
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedSamDiscovery[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* quota / private mode */
  }
}

const discoveries = ref<ArchivedSamDiscovery[]>(loadFromStorage())

/** Exported for tests only — resets module-level singleton state */
export function resetForTests(): void {
  discoveries.value = []
}

/**
 * Persisted SAM discoveries acknowledged by the player.
 * Call `markTransmitted` when UHF downlink completes.
 */
export function useSamArchive() {
  const pendingTransmission = computed(() => discoveries.value.filter((d) => !d.transmitted))

  function archiveDiscovery(params: {
    capturedAtMs: number
    capturedSol: number
    solAcknowledged: number
    siteId: string
    latitudeDeg: number
    longitudeDeg: number
    discoveryName: string
    rarity: ArchivedSamDiscovery['rarity']
    spEarned: number
  }): ArchivedSamDiscovery {
    const row: ArchivedSamDiscovery = {
      archiveId: newArchiveId(),
      capturedAtMs: params.capturedAtMs,
      capturedSol: params.capturedSol,
      acknowledgedAtMs: Date.now(),
      solAcknowledged: params.solAcknowledged,
      siteId: params.siteId,
      latitudeDeg: params.latitudeDeg,
      longitudeDeg: params.longitudeDeg,
      discoveryName: params.discoveryName,
      rarity: params.rarity,
      spEarned: params.spEarned,
      transmitted: false,
    }
    const next = [...discoveries.value, row]
    discoveries.value = next
    saveToStorage(next)
    return row
  }

  function markTransmitted(archiveId: string): void {
    const next = discoveries.value.map((d) =>
      d.archiveId === archiveId ? { ...d, transmitted: true } : d,
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
