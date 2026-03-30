import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const CAPSULE_GLB = '/dan.glb'
const TARGET_SIZE = 0.4

/**
 * Material role mapping — each GLB material name maps to a visual role
 * that we rebuild with proper PBR properties.
 */
const MATERIAL_ROLES: Record<string, (accent: THREE.Color) => THREE.MeshStandardMaterial> = {
  Metal: () => new THREE.MeshStandardMaterial({
    color: 0x3a3a3e,
    roughness: 0.55,
    metalness: 0.85,
    envMapIntensity: 0.6,
  }),
  Chrome: () => new THREE.MeshStandardMaterial({
    color: 0x888890,
    roughness: 0.15,
    metalness: 0.95,
    envMapIntensity: 1.0,
  }),
  Glass: (accent) => new THREE.MeshStandardMaterial({
    color: accent.clone().lerp(new THREE.Color(0xffffff), 0.7),
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  BlackGloss: () => new THREE.MeshStandardMaterial({
    color: 0x111115,
    roughness: 0.1,
    metalness: 0.4,
  }),
  MonitorScreen: (accent) => new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: accent,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.0,
  }),
  ChemGlow: (accent) => new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 1.2,
    roughness: 0.3,
    metalness: 0.0,
    transparent: true,
    opacity: 0.85,
  }),
  lambert2: () => new THREE.MeshStandardMaterial({
    color: 0x2a2a2e,
    roughness: 0.7,
    metalness: 0.3,
  }),
}

/** Accent colors per vent/fluid type. */
const FLUID_COLORS: Record<string, THREE.Color> = {
  water:   new THREE.Color(0x2288ff),
  co2:     new THREE.Color(0x999999),
  methane: new THREE.Color(0x33cc66),
}

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

/**
 * Determines the material role for a mesh by checking its name against known suffixes.
 * Mesh names follow the pattern: `pCylinder1_Glass_0` → role = "Glass"
 */
function detectRole(meshName: string): string | null {
  for (const role of Object.keys(MATERIAL_ROLES)) {
    if (meshName.includes(`_${role}_`) || meshName.endsWith(`_${role}`)) return role
  }
  return null
}

/**
 * Applies proper PBR materials to a cloned capsule instance.
 * Each mesh gets a fresh material based on its detected role and the accent color.
 */
function applyMaterials(root: THREE.Object3D, accent: THREE.Color): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true

    const role = detectRole(child.name)
    if (role && MATERIAL_ROLES[role]) {
      const old = child.material
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else if (old?.dispose) old.dispose()
      child.material = MATERIAL_ROLES[role](accent)
    }
  })
}

/**
 * Stretches the capsule body by offsetting top-cap nodes upward and scaling body-zone nodes on Y.
 * Zone boundaries from the GLB: base < 1.1 < body < 3.6 < top.
 */
function stretchBody(root: THREE.Object3D, extra: number): void {
  if (extra <= 0) return
  const BODY_MIN = 1.1
  const TOP_MIN = 3.6
  // Only operate on direct children of the RootNode (depth-3 in the hierarchy)
  const rootNode = root.getObjectByName('RootNode')
  if (!rootNode) return
  for (const child of rootNode.children) {
    const y = child.position.y
    if (y >= TOP_MIN) {
      // Top cap — push up
      child.position.y += extra
    } else if (y >= BODY_MIN) {
      // Body zone — scale Y and shift up by half the extra
      child.scale.y *= (1 + extra / (TOP_MIN - BODY_MIN))
      child.position.y += extra * 0.5
    }
  }
}

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
 *
 * @param fluidType - 'water' | 'co2' | 'methane' — determines accent color
 * @param x - World X position
 * @param z - World Z position
 * @param groundY - Terrain height at placement point
 * @param scene - Scene to add the instance to
 * @returns Promise resolving to the placed Object3D, or null if loading fails
 */
export async function createBioCapsule(
  fluidType: 'water' | 'co2' | 'methane',
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
): Promise<THREE.Object3D | null> {
  try {
    const tmpl = await loadTemplate()
    const instance = tmpl.clone(true)
    const accent = FLUID_COLORS[fluidType] ?? FLUID_COLORS.water
    instance.userData.fluidType = fluidType
    applyMaterials(instance, accent)
    stretchBody(instance, 1.0)
    placeInstance(instance, x, z, groundY)
    scene.add(instance)
    return instance
  } catch {
    return null
  }
}
