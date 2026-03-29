// src/instruments/tickHandlers/chemCamTickHandler.ts
import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { ChemCamController } from '@/three/instruments/ChemCamController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createChemCamTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const cc = controller as ChemCamController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(cc.tier, cc.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      cc.durationMultiplier = 1 / perf.speedFactor
      cc.accuracyMod = perf.accuracyFactor
    },
    dispose(): void {},
  }
}
