import { describe, it, expect, vi } from 'vitest'
import { useInventoryActions } from '../useInventoryActions'

describe('useInventoryActions', () => {
  it('registers and invokes an action handler', () => {
    const { registerAction, invokeAction } = useInventoryActions()
    const handler = vi.fn()
    registerAction('test-action', handler)
    invokeAction('test-action')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('parses place-buildable:<id> action format', () => {
    const { registerAction, invokeAction } = useInventoryActions()
    const handler = vi.fn()
    registerAction('place-buildable', handler)
    invokeAction('place-buildable:shelter')
    expect(handler).toHaveBeenCalledWith('shelter')
  })

  it('returns false for unregistered action', () => {
    const { invokeAction } = useInventoryActions()
    const result = invokeAction('unknown-action')
    expect(result).toBe(false)
  })
})
