// src/instruments/InstrumentFactory.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { CONTROLLER_REGISTRY, TICK_HANDLER_REGISTRY } from './InstrumentRegistry'

export interface TickHandler {
  tick(delta: number, env: InstrumentEnvironment): void
  dispose(): void
}

export interface InstrumentTuple {
  def: InstrumentDef
  controller: InstrumentController
  tickHandler: TickHandler | null
}

/**
 * Creates an InstrumentTuple from a definition.
 * Resolves controllerType from CONTROLLER_REGISTRY (required — throws if missing).
 * Resolves tickHandlerType from TICK_HANDLER_REGISTRY (optional — null if missing).
 * Sets controller.tier from def.tier (single source of truth).
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
  controller.tier = def.tier

  const handlerFactory = TICK_HANDLER_REGISTRY[def.tickHandlerType]
  const tickHandler = handlerFactory ? handlerFactory(controller) : null

  return { def, controller, tickHandler }
}
