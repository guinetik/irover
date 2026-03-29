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

// --- Upgrade persistence ---
const UPGRADES_STORAGE_KEY = 'mars-instrument-upgrades-v1'

function loadUpgrades(): string[] {
  try {
    const raw = localStorage.getItem(UPGRADES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveUpgrades(ids: string[]): void {
  try { localStorage.setItem(UPGRADES_STORAGE_KEY, JSON.stringify(ids)) } catch {}
}

// --- Durability persistence ---
const DURABILITY_STORAGE_KEY = 'mars-instrument-durability-v1'

interface DurabilityRecord {
  durabilityPct: number
  maxDurability: number
}

function loadDurability(): Record<string, DurabilityRecord> {
  try {
    const raw = localStorage.getItem(DURABILITY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveDurability(instruments: InstrumentController[]): void {
  try {
    const data: Record<string, DurabilityRecord> = {}
    for (const inst of instruments) {
      if (inst.durabilityPct < 100 || inst.maxDurability < 100) {
        data[inst.id] = { durabilityPct: inst.durabilityPct, maxDurability: inst.maxDurability }
      }
    }
    localStorage.setItem(DURABILITY_STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

export function useInstrumentDurability() {
  const { stacks, consumeItem } = useInventory()

  let upgradesHydrated = false
  let lastSavedSol = -1

  /**
   * Called each frame from MarsSiteViewController to sync controller state
   * into Vue reactive refs.
   * @param sol — current Mars sol; durability is persisted once per sol change (not per frame).
   */
  function syncFromControllers(instruments: InstrumentController[], sol?: number): void {
    instrumentRefs = instruments

    // Restore persisted state once on first sync
    if (!upgradesHydrated) {
      upgradesHydrated = true
      const savedUpgrades = loadUpgrades()
      for (const id of savedUpgrades) {
        const inst = instruments.find(i => i.id === id)
        if (inst && !inst.upgraded) inst.applyUpgrade()
      }
      const savedDurability = loadDurability()
      for (const [id, record] of Object.entries(savedDurability)) {
        const inst = instruments.find(i => i.id === id)
        if (inst) {
          inst.durabilityPct = record.durabilityPct
          inst.maxDurability = record.maxDurability
        }
      }
    }

    // Persist durability once per sol change (not every frame)
    const currentSol = sol ?? -1
    if (currentSol !== lastSavedSol && currentSol >= 0) {
      lastSavedSol = currentSol
      saveDurability(instruments)
    }

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
    saveDurability(instrumentRefs)
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
    // Persist upgraded instrument IDs
    const upgraded = instrumentRefs.filter(i => i.upgraded).map(i => i.id)
    saveUpgrades(upgraded)
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
