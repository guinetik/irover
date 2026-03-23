import { ref, computed } from 'vue'
import type { RockTypeId } from '@/three/terrain/RockTypes'
import {
  INVENTORY_CATALOG,
  maxRockSampleKg,
  type CollectedRockSample,
  type InventoryStack,
} from '@/types/inventory'
import { usePlayerProfile } from './usePlayerProfile'

const BASE_CAPACITY_KG = 5

const stacks = ref<InventoryStack[]>([])
const { mod } = usePlayerProfile()

// Seed starter ice (1 kg = 10 units at 0.1 kg/unit) — placeholder until DAN cones produce it
if (stacks.value.length === 0) {
  stacks.value = [{ itemId: 'ice', quantity: 10, totalWeightKg: 1.0 }]
}

export type AddRockSampleResult =
  | { ok: true; payload: CollectedRockSample }
  | { ok: false; message: string }

export type AddComponentResult = { ok: true } | { ok: false; message: string }

export interface InventoryComponentGrant {
  itemId: string
  quantity: number
}

export interface InventoryBatchFailure extends InventoryComponentGrant {
  message: string
}

export type AddComponentsBatchResult =
  | {
    ok: true
    applied: InventoryComponentGrant[]
    failed: InventoryBatchFailure[]
  }
  | {
    ok: false
    applied: InventoryComponentGrant[]
    failed: InventoryBatchFailure[]
  }

