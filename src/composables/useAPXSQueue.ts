import { ref, computed } from 'vue'
import type { APXSComposition, APXSGrade, APXSElementId } from '@/lib/apxsComposition'

export interface APXSQueueEntry {
  id: string
  rockMeshUuid: string
  rockType: string
  rockLabel: string
  grade: APXSGrade
  accuracy: number
  trueComposition: APXSComposition
  measuredComposition: APXSComposition
  anomalies: APXSElementId[]
  caughtElements: string[] // serializable version of Set
  sp: number
  remainingTimeSec: number
  totalTimeSec: number
  startedAtSol: number
}

const queue = ref<APXSQueueEntry[]>([])
const results = ref<APXSQueueEntry[]>([])

function newId(): string {
  return `apxs-q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function useAPXSQueue() {
  const isProcessing = computed(() => queue.value.length > 0)
  const currentExperiment = computed(() => queue.value[0] ?? null)
  const unacknowledgedCount = computed(() => results.value.length)

  function enqueue(entry: Omit<APXSQueueEntry, 'id'>): void {
    queue.value = [...queue.value, { ...entry, id: newId() }]
  }

  /** Tick the front-of-queue timer. Returns the entry if it just completed, null otherwise. */
  function tick(deltaSec: number): APXSQueueEntry | null {
    if (queue.value.length === 0) return null
    const next = [...queue.value]
    const current = { ...next[0] }
    current.remainingTimeSec = Math.max(0, current.remainingTimeSec - deltaSec)
    if (current.remainingTimeSec <= 0) {
      next.shift()
      queue.value = next
      results.value = [...results.value, current]
      return current
    }
    next[0] = current
    queue.value = next
    return null
  }

  /** Pop the oldest unacknowledged result. */
  function acknowledgeOldest(): APXSQueueEntry | null {
    if (results.value.length === 0) return null
    const [oldest, ...rest] = results.value
    results.value = rest
    return oldest
  }

  return {
    queue,
    results,
    isProcessing,
    currentExperiment,
    unacknowledgedCount,
    enqueue,
    tick,
    acknowledgeOldest,
  }
}
