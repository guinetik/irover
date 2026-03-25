import { reactive, ref } from 'vue'

// --- Modifier categories ---
// All values are percentage offsets: 0 = no change, 0.05 = +5%, -0.10 = -10%.
// They stack additively within a category, then apply as (1 + sum) multiplier.

export interface ProfileModifiers {
  movementSpeed: number
  analysisSpeed: number
  powerConsumption: number
  heaterDraw: number
  spYield: number
  inventorySpace: number
  instrumentAccuracy: number
  repairCost: number
  upgradeCost: number
  weatherWarning: number
  batteryCapacity: number
  danScanRadius: number
  buildSpeed: number
  structureDurability: number
}

const ZERO_MODIFIERS: ProfileModifiers = {
  movementSpeed: 0,
  analysisSpeed: 0,
  powerConsumption: 0,
  heaterDraw: 0,
  spYield: 0,
  inventorySpace: 0,
  instrumentAccuracy: 0,
  repairCost: 0,
  upgradeCost: 0,
  weatherWarning: 0,
  batteryCapacity: 0,
  danScanRadius: 0,
  buildSpeed: 0,
  structureDurability: 0,
}

// --- Archetypes (Step 1) ---

export type ArchetypeId = 'maker' | 'manager' | 'methodist'

export interface ArchetypeDef {
  id: ArchetypeId
  name: string
  description: string
  modifiers: Partial<ProfileModifiers>
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  maker: {
    id: 'maker',
    name: 'Maker',
    description: 'Hands-on engineer. Faster on the ground.',
    modifiers: { movementSpeed: 0.05 },
  },
  manager: {
    id: 'manager',
    name: 'Manager',
    description: 'Methodical planner. Faster analysis across all instruments.',
    modifiers: { analysisSpeed: 0.05 },
  },
  methodist: {
    id: 'methodist',
    name: 'Methodist',
    description: 'Resourceful operator. Cheaper repairs and upgrades.',
    modifiers: { repairCost: -0.05, upgradeCost: -0.05 },
  },
}

// --- Foundations (Step 4) ---

export type FoundationId = 'technologist' | 'phd' | 'astronaut'

export interface FoundationDef {
  id: FoundationId
  name: string
  description: string
  modifiers: Partial<ProfileModifiers>
}

export const FOUNDATIONS: Record<FoundationId, FoundationDef> = {
  technologist: {
    id: 'technologist',
    name: 'Technologist',
    description: 'Systems engineer. Power-efficient but lighter on cargo.',
    modifiers: { powerConsumption: -0.05, weatherWarning: -0.05, inventorySpace: -0.15 },
  },
  phd: {
    id: 'phd',
    name: 'PhD',
    description: 'Research scientist. Brilliant analysis, slow on foot.',
    modifiers: { spYield: 0.10, analysisSpeed: 0.10, movementSpeed: -0.10, powerConsumption: 0.05 },
  },
  astronaut: {
    id: 'astronaut',
    name: 'Astronaut',
    description: 'Field operator. Fast mover, reads the weather, burns more power driving.',
    modifiers: { movementSpeed: 0.10, weatherWarning: 0.15, powerConsumption: 0.10 },
  },
}

// --- Origins (Step 3 — flavor only, no modifiers) ---

export type OriginId = 'earth' | 'metropolis' | 'lunar'

export interface OriginDef {
  id: OriginId
  name: string
  description: string
}

export const ORIGINS: Record<OriginId, OriginDef> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    description:
      'Born and raised on the homeworld. You know what real weather feels like. Familiar with natural terrain, organic geology, and open skies.',
  },
  metropolis: {
    id: 'metropolis',
    name: 'Metropolis Colony',
    description:
      "A generation station in the belt. Steel floors, recycled air, artificial gravity. You've never seen a horizon that wasn't a viewport.",
  },
  lunar: {
    id: 'lunar',
    name: 'Lunar Settlement',
    description:
      'Low gravity, long shadows, and silence. The Moon teaches patience. You understand regolith. You understand isolation.',
  },
}

// --- Motivations (Step 2 — flavor only, no modifiers) ---

export type MotivationId = 'legacy' | 'therapist' | 'commute'

export interface MotivationDef {
  id: MotivationId
  name: string
  description: string
}

