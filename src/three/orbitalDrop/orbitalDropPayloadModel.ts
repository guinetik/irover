import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const ORBITAL_DROP_PAYLOAD_TARGET_SIZE = new THREE.Vector3(0.9, 0.72, 0.9)
const ORBITAL_DROP_PAYLOAD_MODEL_URL = '/sci-fi_cargo_crate.glb'

/**
 * Loads the sci-fi cargo crate model used for orbital payload deliveries.
 */
export async function loadOrbitalDropPayloadModel(): Promise<THREE.Object3D | null> {
  if (typeof window === 'undefined') return null
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(ORBITAL_DROP_PAYLOAD_MODEL_URL)
  return prepareOrbitalDropPayloadModel(gltf.scene)
}

/**
 * Centers, grounds, and scales a payload model to fit the orbital drop footprint.
 */
export function prepareOrbitalDropPayloadModel(model: THREE.Object3D): THREE.Object3D {
  const wrapper = new THREE.Group()
  wrapper.add(model)

  model.updateMatrixWorld(true)
  const sourceBounds = new THREE.Box3().setFromObject(model)
  const sourceSize = sourceBounds.getSize(new THREE.Vector3())
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3())
  const scale = Math.min(
    ORBITAL_DROP_PAYLOAD_TARGET_SIZE.x / Math.max(sourceSize.x, 1e-6),
    ORBITAL_DROP_PAYLOAD_TARGET_SIZE.y / Math.max(sourceSize.y, 1e-6),
    ORBITAL_DROP_PAYLOAD_TARGET_SIZE.z / Math.max(sourceSize.z, 1e-6),
  )

  model.scale.setScalar(scale)
  model.position.set(-sourceCenter.x * scale, -sourceBounds.min.y * scale, -sourceCenter.z * scale)
  model.updateMatrixWorld(true)

  wrapper.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
  })
  applyOrbitalDropLuxuryMaterialPass(wrapper)

  return wrapper
}

/**
 * Applies a small “luxury” polish pass to payload materials without changing geometry.
 */
export function applyOrbitalDropLuxuryMaterialPass(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) {
        continue
      }
      material.color.multiplyScalar(1.14)
      material.roughness = Math.max(0.22, material.roughness * 0.7)
      material.metalness = Math.min(0.72, Math.max(material.metalness, 0.24))
      material.emissive = material.emissive.clone().lerp(new THREE.Color(0xffd6a0), 0.12)
      material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.18)
    }
  })
}
