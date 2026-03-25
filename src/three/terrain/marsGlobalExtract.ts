import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { latLonToCartesian } from '@/lib/areography/coordinates'

export const PATCH_GRID_SIZE = 128

export interface MarsGlobalMesh {
  positions: Float32Array // flattened xyz (length = vertexCount * 3)
  vertexCount: number
  sphereRadius: number // auto-detected from median vertex distances
}

export interface LocalPatch {
  /** Heights rasterized into a grid, Y-up */
  heightmap: Float32Array // GRID_SIZE * GRID_SIZE
  gridSize: number
  /** World-space extent for scaling (meters on Mars) */
  extentMeters: number
  heightMin: number
  heightMax: number
}

// Module-level cached singleton
let cachedMesh: MarsGlobalMesh | null = null
let loadingPromise: Promise<MarsGlobalMesh> | null = null

/**
 * Load the Mars global terrain GLB, extract all vertex positions,
 * auto-detect sphere radius, dispose the scene graph, and cache the result.
 */
export async function loadMarsGlobalMesh(): Promise<MarsGlobalMesh> {
  if (cachedMesh) return cachedMesh
  if (loadingPromise) return loadingPromise

  loadingPromise = _doLoad()
  cachedMesh = await loadingPromise
  loadingPromise = null
  return cachedMesh
}

async function _doLoad(): Promise<MarsGlobalMesh> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync('/terrain/mars_terrain_model.glb')

  // Ensure world matrices are computed
  gltf.scene.updateMatrixWorld(true)

  // Collect all vertex positions
  const allPositions: number[] = []
  const _v = new THREE.Vector3()

  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const geo = child.geometry as THREE.BufferGeometry
    const posAttr = geo.getAttribute('position')
    if (!posAttr) return

    for (let i = 0; i < posAttr.count; i++) {
      _v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
      _v.applyMatrix4(child.matrixWorld)
      allPositions.push(_v.x, _v.y, _v.z)
    }
  })

  const vertexCount = allPositions.length / 3
  const positions = new Float32Array(allPositions)

  // Auto-detect sphere radius from median of 100 sampled vertex distances
  const sampleCount = Math.min(100, vertexCount)
  const step = Math.max(1, Math.floor(vertexCount / sampleCount))
  const distances: number[] = []
  for (let i = 0; i < vertexCount; i += step) {
    const idx = i * 3
    const x = positions[idx]
    const y = positions[idx + 1]
    const z = positions[idx + 2]
    distances.push(Math.sqrt(x * x + y * y + z * z))
  }
  distances.sort((a, b) => a - b)
  const sphereRadius = distances[Math.floor(distances.length / 2)]

  console.log(
    `[MarsGlobalMesh] Loaded ${vertexCount} vertices, sphere radius = ${sphereRadius.toFixed(4)}`
  )

  // Dispose the GLB scene graph to free Three.js buffers
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    }
  })

  return { positions, vertexCount, sphereRadius }
}

/**
 * Extract a local patch of terrain around a lat/lon coordinate.
 * Projects nearby vertices into an ENU (East-North-Up) frame and
 * rasterizes heights into a grid.
 */
