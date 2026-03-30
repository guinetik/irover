// src/three/buildables/__tests__/BuildableRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { BuildableRegistry } from '../BuildableRegistry'
import type { BuildableController, BuildableControllerConstructor } from '../BuildableController'

class StubController {
  readonly id = 'stub'
  readonly def: any
  readonly position: any
  readonly footprint = { x: 10, z: 10 }
  readonly features: string[] = []
  readonly isRoverInside = false
  constructor(def: any, pos: any, rot: number, heightAt: any) {
    this.def = def
    this.position = pos
  }
  async init() {}
  update() {}
  dispose() {}
}

describe('BuildableRegistry', () => {
  beforeEach(() => {
    BuildableRegistry.register('StubController', StubController as unknown as BuildableControllerConstructor)
  })

  it('resolves a registered controller', () => {
    const Ctor = BuildableRegistry.resolve('StubController')
    expect(Ctor).toBe(StubController)
  })

  it('throws on unknown controller', () => {
    expect(() => BuildableRegistry.resolve('NonExistent')).toThrow('unknown controller')
  })

  it('reports has() correctly', () => {
    expect(BuildableRegistry.has('StubController')).toBe(true)
    expect(BuildableRegistry.has('NonExistent')).toBe(false)
  })
})
