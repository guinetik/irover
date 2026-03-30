// src/instruments/tickHandlers/drillTickHandler.ts
import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import type { InstrumentDef } from '@/types/instruments'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import { DrillController } from '@/three/instruments/DrillController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'
import instrumentsRaw from '../../../public/data/instruments.json'

/**
 * Search all instrument defs for a chainBonus entry whose key matches,
 * and return its baseValue. Returns 0 when not found.
 */
function findChainBonusBase(defs: InstrumentDef[], key: keyof ProfileModifiers): number {
  for (const def of defs) {
    if (!def.chainBonuses) continue
    for (const bonus of def.chainBonuses) {
      if (bonus.key === key) return bonus.baseValue
    }
  }
  return 0
}

const allDefs = instrumentsRaw.instruments as InstrumentDef[]

export function createDrillTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const drill = controller as DrillController

  // Read chain bonus base values from instrument defs (once at creation)
  drill.chainDrillBonusBase = findChainBonusBase(allDefs, 'chainDrillBonus')
  drill.chainLootBonusBase = findChainBonusBase(allDefs, 'chainLootBonus')
  drill.apxsTraceDropBase = findChainBonusBase(allDefs, 'instrumentAccuracy')

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(drill.tier, drill.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      drill.drillDurationMultiplier = 1 / perf.speedFactor
      drill.accuracyMod = perf.accuracyFactor
    },
    dispose(): void {},
  }
}
