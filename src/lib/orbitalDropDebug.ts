import type { OrbitalDropDebugApi, OrbitalDropItemId, OrbitalDropPosition } from '@/types/orbitalDrop'

export interface InstallOrbitalDropDebugApiOptions extends OrbitalDropDebugApi {}

declare global {
  interface Window {
    OrbitalDrop?: OrbitalDropDebugApi
  }
}

/**
 * Installs the development-only `window.OrbitalDrop` API and returns a disposer.
 */
export function installOrbitalDropDebugApi(
  options: InstallOrbitalDropDebugApiOptions,
): () => void {
  const root = globalThis as typeof globalThis & { OrbitalDrop?: OrbitalDropDebugApi }
  root.OrbitalDrop = {
    dropItem(itemId: OrbitalDropItemId, dropOptions?: Partial<OrbitalDropPosition> & { quantity?: number }) {
      return options.dropItem(itemId, dropOptions)
    },
    dropRandom(dropOptions?: Partial<OrbitalDropPosition> & { quantity?: number }) {
      return options.dropRandom(dropOptions)
    },
    listComponentItems() {
      return options.listComponentItems()
    },
  }

  return () => {
    delete root.OrbitalDrop
  }
}
