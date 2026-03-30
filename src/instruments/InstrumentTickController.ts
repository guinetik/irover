// src/instruments/InstrumentTickController.ts
import type { InstrumentDef } from '@/types/instruments'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import type { InstrumentTuple } from './InstrumentFactory'

export class InstrumentTickController {
  private readonly tuples: InstrumentTuple[]
  private readonly mod: (key: keyof ProfileModifiers) => number

  /** Collected provides bonuses from active instruments. Updated each tick. */
  private _activeProvides: Partial<ProfileModifiers> = {}

  constructor(tuples: InstrumentTuple[]) {
    this.tuples = tuples
    this.mod = usePlayerProfile().mod
  }

  tick(delta: number, env: InstrumentEnvironment): void {
    // Set system-wide modifiers on all controllers
    const durabilityMod = this.mod('structureDurability')
    for (const tuple of this.tuples) {
      tuple.controller.durabilityMod = durabilityMod
    }

    // Tick all handlers
    for (const tuple of this.tuples) {
      tuple.tickHandler?.tick(delta, env)
    }

    // Collect provides from active instruments
    const provides: Partial<ProfileModifiers> = {}
    for (const tuple of this.tuples) {
      if (!tuple.controller.passiveSubsystemEnabled) continue
      if (!tuple.def.provides) continue
      for (const bonus of tuple.def.provides) {
        provides[bonus.key] = (provides[bonus.key] ?? 0) + bonus.value
      }
    }
    this._activeProvides = provides
  }

  /** Current active provides bonuses as additive offsets (e.g. { spYield: 0.05 }). */
  getActiveProvides(): Partial<ProfileModifiers> {
    return this._activeProvides
  }

  getControllerById(id: string): InstrumentController | undefined {
    return this.tuples.find(t => t.def.id === id)?.controller
  }

  getControllerBySlot(slot: number): InstrumentController | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.controller
  }

  getDefBySlot(slot: number): InstrumentDef | undefined {
    return this.tuples.find(t => t.def.slot === slot)?.def
  }

  getDefs(): InstrumentDef[] {
    return [...this.tuples].sort((a, b) => a.def.slot - b.def.slot).map(t => t.def)
  }

  dispose(): void {
    for (const tuple of this.tuples) {
      tuple.controller.dispose()
      tuple.tickHandler?.dispose()
    }
    this._activeProvides = {}
  }
}
