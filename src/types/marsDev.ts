import type { DevSpawnInventoryItemResult } from '@/types/inventory'

/** Result of {@link MarsDevDebugApi.science.addSP}. */
export type DevAddSciencePointsResult =
  | { ok: true; amount: number }
  | { ok: false; message: string }

/** Result of {@link MarsDevDebugApi.mission}. */
export type DevMissionSetResult =
  | { ok: true; missionId: string; name: string; priorCompletedIds: string[] }
  | { ok: false; message: string }

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

  science: {
    /**
     * Grants SP (no profile `spYield` scaling), updates the session ledger, and triggers the same SP toast as gameplay awards.
     * @param amount - Positive integer amount.
     */
    addSP(amount: number): DevAddSciencePointsResult
  }

  /**
   * Clears mission progress (`mars-missions-v1`), auto-completes missions at catalog indices `0..index-1`
   * (SP, item rewards, instrument unlocks — same as playing through them), preserves existing LGA message
   * history, then appends an incoming transmission for the mission at `index` (same shape as the
   * first-mission briefing delivery).
   * @param index - 0-based index into the loaded mission catalog.
   */
  mission(index: number): DevMissionSetResult
}
