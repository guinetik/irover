import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'

export function createRadTickHandler(_controller: InstrumentController): TickHandler {
  return {
    tick(_delta: number, _env: InstrumentEnvironment): void {
      // Nothing to drive per-frame for this passive instrument
    },
    dispose(): void {},
  }
}
