// src/three/buildables/__tests__/HabitatController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { HabitatController } from '../HabitatController'
import type { BuildableDef } from '@/types/buildables'

vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  )
  doorMesh.name = 'Cube012__0'
  const scene = new THREE.Group()
  scene.add(doorMesh)
  return {
    GLTFLoader: class {
      loadAsync() {
        return Promise.resolve({ scene, animations: [] })
      }
    },
  }
})

const SHELTER_DEF: BuildableDef = {
  id: 'shelter',
  label: 'Shelter',
  desc: 'Test shelter',
  image: '/test.png',
  model: '/habitat.glb',
  category: 'shelter',
  placement: 'exterior',
  footprint: { x: 20, z: 20 },
  maxPlacementSlope: 0.3,
  scale: 0.5,
  door: {
    meshName: 'Cube012__0',
    axis: 'x',
    openAngle: 1.57,
    speed: 2.0,
    triggerDistance: 8,
  },
  controllerType: 'HabitatController',
  inventoryItemId: 'shelter-kit',
  features: ['hazard-shield'],
}

describe('HabitatController', () => {
  let controller: HabitatController
  const heightAt = vi.fn().mockReturnValue(0)
  const position = new THREE.Vector3(50, 0, 50)

  beforeEach(async () => {
    controller = new HabitatController(SHELTER_DEF, position.clone(), 0, heightAt)
    const scene = new THREE.Scene()
    await controller.init(scene)
  })

  it('exposes correct id and features', () => {
    expect(controller.id).toBe('shelter')
    expect(controller.features).toContain('hazard-shield')
  })

  it('detects rover inside footprint', () => {
    const roverInside = new THREE.Vector3(50, 0, 50)
    controller.update(roverInside, 0.016)
    expect(controller.isRoverInside).toBe(true)
  })

  it('detects rover outside footprint', () => {
    const roverOutside = new THREE.Vector3(200, 0, 200)
    controller.update(roverOutside, 0.016)
    expect(controller.isRoverInside).toBe(false)
  })

  it('opens door when rover is within trigger distance', () => {
    const roverNear = new THREE.Vector3(50, 0, 50)
    for (let i = 0; i < 60; i++) {
      controller.update(roverNear, 0.016)
    }
    expect(controller.doorOpenFraction).toBeGreaterThan(0)
  })

  it('keeps door closed when rover is far away', () => {
    const roverFar = new THREE.Vector3(200, 0, 200)
    controller.update(roverFar, 0.016)
    expect(controller.doorOpenFraction).toBe(0)
  })

  it('disposes without error', () => {
    expect(() => controller.dispose()).not.toThrow()
  })
})
