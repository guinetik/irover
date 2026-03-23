import type { DevSpawnInventoryItemResult } from '@/types/inventory'

/**
 * Console API for development helpers exposed as `window.MarsDev` in DEV builds only.
 */
export interface MarsDevDebugApi {
  inventory: {
    /**
     * Merges up to `count` distinct random catalog items into cargo, ignoring capacity limits.
     * @param count - Number of distinct item types to add (default 3).
     * @returns Item ids that were merged or newly stacked.
     */
    spawnRandom(count?: number): string[]

    /**
     * Merges a specific catalog item into cargo, ignoring capacity (still enforces max stack).
     * @param itemId - Inventory catalog id (e.g. `basalt`, `ice`, `trace-Fe`).
     * @param quantity - Rocks: number of samples (each random mass). Others: unit count (default 1).
     */
    spawnById(itemId: string, quantity?: number): DevSpawnInventoryItemResult
  }
}
