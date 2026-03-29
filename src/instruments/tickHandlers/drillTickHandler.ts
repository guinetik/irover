// src/instruments/tickHandlers/drillTickHandler.ts
import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import { DrillController } from '@/three/instruments/DrillController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'

export function createDrillTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const drill = controller as DrillController

  return {
    tick(_delta: number): void {
      drill.accuracyMod = mod('instrumentAccuracy')
    },
    dispose(): void {},
  }
}
