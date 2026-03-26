import { ref } from 'vue'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import { useInventory } from './useInventory'

export interface DurabilitySnapshot {
  id: string
  name: string
  slot: number
  durabilityPct: number
  maxDurability: number
  operational: boolean
  repairCost: { weldingWire: number; componentId: string; componentQty: number }
}

// Singleton state
const snapshots = ref<DurabilitySnapshot[]>([])
let instrumentRefs: InstrumentController[] = []

export function useInstrumentDurability() {
  const { stacks, consumeItem } = useInventory()

  /**
   * Called each frame from MarsSiteViewController to sync controller state
   * into Vue reactive refs.
   */
  function syncFromControllers(instruments: InstrumentController[]): void {
    instrumentRefs = instruments
    snapshots.value = instruments.map(inst => ({
      id: inst.id,
      name: inst.name,
      slot: inst.slot,
      durabilityPct: inst.durabilityPct,
      maxDurability: inst.maxDurability,
      operational: inst.operational,
      repairCost: inst.getRepairCost(),
    }))
  }

  /**
   * Attempt to repair an instrument. Checks inventory for ALL required items
   * before consuming any. Returns success/failure with message.
   */
  function tryRepair(instrumentId: string): { ok: boolean; message?: string } {
    const inst = instrumentRefs.find(i => i.id === instrumentId)
    if (!inst) return { ok: false, message: 'Instrument not found.' }
    if (!inst.operational) return { ok: false, message: 'Permanently damaged.' }
    if (inst.durabilityPct >= inst.maxDurability) return { ok: false, message: 'Already at max durability.' }

    const cost = inst.getRepairCost()

    // Pre-check: verify wire quantity before consuming anything
    const wireStack = stacks.value.find(s => s.itemId === 'welding-wire')
    const wireQty = wireStack?.quantity ?? 0
    if (wireQty < cost.weldingWire) {
      return { ok: false, message: `Need ${cost.weldingWire} welding wire.` }
    }

    // Pre-check: verify component quantity before consuming anything
    if (cost.componentQty > 0) {
      const compStack = stacks.value.find(s => s.itemId === cost.componentId)
      const compQty = compStack?.quantity ?? 0
      if (compQty < cost.componentQty) {
        return { ok: false, message: `Need ${cost.componentQty} ${cost.componentId}.` }
      }
    }

    // Both checks passed — now consume
    const wireResult = consumeItem('welding-wire', cost.weldingWire)
    if (!wireResult.ok) return { ok: false, message: wireResult.message }

    if (cost.componentQty > 0) {
      const compResult = consumeItem(cost.componentId, cost.componentQty)
      if (!compResult.ok) return { ok: false, message: compResult.message }
    }

    inst.repair()
    return { ok: true }
  }

  /**
   * Apply hazard effects to all instruments matching a component category.
   */
  function applyHazardToCategory(
    category: 'engineering-components' | 'science-components' | 'mechatronics-components' | 'digital-components',
    effect: { decayMult?: number; directDamage?: number },
  ): void {
    for (const inst of instrumentRefs) {
      if (inst.repairComponentId !== category) continue
      if (effect.decayMult != null) inst.hazardDecayMultiplier = effect.decayMult
      if (effect.directDamage != null) inst.applyHazardDamage(effect.directDamage)
    }
  }

  /**
   * Attempt to install an upgrade on an instrument. Consumes the required
   * inventory item(s) and calls applyUpgrade() on the controller.
   */
  function tryUpgrade(instrumentId: string): { ok: boolean; message?: string } {
    const inst = instrumentRefs.find(i => i.id === instrumentId)
    if (!inst) return { ok: false, message: 'Instrument not found.' }
    if (inst.upgraded) return { ok: false, message: 'Already fully upgraded.' }

    if (inst.upgradeItemId) {
      const stack = stacks.value.find(s => s.itemId === inst.upgradeItemId)
      const qty = stack?.quantity ?? 0
      if (qty < inst.upgradeItemQty) {
        return { ok: false, message: `Need ${inst.upgradeItemQty} ${inst.upgradeItemId}.` }
      }
      const result = consumeItem(inst.upgradeItemId, inst.upgradeItemQty)
      if (!result.ok) return { ok: false, message: result.message }
    }

    inst.applyUpgrade()
    return { ok: true }
  }

  /**
   * Get snapshot for a specific instrument slot.
   */
  function getBySlot(slot: number): DurabilitySnapshot | undefined {
    return snapshots.value.find(s => s.slot === slot)
  }

  return {
    snapshots,
    syncFromControllers,
    tryRepair,
    tryUpgrade,
    applyHazardToCategory,
    getBySlot,
  }
}
