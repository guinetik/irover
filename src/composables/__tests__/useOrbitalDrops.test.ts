import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useOrbitalDrops, resetOrbitalDropsForTests } from '../useOrbitalDrops'

describe('useOrbitalDrops', () => {
  beforeEach(() => {
    resetOrbitalDropsForTests()
  })

  it('lands a payload and opens it when transfer succeeds', () => {
    const scene = new THREE.Scene()
    const orbitalDrops = useOrbitalDrops()
    const dropId = orbitalDrops.spawnDrop(scene, {
      itemStacks: [{ itemId: 'welding-wire', quantity: 2 }],
      position: { x: 10, z: 6 },
      heightAt: () => 1,
    })

    orbitalDrops.updateDrops(6, new THREE.Vector3(50, 0, 50))
    expect(orbitalDrops.lastLandedDrop.value?.id).toBe(dropId)

    orbitalDrops.updateDrops(0, new THREE.Vector3(10, 1, 6))
    expect(orbitalDrops.nearbyDropId.value).toBe(dropId)

    const result = orbitalDrops.openDrop(dropId, () => ({
      ok: true,
      applied: [{ itemId: 'welding-wire', quantity: 2 }],
      failed: [],
    }))

    expect(result?.ok).toBe(true)
    expect(orbitalDrops.activeDrops.value).toHaveLength(0)
    expect(orbitalDrops.lastOpenedDrop.value?.dropId).toBe(dropId)
    expect(orbitalDrops.lastOpenedDrop.value?.failed).toEqual([])
  })

  it('retains only failed item stacks after a partial transfer', () => {
    const scene = new THREE.Scene()
    const orbitalDrops = useOrbitalDrops()
    const dropId = orbitalDrops.spawnDrop(scene, {
      itemStacks: [
        { itemId: 'engineering-components', quantity: 2 },
        { itemId: 'welding-wire', quantity: 4 },
      ],
      position: { x: 0, z: 0 },
      heightAt: () => 0,
    })

    orbitalDrops.updateDrops(6, new THREE.Vector3(0, 0, 0))

    const result = orbitalDrops.openDrop(dropId, () => ({
      ok: false,
      applied: [{ itemId: 'engineering-components', quantity: 2 }],
      failed: [{ itemId: 'welding-wire', quantity: 4, message: 'Cargo full.' }],
    }))

    expect(result?.ok).toBe(false)
    expect(orbitalDrops.activeDrops.value).toHaveLength(1)
    expect(orbitalDrops.activeDrops.value[0]?.itemStacks).toEqual([
      { itemId: 'welding-wire', quantity: 4 },
    ])
  })
})
