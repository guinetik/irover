import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { APXSController } from '@/three/instruments/APXSController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createAPXSTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const apxs = controller as APXSController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(apxs.tier, apxs.durabilityFactor, env, mod('analysisSpeed'), mod('instrumentAccuracy'))
      apxs.perfSpeedFactor = perf.speedFactor
      apxs.perfThermalMult = perf.thermalMult
      apxs.perfThermalZone = perf.thermalZone
    },
    dispose(): void {},
  }
}
