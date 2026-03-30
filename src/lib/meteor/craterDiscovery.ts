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
 * Roll a crater discovery.
 * @param rareBoost — shifts weight from Common toward Rare (0 = no change, 0.2 = +20% rare bias).
 *   Mechanically: Common weight is reduced by `rareBoost * commonWeight`, and that weight
 *   is redistributed equally to Rare entries. Clamped so Common never goes below 10.
 * @param forcedRoll — forced roll value (0-100) for testing; omit for random.
 */
export function rollCraterDiscovery(rareBoost = 0, forcedRoll?: number): CraterDiscovery {
  // Build adjusted weights
  const adjusted = CRATER_DISCOVERIES.map(d => ({ ...d }))
  if (rareBoost > 0) {
    const common = adjusted.find(d => d.rarity === 'Common')
    const rares = adjusted.filter(d => d.rarity === 'Rare')
    if (common && rares.length > 0) {
      const shift = Math.min(common.weight - 10, common.weight * rareBoost)
      common.weight -= shift
      const perRare = shift / rares.length
      for (const r of rares) r.weight += perRare
    }
  }

  const totalWeight = adjusted.reduce((sum, d) => sum + d.weight, 0)
  const roll = forcedRoll ?? Math.random() * totalWeight
  let cumulative = 0
  for (const d of adjusted) {
    cumulative += d.weight
    if (roll < cumulative) return d
  }
  return adjusted[adjusted.length - 1]
}
