import type { DiscoveryRarity } from './samExperiments'

export interface ArchivedSAMDiscovery {
  archiveId: string
  discoveryId: string
  discoveryName: string
  rarity: DiscoveryRarity
  modeId: string
  modeName: string
  sampleId: string
  sampleLabel: string
  quality: number
  spEarned: number
  sideProducts: { itemId: string; quantity: number }[]
  capturedSol: number
  capturedAtMs: number
  siteId: string
  latitudeDeg: number
  longitudeDeg: number
  description: string
  transmitted: boolean
}
