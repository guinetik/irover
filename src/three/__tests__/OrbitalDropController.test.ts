import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { OrbitalDropController } from '../orbitalDrop/OrbitalDropController'

describe('OrbitalDropController', () => {
  it('transitions from descending to landed after enough update time', () => {
    const scene = new THREE.Scene()
    const drop = new OrbitalDropController(scene, {
      id: 'drop-a',
      position: { x: 12, z: -4 },
      heightAt: () => 3,
    })

    drop.start()
    expect(drop.status).toBe('descending')
    expect(scene.children).toContain(drop.group)

    drop.update(2)
    expect(drop.status).toBe('descending')

    drop.update(3)
    expect(drop.status).toBe('landed')
    expect(drop.group.position.x).toBe(12)
    expect(drop.group.position.z).toBe(-4)
    expect(drop.group.position.y).toBe(3)
  })

  it('marks the payload opened and removes it on dispose', () => {
    const scene = new THREE.Scene()
    const drop = new OrbitalDropController(scene, {
      id: 'drop-b',
      position: { x: 0, z: 0 },
      heightAt: () => 0,
    })

    drop.start()
    drop.update(10)
    expect(drop.status).toBe('landed')

    drop.open()
    expect(drop.status).toBe('opened')

    drop.dispose()
    expect(scene.children).not.toContain(drop.group)
  })
})
