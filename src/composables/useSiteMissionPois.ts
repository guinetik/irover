import { ref, shallowRef } from 'vue'

/**
 * A mission / survey point on the site terrain (world XZ, same space as the rover root).
 */
export interface SiteMissionPoi {
  id: string
  label: string
  x: number
  z: number
  /** Optional CSS color for compass marker */
  color?: string
}

type SitePoisFile = {
  sites?: Record<string, SiteMissionPoi[]>
}

const pois = shallowRef<SiteMissionPoi[]>([])
const focusPoiId = ref<string | null>(null)
let loadedJson: SitePoisFile | null = null

async function fetchPoiCatalog(): Promise<SitePoisFile> {
  if (loadedJson) return loadedJson
  const res = await fetch('/data/site-pois.json')
  if (!res.ok) {
    loadedJson = { sites: {} }
    return loadedJson
  }
  loadedJson = (await res.json()) as SitePoisFile
  return loadedJson
}

/**
 * Mission POIs for the Martian site: data-driven list, runtime mutations, and optional focus for HUD emphasis.
 */
export function useSiteMissionPois() {
  /**
   * Replaces POIs from `public/data/site-pois.json` for the given `siteId` (empty if none).
   */
  async function loadPoisForSite(siteId: string): Promise<void> {
    const data = await fetchPoiCatalog()
    focusPoiId.value = null
    pois.value = data.sites?.[siteId] ?? []
  }

  /** Append or replace one POI by id (missions can call mid-session). */
  function upsertPoi(p: SiteMissionPoi): void {
    const next = pois.value.filter((x) => x.id !== p.id)
    next.push(p)
    pois.value = next
  }

  function removePoi(id: string): void {
    pois.value = pois.value.filter((p) => p.id !== id)
    if (focusPoiId.value === id) focusPoiId.value = null
  }

  /** Replace the whole list (e.g. scripted mission branch). */
  function setPois(list: SiteMissionPoi[]): void {
    pois.value = [...list]
  }

  function clearPois(): void {
    pois.value = []
    focusPoiId.value = null
  }

  /** Highlights one POI on the compass; `null` clears. */
  function setFocusPoi(id: string | null): void {
    focusPoiId.value = id
  }

  return {
    pois,
    focusPoiId,
    loadPoisForSite,
    upsertPoi,
    removePoi,
    setPois,
    clearPois,
    setFocusPoi,
  }
}
