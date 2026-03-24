import { describe, it, expect } from 'vitest'
import {
  computeRewardTrackModifiers,
  milestonesUnlockedBetween,
  perksUnlockedAt,
  type RewardTrackMilestone,
} from '../rewardTrack'

// Full reward track with rescaled SP thresholds (min 25 SP gap)
const MILESTONES: RewardTrackMilestone[] = [
  // Tier 1 (25-110 SP)
  { sp: 25,  id: 'swift-wheels',    icon: 'speed',     title: 'Swift Wheels',    description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.05 },
  { sp: 35,  id: 'tight-stow',     icon: 'inventory', title: 'Tight Stow',      description: '', type: 'REWARD TRACK', modifierKey: 'inventorySpace',     modifierValue: 0.025 },
  { sp: 50,  id: 'keen-eye',        icon: 'analysis',  title: 'Keen Eye',        description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.05 },
  { sp: 80,  id: 'power-nap',       icon: 'power',     title: 'Power Nap',       description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.05 },
  { sp: 110, id: 'second-wind',     icon: 'perk',      title: 'Second Wind',     description: '', type: 'PERK',         perkId: 'second-wind' },

  // Tier 2 (140-305 SP)
  { sp: 140, id: 'thick-skin',      icon: 'heater',    title: 'Thick Skin',      description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.05 },
  { sp: 170, id: 'data-yield',      icon: 'sp',        title: 'Data Yield',      description: '', type: 'REWARD TRACK', modifierKey: 'spYield',            modifierValue: 0.05 },
  { sp: 200, id: 'pack-rat',        icon: 'inventory', title: 'Pack Rat',        description: '', type: 'REWARD TRACK', modifierKey: 'inventorySpace',     modifierValue: 0.05 },
  { sp: 230, id: 'night-vision',    icon: 'perk',      title: 'Night Vision',    description: '', type: 'PERK',         perkId: 'night-vision' },
  { sp: 260, id: 'steady-hand',     icon: 'accuracy',  title: 'Steady Hand',     description: '', type: 'REWARD TRACK', modifierKey: 'instrumentAccuracy', modifierValue: 0.05 },
  { sp: 290, id: 'quick-fix',       icon: 'repair',    title: 'Quick Fix',       description: '', type: 'REWARD TRACK', modifierKey: 'repairCost',         modifierValue: -0.05 },
  { sp: 305, id: 'field-locker',    icon: 'inventory', title: 'Field Locker',    description: '', type: 'REWARD TRACK', modifierKey: 'inventorySpace',     modifierValue: 0.025 },

  // Tier 3 (320-530 SP)
  { sp: 320, id: 'cruise-control',  icon: 'speed',     title: 'Cruise Control',  description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.025 },
  { sp: 350, id: 'lab-efficiency',  icon: 'analysis',  title: 'Lab Efficiency',  description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.025 },
  { sp: 380, id: 'dust-shaker',     icon: 'perk',      title: 'Dust Shaker',     description: '', type: 'PERK',         perkId: 'dust-shaker' },
  { sp: 410, id: 'grid-sense',      icon: 'power',     title: 'Grid Sense',      description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.025 },
  { sp: 440, id: 'echo-scan',       icon: 'perk',      title: 'Echo Scan',       description: '', type: 'PERK',         perkId: 'echo-scan' },
  { sp: 455, id: 'salvage-sense',   icon: 'repair',    title: 'Salvage Sense',   description: '', type: 'REWARD TRACK', modifierKey: 'repairCost',         modifierValue: -0.025 },
  { sp: 470, id: 'warm-blood',      icon: 'heater',    title: 'Warm Blood',      description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.025 },
  { sp: 500, id: 'prospect-eye',    icon: 'sp',        title: 'Prospect Eye',    description: '', type: 'REWARD TRACK', modifierKey: 'spYield',            modifierValue: 0.025 },
  { sp: 530, id: 'overclock',       icon: 'perk',      title: 'Overclock',       description: '', type: 'PERK',         perkId: 'overclock' },

  // Tier 4 (560-770 SP)
  { sp: 560, id: 'iron-treads',     icon: 'speed',     title: 'Iron Treads',     description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.01 },
  { sp: 590, id: 'deep-reader',     icon: 'analysis',  title: 'Deep Reader',     description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.01 },
  { sp: 620, id: 'storm-rider',     icon: 'perk',      title: 'Storm Rider',     description: '', type: 'PERK',         perkId: 'storm-rider' },
  { sp: 635, id: 'signal-clarity',  icon: 'accuracy',  title: 'Signal Clarity',  description: '', type: 'REWARD TRACK', modifierKey: 'instrumentAccuracy', modifierValue: 0.025 },
  { sp: 650, id: 'lean-machine',    icon: 'power',     title: 'Lean Machine',    description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.01 },
  { sp: 680, id: 'furnace-heart',   icon: 'heater',    title: 'Furnace Heart',   description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.01 },
  { sp: 710, id: 'multi-scan',      icon: 'perk',      title: 'Multi-Scan',      description: '', type: 'PERK',         perkId: 'multi-scan' },
  { sp: 740, id: 'sharp-nose',      icon: 'accuracy',  title: 'Sharp Nose',      description: '', type: 'REWARD TRACK', modifierKey: 'instrumentAccuracy', modifierValue: 0.025 },
  { sp: 770, id: 'bulk-analysis',   icon: 'perk',      title: 'Bulk Analysis',   description: '', type: 'PERK',         perkId: 'bulk-analysis' },

  // Tier 5 (800-1000 SP)
  { sp: 800, id: 'marathon-wheels', icon: 'speed',     title: 'Marathon Wheels',  description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.015 },
  { sp: 830, id: 'reflex-scan',    icon: 'analysis',  title: 'Reflex Scan',      description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.015 },
  { sp: 860, id: 'solar-surplus',   icon: 'perk',      title: 'Solar Surplus',   description: '', type: 'PERK',         perkId: 'solar-surplus' },
  { sp: 890, id: 'whisper-draw',    icon: 'power',     title: 'Whisper Draw',    description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.015 },
  { sp: 920, id: 'polar-blood',     icon: 'heater',    title: 'Polar Blood',     description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.015 },
  { sp: 950, id: 'ghost-tracks',    icon: 'perk',      title: 'Ghost Tracks',    description: '', type: 'PERK',         perkId: 'ghost-tracks' },
  { sp: 965, id: 'jury-rig',        icon: 'repair',    title: 'Jury Rig',        description: '', type: 'REWARD TRACK', modifierKey: 'repairCost',         modifierValue: -0.025 },
  { sp: 980, id: 'legends-yield',   icon: 'sp',        title: "Legend's Yield",   description: '', type: 'REWARD TRACK', modifierKey: 'spYield',            modifierValue: 0.025 },
  { sp: 1000, id: 'full-autonomy',  icon: 'perk',      title: 'Full Autonomy',   description: '', type: 'PERK',         perkId: 'full-autonomy' },
]

