import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { RoverWheelsController } from '@/three/instruments/RoverWheelsController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'

export function createRoverWheelsTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const wheels = controller as RoverWheelsController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const perf = resolveInstrumentPerformance(wheels.tier, wheels.durabilityFactor, env, mod('movementSpeed'), mod('instrumentAccuracy'))
      wheels.movementSpeedMod = perf.speedFactor
    },
    dispose(): void {},
  }
}
