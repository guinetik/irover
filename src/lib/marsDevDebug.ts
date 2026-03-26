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
  }

  return () => {
    delete root.MarsDev
  }
}
