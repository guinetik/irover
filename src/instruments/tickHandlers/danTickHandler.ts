// src/instruments/tickHandlers/danTickHandler.ts
import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { DANController } from '@/three/instruments/DANController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createDanTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const dan = controller as DANController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(dan.tier, dan.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      dan.accuracyMod = perf.accuracyFactor
      dan.analysisSpeedMod = perf.speedFactor
      dan.scanRadiusMod = mod('danScanRadius')
    },
    dispose(): void {},
  }
}
