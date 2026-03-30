import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { HeaterController } from '@/three/instruments/HeaterController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'

export function createHeaterTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const heater = controller as HeaterController

  return {
    tick(_delta: number, _env: InstrumentEnvironment): void {
      heater.efficiencyMod = mod('heaterEfficiency')
    },
    dispose(): void {},
  }
}
