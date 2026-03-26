import { ref, computed, watchEffect, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { milestonesUnlockedBetween } from '@/lib/rewardTrack'
import type { RewardTrackMilestone } from '@/lib/rewardTrack'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import type AchievementBanner from '@/components/AchievementBanner.vue'
import { useDSNArchive } from '@/composables/useDSNArchive'

interface Achievement {
  id: string
  icon: string
  title: string
  description: string
  type: string
}

interface LibsAchievement extends Achievement {
  sp: number
}

interface DanAchievement extends Achievement {
  event: string
}

interface SurvivalAchievement extends Achievement {
  minSol: number
  spReward: number
}

type EventAchievement = {
  id: string
  event: string
  icon: string
  title: string
  description: string
  type: string
}

/**
 * Dependencies for achievement JSON loading, ChemCam SP thresholds, reward-track milestones, and survival sol gates.
 */
export interface MartianSiteAchievementsOptions {
  achievementRef: Ref<InstanceType<typeof AchievementBanner> | null>
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  chemcamSP: Ref<number>
  totalSP: Ref<number>
  marsSol: Ref<number>
  rewardTrackMilestones: Ref<RewardTrackMilestone[]>
  rewardTrackLoaded: Ref<boolean>
  unlockedTrackIds: Ref<string[]>
  rewardTrackPrevSP: Ref<number>
  loadRewardTrack: (milestones: RewardTrackMilestone[]) => void | Promise<void>
  trackModifiers: ComputedRef<Partial<ProfileModifiers>>
  applyRewardTrack: (partial: Partial<ProfileModifiers>) => void
  awardSurvival: (detail: string, baseSp: number) => SPGain
}

/**
 * Loads `/data/achievements.json`, wires ChemCam SP / reward-track / survival watchers, and exposes trigger helpers
 * for DAN, SAM, and APXS event achievements used by the Mars site controller and SAM/APXS handlers.
 */
export function useMartianSiteAchievements(opts: MartianSiteAchievementsOptions) {
  const {
    achievementRef,
    sampleToastRef,
    chemcamSP,
    totalSP,
    marsSol,
    rewardTrackMilestones,
    rewardTrackLoaded,
    unlockedTrackIds,
    rewardTrackPrevSP,
    loadRewardTrack,
    trackModifiers,
    applyRewardTrack,
    awardSurvival,
  } = opts

  const libsAchievements = ref<LibsAchievement[]>([])
  const danAchievements = ref<DanAchievement[]>([])
  const survivalAchievements = ref<SurvivalAchievement[]>([])
  const samAchievementsData = ref<EventAchievement[]>([])
  const apxsAchievementsData = ref<EventAchievement[]>([])
  const dsnAchievementsData = ref<EventAchievement[]>([])

  const unlockedAchievementIds = ref<string[]>([])

  const totalAchievementCount = computed(
    () =>
      libsAchievements.value.length +
      danAchievements.value.length +
      survivalAchievements.value.length +
      samAchievementsData.value.length +
      apxsAchievementsData.value.length +
      dsnAchievementsData.value.length +
      rewardTrackMilestones.value.length,
  )
  const unlockedAchievementCount = computed(() => unlockedAchievementIds.value.length)

  fetch('/data/achievements.json')
    .then(r => r.json())
    .then(
      (data: {
        'libs-calibration'?: LibsAchievement[]
        'dan-prospecting'?: DanAchievement[]
        'mars-survival'?: SurvivalAchievement[]
        'sam-analysis'?: EventAchievement[]
        'apxs-analysis'?: EventAchievement[]
        'dsn-archaeology'?: EventAchievement[]
        'reward-track'?: RewardTrackMilestone[]
      }) => {
        libsAchievements.value = data['libs-calibration'] ?? []
        danAchievements.value = data['dan-prospecting'] ?? []
        survivalAchievements.value = data['mars-survival'] ?? []
        samAchievementsData.value = data['sam-analysis'] ?? []
        apxsAchievementsData.value = data['apxs-analysis'] ?? []
        dsnAchievementsData.value = data['dsn-archaeology'] ?? []
        if (data['reward-track']) void loadRewardTrack(data['reward-track'])
      },
    )
    .catch(() => {})

  function triggerDanAchievement(event: string): void {
    for (const ach of danAchievements.value) {
      if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
        unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
        achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
      }
    }
  }

  function triggerSamAchievement(event: string): void {
    for (const ach of samAchievementsData.value) {
      if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
        unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
        achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
      }
    }
  }

  function triggerAPXSAchievement(event: string): void {
    for (const ach of apxsAchievementsData.value) {
      if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
        unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
        achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
      }
    }
  }

  function triggerDSNAchievement(event: string): void {
    for (const ach of dsnAchievementsData.value) {
      if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
        unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
        achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
      }
    }
  }

  // DSN Archaeology achievement watcher
  const dsn = useDSNArchive()
  watch(() => dsn.discoveries.value.length, (count) => {
    if (count === 0) return
    if (count >= 1) triggerDSNAchievement('first-transmission')
    if (count >= 10) triggerDSNAchievement('ten-transmissions')

    // Per-sender completion
    const completions = dsn.senderCompletions.value
    for (const [key, { found, total }] of Object.entries(completions)) {
      if (total > 0 && found >= total) triggerDSNAchievement(`sender-${key}`)
    }

    // Corrupted fragments
    if (dsn.corruptedAllFound.value) triggerDSNAchievement('corrupted-all')

    // Archive complete (all 38 colonist logs excluding TX-039)
    const { found, total } = dsn.colonistCount.value
    if (found >= total && total > 0) triggerDSNAchievement('archive-complete')

    // TX-039 read
    if (dsn.tx039Read.value) triggerDSNAchievement('tx039-read')
  })

  // TX-039 read needs its own watcher since reading doesn't change discoveries length
  watch(() => dsn.tx039Read.value, (isRead) => {
    if (isRead) triggerDSNAchievement('tx039-read')
  })

  watchEffect(() => {
    const sp = chemcamSP.value
    for (const ach of libsAchievements.value) {
      if (sp >= ach.sp && !unlockedAchievementIds.value.includes(ach.id)) {
        unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
        achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
      }
    }
  })

  watchEffect(() => {
    if (!rewardTrackLoaded.value || rewardTrackMilestones.value.length === 0) return
    const sp = totalSP.value
    const prev = rewardTrackPrevSP.value
    if (sp <= prev) return

    const crossed = milestonesUnlockedBetween(prev, sp, rewardTrackMilestones.value)
    for (const m of crossed) {
      if (!unlockedTrackIds.value.includes(m.id)) {
        unlockedTrackIds.value = [...unlockedTrackIds.value, m.id]
        unlockedAchievementIds.value = [...unlockedAchievementIds.value, m.id]
        achievementRef.value?.show(m.icon, m.title, m.description, m.type)
      }
    }
    rewardTrackPrevSP.value = sp
  })

  watchEffect(() => {
    applyRewardTrack(trackModifiers.value)
  })

  watchEffect(() => {
    const sol = marsSol.value
    void survivalAchievements.value
    const pending = survivalAchievements.value
      .filter((a) => sol >= a.minSol && !unlockedAchievementIds.value.includes(a.id))
      .sort((a, b) => a.minSol - b.minSol)
    for (const ach of pending) {
      unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
      const gain = awardSurvival(`Survival: ${ach.title}`, ach.spReward)
      achievementRef.value?.show(ach.icon, ach.title, `${ach.description} (+${gain.amount} SP)`, ach.type)
      sampleToastRef.value?.showSP(gain.amount, 'SURVIVAL', gain.bonus)
    }
  })

  return {
    libsAchievements,
    danAchievements,
    survivalAchievements,
    samAchievementsData,
    apxsAchievementsData,
    unlockedAchievementIds,
    totalAchievementCount,
    unlockedAchievementCount,
    triggerDanAchievement,
    triggerSamAchievement,
    triggerAPXSAchievement,
    dsnAchievementsData,
    triggerDSNAchievement,
  }
}