export const MOTIVATIONS: Record<MotivationId, MotivationDef> = {
  legacy: {
    id: 'legacy',
    name: 'Legacy',
    description:
      "I believe humanity's future depends on becoming a multi-planetary species, and I want to contribute to that legacy.",
  },
  therapist: {
    id: 'therapist',
    name: 'Therapist',
    description:
      "My therapist suggested I find a hobby that 'gets me out of the house.' This seemed like the logical extreme.",
  },
  commute: {
    id: 'commute',
    name: 'Commute',
    description:
      "I heard the commute is only 7 months and there's no traffic.",
  },
}

// --- Patrons (Mission Sponsorship) ---

export type PatronId = 'trc' | 'isf' | 'msi'

export interface PatronDef {
  id: PatronId
  name: string
  fullName: string
  identity: string
  description: string
  modifiers: Partial<ProfileModifiers>
}

export const PATRONS: Record<PatronId, PatronDef> = {
  trc: {
    id: 'trc',
    name: 'TRC',
    fullName: 'Technocrats',
    identity: 'The Prospector',
    description: 'Mars as quarry. Cheap maintenance, efficient heating, but slower science.',
    modifiers: {
      repairCost: -0.50,
      upgradeCost: -0.50,
      heaterDraw: -0.25,
      analysisSpeed: -0.10,
      spYield: -0.10,
    },
  },
  isf: {
    id: 'isf',
    name: 'ISF',
    fullName: 'Academics',
    identity: 'The Scientist',
    description: 'Mars as library. Brilliant instruments, power-hungry.',
    modifiers: {
      analysisSpeed: 0.30,
      instrumentAccuracy: 0.10,
      powerConsumption: 0.15,
      batteryCapacity: -0.10,
    },
  },
  msi: {
    id: 'msi',
    name: 'MSI',
    fullName: 'Colonialists',
    identity: 'The Builder',
    description: 'Mars as home. Big cargo, strong structures, but slow science and cold nights.',
    modifiers: {
      inventorySpace: 0.50,
      buildSpeed: 0.30,
      danScanRadius: 0.20,
      structureDurability: 0.25,
      movementSpeed: -0.05,
      analysisSpeed: -0.15,
      spYield: -0.10,
      heaterDraw: 0.20,
    },
  },
}

// --- Resolved profile ---

/** All 1.0 — no buffs, no nerfs */
const NEUTRAL_MODIFIERS: ProfileModifiers = Object.fromEntries(
  Object.keys(ZERO_MODIFIERS).map(k => [k, 1]),
) as unknown as ProfileModifiers

export interface PlayerProfile {
  archetype: ArchetypeId | null
  foundation: FoundationId | null
  patron: PatronId | null
  origin: OriginId | null
  motivation: MotivationId | null
  /** Final stacked modifiers as multipliers (1.0 = no change, 1.15 = +15%) */
  modifiers: ProfileModifiers
  /** True until character creation is completed; enables unrestricted play */
  sandbox: boolean
}

/**
 * Stack partial modifier sets additively, then convert to multipliers.
 * e.g. +0.10 and +0.05 on analysisSpeed → 1.15 multiplier.
 */
function resolveModifiers(...layers: Partial<ProfileModifiers>[]): ProfileModifiers {
  const stacked = { ...ZERO_MODIFIERS }
  for (const layer of layers) {
    for (const key of Object.keys(layer) as (keyof ProfileModifiers)[]) {
      stacked[key] += layer[key] ?? 0
    }
  }
  // Convert offsets to multipliers
  const resolved = { ...ZERO_MODIFIERS }
  for (const key of Object.keys(stacked) as (keyof ProfileModifiers)[]) {
    resolved[key] = 1 + stacked[key]
  }
  return resolved
}

/**
 * Factory: build a resolved PlayerProfile from the three choices.
 */
export function createPlayerProfile(
  archetype: ArchetypeId,
  foundation: FoundationId,
  patron: PatronId,
): PlayerProfile {
  return {
    archetype,
    foundation,
    patron,
    origin: null,
    motivation: null,
    modifiers: resolveModifiers(
      ARCHETYPES[archetype].modifiers,
      FOUNDATIONS[foundation].modifiers,
      PATRONS[patron].modifiers,
    ),
    sandbox: false,
  }
}

/** Neutral default — no choices made yet, all modifiers 1.0 */
export function createNeutralProfile(): PlayerProfile {
  return {
    archetype: null,
    foundation: null,
    patron: null,
    origin: null,
    motivation: null,
    modifiers: { ...NEUTRAL_MODIFIERS },
    sandbox: false,
  }
}

