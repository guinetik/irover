import { INVENTORY_CATALOG } from './inventory'

/** Inventory item ids that may be delivered by the orbital-drop MVP. */
export type OrbitalDropItemId = string

/** One item stack carried by a payload box. */
export interface OrbitalDropItemStack {
  itemId: OrbitalDropItemId
  quantity: number
}

/** World-space XZ coordinates for orbital drop placement. */
export interface OrbitalDropPosition {
  x: number
  z: number
}

/** Input contract for spawning one orbital payload delivery. */
export interface OrbitalDropRequest {
  itemStacks: OrbitalDropItemStack[]
  position: OrbitalDropPosition
}

/** Runtime state for one orbital payload. */
export interface OrbitalDropState {
  id: string
  itemStacks: OrbitalDropItemStack[]
  position: OrbitalDropPosition
  status: OrbitalDropStatus
}

/** High-level lifecycle phases for a payload delivery. */
export type OrbitalDropStatus = 'descending' | 'landed' | 'opened'

/** Browser devtools surface for manually testing orbital payload deliveries. */
export interface OrbitalDropDebugApi {
  dropItem(
    itemId: OrbitalDropItemId,
    options?: Partial<OrbitalDropPosition> & { quantity?: number },
  ): string
  dropRandom(options?: Partial<OrbitalDropPosition> & { quantity?: number }): string
  listComponentItems(): OrbitalDropItemId[]
}

/**
 * Returns the inventory ids currently allowed in orbital payload deliveries.
 */
export function listOrbitalDropItemIds(): OrbitalDropItemId[] {
  return Object.values(INVENTORY_CATALOG)
    .filter((item) => item.category === 'component')
    .map((item) => item.id)
}

/**
 * Returns true when an inventory id is valid for the orbital-drop MVP.
 */
export function isOrbitalDropItemId(itemId: string): itemId is OrbitalDropItemId {
  const item = INVENTORY_CATALOG[itemId]
  return item?.category === 'component'
}
