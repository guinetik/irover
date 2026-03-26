import { describe, expect, it } from 'vitest'
import {
  isOrbitalDropItemId,
  listOrbitalDropItemIds,
} from '../orbitalDrop'

describe('orbitalDrop item catalog helpers', () => {
  it('lists only component inventory ids as orbital drop items', () => {
    expect(listOrbitalDropItemIds()).toEqual([
      'engineering-components',
      'science-components',
      'mechatronics-components',
      'digital-components',
      'welding-wire',
      'ice',
      "dsn-archaeology-module"
    ])
  })

  it('accepts component ids and rejects rock or trace ids', () => {
    expect(isOrbitalDropItemId('welding-wire')).toBe(true)
    expect(isOrbitalDropItemId('engineering-components')).toBe(true)
    expect(isOrbitalDropItemId('basalt')).toBe(false)
    expect(isOrbitalDropItemId('trace-Fe')).toBe(false)
    expect(isOrbitalDropItemId('missing-item')).toBe(false)
  })
})
