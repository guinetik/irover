/** localStorage key: map of {@link siteId} → persisted mission sol (landing = 1). */
export const SITE_MISSION_SOL_STORAGE_KEY = 'mars-site-sol-v1'

/**
 * Reads the stored site → sol map from localStorage (empty object if missing or invalid).
 */
export function readSiteMissionSolMap(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(SITE_MISSION_SOL_STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 1) out[k] = Math.floor(v)
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Returns the persisted mission sol for a site, or `1` if unset.
 *
 * @param siteId - Route / terrain site identifier.
 * @param map - Optional pre-read map; defaults to {@link readSiteMissionSolMap}.
 */
export function getMissionSolForSite(siteId: string, map?: Record<string, number>): number {
  const m = map ?? readSiteMissionSolMap()
  const v = m[siteId]
  return typeof v === 'number' && v >= 1 ? v : 1
}

/**
 * Persists mission sol for a site (minimum 1).
 *
 * @param siteId - Route / terrain site identifier.
 * @param sol - Current mission sol.
 */
export function setMissionSolForSite(siteId: string, sol: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    const n = Math.max(1, Math.floor(sol))
    const map = readSiteMissionSolMap()
    map[siteId] = n
    localStorage.setItem(SITE_MISSION_SOL_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}
