import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { AntennaLGController } from '@/three/instruments/AntennaLGController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createAntennaLGTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const lga = controller as AntennaLGController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(lga.tier, lga.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      lga.accuracyMod = perf.accuracyFactor
    },
    dispose(): void {},
  }
}
