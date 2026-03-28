import { ref, computed } from 'vue'
import type { ArchivedMeteorObservation } from '@/types/meteorArchive'

const STORAGE_KEY = 'mars-meteor-archive-v1'

function newArchiveId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `meteor-obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): ArchivedMeteorObservation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is ArchivedMeteorObservation =>
      r && typeof r === 'object' && typeof r.archiveId === 'string',
    )
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedMeteorObservation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch { /* quota / private mode */ }
}

const observations = ref<ArchivedMeteorObservation[]>(loadFromStorage())

/** Clears singleton state. Used by unit tests only. */
export function resetForTests(): void {
  observations.value = []
}

export function useMeteorArchive() {
  const pendingTransmission = computed(() =>
    observations.value.filter((o) => o.queuedForTransmission && !o.transmitted),
  )

  function archiveObservation(params: {
    siteId: string
    capturedSol: number
    roverWorldX: number
    roverWorldZ: number
    showerId: string
    meteoriteVariant: string
    weightKg: number
    sp: number
  }): ArchivedMeteorObservation {
    const obs: ArchivedMeteorObservation = {
      archiveId: newArchiveId(),
      capturedAtMs: Date.now(),
      subject: 'meteorite',
      queuedForTransmission: false,
      transmitted: false,
      ...params,
    }
    const next = [...observations.value, obs]
    observations.value = next
    saveToStorage(next)
    return obs
  }

  function queueForTransmission(archiveId: string): void {
    const next = observations.value.map((o) =>
      o.archiveId === archiveId ? { ...o, queuedForTransmission: true } : o,
    )
    observations.value = next
    saveToStorage(next)
  }

  function dequeueFromTransmission(archiveId: string): void {
    const next = observations.value.map((o) =>
      o.archiveId === archiveId ? { ...o, queuedForTransmission: false } : o,
    )
    observations.value = next
    saveToStorage(next)
  }

  function markTransmitted(archiveId: string): void {
    const next = observations.value.map((o) =>
      o.archiveId === archiveId ? { ...o, transmitted: true, queuedForTransmission: false } : o,
    )
    observations.value = next
    saveToStorage(next)
  }

  return {
    observations,
    pendingTransmission,
    archiveObservation,
    queueForTransmission,
    dequeueFromTransmission,
    markTransmitted,
  }
}
