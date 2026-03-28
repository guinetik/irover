/** Zone tier at a map position. */
export type RadiationZone = 'safe' | 'intermediate' | 'hazardous'

/** Dose range for a zone tier (mGy/day). */
export interface ZoneDoseRange {
  min: number
  max: number
}

/** Zone tier thresholds and metadata. */
export const ZONE_CONFIG: Record<RadiationZone, { label: string; color: string; doseRange: ZoneDoseRange }> = {
  safe:         { label: 'SAFE',         color: '#44dd88', doseRange: { min: 0.10, max: 0.25 } },
  intermediate: { label: 'INTERMEDIATE', color: '#e8a54b', doseRange: { min: 0.25, max: 0.60 } },
  hazardous:    { label: 'HAZARDOUS',    color: '#ff4444', doseRange: { min: 0.60, max: 1.20 } },
}

/** Normalized radiation scalar (0.0–1.0+) thresholds for zone classification. */
export interface RadiationThresholds {
  safeMax: number
  hazardousMin: number
}

/** Particle species in the RAD detector stack. */
export type RadParticleType = 'proton' | 'neutron' | 'gamma' | 'hze'

/** Radiation event identifiers. */
export type RadEventId = 'gcr-fluctuation' | 'soft-sep' | 'hard-sep' | 'forbush-decrease'

/** Rarity tier for events. */
export type RadEventRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

/** Definition of a radiation event type. */
export interface RadEventDef {
  id: RadEventId
  name: string
  rarity: RadEventRarity
  sp: number
  totalParticles: number
  composition: Record<RadParticleType, number>
  spawnWeight: number
  sideProducts: Array<{ itemId: string; quantity: number }>
  /** Particle rate curve type. */
  rateCurve: 'steady' | 'ramp-up' | 'peak-mid' | 'front-loaded'
  /** Duration of CMB audio in seconds. */
  durationSec: number
}

/** Spawn table configuration. */
export interface RadSpawnConfig {
  baseIntervalSecMin: number
  baseIntervalSecMax: number
  cooldownAfterEventSec: number
}

export const RAD_SPAWN_CONFIG: RadSpawnConfig = {
  baseIntervalSecMin: 120,
  baseIntervalSecMax: 300,
  cooldownAfterEventSec: 60,
}

/** All four event definitions. */
export const RAD_EVENT_DEFS: Record<RadEventId, RadEventDef> = {
  'gcr-fluctuation': {
    id: 'gcr-fluctuation', name: 'GCR Fluctuation', rarity: 'common', sp: 15,
    totalParticles: 18, composition: { proton: 0.30, neutron: 0.30, gamma: 0.25, hze: 0.15 },
    spawnWeight: 50, sideProducts: [], rateCurve: 'steady', durationSec: 20,
  },
  'soft-sep': {
    id: 'soft-sep', name: 'Soft Spectrum SEP', rarity: 'uncommon', sp: 55,
    totalParticles: 28, composition: { proton: 0.05, neutron: 0.60, gamma: 0.30, hze: 0.05 },
    spawnWeight: 25, sideProducts: [{ itemId: 'rad-neutron-profile', quantity: 1 }],
    rateCurve: 'ramp-up', durationSec: 20,
  },
  'hard-sep': {
    id: 'hard-sep', name: 'Hard Spectrum SEP', rarity: 'rare', sp: 140,
    totalParticles: 45, composition: { proton: 0.30, neutron: 0.25, gamma: 0.25, hze: 0.20 },
    spawnWeight: 8, sideProducts: [{ itemId: 'rad-sep-profile', quantity: 1 }, { itemId: 'rad-dose-record', quantity: 1 }],
    rateCurve: 'peak-mid', durationSec: 20,
  },
  'forbush-decrease': {
    id: 'forbush-decrease', name: 'Forbush Decrease', rarity: 'legendary', sp: 350,
    totalParticles: 8, composition: { proton: 0.35, neutron: 0.35, gamma: 0.20, hze: 0.10 },
    spawnWeight: 3, sideProducts: [{ itemId: 'rad-forbush-profile', quantity: 1 }, { itemId: 'rad-cme-data', quantity: 1 }],
    rateCurve: 'front-loaded', durationSec: 20,
  },
}

/** Quality grade thresholds based on catch rate. */
export type RadQualityGrade = 'S' | 'A' | 'B' | 'C' | 'D'

/** Instruments blocked in hazardous zones. RAD and RTG exempt. */
export const RADIATION_BLOCKED_INSTRUMENTS = ['chemcam', 'apxs', 'sam', 'dan', 'dril', 'mastcam', 'rems'] as const

/** Night modulation on GCR baseline. */
export const RAD_NIGHT_DOSE_MULTIPLIER = 1.12
