import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { AntennaUHFController } from '@/three/instruments/AntennaUHFController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createAntennaUHFTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const uhf = controller as AntennaUHFController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(uhf.tier, uhf.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      uhf.accuracyMod = perf.accuracyFactor
    },
    dispose(): void {},
  }
}
