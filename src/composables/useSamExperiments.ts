import { ref, computed } from 'vue'
import type { SAMExperimentsFile, SAMAnalysisMode, SAMDiscovery, DiscoveryRarity } from '@/types/samExperiments'

const data = ref<SAMExperimentsFile | null>(null)
let loaded = false

async function ensureLoaded(): Promise<SAMExperimentsFile> {
  if (data.value) return data.value
  if (!loaded) {
    loaded = true
    const res = await fetch('/data/sam-experiments.json')
    data.value = await res.json()
  }
  return data.value!
}

export function useSamExperiments() {
  const modes = computed(() => data.value?.modes ?? [])
  const discoveries = computed(() => data.value?.discoveries ?? [])

  function unlockedModes(totalSP: number): SAMAnalysisMode[] {
    return modes.value.filter(m => totalSP >= m.unlockSP)
  }

  function possibleDiscoveries(modeId: string, sampleId: string): SAMDiscovery[] {
    return discoveries.value.filter(d =>
      d.mode === modeId && d.rockTypes.includes(sampleId),
    )
  }

  function qualityMultiplier(quality: number): number {
    const table = data.value?.qualityBonuses ?? {}
    const thresholds = Object.keys(table).map(Number).sort((a, b) => b - a)
    for (const t of thresholds) {
      if (quality >= t) return table[String(t)]
    }
    return 0.5
  }

  function multiModeMultiplier(modesCompleted: number): number {
    const table = data.value?.multiModeBonus ?? {}
    return table[String(modesCompleted)] ?? 1.0
  }

  function rollDiscovery(modeId: string, sampleId: string, quality: number, accuracyMod = 1.0): {
    discovery: SAMDiscovery
    spReward: number
    sideProducts: { itemId: string; quantity: number }[]
  } | null {
    const yieldTable = data.value?.yieldTable
    if (!yieldTable) return null
    const weights = yieldTable[sampleId]?.[modeId]
    if (!weights) return null

    // Scale rare/legendary weights by instrumentAccuracy modifier, redistribute excess from common
    const boostedLegendary = weights.legendary * accuracyMod
    const boostedRare = weights.rare * accuracyMod
    const legendaryGain = boostedLegendary - weights.legendary
    const rareGain = boostedRare - weights.rare
    const totalGain = legendaryGain + rareGain
    const adjustedCommon = Math.max(0, weights.common - totalGain)
    const adjustedUncommon = totalGain > weights.common
      ? Math.max(0, weights.uncommon - (totalGain - weights.common))
      : weights.uncommon
    const adjustedWeights: Record<DiscoveryRarity, number> = {
      legendary: boostedLegendary,
      rare: boostedRare,
      uncommon: adjustedUncommon,
      common: adjustedCommon,
    }

    // Roll rarity — check from rarest to most common
    const roll = Math.random() * 100
    let rarity: DiscoveryRarity = 'common'
    let cumulative = 0
    for (const r of ['legendary', 'rare', 'uncommon', 'common'] as DiscoveryRarity[]) {
      cumulative += adjustedWeights[r]
      if (roll < cumulative) { rarity = r; break }
    }

    // Quality can upgrade rarity by one tier (95%+ = 15% chance)
    if (quality >= 95 && Math.random() < 0.15) {
      const upgrade: Record<string, DiscoveryRarity> = { common: 'uncommon', uncommon: 'rare', rare: 'legendary' }
      rarity = upgrade[rarity] ?? rarity
    }

    // Find matching discoveries for this mode + sample + rarity
    const candidates = discoveries.value.filter(d =>
      d.mode === modeId && d.rockTypes.includes(sampleId) && d.rarity === rarity,
    )
    if (candidates.length === 0) {
      // Fallback: any discovery of this rarity for this mode
      const fallback = discoveries.value.filter(d => d.mode === modeId && d.rarity === rarity)
      if (fallback.length === 0) return null
      const pick = fallback[Math.floor(Math.random() * fallback.length)]
      return { discovery: pick, spReward: Math.round(pick.sp * qualityMultiplier(quality)), sideProducts: pick.sideProducts }
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    return { discovery: pick, spReward: Math.round(pick.sp * qualityMultiplier(quality)), sideProducts: pick.sideProducts }
  }

  return {
    data,
    modes,
    discoveries,
    ensureLoaded,
    unlockedModes,
    possibleDiscoveries,
    qualityMultiplier,
    multiModeMultiplier,
    rollDiscovery,
  }
}
