import { describe, it, expect } from 'vitest'
import type { SAMExperimentsFile } from '../samExperiments'
import samJson from '../../../public/data/sam-experiments.json'
import inventoryJson from '../../../public/data/inventory-items.json'

describe('sam-experiments.json', () => {
  const sam = samJson as SAMExperimentsFile
  const inventoryIds = new Set(inventoryJson.items.map((i) => i.id))

  it('has version 1', () => {
    expect(sam.version).toBe(1)
  })

  it('has exactly 3 analysis modes', () => {
    expect(sam.modes).toHaveLength(3)
    const ids = sam.modes.map((m) => m.id)
    expect(ids).toContain('pyrolysis')
    expect(ids).toContain('wet-chemistry')
    expect(ids).toContain('isotope-analysis')
  })

  it('every mode has required fields', () => {
    for (const mode of sam.modes) {
      expect(mode.id).toBeTruthy()
      expect(mode.name).toBeTruthy()
      expect(mode.instrument).toBeTruthy()
      expect(mode.powerW).toBeGreaterThan(0)
      expect(mode.baseDurationSec).toBeGreaterThan(0)
      expect(mode.unlockSP).toBeGreaterThanOrEqual(0)
      expect(mode.icon).toBeTruthy()
    }
  })

  it('mode ingredient itemIds exist in inventory catalog', () => {
    for (const mode of sam.modes) {
      for (const ing of mode.ingredients) {
        expect(inventoryIds.has(ing.itemId)).toBe(true)
      }
    }
  })

  it('no duplicate discovery IDs', () => {
    const ids = sam.discoveries.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every discovery has required fields', () => {
    const validRarities = ['common', 'uncommon', 'rare', 'legendary']
    const modeIds = new Set(sam.modes.map((m) => m.id))

    for (const d of sam.discoveries) {
      expect(d.id).toBeTruthy()
      expect(d.name).toBeTruthy()
      expect(validRarities).toContain(d.rarity)
      expect(d.sp).toBeGreaterThan(0)
      expect(modeIds.has(d.mode)).toBe(true)
      expect(d.rockTypes.length).toBeGreaterThan(0)
      expect(d.description).toBeTruthy()
    }
  })

  it('discovery sideProduct itemIds exist in inventory catalog', () => {
    for (const d of sam.discoveries) {
      for (const sp of d.sideProducts) {
        expect(
          inventoryIds.has(sp.itemId),
          `discovery ${d.id} references unknown item "${sp.itemId}"`,
        ).toBe(true)
        expect(sp.quantity).toBeGreaterThan(0)
      }
    }
  })

  it('discovery rockTypes exist in yield table', () => {
    const yieldRocks = new Set(Object.keys(sam.yieldTable))
    for (const d of sam.discoveries) {
      for (const rt of d.rockTypes) {
        expect(
          yieldRocks.has(rt),
          `discovery ${d.id} references rock "${rt}" not in yieldTable`,
        ).toBe(true)
      }
    }
  })

  it('yield table rarity weights sum to ~100 for each rock×mode', () => {
    for (const [rock, modes] of Object.entries(sam.yieldTable)) {
      for (const [mode, weights] of Object.entries(modes)) {
        const sum =
          weights.common + weights.uncommon + weights.rare + weights.legendary
        expect(
          sum,
          `${rock}/${mode} weights sum to ${sum}, expected 100`,
        ).toBe(100)
      }
    }
  })

  it('has at least 60 discoveries (47 original + 16 fabrication)', () => {
    expect(sam.discoveries.length).toBeGreaterThanOrEqual(63)
  })
})
