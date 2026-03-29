/**
 * Immutable record for a DAN Crater Mode discovery, stored separately from DAN neutron prospects.
 */
export interface ArchivedCraterDiscovery {
  archiveId: string
  /** Mission sol when the discovery was acknowledged */
  capturedSol: number
  /** Unix ms when archived */
  capturedAtMs: number
  siteId: string
  /** Best-effort areographic coordinates */
  latitudeDeg: number
  longitudeDeg: number
  /** World position of the crater center */
  craterX: number
  craterZ: number
  /** Discovery table ID (DC01–DC05) */
  discoveryId: string
  discoveryName: string
  rarity: 'Common' | 'Uncommon' | 'Rare'
  spEarned: number
  /** Whether a vent was placed from this discovery */
  ventPlaced: boolean
  ventType?: 'co2' | 'methane'
  /** Side products awarded */
  sideProducts: Array<{ itemId: string; quantity: number }>
  /** Player has queued this item for UHF transmission */
  queuedForTransmission: boolean
  /** After UHF transmit */
  transmitted: boolean
}
