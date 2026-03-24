import { ref, computed } from 'vue'
import type { ArchivedDanProspect } from '@/types/danArchive'

const STORAGE_KEY = 'mars-dan-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `dan-arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function migrateDanArchiveRow(raw: unknown): ArchivedDanProspect | null {
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
    quality: (o.quality as ArchivedDanProspect['quality']) ?? 'Weak',
    waterConfirmed: o.waterConfirmed === true,
    waterFraction: typeof o.waterFraction === 'number' ? o.waterFraction : 0,
    transmitted: o.transmitted === true,
  }
}

function loadFromStorage(): ArchivedDanProspect[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(migrateDanArchiveRow)
      .filter((r): r is ArchivedDanProspect => r !== null)
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedDanProspect[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* quota / private mode */
  }
}

const prospects = ref<ArchivedDanProspect[]>(loadFromStorage())

/** Exported for tests only — resets module-level singleton state */
export function resetForTests(): void {
  prospects.value = []
}

/**
 * Persisted DAN prospects acknowledged by the player.
 * Call `markTransmitted` when UHF downlink completes.
 */
export function useDanArchive() {
  const pendingTransmission = computed(() => prospects.value.filter((p) => !p.transmitted))

  function archiveProspect(params: {
    capturedAtMs: number
    capturedSol: number
    solAcknowledged: number
    siteId: string
    latitudeDeg: number
    longitudeDeg: number
    quality: ArchivedDanProspect['quality']
    waterConfirmed: boolean
    waterFraction: number
  }): ArchivedDanProspect {
    const row: ArchivedDanProspect = {
      archiveId: newArchiveId(),
      capturedAtMs: params.capturedAtMs,
      capturedSol: params.capturedSol,
      acknowledgedAtMs: Date.now(),
      solAcknowledged: params.solAcknowledged,
      siteId: params.siteId,
      latitudeDeg: params.latitudeDeg,
      longitudeDeg: params.longitudeDeg,
      quality: params.quality,
      waterConfirmed: params.waterConfirmed,
      waterFraction: params.waterFraction,
      transmitted: false,
    }
    const next = [...prospects.value, row]
    prospects.value = next
    saveToStorage(next)
    return row
  }

  function markTransmitted(archiveId: string): void {
    const next = prospects.value.map((p) =>
      p.archiveId === archiveId ? { ...p, transmitted: true } : p,
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
