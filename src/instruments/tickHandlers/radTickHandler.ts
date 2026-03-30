import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { RADController } from '@/three/instruments/RADController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'

export function createRadTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const rad = controller as RADController

  return {
    tick(_delta: number, _env: InstrumentEnvironment): void {
      rad.toleranceMod = mod('radiationTolerance') - 1
    },
    dispose(): void {},
  }
}
