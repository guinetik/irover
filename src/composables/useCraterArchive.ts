import { ref, computed } from 'vue'
import type { ArchivedCraterDiscovery } from '@/types/craterArchive'

const STORAGE_KEY = 'mars-crater-archive-v1'

function loadFromStorage(): ArchivedCraterDiscovery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(data: ArchivedCraterDiscovery[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const discoveries = ref<ArchivedCraterDiscovery[]>(loadFromStorage())

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `crater-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCraterArchive() {
  function archiveDiscovery(params: Omit<ArchivedCraterDiscovery, 'archiveId' | 'capturedAtMs' | 'queuedForTransmission' | 'transmitted'>): ArchivedCraterDiscovery {
    const entry: ArchivedCraterDiscovery = {
      archiveId: generateId(),
      capturedAtMs: Date.now(),
      queuedForTransmission: false,
      transmitted: false,
      ...params,
    }
    discoveries.value = [...discoveries.value, entry]
    persist(discoveries.value)
    return entry
  }

  function queueForTransmission(archiveId: string): void {
    const d = discoveries.value.find(r => r.archiveId === archiveId)
    if (d) { d.queuedForTransmission = true; persist(discoveries.value) }
  }

  function dequeueFromTransmission(archiveId: string): void {
    const d = discoveries.value.find(r => r.archiveId === archiveId)
    if (d) { d.queuedForTransmission = false; persist(discoveries.value) }
  }

  function markTransmitted(archiveId: string): void {
    const d = discoveries.value.find(r => r.archiveId === archiveId)
    if (d) { d.transmitted = true; d.queuedForTransmission = false; persist(discoveries.value) }
  }

  const pendingTransmission = computed(() => discoveries.value.filter(d => d.queuedForTransmission && !d.transmitted))

  function resetForTests(): void {
    discoveries.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  return { discoveries, pendingTransmission, archiveDiscovery, queueForTransmission, dequeueFromTransmission, markTransmitted, resetForTests }
}
