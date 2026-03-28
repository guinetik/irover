import { ref } from 'vue'

const STORAGE_KEY = 'mars-legacy'

function readLegacy(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0
  } catch {
    return 0
  }
}

const legacyLevel = ref(readLegacy())

function incrementLegacy(completedSiteTier: number): void {
  if (completedSiteTier >= 3) return
  const newLevel = completedSiteTier as 1 | 2
  if (newLevel <= legacyLevel.value) return
  legacyLevel.value = newLevel
  try {
    localStorage.setItem(STORAGE_KEY, String(newLevel))
  } catch { /* ignore */ }
}

function isTierUnlocked(tier: number): boolean {
  if (tier <= 1) return true
  return legacyLevel.value >= tier - 1
}

function _resetForTests(): void {
  legacyLevel.value = readLegacy()
}

export function useLegacy() {
  return {
    legacyLevel,
    incrementLegacy,
    isTierUnlocked,
    _resetForTests,
  }
}
