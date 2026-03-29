// src/instruments/tickHandlers/mastCamTickHandler.ts
import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { MastCamController } from '@/three/instruments/MastCamController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createMastCamTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const mc = controller as MastCamController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(mc.tier, mc.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      mc.durationMultiplier = 1 / perf.speedFactor
      mc.surveyRange = 5 * perf.accuracyFactor
    },
    dispose(): void {},
  }
}
