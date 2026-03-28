import type { ShowerSeverity } from './meteorTypes'

const METEOR_COUNTS: Record<ShowerSeverity, [number, number]> = {
  light:    [6, 10],
  moderate: [12, 20],
  heavy:    [20, 30],
}

export function getShowerChancePerSol(meteorRisk: number): number {
  return 0.03 + 0.47 * Math.pow(meteorRisk, 1.4)
}

export function rollShowerThisSol(meteorRisk: number): boolean {
  return Math.random() < getShowerChancePerSol(meteorRisk)
}

export function rollShowerSeverity(meteorRisk: number): ShowerSeverity {
  const roll = Math.random()
  if (meteorRisk >= 0.55) return roll < 0.7 ? 'heavy' : 'moderate'
  if (meteorRisk >= 0.30) return roll < 0.5 ? 'moderate' : roll < 0.85 ? 'heavy' : 'light'
  if (meteorRisk >= 0.15) return roll < 0.6 ? 'light' : 'moderate'
  return 'light'
}

export function rollMeteorCount(severity: ShowerSeverity): number {
  const [min, max] = METEOR_COUNTS[severity]
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function rollTriggerFraction(): number {
  return 0.2 + Math.random() * 0.6
}

export function pickMeteoriteVariant(): string {
  const index = Math.floor(Math.random() * 10) + 1
  return `Lp${String(index).padStart(2, '0')}`
}
