import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { BuildablePlacementPreview } from '../BuildablePlacementPreview'
import type { BuildableDef } from '@/types/buildables'

vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()))
  return {
    GLTFLoader: class {
      loadAsync() {
        return Promise.resolve({ scene, animations: [] })
      }
    },
  }
})

const DEF: BuildableDef = {
  id: 'shelter',
  label: 'Shelter',
  desc: 'Test',
  image: '/test.png',
  model: '/habitat.glb',
  category: 'shelter',
  placement: 'exterior',
  footprint: { x: 20, z: 20 },
  maxPlacementSlope: 0.3,
  scale: 0.5,
  controllerType: 'HabitatController',
  inventoryItemId: 'shelter-kit',
  features: ['hazard-shield'],
}

describe('BuildablePlacementPreview', () => {
  it('creates a wireframe preview group', async () => {
    const scene = new THREE.Scene()
    const preview = new BuildablePlacementPreview(DEF, () => 0, () => 0)
    await preview.init(scene)
    expect(preview.group.parent).toBe(scene)
  })

  it('marks placement invalid on steep slope', async () => {
    const scene = new THREE.Scene()
    const preview = new BuildablePlacementPreview(DEF, () => 0, () => 0.5)
    await preview.init(scene)
    preview.updatePosition(new THREE.Vector3(0, 0, 0), 0)
    expect(preview.isValid).toBe(false)
  })

  it('marks placement valid on flat ground', async () => {
    const scene = new THREE.Scene()
    const preview = new BuildablePlacementPreview(DEF, () => 0, () => 0.1)
    await preview.init(scene)
    preview.updatePosition(new THREE.Vector3(0, 0, 0), 0)
    expect(preview.isValid).toBe(true)
  })

  it('disposes cleanly', async () => {
    const scene = new THREE.Scene()
    const preview = new BuildablePlacementPreview(DEF, () => 0, () => 0)
    await preview.init(scene)
    preview.dispose()
    expect(preview.group.parent).toBeNull()
  })
})
