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

describe('useLGAMailbox mission extensions', () => {
  beforeEach(() => {
    localStorageMock.clear()
    resetForTests()
  })

  it('pushMessage adds a message with generated id and read=false', () => {
    const { pushMessage, messages } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'New Mission',
      body: 'Test body',
      type: 'mission',
      from: 'Mission Control',
      missionId: 'm01-triangulate',
    })
    expect(messages.value.length).toBe(1)
    const msg = messages.value[0]
    expect(msg.id).toBeTruthy()
    expect(msg.read).toBe(false)
    expect(msg.type).toBe('mission')
    expect(msg.from).toBe('Mission Control')
    expect(msg.missionId).toBe('m01-triangulate')
  })

  it('pushMessage persists to localStorage', () => {
    const { pushMessage } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 2,
      timeOfDay: 0.3,
      subject: 'Alert',
      body: 'Storm warning',
      type: 'alert',
      from: 'REMS',
    })
    const raw = localStorage.getItem('mars-lga-mailbox-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.length).toBe(1)
    expect(parsed[0].type).toBe('alert')
  })

  it('messages without type default to undefined (handled by consumer)', () => {
    const { pushMessage, messages } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'Info msg',
      body: 'Just info',
    })
    expect(messages.value[0].type).toBeUndefined()
  })

  it('unreadCount includes pushed messages', () => {
    const { pushMessage, unreadCount } = useLGAMailbox()
    pushMessage({
      direction: 'received',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'Test',
      body: 'Body',
      type: 'mission',
      missionId: 'm01-triangulate',
    })
    expect(unreadCount.value).toBe(1)
  })
})
