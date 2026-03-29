// src/instruments/__tests__/InstrumentRegistry.test.ts
import { describe, it, expect } from 'vitest'
import { CONTROLLER_REGISTRY } from '../InstrumentRegistry'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '@/types/instruments'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

describe('InstrumentRegistry', () => {
  it('every controllerType in instruments.json resolves in CONTROLLER_REGISTRY', () => {
    for (const inst of instruments) {
      const Ctor = CONTROLLER_REGISTRY[inst.controllerType]
      expect(Ctor, `No registry entry for controllerType "${inst.controllerType}" (instrument: ${inst.id})`).toBeDefined()
      expect(typeof Ctor).toBe('function')
    }
  })

  it('controller registry entries are constructors', () => {
    for (const [key, Ctor] of Object.entries(CONTROLLER_REGISTRY)) {
      expect(typeof Ctor, `${key} is not a function`).toBe('function')
    }
  })
})
