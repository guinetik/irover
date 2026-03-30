import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { SAMController } from '@/three/instruments/SAMController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createSAMTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const sam = controller as SAMController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(sam.tier, sam.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      sam.perfSpeedFactor = perf.speedFactor
    },
    dispose(): void {},
  }
}
