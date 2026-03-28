import type { ArchivedDANProspect } from '@/types/danArchive'

/** Scene-space drill marker saved with a water-confirmed DAN archive row. */
export interface DanDrillSiteScene {
  x: number
  y: number
  z: number
  reservoirQuality: number
  signalStrength: number
}

/**
 * Returns the most recent water-confirmed prospect for {@link siteId} that includes stored drill
 * scene coordinates (newer archives only).
 */
export function findLatestPersistedDanDrillSite(
  rows: readonly ArchivedDANProspect[],
  siteId: string,
): DanDrillSiteScene | null {
  let bestMs = -1
  let best: DanDrillSiteScene | null = null
  for (const p of rows) {
    if (p.siteId !== siteId || !p.waterConfirmed) continue
    const x = p.drillSiteX
    const y = p.drillSiteY
    const z = p.drillSiteZ
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    if (p.capturedAtMs > bestMs) {
      bestMs = p.capturedAtMs
      best = {
        x,
        y,
        z,
        reservoirQuality: p.reservoirQuality,
        signalStrength: p.signalStrength,
      }
    }
  }
  return best
}
