// src/instruments/__tests__/InstrumentFactory.test.ts
import { describe, it, expect } from 'vitest'
import { createInstrumentTuple } from '../InstrumentFactory'
import type { InstrumentDef } from '@/types/instruments'
import instrumentsRaw from '../../../public/data/instruments.json'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

describe('createInstrumentTuple', () => {
  it('returns a tuple with def and controller for every instrument in JSON; tickHandler is null or a valid TickHandler', () => {
    for (const def of instruments) {
      const tuple = createInstrumentTuple(def)
      expect(tuple.def).toBe(def)
      expect(tuple.controller).toBeDefined()
      if (tuple.tickHandler !== null) {
        expect(typeof tuple.tickHandler.tick).toBe('function')
        expect(typeof tuple.tickHandler.dispose).toBe('function')
      }
    }
  })

  it('controller has expected InstrumentController shape', () => {
    const tuple = createInstrumentTuple(instruments[0]!)
    expect(typeof tuple.controller.attach).toBe('function')
    expect(typeof tuple.controller.dispose).toBe('function')
    expect(typeof tuple.controller.durabilityPct).toBe('number')
  })

  it('throws a clear error for unknown controllerType', () => {
    const badDef: InstrumentDef = {
      ...instruments[0]!,
      id: 'test',
      controllerType: 'NonExistentController',
    }
    expect(() => createInstrumentTuple(badDef)).toThrow(
      'Unknown controllerType "NonExistentController"'
    )
  })
})
