// src/three/buildables/__tests__/HabitatController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { HabitatController } from '../HabitatController'
import type { BuildableDef } from '@/types/buildables'

vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  const scene = new THREE.Group()
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
  interactionDistance: 12,
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

  it('isNearby returns true when rover is within interaction distance', () => {
    const roverNear = new THREE.Vector3(55, 0, 50) // 5 units away, within 12
    expect(controller.isNearby(roverNear)).toBe(true)
  })

  it('isNearby returns false when rover is beyond interaction distance', () => {
    const roverFar = new THREE.Vector3(200, 0, 200)
    expect(controller.isNearby(roverFar)).toBe(false)
  })

  it('enter() sets isRoverInside true and returns center position', () => {
    expect(controller.isRoverInside).toBe(false)
    const center = controller.enter()
    expect(controller.isRoverInside).toBe(true)
    expect(center.x).toBe(position.x)
    expect(center.z).toBe(position.z)
  })

  it('exit() clears isRoverInside and returns entrance position', () => {
    controller.enter()
    expect(controller.isRoverInside).toBe(true)
    const exitPos = controller.exit()
    expect(controller.isRoverInside).toBe(false)
    // Entrance position should be offset from center
    const distFromCenter = exitPos.distanceTo(position)
    expect(distFromCenter).toBeGreaterThan(0)
  })

  it('getInteriorCameraOrbit returns valid orbit params', () => {
    const orbit = controller.getInteriorCameraOrbit()
    expect(orbit.distance).toBeGreaterThan(0)
    expect(orbit.pitch).toBeGreaterThan(0)
  })

  it('disposes without error', () => {
    expect(() => controller.dispose()).not.toThrow()
  })
})
