import { ref, readonly } from 'vue'
import type { Landmark } from '@/types/landmark'

const landmarks = ref<Landmark[]>([])
const isLoading = ref(false)
let loaded = false

export function useMarsData() {
  async function loadLandmarks(): Promise<Landmark[]> {
    if (loaded) return landmarks.value
    isLoading.value = true
    try {
      const response = await fetch('/data/landmarks.json')
      landmarks.value = await response.json()
      loaded = true
    } finally {
      isLoading.value = false
    }
    return landmarks.value
  }

  return {
    landmarks: readonly(landmarks),
    isLoading: readonly(isLoading),
    loadLandmarks,
  }
}
