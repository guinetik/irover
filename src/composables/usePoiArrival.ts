import { ref, shallowRef } from 'vue'
import type { SiteMissionPoi } from './useSiteMissionPois'

/**
 * Tracks rover proximity to POIs with a dwell timer.
 * The rover must stay within `ARRIVAL_RADIUS` for `DWELL_SECONDS`
 * before the arrival is confirmed.
 */

const ARRIVAL_RADIUS = 2.5
const DWELL_SECONDS = 2

export interface PoiDwellState {
  poiId: string
  /** 0–1 progress through the dwell timer */
  progress: number
  /** true once dwell completed */
  arrived: boolean
}

/** Reactive map of POI dwell states for all POIs currently being dwelled on */
const dwellStates = shallowRef<PoiDwellState[]>([])

/** Set of POI ids that have been fully arrived at (consumed by checker) */
const arrivedIds = new Set<string>()

/** Internal mutable tracking (not reactive — updated each tick) */
const tracking = new Map<string, number>() // poiId -> accumulated dwell seconds

/**
 * Call every frame from the tick loop.
 * Returns list of POI ids that just completed arrival this frame.
 */
export function tickPoiArrivals(
  roverX: number,
  roverZ: number,
  pois: readonly SiteMissionPoi[],
  dt: number,
): string[] {
  const justArrived: string[] = []
  let changed = false

  for (const poi of pois) {
    if (arrivedIds.has(poi.id)) continue

    const dx = roverX - poi.x
    const dz = roverZ - poi.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < ARRIVAL_RADIUS) {
      const prev = tracking.get(poi.id) ?? 0
      const next = Math.min(prev + dt, DWELL_SECONDS)
      tracking.set(poi.id, next)
      changed = true

      if (next >= DWELL_SECONDS) {
        arrivedIds.add(poi.id)
        justArrived.push(poi.id)
      }
    } else {
      // Outside radius — reset dwell
      if (tracking.has(poi.id)) {
        tracking.delete(poi.id)
        changed = true
      }
    }
  }

  // Rebuild reactive state only when something changed
  if (changed || justArrived.length > 0) {
    const states: PoiDwellState[] = []
    for (const [poiId, secs] of tracking) {
      states.push({
        poiId,
        progress: Math.min(secs / DWELL_SECONDS, 1),
        arrived: arrivedIds.has(poiId),
      })
    }
    dwellStates.value = states
  }

  return justArrived
}

/**
 * Check if a specific POI has been arrived at.
 * Used by the objective checker.
 */
export function hasArrivedAtPoi(poiId: string): boolean {
  return arrivedIds.has(poiId)
}

/**
 * Get dwell progress for a specific POI (0 if not near, 0–1 while dwelling).
 */
export function getPoiDwellProgress(poiId: string): number {
  return (tracking.get(poiId) ?? 0) / DWELL_SECONDS
}

/**
 * Clear arrival state for a POI (e.g. when objective is marked done).
 */
export function clearPoiArrival(poiId: string): void {
  arrivedIds.delete(poiId)
  tracking.delete(poiId)
  dwellStates.value = dwellStates.value.filter((s) => s.poiId !== poiId)
}

export function resetPoiArrivalsForTests(): void {
  arrivedIds.clear()
  tracking.clear()
  dwellStates.value = []
}

export function usePoiArrival() {
  return {
    dwellStates,
    tickPoiArrivals,
    hasArrivedAtPoi,
    getPoiDwellProgress,
    clearPoiArrival,
  }
}
