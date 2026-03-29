import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const CAPSULE_GLB = '/dan.glb'
const TARGET_SIZE = 0.5

type FluidType = 'water' | 'co2' | 'methane'

// ---------------------------------------------------------------------------
// Template loading (singleton)
// ---------------------------------------------------------------------------

let template: THREE.Group | null = null
let loadPromise: Promise<THREE.Group> | null = null

function loadTemplate(): Promise<THREE.Group> {
  if (template) return Promise.resolve(template)
  if (!loadPromise) {
    loadPromise = new GLTFLoader()
      .loadAsync(CAPSULE_GLB)
      .then((gltf) => {
        // Strip embedded lights — scene lighting is used
        const lights: THREE.Object3D[] = []
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Light) lights.push(child)
        })
        for (const l of lights) l.parent?.remove(l)
        template = gltf.scene
        return gltf.scene
      })
  }
  return loadPromise
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function placeInstance(instance: THREE.Object3D, x: number, z: number, groundY: number): void {
  instance.position.set(0, 0, 0)
  instance.scale.set(1, 1, 1)
  instance.rotation.set(0, 0, 0)
  instance.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(instance)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
  instance.scale.setScalar(TARGET_SIZE / maxDim)
  instance.updateMatrixWorld(true)

  const boxWorld = new THREE.Box3().setFromObject(instance)
  instance.position.set(x, groundY + 0.05 - boxWorld.min.y, z)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Disposes all geometries and materials under a capsule instance.
 */
export function disposeBioCapsule(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const mat = child.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
  })
}

/**
 * Creates and places a DAN capsule buildable in the scene.
 * Uses the GLB's baked materials as-is.
 *
 * @param fluidType - Stored for future per-type material customization
 * @param x - World X
 * @param z - World Z
 * @param groundY - Terrain height at placement point
 * @param scene - Scene to add the instance to
 * @returns The placed Object3D, or null if loading failed
 */
export async function createBioCapsule(
  fluidType: FluidType,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
): Promise<THREE.Object3D | null> {
  try {
    const tmpl = await loadTemplate()
    const instance = tmpl.clone(true)
    instance.userData.fluidType = fluidType
    placeInstance(instance, x, z, groundY)
    scene.add(instance)
    return instance
  } catch {
    return null
  }
}