describe('computeRewardTrackModifiers', () => {
  it('cumulative modifiers at 110 SP (end of Tier 1)', () => {
    const mods = computeRewardTrackModifiers(110, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.05, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.05, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.05, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.025, 3)
    expect(mods.heaterDraw).toBeUndefined()
    expect(mods.spYield).toBeUndefined()
    expect(mods.instrumentAccuracy).toBeUndefined()
    expect(mods.repairCost).toBeUndefined()
  })

  it('cumulative modifiers at 305 SP (end of Tier 2)', () => {
    const mods = computeRewardTrackModifiers(305, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.05, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.05, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.05, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.05, 3)
    expect(mods.spYield).toBeCloseTo(0.05, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.10, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.05, 3)
    expect(mods.repairCost).toBeCloseTo(-0.05, 3)
  })

  it('cumulative modifiers at 530 SP (end of Tier 3)', () => {
    const mods = computeRewardTrackModifiers(530, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.075, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.075, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.075, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.075, 3)
    expect(mods.spYield).toBeCloseTo(0.075, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.10, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.05, 3)
    expect(mods.repairCost).toBeCloseTo(-0.075, 3)
  })

  it('cumulative modifiers at 770 SP (end of Tier 4)', () => {
    const mods = computeRewardTrackModifiers(770, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.085, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.085, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.085, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.085, 3)
    expect(mods.spYield).toBeCloseTo(0.075, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.10, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.10, 3)
    expect(mods.repairCost).toBeCloseTo(-0.075, 3)
  })

  it('cumulative modifiers at 1000 SP (end of Tier 5)', () => {
    const mods = computeRewardTrackModifiers(1000, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.10, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.10, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.10, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.10, 3)
    expect(mods.spYield).toBeCloseTo(0.10, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.10, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.10, 3)
    expect(mods.repairCost).toBeCloseTo(-0.10, 3)
  })
})

describe('milestonesUnlockedBetween', () => {
  it('returns the 170-SP milestone for range (160, 175]', () => {
    const unlocked = milestonesUnlockedBetween(160, 175, MILESTONES)
    expect(unlocked).toHaveLength(1)
    expect(unlocked[0].id).toBe('data-yield')
    expect(unlocked[0].sp).toBe(170)
  })

  it('returns nothing when prevSp === nextSp (non-inclusive lower bound)', () => {
    const unlocked = milestonesUnlockedBetween(50, 50, MILESTONES)
    expect(unlocked).toHaveLength(0)
  })
})

describe('perksUnlockedAt', () => {
  it('returns second-wind and night-vision at 230 SP', () => {
    const perks = perksUnlockedAt(230, MILESTONES)
    expect(perks).toEqual(new Set(['second-wind', 'night-vision']))
  })

  it('returns only second-wind at 229 SP', () => {
    const perks = perksUnlockedAt(229, MILESTONES)
    expect(perks).toEqual(new Set(['second-wind']))
  })
})
