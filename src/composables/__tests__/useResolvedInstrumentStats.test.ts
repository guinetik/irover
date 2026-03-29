import { describe, it, expect } from 'vitest'
import { resolveInstrumentStats, type ResolvedInstrumentStatsInput } from '../useResolvedInstrumentStats'

function baseInput(activeSlot: number): ResolvedInstrumentStatsInput {
  return {
    activeSlot,
    activeInstrumentSlots: [],
    archetype: null,
    foundation: null,
    patron: null,
    trackModifiers: {},
  }
}

describe('resolveInstrumentStats', () => {
  it('returns empty array for instrument with no stats (LGA slot 11)', () => {
    expect(resolveInstrumentStats(baseInput(11))).toEqual([])
  })

  it('returns empty array for unknown slot', () => {
    expect(resolveInstrumentStats(baseInput(999))).toEqual([])
  })

  it('resolves all declared stats for Drill (slot 3)', () => {
    const result = resolveInstrumentStats(baseInput(3))
    expect(result).toHaveLength(3)
    expect(result[0].stat.key).toBe('analysisSpeed')
    expect(result[0].stat.label).toBe('DRILL SPEED')
    expect(result[1].stat.key).toBe('instrumentAccuracy')
    expect(result[2].stat.key).toBe('powerConsumption')
  })

  it('shows baseline 100% when no buffs apply', () => {
    const result = resolveInstrumentStats(baseInput(3))
    expect(result[0].breakdown.speedPct).toBe(100)
    expect(result[0].breakdown.buffs[0].label).toBe('BASELINE')
  })

  it('includes archetype bonus in breakdown', () => {
    const input = baseInput(1)
    input.archetype = { id: 'maker', name: 'Maker', modifiers: { analysisSpeed: 0.10 } }
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.speedPct).toBeCloseTo(110)
    expect(result[0].breakdown.buffs.some(b => b.label === 'MAKER' && b.value === '+10%')).toBe(true)
  })

  it('stacks archetype + patron bonuses', () => {
    const input = baseInput(3)
    input.archetype = { id: 'maker', name: 'Maker', modifiers: { analysisSpeed: 0.05 } }
    input.patron = { id: 'isf', name: 'ISF', modifiers: { analysisSpeed: 0.10 } }
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.speedPct).toBeCloseTo(115)
  })

  it('includes reward track modifier', () => {
    const input = baseInput(3)
    input.trackModifiers = { analysisSpeed: 0.05 }
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.speedPct).toBeCloseTo(105)
    expect(result[0].breakdown.buffs.some(b => b.label === 'REWARD TRACK')).toBe(true)
  })

  it('includes REMS passive bonus when REMS is active', () => {
    const input = baseInput(8)
    input.activeInstrumentSlots = [8]
    const result = resolveInstrumentStats(input)
    expect(result).toHaveLength(1)
    expect(result[0].stat.key).toBe('spYield')
    expect(result[0].breakdown.buffs.some(b => b.label === 'REMS ACTIVE')).toBe(true)
  })

  it('excludes REMS passive when REMS is not active', () => {
    const input = baseInput(8)
    input.activeInstrumentSlots = []
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.buffs.every(b => b.label !== 'REMS ACTIVE')).toBe(true)
  })

  it('passes instrumentTier from def for storm display', () => {
    const input = baseInput(1)
    input.stormLevel = 3
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.buffs.some(b => b.label.includes('DUST STORM'))).toBe(true)
  })

  it('passes radiationLevel for radiation display', () => {
    const input = baseInput(1)
    input.radiationLevel = 0.75
    const result = resolveInstrumentStats(input)
    expect(result[0].breakdown.buffs.some(b => b.label === 'RADIATION')).toBe(true)
  })

  it('preserves stat order from instruments.json', () => {
    const result = resolveInstrumentStats(baseInput(2))
    expect(result.map(r => r.stat.key)).toEqual(['analysisSpeed', 'instrumentAccuracy', 'powerConsumption'])
  })
})
