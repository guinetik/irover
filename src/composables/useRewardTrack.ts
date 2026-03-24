import { ref, computed } from 'vue'
import type { RewardTrackMilestone } from '@/lib/rewardTrack'
import {
  computeRewardTrackModifiers,
  perksUnlockedAt,
} from '@/lib/rewardTrack'
import { useSciencePoints } from './useSciencePoints'

// Singleton state
const milestones = ref<RewardTrackMilestone[]>([])
const loaded = ref(false)
const prevSP = ref(0)
const unlockedTrackIds = ref<string[]>([])

export function useRewardTrack() {
  const { totalSP } = useSciencePoints()

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
