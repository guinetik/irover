import { ref, computed } from 'vue'
import type { PlacedBuildable, BuildablesSaveData } from '@/types/buildables'
import type { BuildableController } from '@/three/buildables/BuildableController'

const STORAGE_KEY = 'mars-buildables-v1'

const placedBuildables = ref<PlacedBuildable[]>([])
const activeControllers = ref<BuildableController[]>([])

const isShielded = computed(() =>
  activeControllers.value.some(
    (b) => b.isRoverInside && b.features.includes('hazard-shield'),
  ),
)

function persist(): void {
  const data: BuildablesSaveData = { buildables: placedBuildables.value }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full */ }
}

function savePlacement(entry: PlacedBuildable): void {
  placedBuildables.value = [...placedBuildables.value, entry]
  persist()
}

function loadForSite(siteId: string): PlacedBuildable[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as BuildablesSaveData
    const filtered = data.buildables.filter((b) => b.siteId === siteId)
    placedBuildables.value = filtered
    return filtered
  } catch {
    return []
  }
}

function registerController(controller: BuildableController): void {
  activeControllers.value = [...activeControllers.value, controller]
}

function unregisterController(controller: BuildableController): void {
  activeControllers.value = activeControllers.value.filter((c) => c !== controller)
}

function clearAll(): void {
  placedBuildables.value = []
  activeControllers.value = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

export function useBuildables() {
  return {
    placedBuildables,
    activeControllers,
    isShielded,
    savePlacement,
    loadForSite,
    registerController,
    unregisterController,
    clearAll,
  }
}
