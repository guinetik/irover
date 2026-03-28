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

  it('pushMessage sets read=false for received and read=true for sent (no phantom inbox unread)', () => {
    const { pushMessage, messages, unreadCount } = useLGAMailbox()
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
    pushMessage({
      direction: 'sent',
      sol: 1,
      timeOfDay: 0.5,
      subject: 'MISSION COMPLETE: Test',
      body: 'Done',
      type: 'info',
      from: 'Rover',
    })
    expect(messages.value.length).toBe(2)
    expect(messages.value[0].read).toBe(false)
    expect(messages.value[1].read).toBe(true)
    expect(unreadCount.value).toBe(1)
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

  it('pushMessage is idempotent for the same missionId and direction', () => {
    const { pushMessage, messages } = useLGAMailbox()
    const payload = {
      direction: 'received' as const,
      sol: 5,
      timeOfDay: 0.2,
      subject: 'Mission brief',
      body: 'Details here',
      type: 'mission' as const,
      missionId: 'm02-repeat',
    }
    pushMessage(payload)
    pushMessage(payload)
    expect(messages.value.length).toBe(1)
  })

  it('pushMessage is idempotent for the same sol, subject, and body (no missionId)', () => {
    const { pushMessage, messages } = useLGAMailbox()
    const payload = {
      direction: 'received' as const,
      sol: 7,
      timeOfDay: 0.1,
      subject: 'STATUS',
      body: 'Ping',
    }
    pushMessage(payload)
    pushMessage({ ...payload, timeOfDay: 0.99 })
    expect(messages.value.length).toBe(1)
  })
})
