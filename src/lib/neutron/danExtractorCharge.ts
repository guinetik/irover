export interface ChargeResult {
  storedKg: number
  lastChargedSol: number
}

export interface ChargeParams {
  storedKg: number
  lastChargedSol: number
  currentSol: number
  reservoirQuality: number  // 0–1
  danChargeRateMod: number  // 1.0 = no change
  danStorageCapMod: number  // 1.0 = no change
}

/**
 * Calculate accumulated charge since last update.
 * chargeRate = reservoirQuality × danChargeRateMod  kg/sol
 * maxStorage = 1.0 × danStorageCapMod  kg
 * Pure — no side effects.
 */
export function calcExtractorCharge(p: ChargeParams): ChargeResult {
  const chargeRate = p.reservoirQuality * p.danChargeRateMod
  const elapsedSols = Math.max(0, p.currentSol - p.lastChargedSol)
  const maxStorage = 1.0 * p.danStorageCapMod
  return {
    storedKg: Math.min(p.storedKg + chargeRate * elapsedSols, maxStorage),
    lastChargedSol: p.currentSol,
  }
}
