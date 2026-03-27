// src/lib/__tests__/instrumentSpeedBreakdown.test.ts
import { describe, it, expect } from 'vitest'
import { buildSpeedBreakdown, type SpeedBreakdownInput } from '../instrumentSpeedBreakdown'

const GREEN = '#5dc9a5'
const RED = '#e05030'
const DIM = 'rgba(196,117,58,0.6)'

/** Helper: minimal input with no modifiers */
function baseInput(overrides: Partial<SpeedBreakdownInput> = {}): SpeedBreakdownInput {
  return {
    modifierKey: 'analysisSpeed',
    archetype: null,
    foundation: null,
    patron: null,
    trackModifiers: {},
    ...overrides,
  }
}

describe('buildSpeedBreakdown', () => {
  it('returns baseline 100% when no modifiers are present', () => {
    const result = buildSpeedBreakdown(baseInput())
    expect(result.speedPct).toBeCloseTo(100)
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0]).toEqual({ label: 'BASELINE', value: '100%', color: DIM })
  })

  it('shows archetype modifier with correct label and color', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
    }))
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0]).toEqual({ label: 'MANAGER', value: '+5%', color: GREEN })
    expect(result.speedPct).toBeCloseTo(105)
  })

  it('shows negative modifier in red', () => {
    const result = buildSpeedBreakdown(baseInput({
      patron: { id: 'trc', name: 'Technocrats', modifiers: { analysisSpeed: -0.10 } },
    }))
    expect(result.buffs[0]).toEqual({ label: 'TECHNOCRATS', value: '-10%', color: RED })
    expect(result.speedPct).toBeCloseTo(90)
  })

  it('stacks archetype + foundation + patron + reward track additively', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
      foundation: { id: 'phd', name: 'PhD', modifiers: { analysisSpeed: 0.10 } },
      patron: { id: 'isf', name: 'Academics', modifiers: { analysisSpeed: 0.30 } },
      trackModifiers: { analysisSpeed: 0.05 },
    }))
    expect(result.buffs).toHaveLength(4)
    expect(result.buffs[3]).toEqual({ label: 'REWARD TRACK', value: '+5%', color: GREEN })
    expect(result.speedPct).toBeCloseTo(150)
  })

  it('skips sources that have no modifier for the requested key', () => {
    const result = buildSpeedBreakdown(baseInput({
      modifierKey: 'analysisSpeed',
      archetype: { id: 'maker', name: 'Maker', modifiers: { movementSpeed: 0.05 } },
    }))
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0].label).toBe('BASELINE')
    expect(result.speedPct).toBeCloseTo(100)
  })

  it('adds thermal COLD entry (speed boost)', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'COLD' }))
    expect(result.buffs).toHaveLength(1)
    expect(result.buffs[0].label).toBe('COLD')
    expect(result.buffs[0].color).toBe(GREEN)
    expect(result.speedPct).toBeCloseTo(117.6, 0)
  })

  it('adds thermal FRIGID entry (speed penalty)', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'FRIGID' }))
    expect(result.buffs[0].label).toBe('FRIGID')
    expect(result.buffs[0].color).toBe(RED)
    expect(result.speedPct).toBeCloseTo(80)
  })

  it('adds thermal CRITICAL entry (half speed)', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'CRITICAL' }))
    expect(result.buffs[0].label).toBe('CRITICAL')
    expect(result.buffs[0].color).toBe(RED)
    expect(result.speedPct).toBeCloseTo(50)
  })

  it('OPTIMAL thermal zone adds no entry', () => {
    const result = buildSpeedBreakdown(baseInput({ thermalZone: 'OPTIMAL' }))
    expect(result.buffs[0].label).toBe('BASELINE')
  })

  it('appends extras after standard entries', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
      extras: [{ label: 'MASTCAM SCAN', value: '+40%', color: GREEN }],
    }))
    expect(result.buffs).toHaveLength(2)
    expect(result.buffs[0].label).toBe('MANAGER')
    expect(result.buffs[1].label).toBe('MASTCAM SCAN')
  })

  it('uses speedPctOverride when provided', () => {
    const result = buildSpeedBreakdown(baseInput({
      archetype: { id: 'manager', name: 'Manager', modifiers: { analysisSpeed: 0.05 } },
      extras: [{ label: 'NIGHT', value: '-25%', color: RED }],
      speedPctOverride: 78.75,
    }))
    expect(result.speedPct).toBeCloseTo(78.75)
  })

  it('works with movementSpeed key for wheels', () => {
    const result = buildSpeedBreakdown(baseInput({
      modifierKey: 'movementSpeed',
      archetype: { id: 'maker', name: 'Maker', modifiers: { movementSpeed: 0.05 } },
    }))
    expect(result.buffs[0]).toEqual({ label: 'MAKER', value: '+5%', color: GREEN })
    expect(result.speedPct).toBeCloseTo(105)
  })
})