export function useInventory() {
  const capacityKg = computed(() => BASE_CAPACITY_KG * mod('inventorySpace'))

  const currentWeightKg = computed(() =>
    stacks.value.reduce((sum, s) => sum + s.totalWeightKg, 0),
  )

  const isFull = computed(() => currentWeightKg.value >= capacityKg.value)

  /**
   * True if a rock sample of this type could be added without exceeding capacity,
   * assuming worst-case mass (max of weight range). Used to gate arm drill collection.
   */
  function canFitRockSampleMax(rockType: RockTypeId): boolean {
    const maxW = maxRockSampleKg(rockType)
    return currentWeightKg.value + maxW <= capacityKg.value + 1e-9
  }

  /**
   * Merges one drill rock sample into the stack for that lithology.
   * Rolls mass from catalog weightRange. Does not deplete the rock mesh (caller handles that).
   */
  function addRockSample(rockType: RockTypeId, rockMeshUuid: string, weightMult = 1.0): AddRockSampleResult {
    const def = INVENTORY_CATALOG[rockType]
    if (!def || def.category !== 'rock' || !def.weightRange) {
      return { ok: false, message: 'Unknown sample type.' }
    }
    const [minW, maxW] = def.weightRange
    const weight = (minW + Math.random() * (maxW - minW)) * weightMult
    const rounded = Math.round(weight * 100) / 100
    if (currentWeightKg.value + rounded > capacityKg.value + 1e-9) {
      return { ok: false, message: 'Cargo full — cannot store sample.' }
    }

    const next = [...stacks.value]
    const i = next.findIndex((s) => s.itemId === rockType)
    if (i >= 0) {
      const s = next[i]
      next[i] = {
        itemId: s.itemId,
        quantity: s.quantity + 1,
        totalWeightKg: Math.round((s.totalWeightKg + rounded) * 100) / 100,
      }
    } else {
      next.push({
        itemId: rockType,
        quantity: 1,
        totalWeightKg: rounded,
      })
    }
    stacks.value = next

    const payload: CollectedRockSample = {
      rockMeshUuid,
      rockType,
      displayLabel: def.label,
      weightKgThisSample: rounded,
    }
    return { ok: true, payload }
  }

  /**
   * Adds crafting / repair components. Each unit is `weightPerUnit` kg; respects `maxStack`.
   */
  function addComponent(itemId: string, quantity: number): AddComponentResult {
    if (quantity <= 0) return { ok: false, message: 'Invalid quantity.' }
    const def = INVENTORY_CATALOG[itemId]
    if (!def || (def.category !== 'component' && def.category !== 'trace') || def.weightPerUnit == null || def.maxStack == null) {
      return { ok: false, message: 'Unknown component.' }
    }
    const addWeight = def.weightPerUnit * quantity
    if (currentWeightKg.value + addWeight > capacityKg.value + 1e-9) {
      return { ok: false, message: 'Cargo full.' }
    }

    const next = [...stacks.value]
    const i = next.findIndex((s) => s.itemId === itemId)
    if (i >= 0) {
      const s = next[i]
      const newQty = s.quantity + quantity
      if (newQty > def.maxStack) return { ok: false, message: 'Stack limit reached.' }
      next[i] = {
        itemId: s.itemId,
        quantity: newQty,
        totalWeightKg: Math.round((s.totalWeightKg + addWeight) * 100) / 100,
      }
    } else {
      if (quantity > def.maxStack) return { ok: false, message: 'Stack limit reached.' }
      next.push({
        itemId,
        quantity,
        totalWeightKg: Math.round(addWeight * 100) / 100,
      })
    }
    stacks.value = next
    return { ok: true }
  }

  /**
   * Adds trace element samples (from ChemCam-buffed drill collection).
   */
  function addTrace(elementSymbol: string, quantity = 1): AddComponentResult {
    return addComponent(`trace-${elementSymbol}`, quantity)
  }

  /**
   * Applies multiple component grants in order, preserving partial success details.
   */
  function addComponentsBatch(grants: InventoryComponentGrant[]): AddComponentsBatchResult {
    const applied: InventoryComponentGrant[] = []
    const failed: InventoryBatchFailure[] = []

    for (const grant of grants) {
      const result = addComponent(grant.itemId, grant.quantity)
      if (result.ok) {
        applied.push({
          itemId: grant.itemId,
          quantity: grant.quantity,
        })
      } else {
        failed.push({
          itemId: grant.itemId,
          quantity: grant.quantity,
          message: result.message,
        })
      }
    }

    return {
      ok: failed.length === 0,
      applied,
      failed,
    }
  }

  /**
   * Removes an entire stack (dump cargo slot).
   */
  function removeStack(itemId: string): void {
    stacks.value = stacks.value.filter((s) => s.itemId !== itemId)
  }

  /**
   * Consumes quantity units (for components/traces/refined) or weightKg (for rocks) from a stack.
   * Removes the stack entirely when it reaches zero.
   */
  function consumeItem(itemId: string, quantity: number, weightKg?: number): { ok: boolean; message?: string } {
    const idx = stacks.value.findIndex(s => s.itemId === itemId)
    if (idx < 0) return { ok: false, message: 'Item not in inventory.' }
    const s = stacks.value[idx]
    const def = INVENTORY_CATALOG[itemId]
    if (!def) return { ok: false, message: 'Unknown item.' }

    const next = [...stacks.value]
    if (def.category === 'rock') {
      const w = weightKg ?? 0
      if (w <= 0) return { ok: false, message: 'Must specify weight for rock consumption.' }
      if (s.totalWeightKg < w - 1e-9) return { ok: false, message: 'Insufficient sample weight.' }
      const newWeight = Math.round((s.totalWeightKg - w) * 1000) / 1000
      if (newWeight <= 0.001) {
        next.splice(idx, 1)
      } else {
        next[idx] = { ...s, totalWeightKg: newWeight }
      }
    } else {
      if (s.quantity < quantity) return { ok: false, message: 'Insufficient quantity.' }
      const newQty = s.quantity - quantity
      if (newQty <= 0) {
        next.splice(idx, 1)
      } else {
        const unitW = def.weightPerUnit ?? 0
        next[idx] = { ...s, quantity: newQty, totalWeightKg: Math.round(newQty * unitW * 1000) / 1000 }
      }
    }
    stacks.value = next
    return { ok: true }
  }

  return {
    stacks,
    currentWeightKg,
    isFull,
    capacityKg,
    canFitRockSampleMax,
    addRockSample,
    addComponent,
    addComponentsBatch,
    addTrace,
    removeStack,
    consumeItem,
  }
}

/**
 * Test-only reset for the singleton inventory state.
 */
export function resetInventoryForTests(): void {
  stacks.value = []
}
