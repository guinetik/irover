// src/instruments/__tests__/InstrumentTickController.test.ts
import { describe, it, expect, vi } from 'vitest'
import { InstrumentTickController } from '../InstrumentTickController'
import { createInstrumentTuple } from '../InstrumentFactory'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

const CALM_ENV: InstrumentEnvironment = { thermalZone: 'OPTIMAL', stormLevel: 0, radiationLevel: 0 }

function makeController(): InstrumentTickController {
  const tuples = instruments.map(def => createInstrumentTuple(def))
  return new InstrumentTickController(tuples)
}

describe('InstrumentTickController', () => {
  it('getControllerById returns controller for known id', () => {
    const ctrl = makeController()
    const dan = ctrl.getControllerById('dan')
    expect(dan).toBeDefined()
  })

  it('getControllerById returns undefined for unknown id', () => {
    const ctrl = makeController()
    expect(ctrl.getControllerById('does-not-exist')).toBeUndefined()
  })

  it('getControllerBySlot returns controller for known slot', () => {
    const ctrl = makeController()
    const slot5 = ctrl.getControllerBySlot(5)
    expect(slot5).toBeDefined()
  })

  it('getDefBySlot returns def with matching slot', () => {
    const ctrl = makeController()
    const def = ctrl.getDefBySlot(5)
    expect(def?.id).toBe('dan')
  })

  it('getDefs returns all defs in slot order', () => {
    const ctrl = makeController()
    const defs = ctrl.getDefs()
    expect(defs.length).toBe(14)
    for (let i = 1; i < defs.length; i++) {
      expect(defs[i]!.slot).toBeGreaterThan(defs[i - 1]!.slot)
    }
  })

  it('tick does not throw when all tickHandlers are null', () => {
    const ctrl = makeController()
    expect(() => ctrl.tick(0.016, CALM_ENV)).not.toThrow()
  })

  it('tick forwards to tickHandlers that have a tick method', () => {
    const tuples = instruments.slice(0, 1).map(def => createInstrumentTuple(def))
    const fakeTick = vi.fn()
    ;(tuples[0] as any).tickHandler = { tick: fakeTick, dispose: vi.fn() }
    const ctrl = new InstrumentTickController(tuples)
    ctrl.tick(0.016, CALM_ENV)
    expect(fakeTick).toHaveBeenCalledWith(0.016, CALM_ENV)
  })

  it('dispose calls controller.dispose for all tuples', () => {
    const tuples = instruments.map(def => createInstrumentTuple(def))
    const spies = tuples.map(t => vi.spyOn(t.controller, 'dispose'))
    const ctrl = new InstrumentTickController(tuples)
    ctrl.dispose()
    for (const spy of spies) {
      expect(spy).toHaveBeenCalled()
    }
  })
})
