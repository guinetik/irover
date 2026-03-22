import { ref, computed } from 'vue'
import { ROCK_TYPES, type RockTypeId } from '@/three/terrain/RockTypes'

export interface Sample {
  id: string
  type: RockTypeId
  label: string
  weightKg: number
}

const CAPACITY_KG = 5
let sampleCounter = 0

const samples = ref<Sample[]>([])

export function useInventory() {
  const currentWeightKg = computed(() =>
    samples.value.reduce((sum, s) => sum + s.weightKg, 0)
  )

  const isFull = computed(() => currentWeightKg.value >= CAPACITY_KG)

  const capacityKg = CAPACITY_KG

  /**
   * Collects a sample of the given rock type into the inventory.
   * Weight is randomised within the type's weight range.
   * Returns null if the sample would exceed capacity.
   */
  function addSample(type: RockTypeId): Sample | null {
    const rockType = ROCK_TYPES[type]
    const [minW, maxW] = rockType.weightRange
    const weight = minW + Math.random() * (maxW - minW)
    if (currentWeightKg.value + weight > CAPACITY_KG) return null

    sampleCounter++
    const sample: Sample = {
      id: `sample-${sampleCounter}`,
      type,
      label: `${rockType.label} #${sampleCounter}`,
      weightKg: Math.round(weight * 100) / 100,
    }
    samples.value.push(sample)
    return sample
  }

  function removeSample(id: string): void {
    const idx = samples.value.findIndex(s => s.id === id)
    if (idx >= 0) samples.value.splice(idx, 1)
  }

  return {
    samples,
    currentWeightKg,
    isFull,
    capacityKg,
    addSample,
    removeSample,
  }
}
