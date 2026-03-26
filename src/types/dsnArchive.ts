export type TransmissionRarity = 'common' | 'uncommon' | 'rare' | 'legendary'
export type TransmissionCategory = 'colonist' | 'echo'

export interface DSNTransmission {
  id: string
  category: TransmissionCategory
  frequencyMHz: number
  date: string
  sender: string
  senderRole?: string
  senderKey: string
  body: string
  rarity: TransmissionRarity
  year?: number
  sortOrder: number
}

export interface DSNTransmissionCatalog {
  version: number
  transmissions: DSNTransmission[]
}

export interface DSNDiscovery {
  transmissionId: string
  discoveredAtSol: number
  read: boolean
}

export interface DSNArchiveState {
  unlocked: boolean
  discoveries: DSNDiscovery[]
}
