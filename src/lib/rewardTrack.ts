import type { ProfileModifiers } from '@/composables/usePlayerProfile'

export interface RewardTrackMilestone {
  sp: number
  id: string
  icon: string
  title: string
  description: string
  type: string               // 'REWARD TRACK' | 'PERK'
  modifierKey?: keyof ProfileModifiers
  modifierValue?: number     // percentage offset (e.g. 0.05 = +5%, -0.05 = -5%)
  perkId?: string            // e.g. 'night-vision', 'second-wind'
}

/**
 * Iterate sorted milestones up to `lifetimeSp`, sum `modifierValue` into
 * matching `modifierKey`. Returns partial with only non-zero keys.
 */
export function computeRewardTrackModifiers(
  lifetimeSp: number,
  milestones: RewardTrackMilestone[],
): Partial<ProfileModifiers> {
  const sorted = [...milestones].sort((a, b) => a.sp - b.sp)
  const accum: Partial<Record<keyof ProfileModifiers, number>> = {}

  for (const m of sorted) {
    if (m.sp > lifetimeSp) break
    if (m.modifierKey && m.modifierValue !== undefined) {
      accum[m.modifierKey] = (accum[m.modifierKey] ?? 0) + m.modifierValue
    }
  }

  // Strip zero-valued keys
  const result: Partial<ProfileModifiers> = {}
  for (const [key, value] of Object.entries(accum)) {
    if (value !== 0) {
      result[key as keyof ProfileModifiers] = value
    }
  }
  return result
}

/**
 * Return milestones where `sp` is in the half-open interval (prevSp, nextSp].
 */
export function milestonesUnlockedBetween(
  prevSp: number,
  nextSp: number,
  milestones: RewardTrackMilestone[],
): RewardTrackMilestone[] {
  return milestones.filter(m => m.sp > prevSp && m.sp <= nextSp)
}

/**
 * Return set of `perkId` values for all milestones with `sp <= lifetimeSp`
 * that have a `perkId`.
 */
export function perksUnlockedAt(
  lifetimeSp: number,
  milestones: RewardTrackMilestone[],
): Set<string> {
  const perks = new Set<string>()
  for (const m of milestones) {
    if (m.sp <= lifetimeSp && m.perkId) {
      perks.add(m.perkId)
    }
  }
  return perks
}
