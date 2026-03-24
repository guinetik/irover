import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLGAMailbox, resetForTests } from '../useLGAMailbox'

// --- Minimal localStorage mock for Node environment ---
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
}
vi.stubGlobal('localStorage', localStorageMock)

beforeEach(() => {
  localStorageMock.clear()
  resetForTests()
})

describe('sendHeartbeat', () => {
  it('creates a sent message with correct subject and body', () => {
    const { sendHeartbeat, messages } = useLGAMailbox()
    sendHeartbeat(42)

    expect(messages.value).toHaveLength(1)
    const msg = messages.value[0]
    expect(msg.direction).toBe('sent')
    expect(msg.sol).toBe(42)
    expect(msg.subject).toBe('SOL 42 STATUS: NOMINAL')
    expect(msg.body).toBe('Systems operational. Battery nominal. All instruments responding.')
    expect(msg.read).toBe(true)
    expect(msg.timeOfDay).toBeCloseTo((8 * 60) / 1477, 6)
  })

  it('is idempotent — calling twice for the same sol creates only one message', () => {
    const { sendHeartbeat, messages } = useLGAMailbox()
    sendHeartbeat(10)
    sendHeartbeat(10)

    expect(messages.value.filter((m) => m.direction === 'sent' && m.sol === 10)).toHaveLength(1)
  })
})

describe('receiveMessage', () => {
  it('creates a received message with read=false', () => {
    const { receiveMessage, messages } = useLGAMailbox()
    receiveMessage(5, 0.5)

    expect(messages.value).toHaveLength(1)
    const msg = messages.value[0]
    expect(msg.direction).toBe('received')
    expect(msg.sol).toBe(5)
    expect(msg.timeOfDay).toBe(0.5)
    expect(msg.subject).toBe('MISSION CONTROL — SOL 5')
    expect(msg.read).toBe(false)
  })

  it('is idempotent — calling twice for the same sol creates only one message', () => {
    const { receiveMessage, messages } = useLGAMailbox()
    receiveMessage(7, 0.4)
    receiveMessage(7, 0.4)

    expect(messages.value.filter((m) => m.direction === 'received' && m.sol === 7)).toHaveLength(1)
  })
})

describe('markRead', () => {
  it('sets read=true on the specified message', () => {
    const { receiveMessage, markRead, messages } = useLGAMailbox()
    receiveMessage(3, 0.5)

    const id = messages.value[0].id
    expect(messages.value[0].read).toBe(false)

    markRead(id)
    expect(messages.value[0].read).toBe(true)
  })
})

describe('markAllRead', () => {
  it('marks all messages as read', () => {
    const { receiveMessage, markAllRead, messages } = useLGAMailbox()
    receiveMessage(1, 0.3)
    receiveMessage(2, 0.4)
    receiveMessage(3, 0.5)

    expect(messages.value.every((m) => !m.read)).toBe(true)

    markAllRead()
    expect(messages.value.every((m) => m.read)).toBe(true)
  })
})

describe('unreadCount', () => {
  it('is reactive and reflects actual unread count', () => {
    const { receiveMessage, sendHeartbeat, markRead, unreadCount, messages } = useLGAMailbox()

    expect(unreadCount.value).toBe(0)

    receiveMessage(1, 0.3)
    receiveMessage(2, 0.4)
    sendHeartbeat(1) // sent messages are read:true

    expect(unreadCount.value).toBe(2)

    markRead(messages.value.find((m) => m.sol === 1 && m.direction === 'received')!.id)
    expect(unreadCount.value).toBe(1)
  })
})

describe('hasIncomingMessage', () => {
  it('is deterministic — same sol always returns the same result', () => {
    const { hasIncomingMessage } = useLGAMailbox()
    const result1 = hasIncomingMessage(100)
    const result2 = hasIncomingMessage(100)
    expect(result1).toBe(result2)
  })

  it('returns a boolean', () => {
    const { hasIncomingMessage } = useLGAMailbox()
    expect(typeof hasIncomingMessage(50)).toBe('boolean')
  })

  it('returns true for roughly 60% of sols across a range', () => {
    const { hasIncomingMessage } = useLGAMailbox()
    let trueCount = 0
    const total = 1000
    for (let sol = 0; sol < total; sol++) {
      if (hasIncomingMessage(sol)) trueCount++
    }
    // Allow ±5% tolerance around 60%
    expect(trueCount / total).toBeGreaterThan(0.55)
    expect(trueCount / total).toBeLessThan(0.65)
  })
})

describe('incomingMessageTimeOfDay', () => {
  it('returns a value in the 12:00-16:00 range', () => {
    const { incomingMessageTimeOfDay } = useLGAMailbox()
    const low = (12 * 60) / 1477
    const high = (16 * 60) / 1477

    for (const sol of [0, 1, 42, 100, 999]) {
      const t = incomingMessageTimeOfDay(sol)
      expect(t).toBeGreaterThanOrEqual(low)
      expect(t).toBeLessThan(high)
    }
  })

  it('is deterministic — same sol always returns the same value', () => {
    const { incomingMessageTimeOfDay } = useLGAMailbox()
    expect(incomingMessageTimeOfDay(77)).toBe(incomingMessageTimeOfDay(77))
  })
})
