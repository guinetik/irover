export type VentType = 'co2' | 'methane'

export interface CraterDiscovery {
  id: string
  name: string
  rarity: 'Common' | 'Uncommon' | 'Rare'
  sp: number
  ventType: VentType | null
  sideProducts: Array<{ itemId: string; quantity: number }>
  weight: number
}

export const CRATER_DISCOVERIES: CraterDiscovery[] = [
  { id: 'DC01', name: 'CO\u2082 vent',              rarity: 'Common',   sp: 20,  ventType: 'co2',     sideProducts: [],                                   weight: 40 },
  { id: 'DC02', name: 'Carbonate decomposition',    rarity: 'Uncommon', sp: 55,  ventType: null,      sideProducts: [{ itemId: 'trace-Ca', quantity: 2 }], weight: 15 },
  { id: 'DC03', name: 'Adsorbed water release',     rarity: 'Uncommon', sp: 60,  ventType: null,      sideProducts: [{ itemId: 'ice', quantity: 1 }],      weight: 15 },
  { id: 'DC04', name: 'Methane trace',              rarity: 'Rare',     sp: 150, ventType: 'methane', sideProducts: [],                                   weight: 15 },
  { id: 'DC05', name: 'Deep regolith stratigraphy', rarity: 'Uncommon', sp: 45,  ventType: null,      sideProducts: [],                                   weight: 15 },
]

/**
 * Roll a crater discovery. Pass a forced roll value (0-100) for testing; omit for random.
 */
export function rollCraterDiscovery(forcedRoll?: number): CraterDiscovery {
  const roll = forcedRoll ?? Math.random() * 100
  let cumulative = 0
  for (const d of CRATER_DISCOVERIES) {
    cumulative += d.weight
    if (roll < cumulative) return d
  }
  return CRATER_DISCOVERIES[CRATER_DISCOVERIES.length - 1]
}
