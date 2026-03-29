import type { MissionReward } from '@/types/missions'
import { isOrbitalDropItemId } from '@/types/orbitalDrop'

/**
 * Returns mission reward stacks that must be delivered via orbital drop.
 * Component-catalog items use drops; mined rocks and other categories stay on direct inventory grants.
 *
 * @param reward - Mission `reward` block from catalog data
 * @returns Stacks to spawn as payload (caller positions spawns near the rover)
 */
export function rewardItemsForOrbitalDrop(
  reward: MissionReward,
): Array<{ id: string; quantity: number }> {
  if (!reward.items?.length) return []
  const out: Array<{ id: string; quantity: number }> = []
  for (const item of reward.items) {
    if (!isOrbitalDropItemId(item.id)) continue
    out.push({ id: item.id, quantity: Math.max(1, Math.floor(item.quantity ?? 1)) })
  }
  return out
}
