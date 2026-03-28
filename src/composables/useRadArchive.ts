import { ref, computed } from 'vue'
import type { ArchivedRADEvent } from '@/types/radArchive'
import type { RadEventId, RadEventRarity, RadQualityGrade, RadParticleType } from '@/lib/radiation'

const STORAGE_KEY = 'mars-rad-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `rad-arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): ArchivedRADEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is ArchivedRADEvent =>
      r && typeof r === 'object' && typeof r.archiveId === 'string',
    )
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedRADEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch { /* quota / private mode */ }
}

const events = ref<ArchivedRADEvent[]>(loadFromStorage())

/** Clears singleton state. Used by unit tests only. */
export function resetForTests(): void {
  events.value = []
}

export function useRadArchive() {
  const pendingTransmission = computed(() => events.value.filter((e) => e.queuedForTransmission && !e.transmitted))

  function archiveRadEvent(params: {
    eventId: RadEventId
    classifiedAs: RadEventId
    eventName: string
    rarity: RadEventRarity
    resolved: boolean
    confidence: number
    caught: number
    total: number
    caughtComposition?: Record<RadParticleType, number>
    grade: RadQualityGrade
    spEarned: number
    sideProducts: Array<{ itemId: string; quantity: number }>
    capturedSol: number
    capturedAtMs?: number
    siteId: string
    latitudeDeg: number
    longitudeDeg: number
  }): ArchivedRADEvent {
    const row: ArchivedRADEvent = {
      archiveId: newArchiveId(),
      eventId: params.eventId,
      classifiedAs: params.classifiedAs,
      eventName: params.eventName,
      rarity: params.rarity,
      resolved: params.resolved,
      confidence: params.confidence,
      caught: params.caught,
      total: params.total,
      caughtComposition: params.caughtComposition,
      grade: params.grade,
      spEarned: params.spEarned,
      sideProducts: params.sideProducts,
      capturedSol: params.capturedSol,
      capturedAtMs: params.capturedAtMs ?? Date.now(),
      siteId: params.siteId,
      latitudeDeg: params.latitudeDeg,
      longitudeDeg: params.longitudeDeg,
      queuedForTransmission: false,
      transmitted: false,
    }

    const next = [...events.value, row]
    events.value = next
    saveToStorage(next)
    return row
  }

  function queueForTransmission(archiveId: string): void {
    const next = events.value.map((e) =>
      e.archiveId === archiveId ? { ...e, queuedForTransmission: true } : e,
    )
    events.value = next
    saveToStorage(next)
  }

  function dequeueFromTransmission(archiveId: string): void {
    const next = events.value.map((e) =>
      e.archiveId === archiveId ? { ...e, queuedForTransmission: false } : e,
    )
    events.value = next
    saveToStorage(next)
  }

  function markTransmitted(archiveId: string): void {
    const next = events.value.map((e) =>
      e.archiveId === archiveId ? { ...e, transmitted: true, queuedForTransmission: false } : e,
    )
    events.value = next
    saveToStorage(next)
  }

  return {
    events,
    pendingTransmission,
    archiveRadEvent,
    queueForTransmission,
    dequeueFromTransmission,
    markTransmitted,
  }
}
