import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Rock type identifiers
// ---------------------------------------------------------------------------

export type RockTypeId =
  | 'basalt'
  | 'hematite'
  | 'olivine'
  | 'sulfate'
  | 'mudstone'
  | 'iron-meteorite'

// ---------------------------------------------------------------------------
// Spawn-weight input (subset of TerrainParams relevant to distribution)
// ---------------------------------------------------------------------------

export interface SpawnParams {
  basalt: number
  ironOxide: number
  silicateIndex: number
  waterIceIndex: number
  dustCover: number
}

// ---------------------------------------------------------------------------
// Rock type definition
// ---------------------------------------------------------------------------

export interface RockType {
  id: RockTypeId
  label: string
  /** CSS hex colour for inventory UI */
  color: string
  /** [min, max] sample weight in kg */
  weightRange: [number, number]
  /** Texture filename in public/ (e.g. "basalt.jpg") */
  textureFile: string
  material: {
    color: number
    roughness: number
    metalness: number
  }
  geometry: {
    base: 'icosahedron' | 'dodecahedron' | 'octahedron' | 'sphere' | 'box' | 'cylinder'
    detail: number
    /** Simplex noise vertex displacement amplitude */
    displace: number
    /** Y-axis squash factor applied to scale */
    scaleY: number
  }
  /** Computes an unnormalised spawn weight from terrain geological indices */
  spawnWeight: (p: SpawnParams) => number
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const ROCK_TYPES: Record<RockTypeId, RockType> = {
  basalt: {
    id: 'basalt',
    label: 'Basalt',
    color: '#3a2e28',
    weightRange: [0.4, 1.2],
    textureFile: 'basalt.jpg',
    material: { color: 0x2e2420, roughness: 0.95, metalness: 0.02 },
    geometry: { base: 'icosahedron', detail: 1, displace: 0.12, scaleY: 0.7 },
    spawnWeight: (p) => p.basalt * 0.8,
  },
  hematite: {
    id: 'hematite',
    label: 'Hematite',
    color: '#8b4535',
    weightRange: [0.3, 0.8],
    textureFile: 'hermatite.jpg',
    material: { color: 0x6b3028, roughness: 0.6, metalness: 0.35 },
    geometry: { base: 'sphere', detail: 2, displace: 0.06, scaleY: 0.9 },
    spawnWeight: (p) => p.ironOxide * 0.5,
  },
  olivine: {
    id: 'olivine',
    label: 'Olivine',
    color: '#5a6b3a',
    weightRange: [0.3, 0.9],
    textureFile: 'olivine.jpg',
    material: { color: 0x4a5a2a, roughness: 0.7, metalness: 0.15 },
    geometry: { base: 'dodecahedron', detail: 1, displace: 0.18, scaleY: 0.8 },
    spawnWeight: (p) => p.silicateIndex * 0.4,
  },
  sulfate: {
    id: 'sulfate',
    label: 'Sulfate',
    color: '#c8b890',
    weightRange: [0.2, 0.7],
    textureFile: 'sulfate.jpg',
    material: { color: 0xb8a878, roughness: 1.0, metalness: 0.0 },
    geometry: { base: 'cylinder', detail: 1, displace: 0.08, scaleY: 0.45 },
    spawnWeight: (p) => p.waterIceIndex * 0.6,
  },
  mudstone: {
    id: 'mudstone',
    label: 'Mudstone',
    color: '#6b5e52',
    weightRange: [0.3, 1.0],
    textureFile: 'mudstone.jpg',
    material: { color: 0x5a4e42, roughness: 1.0, metalness: 0.0 },
    geometry: { base: 'box', detail: 1, displace: 0.1, scaleY: 0.35 },
    spawnWeight: (p) => (1 - p.basalt) * p.dustCover * 0.5,
  },
  'iron-meteorite': {
    id: 'iron-meteorite',
    label: 'Iron Meteorite',
    color: '#555d65',
    weightRange: [0.5, 1.5],
    textureFile: 'iron.jpg',
    material: { color: 0x3a4048, roughness: 0.4, metalness: 0.7 },
    geometry: { base: 'icosahedron', detail: 2, displace: 0.22, scaleY: 0.75 },
    spawnWeight: () => 0.02,
  },
}

/** Ordered array for iteration */
export const ROCK_TYPE_LIST: RockType[] = Object.values(ROCK_TYPES)

// ---------------------------------------------------------------------------
// Geometry factory
// ---------------------------------------------------------------------------

/** Number of geometry variants generated per rock type for visual variety. */
export const ROCK_VARIANTS_PER_TYPE = 4

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
  // Bump detail +1 for more vertices to displace, giving more organic shapes
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
// Spawn distribution
// ---------------------------------------------------------------------------

/**
 * Builds a cumulative probability distribution for rock types given terrain
 * geological indices. Returns an array of `[cumulativeProbability, RockTypeId]`
 * pairs sorted by cumulative weight, suitable for binary-search selection.
 */
export function buildSpawnDistribution(
  params: SpawnParams,
): Array<[number, RockTypeId]> {
  let total = 0
  const weights: Array<[number, RockTypeId]> = []

  for (const t of ROCK_TYPE_LIST) {
    const w = Math.max(0, t.spawnWeight(params))
    total += w
    weights.push([total, t.id])
  }

  if (total === 0) {
    // Fallback: uniform distribution
    const n = weights.length
    return weights.map((entry, i) => [(i + 1) / n, entry[1]])
  }

  // Normalise to 0..1
  return weights.map(([cum, id]) => [cum / total, id])
}

/**
 * Picks a rock type from a prebuilt cumulative distribution using a
 * random value in [0, 1).
 */
export function pickRockType(
  dist: Array<[number, RockTypeId]>,
  rand: number,
): RockTypeId {
  for (const [threshold, id] of dist) {
    if (rand < threshold) return id
  }
  return dist[dist.length - 1][1]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Displaces vertices using a seeded multi-octave pseudo-noise pattern.
 * The seed offset ensures each geometry variant has a unique silhouette.
 * Five octaves at increasing frequencies produce organic, irregular shapes
 * rather than the uniform wobble of simple sin/cos.
 */
function displaceVertices(geo: THREE.BufferGeometry, amount: number, seed = 0): void {
  const pos = geo.attributes.position
  const s = seed * 17.31 // spread seed across frequency space
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    // Five octaves at different frequencies + seed offsets for organic shape
    const n1 = Math.sin(x * 7.3 + y * 2.1 + s) * Math.cos(z * 5.7 + x * 1.3 + s * 0.7)
    const n2 = Math.sin(y * 11.1 + z * 3.9 + s * 1.3) * Math.cos(x * 8.3 + s * 0.4) * 0.5
    const n3 = Math.sin(z * 15.7 + x * 4.7 + s * 0.9) * Math.cos(y * 12.3 + s * 1.1) * 0.25
    const n4 = Math.sin(x * 23.1 + z * 19.7 + s * 1.7) * Math.cos(y * 17.9 + s * 0.6) * 0.12
    const n5 = Math.cos(y * 31.3 + x * 27.1 + s * 2.3) * Math.sin(z * 29.7 + s * 1.4) * 0.06
    const noise = (n1 + n2 + n3 + n4 + n5) / 1.93

    const len = Math.sqrt(x * x + y * y + z * z) || 1
    // Asymmetric displacement — less vertical squash for more natural shapes
    const asymX = 1.0 + Math.sin(s + i * 0.1) * 0.3
    const asymZ = 1.0 + Math.cos(s + i * 0.13) * 0.3
    pos.setX(i, x + (x / len) * noise * amount * asymX)
    pos.setY(i, y + (y / len) * noise * amount * 0.6)
    pos.setZ(i, z + (z / len) * noise * amount * asymZ)
  }
}

/**
 * Adds a `color` vertex attribute with per-vertex variation around a base
 * colour (non-textured fallback path). Seed shifts the noise pattern so
 * each variant has a different colour distribution.
 */
function applyVertexColors(geo: THREE.BufferGeometry, baseHex: number, seed = 0): void {
  const pos = geo.attributes.position
  const count = pos.count
  const colors = new Float32Array(count * 3)

  const base = new THREE.Color(baseHex)
  const s = seed * 7.13

  // Per-variant overall tint shift (warm/cool/bright/dark)
  const tintShift = Math.sin(s * 3.7) * 0.1
  const warmCool = Math.cos(s * 2.3) * 0.06

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    // Multi-frequency jitter for more natural color breakup
    const j1 = Math.sin(x * 13.7 + z * 9.1 + s) * Math.cos(y * 11.3 + s * 0.5) * 0.15
    const j2 = Math.sin(y * 23.1 + x * 7.7 + s * 1.3) * 0.08
    const lum = 1.0 + j1 + j2 + tintShift

    colors[i * 3] = Math.min(1, Math.max(0, base.r * lum + warmCool))
    colors[i * 3 + 1] = Math.min(1, Math.max(0, base.g * lum))
    colors[i * 3 + 2] = Math.min(1, Math.max(0, base.b * lum - warmCool))
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/**
 * Adds near-white vertex colours with seeded position-based luminance jitter.
 * Used when a texture map provides the base colour — vertex colours multiply
 * the texture to create per-rock surface variation (dirty patches, weathering).
 * Wider variation range creates visible dark crevices and bright highlights.
 */
function applyLuminanceModulation(geo: THREE.BufferGeometry, seed = 0): void {
  const pos = geo.attributes.position
  const count = pos.count
  const colors = new Float32Array(count * 3)
  const s = seed * 11.37

  // Per-variant slight warm/cool tint — some rocks slightly redder, others greyer
  const warmth = Math.sin(s * 2.1) * 0.04

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    // Three octaves for stronger, more varied weathering patterns
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
