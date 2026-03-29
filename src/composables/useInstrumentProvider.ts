// src/composables/useInstrumentProvider.ts
import type { InstrumentDef } from '@/types/instruments'
import { createInstrumentTuple } from '@/instruments/InstrumentFactory'
import { InstrumentTickController } from '@/instruments/InstrumentTickController'
import instrumentsRaw from '../../public/data/instruments.json'

interface InstrumentProviderState {
  defs: InstrumentDef[]
  tickController: InstrumentTickController
}

let _state: InstrumentProviderState | null = null

function createState(): InstrumentProviderState {
  const defs = (instrumentsRaw.instruments as InstrumentDef[])
  const tuples = defs.map(def => createInstrumentTuple(def))
  const tickController = new InstrumentTickController(tuples)
  return { defs, tickController }
}

/**
 * Singleton instrument provider. Loads instruments.json once and caches.
 *
 * Plan A: exposes defs and tickController.
 * tickController.tick() is a no-op in Plan A — wired into the animation loop in Plan B.
 */
export function useInstrumentProvider() {
  if (!_state) {
    _state = createState()
  }

  function defBySlot(slot: number): InstrumentDef | undefined {
    return _state!.defs.find(d => d.slot === slot)
  }

  return {
    defs: _state.defs,
    defBySlot,
    tickController: _state.tickController,
  }
}

/** Reset singleton — for tests only. */
export function _resetInstrumentProvider(): void {
  _state = null
}
