import { ref } from 'vue'

export interface ActiveSiteData {
  siteId: string
  seed: number
}

const STORAGE_KEY = 'mars-active-site-v1'

const activeSite = ref<ActiveSiteData | null>(null)

function hydrate(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data: ActiveSiteData = JSON.parse(raw)
    if (data.siteId && typeof data.seed === 'number') {
      activeSite.value = data
    }
  } catch {
    // Corrupted or localStorage unavailable — ignore
  }
}

// Hydrate on first load
hydrate()

export function useActiveSite() {
  function setSite(siteId: string, seed: number): void {
    const data: ActiveSiteData = { siteId, seed }
    activeSite.value = data
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // quota / private mode / unavailable — ignore
    }
  }

  function clear(): void {
    activeSite.value = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // unavailable — ignore
    }
  }

  return {
    activeSite,
    setSite,
    clear,
    hydrate,
  }
}
