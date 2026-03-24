import { ref, computed } from 'vue'
import type { LGAMessage } from '@/types/lgaMailbox'

const STORAGE_KEY = 'mars-lga-mailbox-v1'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `lga-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadFromStorage(): LGAMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is LGAMessage => r && typeof r === 'object' && typeof r.id === 'string')
  } catch { return [] }
}

function saveToStorage(rows: LGAMessage[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)) }
  catch { /* quota / private mode */ }
}

/**
 * Deterministic pseudo-random hash derived from a sol number.
 * Returns a value in [0, 1). Uses no Math.random().
 */
function hashSol(sol: number): number {
  let h = sol * 2654435761
  h = ((h >>> 16) ^ h) * 0x45d9f3b
  h = ((h >>> 16) ^ h) * 0x45d9f3b
  h = (h >>> 16) ^ h
  return (h >>> 0) / 0xFFFFFFFF
}

// --- Singleton state ---
const messages = ref<LGAMessage[]>(loadFromStorage())

/** Exported only for test isolation — do not call in production code. */
export function resetForTests(): void {
  messages.value = []
}

export function useLGAMailbox() {
  const unreadCount = computed(() => messages.value.filter((m) => !m.read).length)

  /**
   * Send a status heartbeat for the given sol.
   * Idempotent: calling more than once for the same sol is a no-op.
   */
  function sendHeartbeat(sol: number): void {
    const alreadySent = messages.value.some((m) => m.direction === 'sent' && m.sol === sol)
    if (alreadySent) return

    const msg: LGAMessage = {
      id: newId(),
      direction: 'sent',
      sol,
      timeOfDay: (8 * 60) / 1477,
      subject: `SOL ${sol} STATUS: NOMINAL`,
      body: 'Systems operational. Battery nominal. All instruments responding.',
      read: true,
    }

    const next = [...messages.value, msg]
    messages.value = next
    saveToStorage(next)
  }

  /**
   * Record an incoming message from Mission Control for the given sol.
   * Idempotent: calling more than once for the same sol is a no-op.
   */
  function receiveMessage(sol: number, timeOfDay: number): void {
    const alreadyReceived = messages.value.some((m) => m.direction === 'received' && m.sol === sol)
    if (alreadyReceived) return

    const msg: LGAMessage = {
      id: newId(),
      direction: 'received',
      sol,
      timeOfDay,
      subject: `MISSION CONTROL — SOL ${sol}`,
      body: 'TEST',
      read: false,
    }

    const next = [...messages.value, msg]
    messages.value = next
    saveToStorage(next)
  }

  /** Mark a single message as read by id. */
  function markRead(messageId: string): void {
    const next = messages.value.map((m) => (m.id === messageId ? { ...m, read: true } : m))
    messages.value = next
    saveToStorage(next)
  }

  /** Mark all messages as read. */
  function markAllRead(): void {
    const next = messages.value.map((m) => (m.read ? m : { ...m, read: true }))
    messages.value = next
    saveToStorage(next)
  }

  /**
   * Deterministic check: does this sol have an incoming message from Mission Control?
   * ~60% of sols return true. Uses a seeded hash — no randomness.
   */
  function hasIncomingMessage(sol: number): boolean {
    return hashSol(sol + 7919) < 0.6
  }

  /**
   * Deterministic delivery time for incoming message on this sol.
   * Returns a timeOfDay fraction representing a time between 12:00 and 16:00.
   */
  function incomingMessageTimeOfDay(sol: number): number {
    const base = (12 * 60) / 1477
    const range = (4 * 60) / 1477
    return base + hashSol(sol + 1013) * range
  }

  return {
    messages,
    unreadCount,
    sendHeartbeat,
    receiveMessage,
    markRead,
    markAllRead,
    hasIncomingMessage,
    incomingMessageTimeOfDay,
  }
}
