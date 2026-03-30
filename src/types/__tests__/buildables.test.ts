// src/types/__tests__/buildables.test.ts
import { describe, it, expect } from 'vitest'
import { BUILDABLE_CATALOG, getBuildableDef } from '@/types/buildables'

describe('buildable catalog', () => {
  it('loads shelter from buildables.json', () => {
    const shelter = getBuildableDef('shelter')
    expect(shelter).toBeDefined()
    expect(shelter!.id).toBe('shelter')
    expect(shelter!.model).toBe('/habitat.glb')
    expect(shelter!.controllerType).toBe('HabitatController')
    expect(shelter!.inventoryItemId).toBe('shelter-kit')
    expect(shelter!.features).toContain('hazard-shield')
  })

  it('has interactionDistance on shelter def', () => {
    const shelter = getBuildableDef('shelter')!
    expect(shelter.interactionDistance).toBe(12)
    expect(shelter.door).toBeUndefined()
  })

  it('catalog keys match buildable ids', () => {
    for (const [key, def] of Object.entries(BUILDABLE_CATALOG)) {
      expect(key).toBe(def.id)
    }
  })
})
