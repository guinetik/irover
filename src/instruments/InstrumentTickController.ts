// src/instruments/InstrumentTickController.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentTuple } from './InstrumentFactory'

export class InstrumentTickController {
  private readonly tuples: InstrumentTuple[]

  constructor(tuples: InstrumentTuple[]) {
    this.tuples = tuples
  }

  tick(delta: number): void {
    for (const tuple of this.tuples) {
      tuple.tickHandler?.tick(delta)
    }
  }

  getControllerById(id: string): InstrumentController | undefined {
    return this.tuples.find(t => t.def.id === id)?.controller
  }

  getControllerBySlot(slot: number): InstrumentController | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.controller
  }

  getDefBySlot(slot: number): InstrumentDef | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.def
  }

  getDefs(): InstrumentDef[] {
    return [...this.tuples].sort((a, b) => a.def.slot - b.def.slot).map(t => t.def)
  }

  dispose(): void {
    for (const tuple of this.tuples) {
      tuple.controller.dispose()
      tuple.tickHandler?.dispose()
    }
  }
}
