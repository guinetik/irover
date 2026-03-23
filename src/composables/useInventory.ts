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

export type AddRockSampleResult =
  | { ok: true; payload: CollectedRockSample }
  | { ok: false; message: string }

export type AddComponentResult = { ok: true } | { ok: false; message: string }

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
   * Removes an entire stack (dump cargo slot).
   */
  function removeStack(itemId: string): void {
    stacks.value = stacks.value.filter((s) => s.itemId !== itemId)
  }

  return {
    stacks,
    currentWeightKg,
    isFull,
    capacityKg,
    canFitRockSampleMax,
    addRockSample,
    addComponent,
    addTrace,
    removeStack,
  }
}
