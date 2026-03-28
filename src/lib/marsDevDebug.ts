import type {
  DevAddSciencePointsResult,
  DevMissionSetResult,
  MarsDevDebugApi,
} from '@/types/marsDev'
import type { DevSpawnInventoryItemResult } from '@/types/inventory'

export interface InstallMarsDevDebugApiOptions {
  spawnRandomInventoryItems: (count?: number) => string[]
  spawnInventoryItemById: (itemId: string, quantity?: number) => DevSpawnInventoryItemResult
  addSciencePoints: (amount: number) => DevAddSciencePointsResult
  /** Clears mission + LGA state and queues the briefing for `missions.json` catalog index. */
  setMissionForDev: (index: number) => DevMissionSetResult
  /** Force-trigger a dust storm at level 1-5. */
  triggerStorm: (level: number) => void
  /** Force-trigger a meteor shower at level 1-3. */
  triggerMeteorShower: (level: number) => void
  /** Place waypoint markers at safe radiation zone centroids. Returns count placed. */
  showRadSafeZones: () => number
  /** Remove all safe-zone waypoint markers. */
  hideRadSafeZones: () => void
  /** Enable free-fly debug camera. */
  enableFlyCamera: () => void
  /** Disable free-fly debug camera, return to rover. */
  disableFlyCamera: () => void
}

declare global {
  interface Window {
    MarsDev?: MarsDevDebugApi
  }
}

/**
 * Installs the development-only `window.MarsDev` API and returns a disposer.
 */
export function installMarsDevDebugApi(options: InstallMarsDevDebugApiOptions): () => void {
  const root = globalThis as typeof globalThis & { MarsDev?: MarsDevDebugApi }
  root.MarsDev = {
    inventory: {
      spawnRandom(count = 3) {
        return options.spawnRandomInventoryItems(count)
      },
      spawnById(itemId, quantity = 1) {
        return options.spawnInventoryItemById(itemId, quantity)
      },
    },
    science: {
      addSP(amount) {
        return options.addSciencePoints(amount)
      },
    },
    mission(index: number) {
      return options.setMissionForDev(index)
    },
    weather: {
      triggerStorm(level = 3) {
        options.triggerStorm(level)
      },
      triggerMeteorShower(level = 2) {
        options.triggerMeteorShower(level)
      },
    },
    camera: {
      fly() {
        options.enableFlyCamera()
      },
      stop() {
        options.disableFlyCamera()
      },
    },
    radiation: {
      showSafeZones() {
        return options.showRadSafeZones()
      },
      hideSafeZones() {
        options.hideRadSafeZones()
      },
    },
  }

  return () => {
    delete root.MarsDev
  }
}