// --- localStorage persistence ---

const STORAGE_KEY = 'mars-profile-v1'

interface StoredProfile {
  archetype: ArchetypeId | null
  foundation: FoundationId | null
  patron: PatronId | null
  origin: OriginId | null
  motivation: MotivationId | null
  sandbox: boolean
}

// --- Singleton reactive state ---

const profile = reactive<PlayerProfile>(createNeutralProfile())

// Private refs for the three choice IDs + reward track layer
const chosenArchetype = ref<ArchetypeId | null>(null)
const chosenFoundation = ref<FoundationId | null>(null)
const chosenPatron = ref<PatronId | null>(null)
const chosenOrigin = ref<OriginId | null>(null)
const chosenMotivation = ref<MotivationId | null>(null)
const rewardTrackLayer = ref<Partial<ProfileModifiers>>({})

function saveToStorage(): void {
  try {
    const data: StoredProfile = {
      archetype: chosenArchetype.value,
      foundation: chosenFoundation.value,
      patron: chosenPatron.value,
      origin: chosenOrigin.value,
      motivation: chosenMotivation.value,
      sandbox: profile.sandbox,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage unavailable (SSR, private mode quota, etc.) — silently ignore
  }
}

function hydrateProfile(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as StoredProfile
    chosenArchetype.value = data.archetype ?? null
    chosenFoundation.value = data.foundation ?? null
    chosenPatron.value = data.patron ?? null
    chosenOrigin.value = data.origin ?? null
    chosenMotivation.value = data.motivation ?? null
    profile.sandbox = data.sandbox ?? false
    recomputeModifiers()
  } catch {
    // Corrupt or missing data — leave profile at defaults
  }
}

function clearProfile(): void {
  chosenArchetype.value = null
  chosenFoundation.value = null
  chosenPatron.value = null
  chosenOrigin.value = null
  chosenMotivation.value = null
  recomputeModifiers()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — silently ignore
  }
}

/**
 * Recompute profile modifiers from all four sources:
 * archetype + foundation + patron + reward track.
 */
function recomputeModifiers(): void {
  profile.origin = chosenOrigin.value
  profile.motivation = chosenMotivation.value
  if (!chosenArchetype.value || !chosenFoundation.value || !chosenPatron.value) {
    profile.archetype = null
    profile.foundation = null
    profile.patron = null
    Object.assign(profile.modifiers, resolveModifiers(rewardTrackLayer.value))
    return
  }
  profile.archetype = chosenArchetype.value
  profile.foundation = chosenFoundation.value
  profile.patron = chosenPatron.value
  Object.assign(
    profile.modifiers,
    resolveModifiers(
      ARCHETYPES[chosenArchetype.value].modifiers,
      FOUNDATIONS[chosenFoundation.value].modifiers,
      PATRONS[chosenPatron.value].modifiers,
      rewardTrackLayer.value,
    ),
  )
}

/**
 * Reactive player profile (singleton). Call setProfile() to change run configuration.
 */
export function usePlayerProfile() {
  function setProfile(
    archetype: ArchetypeId | null,
    foundation: FoundationId | null,
    patron: PatronId | null,
  ): void {
    chosenArchetype.value = archetype
    chosenFoundation.value = foundation
    chosenPatron.value = patron
    recomputeModifiers()
    saveToStorage()
  }

  /**
   * Apply reward-track modifier overrides (fourth layer).
   * This is lifetime data — setProfile does NOT clear it.
   */
  function applyRewardTrack(partial: Partial<ProfileModifiers>): void {
    rewardTrackLayer.value = partial
    recomputeModifiers()
    saveToStorage()
  }

  function setIdentity(origin: OriginId, motivation: MotivationId): void {
    chosenOrigin.value = origin
    chosenMotivation.value = motivation
    profile.origin = origin
    profile.motivation = motivation
    saveToStorage()
  }

  /** Convenience: get a single modifier multiplier */
  function mod(key: keyof ProfileModifiers): number {
    return profile.modifiers[key]
  }

  return {
    profile,
    setProfile,
    setIdentity,
    applyRewardTrack,
    hydrateProfile,
    clearProfile,
    mod,
    ARCHETYPES,
    FOUNDATIONS,
    PATRONS,
    ORIGINS,
    MOTIVATIONS,
  }
}

// Hydrate from storage on module load
hydrateProfile()
