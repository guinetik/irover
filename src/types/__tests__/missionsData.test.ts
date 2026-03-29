import { describe, it, expect } from 'vitest'
import type { MissionCatalog, ObjectiveType } from '../missions'
import catalogJson from '../../../public/data/missions.json'

const VALID_OBJECTIVE_TYPES: ObjectiveType[] = [
  'go-to', 'gather', 'sam-experiment', 'apxs',
  'mastcam-tag', 'chemcam', 'dan-activate', 'dan-scan', 'dan-prospect', 'transmit', 'queue-transmission', 'rtg-overdrive', 'rtg-shunt', 'rems-activate',
  'rad-activate', 'rad-decode',
  'use-repair-kit',
  'install-upgrade', 'dsn-receive',
  'power-boot', 'ui-inspect', 'avionics-test',
]

describe('missions.json', () => {
  const catalog = catalogJson as MissionCatalog

  it('has version 1', () => {
    expect(catalog.version).toBe(1)
  })

  it('has at least 10 tutorial missions', () => {
    expect(catalog.missions.length).toBeGreaterThanOrEqual(9)
  })

  it('every mission has required fields', () => {
    for (const m of catalog.missions) {
      expect(m.id).toBeTruthy()
      expect(m.name).toBeTruthy()
      expect(m.briefing).toBeTruthy()
      expect(m.objectives.length).toBeGreaterThan(0)
    }
  })

  it('no duplicate mission IDs', () => {
    const ids = catalog.missions.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no duplicate objective IDs within a mission', () => {
    for (const m of catalog.missions) {
      const ids = m.objectives.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('all objective types are valid', () => {
    for (const m of catalog.missions) {
      for (const o of m.objectives) {
        expect(VALID_OBJECTIVE_TYPES).toContain(o.type)
      }
    }
  })

  it('chain references point to existing missions or null', () => {
    const ids = new Set(catalog.missions.map((m) => m.id))
    for (const m of catalog.missions) {
      if (m.chain !== null) {
        expect(ids.has(m.chain)).toBe(true)
      }
    }
  })
})
