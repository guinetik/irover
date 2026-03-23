import { ref, computed } from 'vue'
import type { DiscoveryRarity } from '@/types/samExperiments'

export interface SamQueueEntry {
  id: string
  modeId: string
  modeName: string
  sampleId: string
  sampleLabel: string
  quality: number
  discoveryId: string
  discoveryName: string
  discoveryRarity: DiscoveryRarity
  discoveryDescription: string
  spReward: number
  sideProducts: { itemId: string; quantity: number }[]
  remainingTimeSec: number
  totalTimeSec: number
  startedAtSol: number
  powerW: number
}

const queue = ref<SamQueueEntry[]>([])
const results = ref<SamQueueEntry[]>([])

function newId(): string {
  return `sam-q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function useSamQueue() {
  const isProcessing = computed(() => queue.value.length > 0)
  const currentExperiment = computed(() => queue.value[0] ?? null)
  const unacknowledgedCount = computed(() => results.value.length)

  function enqueue(entry: Omit<SamQueueEntry, 'id'>): void {
    queue.value = [...queue.value, { ...entry, id: newId() }]
  }

  /** Tick the front-of-queue timer. Returns the entry if it just completed, null otherwise. */
  function tick(deltaSec: number): SamQueueEntry | null {
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
  function acknowledgeOldest(): SamQueueEntry | null {
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
