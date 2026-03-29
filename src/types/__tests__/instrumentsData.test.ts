// src/types/__tests__/instrumentsData.test.ts
import { describe, it, expect } from 'vitest'
import instrumentsRaw from '../../../public/data/instruments.json'
import type { InstrumentDef } from '../instruments'

const instruments = instrumentsRaw.instruments as InstrumentDef[]

// All valid ProfileModifiers keys — must stay in sync with usePlayerProfile.ts
const VALID_MODIFIER_KEYS = [
  'movementSpeed',
  'analysisSpeed',
  'powerConsumption',
  'heaterDraw',
  'spYield',
  'inventorySpace',
  'instrumentAccuracy',
  'repairCost',
  'upgradeCost',
  'weatherWarning',
  'batteryCapacity',
  'danScanRadius',
  'buildSpeed',
  'structureDurability',
  'radiationTolerance',
]

describe('instruments.json', () => {
  it('has at least one instrument', () => {
    expect(instruments.length).toBeGreaterThan(0)
  })

  it('every instrument has required top-level fields', () => {
    for (const inst of instruments) {
      expect(inst.id, `${inst.id} missing id`).toBeTruthy()
      expect(typeof inst.slot, `${inst.id} slot must be number`).toBe('number')
      expect(inst.name, `${inst.id} missing name`).toBeTruthy()
      expect(inst.type, `${inst.id} missing type`).toBeTruthy()
      expect(inst.desc, `${inst.id} missing desc`).toBeTruthy()
      expect(inst.power, `${inst.id} missing power`).toBeTruthy()
      expect(inst.controllerType, `${inst.id} missing controllerType`).toBeTruthy()
      expect(inst.tickHandlerType, `${inst.id} missing tickHandlerType`).toBeTruthy()
    }
  })

  it('every instrument has a valid help object', () => {
    for (const inst of instruments) {
      expect(inst.help, `${inst.id} missing help`).toBeDefined()
      expect(inst.help.summary, `${inst.id} help missing summary`).toBeTruthy()
      expect(inst.help.sections.length, `${inst.id} help must have at least one section`).toBeGreaterThan(0)
      for (const section of inst.help.sections) {
        expect(section.heading, `${inst.id} section missing heading`).toBeTruthy()
        expect(section.body, `${inst.id} section missing body`).toBeTruthy()
      }
    }
  })

  it('slot numbers are unique', () => {
    const slots = instruments.map(i => i.slot)
    const unique = new Set(slots)
    expect(unique.size).toBe(slots.length)
  })

  it('all 14 instruments are present', () => {
    expect(instruments.length).toBe(14)
  })

  it('ids are unique', () => {
    const ids = instruments.map(i => i.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('images have src and alt if present', () => {
    for (const inst of instruments) {
      if (!inst.help.images) continue
      for (const img of inst.help.images) {
        expect(img.src, `${inst.id} image missing src`).toBeTruthy()
        expect(img.alt, `${inst.id} image missing alt`).toBeTruthy()
      }
    }
  })

  it('every instrument has a stats array', () => {
    for (const inst of instruments) {
      expect(Array.isArray(inst.stats), `${inst.id} missing stats array`).toBe(true)
    }
  })

  it('every stat has a valid key and non-empty label', () => {
    for (const inst of instruments) {
      for (const stat of inst.stats) {
        expect(stat.key, `${inst.id} stat missing key`).toBeTruthy()
        expect(stat.label, `${inst.id} stat missing label`).toBeTruthy()
        expect(
          VALID_MODIFIER_KEYS,
          `${inst.id} stat.key "${stat.key}" is not a valid ProfileModifiers key`,
        ).toContain(stat.key)
      }
    }
  })

  it('provides entries have valid key, numeric value, and non-empty label', () => {
    for (const inst of instruments) {
      if (!inst.provides) continue
      for (const bonus of inst.provides) {
        expect(bonus.key, `${inst.id} provides entry missing key`).toBeTruthy()
        expect(
          VALID_MODIFIER_KEYS,
          `${inst.id} provides key "${bonus.key}" is not a valid ProfileModifiers key`,
        ).toContain(bonus.key)
        expect(typeof bonus.value, `${inst.id} provides entry value must be number`).toBe('number')
        expect(bonus.label, `${inst.id} provides entry missing label`).toBeTruthy()
      }
    }
  })
})
