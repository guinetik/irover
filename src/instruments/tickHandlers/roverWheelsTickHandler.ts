import type { TickHandler } from '@/instruments/InstrumentFactory'
import type { InstrumentController } from '@/three/instruments/InstrumentController'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'
import { RoverWheelsController } from '@/three/instruments/RoverWheelsController'
import { usePlayerProfile } from '@/composables/usePlayerProfile'

/** Movement-specific storm penalty: 12% speed loss per storm level (harsher than instrument tier penalty). */
const STORM_SPEED_LOSS_PER_LEVEL = 0.12

export function createRoverWheelsTickHandler(controller: InstrumentController): TickHandler {
  const { mod } = usePlayerProfile()
  const wheels = controller as RoverWheelsController

  return {
    tick(_delta: number, env: InstrumentEnvironment): void {
      const profileMod = mod('movementSpeed')
      const durability = Math.max(0.1, wheels.durabilityFactor)
      const stormPenalty = env.stormLevel > 0 ? 1.0 - (env.stormLevel * STORM_SPEED_LOSS_PER_LEVEL) : 1.0
      wheels.movementSpeedMod = profileMod * durability * Math.max(0, stormPenalty)

      // Per-instrument durability buff — stacks on top of system-wide structureDurability
      wheels.durabilityMod *= mod('instrumentDurability')
    },
    dispose(): void {},
  }
}
