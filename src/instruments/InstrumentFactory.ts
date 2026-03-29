// src/instruments/InstrumentFactory.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import { CONTROLLER_REGISTRY } from './InstrumentRegistry'

export interface InstrumentTuple {
  def: InstrumentDef
  controller: InstrumentController
  /** Null in Plan A — populated by Plan B when the live system is wired. */
  tickHandler: null
}

/**
 * Creates an InstrumentTuple from a definition.
 * Throws if the controllerType is not registered — fail fast during development.
 *
 * Plan A: tickHandler is always null.
 * Plan B: this function will accept a context arg and resolve tickHandler from TICK_HANDLER_REGISTRY.
 */
export function createInstrumentTuple(def: InstrumentDef): InstrumentTuple {
  const Ctor = CONTROLLER_REGISTRY[def.controllerType]
  if (!Ctor) {
    throw new Error(
      `[InstrumentFactory] Unknown controllerType "${def.controllerType}" for instrument "${def.id}". ` +
      `Register it in CONTROLLER_REGISTRY.`
    )
  }
  const controller = new Ctor()
  return { def, controller, tickHandler: null }
}
