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
  }
}
