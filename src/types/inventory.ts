import type { RockTypeId } from '@/three/terrain/RockTypes'
import inventoryItemsJson from '../../public/data/inventory-items.json'

/** Root shape of `public/data/inventory-items.json`. */
export interface InventoryItemsFile {
  version: number
  items: InventoryItemDefJson[]
}

export type InventoryItemCategory = 'rock' | 'component'

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
}

/** All item ids from the bundled catalog (rocks + components). */
export type InventoryItemId = string

/** One merged stack in the rover cargo. */
export interface InventoryStack {
  itemId: InventoryItemId
  quantity: number
  totalWeightKg: number
}

/** Payload after a successful APXS rock collection (for UI + science scoring). */
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
      }
    } else {
      if (row.weightPerUnit == null || row.maxStack == null)
        throw new Error(`[inventory] component "${row.id}" needs weightPerUnit and maxStack`)
      out[row.id] = {
        id: row.id,
        category: 'component',
        label: row.label,
        description: row.description,
        image: row.image,
        weightRange: null,
        weightPerUnit: row.weightPerUnit,
        maxStack: row.maxStack,
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
