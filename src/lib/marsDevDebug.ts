import type { DevAddSciencePointsResult, MarsDevDebugApi } from '@/types/marsDev'
import type { DevSpawnInventoryItemResult } from '@/types/inventory'

export interface InstallMarsDevDebugApiOptions {
  spawnRandomInventoryItems: (count?: number) => string[]
  spawnInventoryItemById: (itemId: string, quantity?: number) => DevSpawnInventoryItemResult
  addSciencePoints: (amount: number) => DevAddSciencePointsResult
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
  }

  return () => {
    delete root.MarsDev
  }
}
