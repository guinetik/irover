// src/instruments/InstrumentTickController.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentTuple } from './InstrumentFactory'

export class InstrumentTickController {
  private readonly tuples: InstrumentTuple[]

  constructor(tuples: InstrumentTuple[]) {
    this.tuples = tuples
  }

  /**
   * Forward tick to all registered tick handlers.
   * No-op in Plan A (all tickHandlers are null).
   */
  tick(delta: number): void {
    for (const tuple of this.tuples) {
      if (tuple.tickHandler && typeof (tuple.tickHandler as any).tick === 'function') {
        ;(tuple.tickHandler as any).tick(delta)
      }
    }
  }

  /** Look up controller by instrument id (e.g. "dan") */
  getControllerById(id: string): InstrumentController | undefined {
    return this.tuples.find(t => t.def.id === id)?.controller
  }

  /** Look up controller by slot number */
  getControllerBySlot(slot: number): InstrumentController | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.controller
  }

  /** Look up def by slot number */
  getDefBySlot(slot: number): InstrumentDef | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.def
  }

  /** All defs, in slot order */
  getDefs(): InstrumentDef[] {
    return [...this.tuples].sort((a, b) => a.def.slot - b.def.slot).map(t => t.def)
  }

  dispose(): void {
    for (const tuple of this.tuples) {
      tuple.controller.dispose()
      if (tuple.tickHandler && typeof (tuple.tickHandler as any).dispose === 'function') {
        ;(tuple.tickHandler as any).dispose()
      }
    }
  }
}
