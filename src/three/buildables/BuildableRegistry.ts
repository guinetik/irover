// src/three/buildables/BuildableRegistry.ts
import type { BuildableControllerConstructor } from './BuildableController'

const registry: Record<string, BuildableControllerConstructor> = {}

export const BuildableRegistry = {
  register(name: string, ctor: BuildableControllerConstructor): void {
    registry[name] = ctor
  },

  resolve(name: string): BuildableControllerConstructor {
    const ctor = registry[name]
    if (!ctor) throw new Error(`BuildableRegistry: unknown controller "${name}"`)
    return ctor
  },

  has(name: string): boolean {
    return name in registry
  },
}

import { HabitatController } from './HabitatController'
BuildableRegistry.register('HabitatController', HabitatController)
