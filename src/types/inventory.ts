import type { RockTypeId } from '@/three/terrain/RockTypes'
import inventoryItemsJson from '../../public/data/inventory-items.json'

/** Root shape of `public/data/inventory-items.json`. */
export interface InventoryItemsFile {
  version: number
  items: InventoryItemDefJson[]
}

export type InventoryItemCategory = 'rock' | 'component' | 'trace' | 'refined' | 'buildable'

/** One row from the inventory catalog JSON. */
export interface InventoryItemDefJson {
  id: string
  category: InventoryItemCategory
  label: string
  description: string
  /** Path under site root, e.g. `/basalt.jpg` */
  image: string
  /** Rock samples only — kg per collected piece (random in range). */
  weightRange?: [number, number]
  /** Components only — kg per unit. */
  weightPerUnit?: number
  /** Components only — max count per stack. Rocks omit (unlimited count, cargo mass only). */
  maxStack?: number
  /** Buildables only — action string encoding the operation (e.g. `place-buildable:shelter`). */
  action?: string
}

/** Runtime catalog entry with validated fields. */
export interface InventoryItemDef {
  id: string
  category: InventoryItemCategory
  label: string
  description: string
  image: string
  weightRange: [number, number] | null
  weightPerUnit: number | null
  maxStack: number | null
  action: string | null
}

/** All item ids from the bundled catalog (rocks + components). */
export type InventoryItemId = string

/** One merged stack in the rover cargo. */
export interface InventoryStack {
  itemId: InventoryItemId
  quantity: number
  totalWeightKg: number
}

/** Result of dev-only inventory spawn by id (`devSpawnInventoryItem`). */
export type DevSpawnInventoryItemResult =
  | { ok: true }
  | { ok: false; message: string }

/** Payload after a successful arm drill rock collection (for UI + science scoring). */
export interface CollectedRockSample {
  rockMeshUuid: string
  rockType: RockTypeId
  displayLabel: string
  weightKgThisSample: number
}

const raw = inventoryItemsJson as InventoryItemsFile

/**
 * Builds a lookup table from the bundled inventory catalog.
 * Throws at module load if JSON is inconsistent.
 */
function buildCatalog(items: InventoryItemDefJson[]): Record<string, InventoryItemDef> {
  const out: Record<string, InventoryItemDef> = {}
  for (const row of items) {
    if (row.category === 'rock') {
      if (!row.weightRange || row.weightRange.length !== 2)
        throw new Error(`[inventory] rock "${row.id}" needs weightRange [min,max]`)
      out[row.id] = {
        id: row.id,
        category: 'rock',
        label: row.label,
        description: row.description,
        image: row.image,
        weightRange: row.weightRange,
        weightPerUnit: null,
        maxStack: null,
        action: null,
      }
    } else if (row.category === 'component' || row.category === 'trace' || row.category === 'refined') {
      if (row.weightPerUnit == null || row.maxStack == null)
        throw new Error(`[inventory] ${row.category} "${row.id}" needs weightPerUnit and maxStack`)
      out[row.id] = {
        id: row.id,
        category: row.category,
        label: row.label,
        description: row.description,
        image: row.image,
        weightRange: null,
        weightPerUnit: row.weightPerUnit,
        maxStack: row.maxStack,
        action: null,
      }
    } else if (row.category === 'buildable') {
      if (row.weightPerUnit == null || row.maxStack == null)
        throw new Error(`[inventory] buildable "${row.id}" needs weightPerUnit and maxStack`)
      out[row.id] = {
        id: row.id,
        category: 'buildable',
        label: row.label,
        description: row.description,
        image: row.image,
        weightRange: null,
        weightPerUnit: row.weightPerUnit,
        maxStack: row.maxStack,
        action: row.action ?? null,
      }
    }
  }
  return out
}

/** Validated catalog keyed by item id. */
export const INVENTORY_CATALOG: Record<string, InventoryItemDef> = buildCatalog(raw.items)

/**
 * Returns catalog metadata for an item id, or undefined if unknown.
 */
export function getInventoryItemDef(id: string): InventoryItemDef | undefined {
  return INVENTORY_CATALOG[id]
}

/**
 * Maximum kg a single rock sample of this type could add (upper bound of weightRange).
 */
export function maxRockSampleKg(rockTypeId: RockTypeId): number {
  const def = INVENTORY_CATALOG[rockTypeId]
  if (!def?.weightRange) return 0
  return def.weightRange[1]
}
