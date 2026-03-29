import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const CAPSULE_GLB = '/dan.glb'
const TARGET_SIZE = 0.5

type FluidType = 'water' | 'co2' | 'methane'

const GAS_TYPES = new Set<FluidType>(['co2', 'methane'])

/** Accent colors per fluid type. */
const FLUID_COLORS: Record<FluidType, THREE.Color> = {
  water:   new THREE.Color(0x2288ff),
  co2:     new THREE.Color(0x999999),
  methane: new THREE.Color(0x33cc66),
}

// ---------------------------------------------------------------------------
// Material factories — one per GLB material role
// ---------------------------------------------------------------------------

function makeMetal(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x3a3a3e, roughness: 0.55, metalness: 0.85, envMapIntensity: 0.6,
  })
}

function makeChrome(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x888890, roughness: 0.15, metalness: 0.95, envMapIntensity: 1.0,
  })
}

function makeGlass(accent: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: accent.clone().lerp(new THREE.Color(0xffffff), 0.7),
    roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
  })
}

function makeBlackGloss(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x111115, roughness: 0.1, metalness: 0.4 })
}

function makeMonitor(accent: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: accent, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.0,
  })
}

function makeLambert(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7, metalness: 0.3 })
}

/** Liquid fluid — solid emissive glow. */
function makeLiquidGlow(accent: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.2,
    roughness: 0.3, metalness: 0.0,
    transparent: true, opacity: 0.85,
  })
}

/** Gas fluid — additive blending, softer, animated. */
function makeGasGlow(accent: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: accent,
    emissiveIntensity: 0.8,
    roughness: 0.6,
    metalness: 0.0,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

/** Role name → factory (accent is ignored for non-accent roles). */
const ROLE_FACTORY: Record<string, (accent: THREE.Color) => THREE.MeshStandardMaterial> = {
  Metal: makeMetal,
  Chrome: makeChrome,
  Glass: makeGlass,
  BlackGloss: makeBlackGloss,
  MonitorScreen: makeMonitor,
  lambert2: makeLambert,
  // ChemGlow is handled separately — depends on liquid vs gas
}

// ---------------------------------------------------------------------------
// Animation bookkeeping
// ---------------------------------------------------------------------------

/** All gas-glow materials currently alive — pulsed each frame by updateCapsules(). */
const gasGlowMaterials = new Set<THREE.MeshStandardMaterial>()

/**
 * Call once per frame to animate gas capsule fluid. Drives a slow opacity
 * pulse that makes CO2/methane look wispy.
 */
export function updateCapsules(elapsed: number): void {
  // Two overlapping sine waves for organic-looking movement
  const pulse = 0.35 + 0.15 * Math.sin(elapsed * 1.7) + 0.10 * Math.sin(elapsed * 3.1 + 1.0)
  const intensity = 0.6 + 0.4 * Math.sin(elapsed * 2.3 + 0.5)
  for (const mat of gasGlowMaterials) {
    mat.opacity = pulse
    mat.emissiveIntensity = intensity
  }
}

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
// Material application
// ---------------------------------------------------------------------------

/**
 * Mesh names follow `pCylinder22_ChemGlow_0` → role = "ChemGlow"
 */
function detectRole(meshName: string): string | null {
  const allRoles = [...Object.keys(ROLE_FACTORY), 'ChemGlow']
  for (const role of allRoles) {
    if (meshName.includes(`_${role}_`) || meshName.endsWith(`_${role}`)) return role
  }
  return null
}

function applyMaterials(root: THREE.Object3D, fluidType: FluidType): void {
  const accent = FLUID_COLORS[fluidType]
  const isGas = GAS_TYPES.has(fluidType)

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true

    const role = detectRole(child.name)
    if (!role) return

    // Dispose cloned GLB material
    const old = child.material
    if (Array.isArray(old)) old.forEach((m) => m.dispose())
    else if (old?.dispose) old.dispose()

    if (role === 'ChemGlow') {
      if (isGas) {
        const mat = makeGasGlow(accent)
        child.material = mat
        gasGlowMaterials.add(mat)
        // Tag for cleanup
        child.userData._gasMat = mat
      } else {
        child.material = makeLiquidGlow(accent)
      }
    } else {
      child.material = ROLE_FACTORY[role](accent)
    }
  })
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
 * Disposes geometries, materials, and removes gas-glow animation tracking.
 */
export function disposeBioCapsule(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const mat = child.material
    if (Array.isArray(mat)) mat.forEach((m) => { gasGlowMaterials.delete(m); m.dispose() })
    else { gasGlowMaterials.delete(mat); mat.dispose() }
  })
}

/**
 * Creates, materials, places, and adds a DAN capsule buildable to the scene.
 *
 * @param fluidType - Determines accent color and gas vs liquid treatment
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
    applyMaterials(instance, fluidType)
    placeInstance(instance, x, z, groundY)
    scene.add(instance)
    return instance
  } catch {
    return null
  }
}
