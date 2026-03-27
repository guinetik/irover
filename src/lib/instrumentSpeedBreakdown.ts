// src/lib/instrumentSpeedBreakdown.ts
import type { ProfileModifiers } from '@/composables/usePlayerProfile'

export interface SpeedBuffEntry {
  label: string
  value: string
  color: string
}

export interface SpeedBreakdown {
  /** Effective speed as percentage of baseline (100 = no buffs). */
  speedPct: number
  /** Contributing buff / debuff entries. */
  buffs: SpeedBuffEntry[]
}

/** Source definition for one profile layer (archetype, foundation, or patron). */
export interface ProfileSource {
  id: string
  name: string
  modifiers: Partial<ProfileModifiers>
}

export interface SpeedBreakdownInput {
  modifierKey: keyof ProfileModifiers
  archetype: ProfileSource | null
  foundation: ProfileSource | null
  patron: ProfileSource | null
  trackModifiers: Partial<ProfileModifiers>
  thermalZone?: 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'
  extras?: SpeedBuffEntry[]
  speedPctOverride?: number
}

const GREEN = '#5dc9a5'
const RED = '#e05030'
const DIM = 'rgba(196,117,58,0.6)'

/** Duration multiplier per thermal zone (higher = slower). */
const THERMAL_DURATION_MULT: Record<string, number> = {
  OPTIMAL: 1.0,
  COLD: 0.85,
  FRIGID: 1.25,
  CRITICAL: 2.0,
}

function fmtBuff(v: number): string {
  const pct = Math.round(v * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

export function buildSpeedBreakdown(input: SpeedBreakdownInput): SpeedBreakdown {
  const buffs: SpeedBuffEntry[] = []
  let profileSum = 0

  // Profile sources: archetype, foundation, patron
  for (const source of [input.archetype, input.foundation, input.patron]) {
    if (!source) continue
    const mod = source.modifiers[input.modifierKey]
    if (mod) {
      buffs.push({ label: source.name.toUpperCase(), value: fmtBuff(mod), color: mod > 0 ? GREEN : RED })
      profileSum += mod
    }
  }

  // Reward track
  const trackMod = input.trackModifiers[input.modifierKey]
  if (trackMod) {
    buffs.push({ label: 'REWARD TRACK', value: fmtBuff(trackMod), color: trackMod > 0 ? GREEN : RED })
    profileSum += trackMod
  }

  // Thermal zone
  let thermalSpeedFactor = 1
  if (input.thermalZone && input.thermalZone !== 'OPTIMAL') {
    const durMult = THERMAL_DURATION_MULT[input.thermalZone] ?? 1
    thermalSpeedFactor = 1 / durMult
    const pctDelta = thermalSpeedFactor - 1
    buffs.push({
      label: `WEATHER (${input.thermalZone})`,
      value: fmtBuff(pctDelta),
      color: pctDelta > 0 ? GREEN : RED,
    })
  }

  // Extras (display-only)
  if (input.extras) {
    for (const extra of input.extras) {
      buffs.push(extra)
    }
  }

  // Compute speedPct
  const profileMult = 1 + profileSum
  let speedPct = profileMult * thermalSpeedFactor * 100
  if (input.speedPctOverride !== undefined) {
    speedPct = input.speedPctOverride
  }

  // Baseline fallback
  if (buffs.length === 0) {
    buffs.push({ label: 'BASELINE', value: '100%', color: DIM })
  }

  return { speedPct, buffs }
}
