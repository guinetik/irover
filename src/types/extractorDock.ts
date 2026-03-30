// src/types/extractorDock.ts

export type ExtractorFluidType = 'water' | 'co2' | 'methane'

/**
 * Represents one deployed extractor, normalised from either DAN archive
 * (water) or vent archive (co2/methane). Used for proximity docking checks.
 */
export interface ExtractorDockTarget {
  archiveId: string
  archiveType: 'dan' | 'vent'
  fluidType: ExtractorFluidType
  x: number   // terrain-frame X
  z: number   // terrain-frame Z
  storedKg: number
  lastChargedSol: number
  reservoirQuality: number  // 0–1; drives charge rate
}

/**
 * State held in pendingExtractorDock while rover is docked.
 * storedKg is mutable — updated after each extract action.
 */
export interface ExtractorDockState {
  archiveId: string
  archiveType: 'dan' | 'vent'
  fluidType: ExtractorFluidType
  storedKg: number
  maxStorageKg: number         // 1.0 × danStorageCapacityMod
  chargeRateKgPerSol: number   // reservoirQuality × danChargeRateMod
  extractPowerW: number        // 5.0 × danPowerCostMod
  cargoFull?: boolean          // true when last extract failed due to full inventory
}
