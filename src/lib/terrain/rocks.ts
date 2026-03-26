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

/** Number of geometry variants generated per rock type for visual variety. */
export const ROCK_VARIANTS_PER_TYPE = 4

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
    const n = weights.length
    return weights.map((entry, i) => [(i + 1) / n, entry[1]])
  }

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
