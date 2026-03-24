import { ref } from 'vue'
import type { APXSComposition, APXSGrade, APXSElementId } from '@/lib/apxsComposition'
import type { RockTypeId } from '@/three/terrain/RockTypes'

export interface ArchivedAPXSAnalysis {
  archiveId: string
  rockType: RockTypeId
  rockLabel: string
  grade: APXSGrade
  accuracy: number
  trueComposition: APXSComposition
  measuredComposition: APXSComposition
  anomalies: APXSElementId[]
  spEarned: number
  capturedSol: number
  capturedAtMs: number
  siteId: string
}

const STORAGE_KEY = 'mars-apxs-archive-v1'

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `apxs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): ArchivedAPXSAnalysis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is ArchivedAPXSAnalysis =>
        r && typeof r === 'object' && typeof r.archiveId === 'string',
    )
  } catch {
    return []
  }
}

function saveToStorage(rows: ArchivedAPXSAnalysis[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    /* quota errors are silently ignored */
  }
}

const analyses = ref<ArchivedAPXSAnalysis[]>(loadFromStorage())

export function resetAPXSArchiveForTests(): void {
  analyses.value = []
}

export function useAPXSArchive() {
  function archiveAnalysis(
    params: Omit<ArchivedAPXSAnalysis, 'archiveId' | 'capturedAtMs'>,
  ): ArchivedAPXSAnalysis {
    const row: ArchivedAPXSAnalysis = {
      ...params,
      archiveId: newId(),
      capturedAtMs: Date.now(),
    }
    const next = [...analyses.value, row]
    analyses.value = next
    saveToStorage(next)
    return row
  }

  return { analyses, archiveAnalysis }
}
