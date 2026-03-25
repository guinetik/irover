import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { latLonToCartesian } from '@/lib/areography/coordinates'
import {
  extractLocalPatch,
  PATCH_GRID_SIZE,
  type MarsGlobalMesh,
} from '../marsGlobalExtract'

/**
 * Build a synthetic MarsGlobalMesh: a sphere of vertices at a given radius
 * with slight height variation to produce non-zero terrain.
 */
function makeSyntheticSphere(
  radius: number,
  latSteps: number = 90,
  lonSteps: number = 180,
  heightVariation: number = 0.01
): MarsGlobalMesh {
  const positions: number[] = []
  for (let i = 0; i <= latSteps; i++) {
    const lat = -90 + (180 * i) / latSteps
    for (let j = 0; j <= lonSteps; j++) {
      const lon = -180 + (360 * j) / lonSteps
      // Add slight random-ish height variation based on lat/lon
      const r = radius + heightVariation * Math.sin(lat * 5 * THREE.MathUtils.DEG2RAD) * Math.cos(lon * 7 * THREE.MathUtils.DEG2RAD)
      const v = latLonToCartesian(lat, lon, r)
      positions.push(v.x, v.y, v.z)
    }
  }
  return {
    positions: new Float32Array(positions),
    vertexCount: positions.length / 3,
    sphereRadius: radius,
  }
}

describe('ENU frame construction', () => {
  it('at equator (lat=0, lon=0) East should be roughly along world-X', () => {
    // At lat=0, lon=0: P points along +Z (from latLonToCartesian: cos(0)sin(0)=0, sin(0)=0, cos(0)cos(0)=1)
    // So P_normal = (0, 0, 1)
    // refVector = (0, 1, 0) since |P_normal.y| = 0 < 0.99
    // East = normalize(cross((0,1,0), (0,0,1))) = normalize((1,0,0)) = (1,0,0)
    const P = latLonToCartesian(0, 0, 1)
    const P_normal = P.clone().normalize()

    expect(P_normal.x).toBeCloseTo(0, 5)
    expect(P_normal.y).toBeCloseTo(0, 5)
    expect(P_normal.z).toBeCloseTo(1, 5)

    const refVector = Math.abs(P_normal.y) > 0.99
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0)

    const East = new THREE.Vector3().crossVectors(refVector, P_normal).normalize()
    const North = new THREE.Vector3().crossVectors(P_normal, East)

    // East should point along +X
    expect(East.x).toBeCloseTo(1, 5)
    expect(East.y).toBeCloseTo(0, 5)
    expect(East.z).toBeCloseTo(0, 5)

    // North should point along -Y (cross of +Z and +X = ... wait, let's compute)
    // North = cross(P_normal, East) = cross((0,0,1), (1,0,0)) = (0,1,0)
    // Actually: cross((0,0,1),(1,0,0)) = (0*0 - 1*0, 1*1 - 0*0, 0*0 - 0*1) = (0,1,0)
    expect(North.y).toBeCloseTo(1, 5)

    // All vectors should be unit length
    expect(East.length()).toBeCloseTo(1, 5)
    expect(North.length()).toBeCloseTo(1, 5)

    // All vectors should be orthogonal
    expect(East.dot(North)).toBeCloseTo(0, 5)
    expect(East.dot(P_normal)).toBeCloseTo(0, 5)
    expect(North.dot(P_normal)).toBeCloseTo(0, 5)
  })

  it('near pole (lat=89) should not produce NaN or zero vectors', () => {
    const P = latLonToCartesian(89, 45, 1)
    const P_normal = P.clone().normalize()

    // Near pole, |P_normal.y| should be close to 1
    expect(Math.abs(P_normal.y)).toBeGreaterThan(0.99)

    // Should use world-X as reference
    const refVector = Math.abs(P_normal.y) > 0.99
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0)

    const East = new THREE.Vector3().crossVectors(refVector, P_normal).normalize()
    const North = new THREE.Vector3().crossVectors(P_normal, East)

    // No NaN
    expect(isNaN(East.x)).toBe(false)
    expect(isNaN(East.y)).toBe(false)
    expect(isNaN(East.z)).toBe(false)
    expect(isNaN(North.x)).toBe(false)
    expect(isNaN(North.y)).toBe(false)
    expect(isNaN(North.z)).toBe(false)

    // Not zero vectors
    expect(East.length()).toBeGreaterThan(0.99)
    expect(North.length()).toBeGreaterThan(0.99)

    // Orthogonal
    expect(Math.abs(East.dot(North))).toBeLessThan(0.001)
    expect(Math.abs(East.dot(P_normal))).toBeLessThan(0.001)
    expect(Math.abs(North.dot(P_normal))).toBeLessThan(0.001)
  })
})

describe('extractLocalPatch with synthetic sphere', () => {
  it('extracts a valid patch at equator', () => {
    const mesh = makeSyntheticSphere(10, 180, 360, 0.05)

    const patch = extractLocalPatch(mesh, 0, 0, 2)
    expect(patch).not.toBeNull()
    if (!patch) return

    expect(patch.gridSize).toBe(PATCH_GRID_SIZE)
    expect(patch.heightmap.length).toBe(PATCH_GRID_SIZE * PATCH_GRID_SIZE)
    expect(patch.heightMax).toBeGreaterThanOrEqual(patch.heightMin)
    expect(isFinite(patch.extentMeters)).toBe(true)
    expect(patch.extentMeters).toBeGreaterThan(0)
  })

  it('extracts a valid patch at mid-latitude', () => {
    const mesh = makeSyntheticSphere(10, 180, 360, 0.05)

    const patch = extractLocalPatch(mesh, 45, 90, 2)
    expect(patch).not.toBeNull()
    if (!patch) return

    expect(patch.gridSize).toBe(PATCH_GRID_SIZE)
    expect(patch.heightMax).toBeGreaterThanOrEqual(patch.heightMin)
  })

  it('extracts a valid patch near pole', () => {
    const mesh = makeSyntheticSphere(10, 180, 360, 0.05)

    const patch = extractLocalPatch(mesh, 85, 0, 3)
    expect(patch).not.toBeNull()
    if (!patch) return

    expect(patch.gridSize).toBe(PATCH_GRID_SIZE)
    // Heights should be finite
    for (let i = 0; i < patch.heightmap.length; i++) {
      expect(isFinite(patch.heightmap[i])).toBe(true)
    }
  })

  it('returns null for empty mesh', () => {
    const mesh: MarsGlobalMesh = {
      positions: new Float32Array(0),
      vertexCount: 0,
      sphereRadius: 10,
    }
    const patch = extractLocalPatch(mesh, 0, 0)
    expect(patch).toBeNull()
  })

  it('height range is clamped to 120 max', () => {
    // Create a sphere with large height variation
    const mesh = makeSyntheticSphere(10, 180, 360, 5.0)
    const patch = extractLocalPatch(mesh, 0, 0, 5)
    if (!patch) return

    const range = patch.heightMax - patch.heightMin
    expect(range).toBeLessThanOrEqual(120 + 0.001)
  })
})
