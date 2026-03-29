import { useInstrumentProvider } from './useInstrumentProvider'
import {
  buildSpeedBreakdown,
  type SpeedBreakdown,
  type ProfileSource,
  type SpeedBuffEntry,
} from '@/lib/instrumentSpeedBreakdown'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { InstrumentStatDef } from '@/types/instruments'

export interface ResolvedStat {
  stat: InstrumentStatDef
  breakdown: SpeedBreakdown
}

export type ResolvedInstrumentStats = ResolvedStat[]

export interface ResolvedInstrumentStatsInput {
  activeSlot: number
  activeInstrumentSlots: number[]
  archetype: ProfileSource | null
  foundation: ProfileSource | null
  patron: ProfileSource | null
  trackModifiers: Partial<ProfileModifiers>
  thermalZone?: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  stormLevel?: number
  radiationLevel?: number
}

/**
 * Resolves instrument stats from InstrumentDef.stats[] into display-ready breakdowns.
 *
 * 1. Looks up the definition by slot via useInstrumentProvider.
 * 2. Collects passive provides[] bonuses from active instruments as display extras.
 * 3. Calls buildSpeedBreakdown per stat with profile + environment + tier.
 */
export function resolveInstrumentStats(input: ResolvedInstrumentStatsInput): ResolvedInstrumentStats {
  const { defBySlot } = useInstrumentProvider()
  const def = defBySlot(input.activeSlot)
  if (!def || def.stats.length === 0) return []

  // Collect passive bonuses from active instruments
  const passiveExtras = new Map<keyof ProfileModifiers, SpeedBuffEntry[]>()
  for (const slot of input.activeInstrumentSlots) {
    const providerDef = defBySlot(slot)
    if (!providerDef?.provides) continue
    for (const bonus of providerDef.provides) {
      const list = passiveExtras.get(bonus.key) ?? []
      const pct = Math.round(bonus.value * 100)
      list.push({
        label: bonus.label,
        value: pct >= 0 ? `+${pct}%` : `${pct}%`,
        color: bonus.value > 0 ? '#5dc9a5' : '#e05030',
      })
      passiveExtras.set(bonus.key, list)
    }
  }

  return def.stats.map(stat => ({
    stat,
    breakdown: buildSpeedBreakdown({
      modifierKey: stat.key,
      archetype: input.archetype,
      foundation: input.foundation,
      patron: input.patron,
      trackModifiers: input.trackModifiers,
      thermalZone: input.thermalZone,
      stormLevel: input.stormLevel,
      instrumentTier: def.tier,
      radiationLevel: input.radiationLevel,
      extras: passiveExtras.get(stat.key),
    }),
  }))
}
