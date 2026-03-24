import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  ORBITAL_DROP_PAYLOAD_TARGET_SIZE,
  prepareOrbitalDropPayloadModel,
} from '../orbitalDrop/orbitalDropPayloadModel'

describe('prepareOrbitalDropPayloadModel', () => {
  it('centers the model, places its base at y=0, and fits it inside payload bounds', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 1),
      new THREE.MeshStandardMaterial(),
    )
    mesh.position.set(5, 7, -3)
    root.add(mesh)

    const prepared = prepareOrbitalDropPayloadModel(root)
    const bounds = new THREE.Box3().setFromObject(prepared)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())

    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(center.x).toBeCloseTo(0, 5)
    expect(center.z).toBeCloseTo(0, 5)
    expect(size.x).toBeLessThanOrEqual(ORBITAL_DROP_PAYLOAD_TARGET_SIZE.x + 1e-6)
    expect(size.y).toBeLessThanOrEqual(ORBITAL_DROP_PAYLOAD_TARGET_SIZE.y + 1e-6)
    expect(size.z).toBeLessThanOrEqual(ORBITAL_DROP_PAYLOAD_TARGET_SIZE.z + 1e-6)
  })
})
