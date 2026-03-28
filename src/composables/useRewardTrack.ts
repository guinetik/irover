import { ref, computed, watch } from 'vue'
import type { RewardTrackMilestone } from '@/lib/rewardTrack'
import {
  computeRewardTrackModifiers,
  perksUnlockedAt,
} from '@/lib/rewardTrack'
import { useSciencePoints } from './useSciencePoints'

const REWARD_TRACK_STORAGE_KEY = 'mars-reward-track-v1'

const { totalSP } = useSciencePoints()

function loadRewardTrackStorage(): { unlockedTrackIds: string[]; prevSP: number } | null {
  try {
    const raw = localStorage.getItem(REWARD_TRACK_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as { unlockedTrackIds?: unknown; prevSP?: unknown }
    const ids = Array.isArray(data.unlockedTrackIds)
      ? data.unlockedTrackIds.filter((x): x is string => typeof x === 'string')
      : []
    const prev =
      typeof data.prevSP === 'number' && Number.isFinite(data.prevSP)
        ? Math.max(0, data.prevSP)
        : 0
    return { unlockedTrackIds: ids, prevSP: prev }
  } catch {
    return null
  }
}

function persistRewardTrackStorage(unlockedTrackIds: string[], prevSP: number): void {
  try {
    localStorage.setItem(
      REWARD_TRACK_STORAGE_KEY,
      JSON.stringify({ unlockedTrackIds, prevSP }),
    )
  } catch {
    /* ignore */
  }
}

const storedRT = loadRewardTrackStorage()

// Singleton state
const milestones = ref<RewardTrackMilestone[]>([])
const loaded = ref(false)
/** Last SP value used by milestone-crossing toasts — persisted so reload does not replay banners. */
const prevSP = ref(storedRT?.prevSP ?? totalSP.value)
const unlockedTrackIds = ref<string[]>(storedRT?.unlockedTrackIds ?? [])

let rewardTrackPersistReady = false
watch(
  [unlockedTrackIds, prevSP],
  () => {
    if (!rewardTrackPersistReady) return
    persistRewardTrackStorage(unlockedTrackIds.value, prevSP.value)
  },
  { deep: true },
)

export function useRewardTrack() {
  if (!rewardTrackPersistReady) {
    rewardTrackPersistReady = true
    persistRewardTrackStorage(unlockedTrackIds.value, prevSP.value)
  }

  async function loadRewardTrack(data: RewardTrackMilestone[]): Promise<void> {
    milestones.value = data
    loaded.value = true
  }

  const trackModifiers = computed(() =>
    computeRewardTrackModifiers(totalSP.value, milestones.value),
  )

  const unlockedPerks = computed(() =>
    perksUnlockedAt(totalSP.value, milestones.value),
  )

  function hasPerk(perkId: string): boolean {
    return unlockedPerks.value.has(perkId)
  }

  return {
    milestones,
    loaded,
    trackModifiers,
    unlockedPerks,
    unlockedTrackIds,
    prevSP,
    hasPerk,
    loadRewardTrack,
  }
}

/**
 * Clears reward-track toast cursor and unlocked-id list. For unit tests / reset flows.
 */
export function resetRewardTrackForTests(): void {
  rewardTrackPersistReady = false
  prevSP.value = 0
  unlockedTrackIds.value = []
  milestones.value = []
  loaded.value = false
  try {
    localStorage.removeItem(REWARD_TRACK_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
