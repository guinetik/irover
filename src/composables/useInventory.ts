import { ref, computed } from 'vue'

export interface Sample {
  id: string
  type: 'regolith'
  label: string
  weightKg: number
}

const CAPACITY_KG = 15
let sampleCounter = 0

const samples = ref<Sample[]>([])

export function useInventory() {
  const currentWeightKg = computed(() =>
    samples.value.reduce((sum, s) => sum + s.weightKg, 0)
  )

  const isFull = computed(() => currentWeightKg.value >= CAPACITY_KG)

  const capacityKg = CAPACITY_KG

  function addSample(type: 'regolith' = 'regolith'): Sample | null {
    const weight = 0.5 + Math.random() * 1.0
    if (currentWeightKg.value + weight > CAPACITY_KG) return null

    sampleCounter++
    const sample: Sample = {
      id: `sample-${sampleCounter}`,
      type,
      label: `Regolith Sample #${sampleCounter}`,
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
