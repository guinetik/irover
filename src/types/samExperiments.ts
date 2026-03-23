/** Affinity rating for a rock type in a given analysis mode */
export type RockAffinity = 'excellent' | 'good' | 'moderate' | 'poor'

/** Discovery rarity tier */
export type DiscoveryRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

/** One of SAM's three analysis instruments */
export interface SAMAnalysisMode {
  id: string
  name: string
  instrument: string
  description: string
  hint: string
  powerW: number
  baseDurationSec: number
  /** SP threshold to unlock this mode (0 = available from start) */
  unlockSP: number
  /** Additional inventory items consumed per run (e.g. ice for wet chemistry) */
  ingredients: { itemId: string; quantity: number }[]
  icon: string
  /** Rock type → affinity rating */
  affinities: Record<string, RockAffinity>
}

/** A discoverable compound/signature from SAM analysis */
export interface SAMDiscovery {
  id: string
  name: string
  rarity: DiscoveryRarity
  sp: number
  /** Which analysis mode produces this discovery */
  mode: string
  /** Which rock types can yield this discovery */
  rockTypes: string[]
  description: string
  /** Byproducts dropped into inventory on discovery (empty = knowledge only) */
  sideProducts: { itemId: string; quantity: number }[]
}

/** Rarity probability distribution for a rock type × mode combo (percentages, should sum to ~100) */
export interface RarityWeights {
  common: number
  uncommon: number
  rare: number
  legendary: number
}

/** Mini-game quality score → SP multiplier (key = minimum quality %) */
export type QualityBonusTable = Record<string, number>

/** Number of completed modes on same sample → SP multiplier */
export type MultiModeBonusTable = Record<string, number>

/** Root shape of public/data/sam-experiments.json */
export interface SAMExperimentsFile {
  version: number
  /** Kg consumed from rock sample per analysis run */
  sampleConsumptionKg: number
  modes: SAMAnalysisMode[]
  qualityBonuses: QualityBonusTable
  multiModeBonus: MultiModeBonusTable
  discoveries: SAMDiscovery[]
  /** rockType → modeId → rarity weights */
  yieldTable: Record<string, Record<string, RarityWeights>>
}
