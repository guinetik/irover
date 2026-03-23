import type { MarsDevDebugApi } from '@/types/marsDev'

export interface InstallMarsDevDebugApiOptions {
  spawnRandomInventoryItems: (count?: number) => string[]
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
    },
  }

  return () => {
    delete root.MarsDev
  }
}
