import * as THREE from 'three'
import type { RockType } from '@/lib/terrain/rocks'

export * from '@/lib/terrain/rocks'

// ---------------------------------------------------------------------------
// Geometry factory
// ---------------------------------------------------------------------------

/**
 * Creates a rock geometry for the given type with seeded vertex displacement
 * and per-vertex colour variation.
 *
 * @param textured When true, vertex colours are near-white luminance
 *   modulators (the texture provides base colour). When false, vertex colours
 *   carry the material's base colour directly.
 * @param seed Variant seed — different seeds produce distinct silhouettes.
 */
export function createRockGeometry(
  type: RockType,
  textured = false,
  seed = 0,
): THREE.BufferGeometry {
  const g = type.geometry
  const d = g.detail + 1
  let geo: THREE.BufferGeometry

  switch (g.base) {
    case 'icosahedron':
      geo = new THREE.IcosahedronGeometry(0.5, d)
      break
    case 'dodecahedron':
      geo = new THREE.DodecahedronGeometry(0.5, d)
      break
    case 'octahedron':
      geo = new THREE.OctahedronGeometry(0.5, d)
      break
    case 'sphere':
      geo = new THREE.SphereGeometry(0.5, 8 + d * 4, 6 + d * 3)
      break
    case 'box':
      geo = new THREE.BoxGeometry(0.7, 0.35, 0.6, 2 + d, 2 + d, 2 + d)
      break
    case 'cylinder':
      geo = new THREE.CylinderGeometry(0.45, 0.55, 0.3, 7 + d * 2, 2 + d)
      break
  }

  displaceVertices(geo, g.displace, seed)

  if (textured) {
    applyLuminanceModulation(geo, seed)
  } else {
    applyVertexColors(geo, type.material.color, seed)
  }

  geo.computeVertexNormals()
  return geo
}

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

/**
 * Creates a PBR material for the given rock type.
 * When a texture is provided it becomes the colour map; vertex colours act as
 * a subtle luminance modulator so individual rocks look slightly different.
 * Without a texture, the material.color tints the vertex colours directly.
 *
 * @param useVertexColors Enable for procedural geometries that have a `color`
 *   attribute. Disable for GLB geometries that rely on UV-mapped textures only.
 */
export function createRockMaterial(
  type: RockType,
  texture?: THREE.Texture,
  useVertexColors = true,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: texture ? 0xffffff : type.material.color,
    roughness: type.material.roughness,
    metalness: type.material.metalness,
    vertexColors: useVertexColors,
  })
  if (texture) {
    mat.map = texture
  }
  return mat
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function displaceVertices(geo: THREE.BufferGeometry, amount: number, seed = 0): void {
  const pos = geo.attributes.position
  const s = seed * 17.31
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    const n1 = Math.sin(x * 7.3 + y * 2.1 + s) * Math.cos(z * 5.7 + x * 1.3 + s * 0.7)
    const n2 = Math.sin(y * 11.1 + z * 3.9 + s * 1.3) * Math.cos(x * 8.3 + s * 0.4) * 0.5
    const n3 = Math.sin(z * 15.7 + x * 4.7 + s * 0.9) * Math.cos(y * 12.3 + s * 1.1) * 0.25
    const n4 = Math.sin(x * 23.1 + z * 19.7 + s * 1.7) * Math.cos(y * 17.9 + s * 0.6) * 0.12
    const n5 = Math.cos(y * 31.3 + x * 27.1 + s * 2.3) * Math.sin(z * 29.7 + s * 1.4) * 0.06
    const noise = (n1 + n2 + n3 + n4 + n5) / 1.93

    const len = Math.sqrt(x * x + y * y + z * z) || 1
    const asymX = 1.0 + Math.sin(s + i * 0.1) * 0.3
    const asymZ = 1.0 + Math.cos(s + i * 0.13) * 0.3
    pos.setX(i, x + (x / len) * noise * amount * asymX)
    pos.setY(i, y + (y / len) * noise * amount * 0.6)
    pos.setZ(i, z + (z / len) * noise * amount * asymZ)
  }
}

function applyVertexColors(geo: THREE.BufferGeometry, baseHex: number, seed = 0): void {
  const pos = geo.attributes.position
  const count = pos.count
  const colors = new Float32Array(count * 3)

  const base = new THREE.Color(baseHex)
  const s = seed * 7.13

  const tintShift = Math.sin(s * 3.7) * 0.1
  const warmCool = Math.cos(s * 2.3) * 0.06

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    const j1 = Math.sin(x * 13.7 + z * 9.1 + s) * Math.cos(y * 11.3 + s * 0.5) * 0.15
    const j2 = Math.sin(y * 23.1 + x * 7.7 + s * 1.3) * 0.08
    const lum = 1.0 + j1 + j2 + tintShift

    colors[i * 3] = Math.min(1, Math.max(0, base.r * lum + warmCool))
    colors[i * 3 + 1] = Math.min(1, Math.max(0, base.g * lum))
    colors[i * 3 + 2] = Math.min(1, Math.max(0, base.b * lum - warmCool))
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function applyLuminanceModulation(geo: THREE.BufferGeometry, seed = 0): void {
  const pos = geo.attributes.position
  const count = pos.count
  const colors = new Float32Array(count * 3)
  const s = seed * 11.37

  const warmth = Math.sin(s * 2.1) * 0.04

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    const n1 = Math.sin(x * 13.7 + z * 9.1 + s) * Math.cos(y * 11.3 + s * 0.7) * 0.14
    const n2 = Math.sin(y * 19.3 + x * 7.7 + s * 1.1) * Math.cos(z * 14.1 + s * 0.3) * 0.07
    const n3 = Math.cos(x * 27.1 + y * 23.9 + s * 1.9) * Math.sin(z * 21.3 + s) * 0.04
    const lum = Math.min(1.0, Math.max(0.55, 0.88 + n1 + n2 + n3))

    colors[i * 3] = Math.min(1.0, lum + warmth)
    colors[i * 3 + 1] = lum
    colors[i * 3 + 2] = Math.min(1.0, lum - warmth)
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}