export function extractLocalPatch(
  mesh: MarsGlobalMesh,
  latDeg: number,
  lonDeg: number,
  radiusDeg: number = 3.0
): LocalPatch | null {
  const { positions, vertexCount, sphereRadius } = mesh

  // 1. Convert lat/lon to 3D point on sphere
  const P = latLonToCartesian(latDeg, lonDeg, sphereRadius)
  const P_normal = P.clone().normalize()

  // 2. Angular threshold
  const cosThreshold = Math.cos(radiusDeg * THREE.MathUtils.DEG2RAD)

  // 3. Build ENU frame at P
  // Pole-safe reference vector
  const refVector = Math.abs(P_normal.y) > 0.99
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0)

  const East = new THREE.Vector3().crossVectors(refVector, P_normal).normalize()
  const North = new THREE.Vector3().crossVectors(P_normal, East) // already unit length

  // 4. Scan vertices, project to ENU
  const localPoints: { e: number; n: number; u: number }[] = []
  const vNorm = new THREE.Vector3()
  const offset = new THREE.Vector3()

  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3
    const vx = positions[idx]
    const vy = positions[idx + 1]
    const vz = positions[idx + 2]

    // Normalize vertex to compare angular distance
    const dist = Math.sqrt(vx * vx + vy * vy + vz * vz)
    if (dist === 0) continue
    vNorm.set(vx / dist, vy / dist, vz / dist)

    const dot = vNorm.dot(P_normal)
    if (dot < cosThreshold) continue

    // Project to ENU
    offset.set(vx - P.x, vy - P.y, vz - P.z)
    const e = offset.dot(East)
    const n = offset.dot(North)
    const u = offset.dot(P_normal)
    localPoints.push({ e, n, u })
  }

  console.log(
    `[extractLocalPatch] lat=${latDeg}, lon=${lonDeg}: ${localPoints.length} vertices in patch`
  )

  if (localPoints.length === 0) return null

  // 5. Compute extent
  let eMin = Infinity, eMax = -Infinity
  let nMin = Infinity, nMax = -Infinity
  for (const pt of localPoints) {
    if (pt.e < eMin) eMin = pt.e
    if (pt.e > eMax) eMax = pt.e
    if (pt.n < nMin) nMin = pt.n
    if (pt.n > nMax) nMax = pt.n
  }

  const eSpan = eMax - eMin || 1
  const nSpan = nMax - nMin || 1
  const span = Math.max(eSpan, nSpan)

  // 6. Rasterize into grid
  const G = PATCH_GRID_SIZE
  const heightmap = new Float32Array(G * G).fill(-Infinity)

  for (const pt of localPoints) {
    // Map to grid coordinates [0, G-1]
    const gx = Math.floor(((pt.e - eMin) / span) * (G - 1))
    const gz = Math.floor(((pt.n - nMin) / span) * (G - 1))
    const ci = Math.min(G - 1, Math.max(0, gx))
    const cj = Math.min(G - 1, Math.max(0, gz))
    const cellIdx = cj * G + ci
    if (pt.u > heightmap[cellIdx]) {
      heightmap[cellIdx] = pt.u
    }
  }

  // 7. Gap-fill passes (16 iterations of neighbor averaging)
  for (let pass = 0; pass < 16; pass++) {
    let filled = 0
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const idx = j * G + i
        if (heightmap[idx] !== -Infinity) continue

        // Average from neighbors
        let sum = 0
        let count = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue
            const ni = i + di
            const nj = j + dj
            if (ni < 0 || ni >= G || nj < 0 || nj >= G) continue
            const nIdx = nj * G + ni
            if (heightmap[nIdx] !== -Infinity) {
              sum += heightmap[nIdx]
              count++
            }
          }
        }
        if (count > 0) {
          heightmap[idx] = sum / count
          filled++
        }
      }
    }
    if (filled === 0) break
  }

  // 8. Count remaining gaps, fill with 0
  let emptyCount = 0
  for (let i = 0; i < G * G; i++) {
    if (heightmap[i] === -Infinity) {
      emptyCount++
      heightmap[i] = 0
    }
  }

  const fillPct = ((1 - emptyCount / (G * G)) * 100).toFixed(1)
  console.log(`[extractLocalPatch] Grid fill: ${fillPct}%`)

  // 9. If >50% empty after filling, return null
  if (emptyCount > (G * G) * 0.5) {
    console.log('[extractLocalPatch] Too sparse, returning null')
    return null
  }

  // 10. Height clamping: clamp range to max 120 units
  let heightMin = Infinity
  let heightMax = -Infinity
  for (let i = 0; i < G * G; i++) {
    if (heightmap[i] < heightMin) heightMin = heightmap[i]
    if (heightmap[i] > heightMax) heightMax = heightmap[i]
  }

  const heightRange = heightMax - heightMin
  if (heightRange > 120) {
    const scale = 120 / heightRange
    for (let i = 0; i < G * G; i++) {
      heightmap[i] = heightMin + (heightmap[i] - heightMin) * scale
    }
    heightMax = heightMin + 120
  }

  // Recompute final min/max
  heightMin = Infinity
  heightMax = -Infinity
  for (let i = 0; i < G * G; i++) {
    if (heightmap[i] < heightMin) heightMin = heightmap[i]
    if (heightmap[i] > heightMax) heightMax = heightmap[i]
  }

  return {
    heightmap,
    gridSize: G,
    extentMeters: span,
    heightMin,
    heightMax,
  }
}
