import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { DrillController } from '../DrillController'
import { resetInventoryForTests } from '@/composables/useInventory'

function makeRock(rockType = 'basalt'): THREE.Mesh {
  const rock = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshStandardMaterial(),
  )
  rock.userData.rockType = rockType
  return rock
}

describe('DrillController', () => {
  beforeEach(() => {
    resetInventoryForTests()
  })

  it('requires releasing E after a completed collection before drilling can restart', () => {
    const drill = new DrillController()
    const firstRock = makeRock()
    const secondRock = makeRock()
    const depleted = new Set<THREE.Mesh>()

    const targeting = {
      setRoverPosition: vi.fn(),
      castFromDrillHead: vi.fn(() => {
        if (!depleted.has(firstRock)) {
          return { rock: firstRock, point: new THREE.Vector3(0, 0, 0), rockType: 'basalt' as const }
        }
        return { rock: secondRock, point: new THREE.Vector3(0.1, 0, 0), rockType: 'basalt' as const }
      }),
      depleteRock: vi.fn((rock: THREE.Mesh) => {
        depleted.add(rock)
      }),
      dispose: vi.fn(),
    }

    const drillRuntime = {
      isDrilling: false,
      isComplete: false,
      progress: 0,
      durationMultiplier: 1,
      scanSpeedMult: 1,
      startDrill: vi.fn(() => {
        drillRuntime.isDrilling = true
      }),
      updateTarget: vi.fn(),
      cancelDrill: vi.fn(() => {
        drillRuntime.isDrilling = false
        drillRuntime.isComplete = false
        drillRuntime.progress = 0
      }),
      update: vi.fn((_delta: number, hasTarget: boolean) => {
        if (hasTarget && drillRuntime.isDrilling && drillRuntime.startDrill.mock.calls.length === 1) {
          drillRuntime.isComplete = true
          drillRuntime.isDrilling = false
          drillRuntime.progress = 1
        }
      }),
    }

    const drillPrivate = drill as unknown as Record<string, unknown>
    drillPrivate.targeting = targeting
    drillPrivate.drill = drillRuntime

    drill.handleInput(new Set(['KeyE']), 0.016)
    drill.update(0.016)
    expect(drillRuntime.startDrill).toHaveBeenCalledTimes(1)
    expect(drill.lastCollected?.rockType).toBe('basalt')

    drill.lastCollected = null
    drill.handleInput(new Set(['KeyE']), 0.016)
    drill.update(0.016)
    expect(drillRuntime.startDrill).toHaveBeenCalledTimes(1)

    drill.handleInput(new Set<string>(), 0.016)
    drill.update(0.016)
    drill.handleInput(new Set(['KeyE']), 0.016)
    drill.update(0.016)
    expect(drillRuntime.startDrill).toHaveBeenCalledTimes(2)
  })
})
