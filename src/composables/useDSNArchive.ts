// src/composables/useDSNArchive.ts
import { ref, computed } from 'vue'
import type {
  DSNTransmission,
  DSNTransmissionCatalog,
  DSNDiscovery,
} from '@/types/dsnArchive'

const STORAGE_KEY = 'mars-dsn-archive-v1'

// --- Singleton state ---
const catalog = ref<DSNTransmission[]>([])
const unlocked = ref(false)
const discoveries = ref<DSNDiscovery[]>([])

function loadFromStorage(): { unlocked: boolean; discoveries: DSNDiscovery[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { unlocked: false, discoveries: [] }
    const parsed = JSON.parse(raw)
    return {
      unlocked: parsed.unlocked ?? false,
      discoveries: Array.isArray(parsed.discoveries) ? parsed.discoveries : [],
    }
  } catch {
    return { unlocked: false, discoveries: [] }
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      unlocked: unlocked.value,
      discoveries: discoveries.value,
    }))
  } catch { /* quota / private mode */ }
}

// Restore on module load
const stored = loadFromStorage()
unlocked.value = stored.unlocked
discoveries.value = stored.discoveries

// --- Derived ---
const allTransmissions = computed(() => catalog.value)
const discoveredIds = computed(() => new Set(discoveries.value.map(d => d.transmissionId)))
const unreadCount = computed(() => discoveries.value.filter(d => !d.read).length)

const colonistCount = computed(() => {
  const total = catalog.value.filter(t => t.category === 'colonist').length
  const found = discoveries.value.filter(d => {
    const t = catalog.value.find(tx => tx.id === d.transmissionId)
    return t?.category === 'colonist'
  }).length
  return { found, total }
})

const echoCount = computed(() => {
  const total = catalog.value.filter(t => t.category === 'echo').length
  const found = discoveries.value.filter(d => {
    const t = catalog.value.find(tx => tx.id === d.transmissionId)
    return t?.category === 'echo'
  }).length
  return { found, total }
})

const senderCompletions = computed(() => {
  const result: Record<string, { found: number; total: number }> = {}
  for (const tx of catalog.value) {
    if (tx.category !== 'colonist') continue
    if (!result[tx.senderKey]) result[tx.senderKey] = { found: 0, total: 0 }
    result[tx.senderKey].total++
    if (discoveredIds.value.has(tx.id)) result[tx.senderKey].found++
  }
  return result
})

const corruptedAllFound = computed(() => {
  const corrupted = catalog.value.filter(
    t => t.category === 'colonist' && t.senderKey === 'unknown' && t.id !== 'TX-039',
  )
  return corrupted.length > 0 && corrupted.every(t => discoveredIds.value.has(t.id))
})

const tx039Read = computed(() => {
  const d = discoveries.value.find(d => d.transmissionId === 'TX-039')
  return d?.read ?? false
})

// --- Weighted random ---
const RARITY_WEIGHTS: Record<string, number> = {
  common: 60, uncommon: 25, rare: 10, legendary: 5,
}

function weightedPick(pool: DSNTransmission[]): DSNTransmission | null {
  if (pool.length === 0) return null
  const totalWeight = pool.reduce((sum, t) => sum + (RARITY_WEIGHTS[t.rarity] ?? 1), 0)
  let roll = Math.random() * totalWeight
  for (const t of pool) {
    roll -= RARITY_WEIGHTS[t.rarity] ?? 1
    if (roll <= 0) return t
  }
  return pool[pool.length - 1]
}

// --- Core API ---
function loadCatalog(data: DSNTransmissionCatalog): void {
  catalog.value = data.transmissions
}

function unlock(): void {
  unlocked.value = true
  persist()
}

function discoverTransmission(txId: string, currentSol: number): void {
  if (discoveredIds.value.has(txId)) return
  discoveries.value = [...discoveries.value, {
    transmissionId: txId,
    discoveredAtSol: currentSol,
    read: false,
  }]
  persist()
  checkTx039Unlock(currentSol)
}

function checkTx039Unlock(currentSol: number): void {
  const tx039 = catalog.value.find(t => t.id === 'TX-039')
  if (!tx039) return
  if (discoveredIds.value.has('TX-039')) return
  const allColonist = catalog.value.filter(t => t.category === 'colonist' && t.id !== 'TX-039')
  const allFound = allColonist.every(t => discoveredIds.value.has(t.id))
  if (allFound) {
    discoveries.value = [...discoveries.value, {
      transmissionId: 'TX-039',
      discoveredAtSol: currentSol,
      read: false,
    }]
    persist()
  }
}

function pullTransmissions(currentSol: number): DSNTransmission[] {
  const pool = catalog.value.filter(t =>
    t.id !== 'TX-039' && !discoveredIds.value.has(t.id),
  )
  if (pool.length === 0) return []

  // ~30% chance nothing comes through, ~55% one transmission, ~15% two
  const roll = Math.random()
  const count = Math.min(pool.length, roll < 0.30 ? 0 : roll < 0.85 ? 1 : 2)
  if (count === 0) return []
  const pulled: DSNTransmission[] = []

  // First pull ever: force TX-001
  const tx001 = pool.find(t => t.id === 'TX-001')
  if (tx001 && discoveries.value.length === 0) {
    pulled.push(tx001)
  }

  while (pulled.length < count) {
    const remaining = pool.filter(t => !pulled.some(p => p.id === t.id))
    const pick = weightedPick(remaining)
    if (!pick) break
    pulled.push(pick)
  }

  for (const tx of pulled) {
    discoverTransmission(tx.id, currentSol)
  }

  return pulled
}

function markRead(txId: string): void {
  const d = discoveries.value.find(d => d.transmissionId === txId)
  if (d && !d.read) {
    d.read = true
    discoveries.value = [...discoveries.value]
    persist()
  }
}

function markAllRead(): void {
  let changed = false
  for (const d of discoveries.value) {
    if (!d.read) { d.read = true; changed = true }
  }
  if (changed) {
    discoveries.value = [...discoveries.value]
    persist()
  }
}

function getTransmission(txId: string): DSNTransmission | undefined {
  return catalog.value.find(t => t.id === txId)
}

function resetForTests(): void {
  catalog.value = []
  unlocked.value = false
  discoveries.value = []
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function useDSNArchive() {
  return {
    unlocked, discoveries, allTransmissions, unreadCount,
    colonistCount, echoCount, senderCompletions, corruptedAllFound, tx039Read,
    loadCatalog, unlock, pullTransmissions, discoverTransmission,
    markRead, markAllRead, getTransmission, resetForTests,
  }
}
