import { ref } from 'vue'
import type { ArchivedVent } from '@/types/ventArchive'

const STORAGE_KEY = 'mars-vent-archive-v1'

function loadFromStorage(): ArchivedVent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(data: ArchivedVent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const vents = ref<ArchivedVent[]>(loadFromStorage())

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `vent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useVentArchive() {
  function archiveVent(params: Omit<ArchivedVent, 'archiveId'>): ArchivedVent {
    const entry: ArchivedVent = { archiveId: generateId(), ...params }
    vents.value = [...vents.value, entry]
    persist(vents.value)
    return entry
  }

  function getVentsForSite(siteId: string): ArchivedVent[] {
    return vents.value.filter(v => v.siteId === siteId)
  }

  function hasActiveVent(siteId: string, ventType: 'co2' | 'methane'): boolean {
    return vents.value.some(v => v.siteId === siteId && v.ventType === ventType)
  }

  function resetForTests(): void {
    vents.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  return { vents, archiveVent, getVentsForSite, hasActiveVent, resetForTests }
}
