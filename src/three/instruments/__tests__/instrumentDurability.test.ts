import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { InstrumentController } from '../InstrumentController'

/** Minimal concrete subclass for testing the abstract base. */
class TestInstrument extends InstrumentController {
  readonly id = 'test'
  readonly name = 'Test Instrument'
  readonly slot = 0
  readonly focusNodeName = 'TestNode'
  readonly focusOffset = new THREE.Vector3()
  readonly viewAngle = 0
  readonly viewPitch = 0
}

/** Subclass with 100% usage decay chance for deterministic tests. */
class AlwaysDecayInstrument extends TestInstrument {
  override readonly usageDecayChance = 1.0
}

/** Subclass with 0% usage decay chance. */
class NeverDecayInstrument extends TestInstrument {
  override readonly usageDecayChance = 0.0
}

describe('InstrumentController durability', () => {
  it('durabilityFactor at 100% returns 1.0', () => {
    const inst = new TestInstrument()
    expect(inst.durabilityPct).toBe(100)
    expect(inst.durabilityFactor).toBeCloseTo(1.0)
  })

  it('durabilityFactor at breakThreshold (25%) returns 0.0', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = inst.breakThreshold
    expect(inst.durabilityFactor).toBeCloseTo(0.0)
  })

  it('durabilityFactor at 62.5% returns 0.5 (midpoint for threshold=25)', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = 62.5
    expect(inst.durabilityFactor).toBeCloseTo(0.5)
  })

  it('applyPassiveDecay reduces durabilityPct', () => {
    const inst = new TestInstrument()
    const before = inst.durabilityPct
    inst.applyPassiveDecay(1)
    expect(inst.durabilityPct).toBeLessThan(before)
  })

  it('applyPassiveDecay does not go below breakThreshold', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = inst.breakThreshold + 0.01
    inst.applyPassiveDecay(100)
    expect(inst.durabilityPct).toBe(inst.breakThreshold)
  })

  it('rollUsageDecay with chance=1.0 always decays', () => {
    const inst = new AlwaysDecayInstrument()
    const before = inst.durabilityPct
    inst.rollUsageDecay()
    expect(inst.durabilityPct).toBeLessThan(before)
  })

  it('rollUsageDecay with chance=0.0 never decays', () => {
    const inst = new NeverDecayInstrument()
    const before = inst.durabilityPct
    inst.rollUsageDecay()
    expect(inst.durabilityPct).toBe(before)
  })

  it('repair() restores to maxDurability and decrements maxDurability by 1', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = 60
    const maxBefore = inst.maxDurability
    inst.repair()
    expect(inst.durabilityPct).toBe(maxBefore)
    expect(inst.maxDurability).toBe(maxBefore - 1)
  })

  it('repair() does nothing below breakThreshold', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = inst.breakThreshold
    const maxBefore = inst.maxDurability
    inst.repair()
    expect(inst.durabilityPct).toBe(inst.breakThreshold)
    expect(inst.maxDurability).toBe(maxBefore)
  })

  it('applyHazardDamage reduces durability, floors at breakThreshold', () => {
    const inst = new TestInstrument()
    inst.applyHazardDamage(50)
    expect(inst.durabilityPct).toBe(50)

    inst.applyHazardDamage(999)
    expect(inst.durabilityPct).toBe(inst.breakThreshold)
  })

  it('getRepairCost returns correct tiers', () => {
    const inst = new TestInstrument()

    inst.durabilityPct = 95
    expect(inst.getRepairCost()).toEqual({ weldingWire: 1, componentId: 'engineering-components', componentQty: 0 })

    inst.durabilityPct = 80
    expect(inst.getRepairCost()).toEqual({ weldingWire: 2, componentId: 'engineering-components', componentQty: 1 })

    inst.durabilityPct = 55
    expect(inst.getRepairCost()).toEqual({ weldingWire: 3, componentId: 'engineering-components', componentQty: 2 })

    inst.durabilityPct = 30
    expect(inst.getRepairCost()).toEqual({ weldingWire: 4, componentId: 'engineering-components', componentQty: 3 })
  })

  it('selectionHighlightColor returns correct color per durability', () => {
    const inst = new TestInstrument()

    inst.durabilityPct = 100
    expect(inst.selectionHighlightColor).toBe(0x40c8f0) // cyan

    inst.durabilityPct = 75
    expect(inst.selectionHighlightColor).toBe(0x40f080) // green

    inst.durabilityPct = 50
    expect(inst.selectionHighlightColor).toBe(0xf0e040) // yellow

    inst.durabilityPct = 30
    expect(inst.selectionHighlightColor).toBe(0xf0a030) // orange
  })

  it('operational returns true at 100%, false at breakThreshold', () => {
    const inst = new TestInstrument()

    inst.durabilityPct = 100
    expect(inst.operational).toBe(true)

    inst.durabilityPct = inst.breakThreshold
    expect(inst.operational).toBe(false)
  })

  it('applyPassiveDecay uses storm floor when hazardDecayMultiplier > 1.0', () => {
    const inst = new TestInstrument()
    // breakThreshold = 25, so storm floor = 35
    inst.durabilityPct = 36
    inst.hazardDecayMultiplier = 2.0
    inst.applyPassiveDecay(100) // large solDelta to force floor
    expect(inst.durabilityPct).toBe(35) // stops at storm floor, not breakThreshold
  })

  it('applyPassiveDecay uses normal breakThreshold floor when hazardDecayMultiplier = 1.0', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = 30
    inst.hazardDecayMultiplier = 1.0
    inst.applyPassiveDecay(100)
    expect(inst.durabilityPct).toBe(25) // normal breakThreshold floor
  })

  it('applyPassiveDecay storm floor does not raise durability if already below floor', () => {
    const inst = new TestInstrument()
    inst.durabilityPct = 30 // below storm floor of 35, above breakThreshold of 25
    inst.hazardDecayMultiplier = 2.0
    inst.applyPassiveDecay(0.001) // tiny delta
    // Should not decay further since already below storm floor with active hazard
    expect(inst.durabilityPct).toBe(30)
  })
})
