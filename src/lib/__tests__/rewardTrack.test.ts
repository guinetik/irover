import { describe, it, expect } from 'vitest'
import {
  computeRewardTrackModifiers,
  milestonesUnlockedBetween,
  perksUnlockedAt,
  type RewardTrackMilestone,
} from '../rewardTrack'

// Full 26-row reward track from GDD
const MILESTONES: RewardTrackMilestone[] = [
  // Tier 1 (0-100 SP)
  { sp: 20,  id: 'swift-wheels',    icon: 'speed',     title: 'Swift Wheels',    description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.05 },
  { sp: 50,  id: 'keen-eye',        icon: 'analysis',  title: 'Keen Eye',        description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.05 },
  { sp: 80,  id: 'power-nap',       icon: 'power',     title: 'Power Nap',       description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.05 },
  { sp: 100, id: 'second-wind',     icon: 'perk',      title: 'Second Wind',     description: '', type: 'PERK',         perkId: 'second-wind' },

  // Tier 2 (120-250 SP)
  { sp: 120, id: 'thick-skin',      icon: 'heater',    title: 'Thick Skin',      description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.05 },
  { sp: 150, id: 'data-yield',      icon: 'sp',        title: 'Data Yield',      description: '', type: 'REWARD TRACK', modifierKey: 'spYield',            modifierValue: 0.05 },
  { sp: 180, id: 'pack-rat',        icon: 'inventory', title: 'Pack Rat',        description: '', type: 'REWARD TRACK', modifierKey: 'inventorySpace',     modifierValue: 0.05 },
  { sp: 200, id: 'night-vision',    icon: 'perk',      title: 'Night Vision',    description: '', type: 'PERK',         perkId: 'night-vision' },
  { sp: 230, id: 'steady-hand',     icon: 'accuracy',  title: 'Steady Hand',     description: '', type: 'REWARD TRACK', modifierKey: 'instrumentAccuracy', modifierValue: 0.05 },
  { sp: 250, id: 'quick-fix',       icon: 'repair',    title: 'Quick Fix',       description: '', type: 'REWARD TRACK', modifierKey: 'repairCost',         modifierValue: -0.05 },

  // Tier 3 (280-500 SP)
  { sp: 280, id: 'cruise-control',  icon: 'speed',     title: 'Cruise Control',  description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.025 },
  { sp: 310, id: 'lab-efficiency',  icon: 'analysis',  title: 'Lab Efficiency',  description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.025 },
  { sp: 340, id: 'dust-shaker',     icon: 'perk',      title: 'Dust Shaker',     description: '', type: 'PERK',         perkId: 'dust-shaker' },
  { sp: 370, id: 'grid-sense',      icon: 'power',     title: 'Grid Sense',      description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.025 },
  { sp: 400, id: 'echo-scan',       icon: 'perk',      title: 'Echo Scan',       description: '', type: 'PERK',         perkId: 'echo-scan' },
  { sp: 430, id: 'warm-blood',      icon: 'heater',    title: 'Warm Blood',      description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.025 },
  { sp: 460, id: 'prospect-eye',    icon: 'sp',        title: 'Prospect Eye',    description: '', type: 'REWARD TRACK', modifierKey: 'spYield',            modifierValue: 0.025 },
  { sp: 500, id: 'overclock',       icon: 'perk',      title: 'Overclock',       description: '', type: 'PERK',         perkId: 'overclock' },

  // Tier 4 (530-750 SP)
  { sp: 530, id: 'iron-treads',     icon: 'speed',     title: 'Iron Treads',     description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.01 },
  { sp: 560, id: 'deep-reader',     icon: 'analysis',  title: 'Deep Reader',     description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.01 },
  { sp: 590, id: 'storm-rider',     icon: 'perk',      title: 'Storm Rider',     description: '', type: 'PERK',         perkId: 'storm-rider' },
  { sp: 620, id: 'lean-machine',    icon: 'power',     title: 'Lean Machine',    description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.01 },
  { sp: 650, id: 'furnace-heart',   icon: 'heater',    title: 'Furnace Heart',   description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.01 },
  { sp: 680, id: 'multi-scan',      icon: 'perk',      title: 'Multi-Scan',      description: '', type: 'PERK',         perkId: 'multi-scan' },
  { sp: 710, id: 'sharp-nose',      icon: 'accuracy',  title: 'Sharp Nose',      description: '', type: 'REWARD TRACK', modifierKey: 'instrumentAccuracy', modifierValue: 0.01 },
  { sp: 750, id: 'bulk-analysis',   icon: 'perk',      title: 'Bulk Analysis',   description: '', type: 'PERK',         perkId: 'bulk-analysis' },

  // Tier 5 (800-1000 SP)
  { sp: 800, id: 'marathon-wheels', icon: 'speed',     title: 'Marathon Wheels',  description: '', type: 'REWARD TRACK', modifierKey: 'movementSpeed',      modifierValue: 0.01 },
  { sp: 830, id: 'reflex-scan',    icon: 'analysis',  title: 'Reflex Scan',      description: '', type: 'REWARD TRACK', modifierKey: 'analysisSpeed',      modifierValue: 0.01 },
  { sp: 860, id: 'solar-surplus',   icon: 'perk',      title: 'Solar Surplus',   description: '', type: 'PERK',         perkId: 'solar-surplus' },
  { sp: 890, id: 'whisper-draw',    icon: 'power',     title: 'Whisper Draw',    description: '', type: 'REWARD TRACK', modifierKey: 'powerConsumption',   modifierValue: -0.01 },
  { sp: 920, id: 'polar-blood',     icon: 'heater',    title: 'Polar Blood',     description: '', type: 'REWARD TRACK', modifierKey: 'heaterDraw',         modifierValue: -0.01 },
  { sp: 950, id: 'ghost-tracks',    icon: 'perk',      title: 'Ghost Tracks',    description: '', type: 'PERK',         perkId: 'ghost-tracks' },
  { sp: 980, id: 'legends-yield',   icon: 'sp',        title: "Legend's Yield",   description: '', type: 'REWARD TRACK', modifierKey: 'spYield',            modifierValue: 0.01 },
  { sp: 1000, id: 'full-autonomy',  icon: 'perk',      title: 'Full Autonomy',   description: '', type: 'PERK',         perkId: 'full-autonomy' },
]

describe('computeRewardTrackModifiers', () => {
  it('cumulative modifiers at 100 SP', () => {
    const mods = computeRewardTrackModifiers(100, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.05, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.05, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.05, 3)
    expect(mods.heaterDraw).toBeUndefined()
    expect(mods.spYield).toBeUndefined()
    expect(mods.inventorySpace).toBeUndefined()
    expect(mods.instrumentAccuracy).toBeUndefined()
    expect(mods.repairCost).toBeUndefined()
  })

  it('cumulative modifiers at 250 SP', () => {
    const mods = computeRewardTrackModifiers(250, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.05, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.05, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.05, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.05, 3)
    expect(mods.spYield).toBeCloseTo(0.05, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.05, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.05, 3)
    expect(mods.repairCost).toBeCloseTo(-0.05, 3)
  })

  it('cumulative modifiers at 500 SP', () => {
    const mods = computeRewardTrackModifiers(500, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.075, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.075, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.075, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.075, 3)
    expect(mods.spYield).toBeCloseTo(0.075, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.05, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.05, 3)
    expect(mods.repairCost).toBeCloseTo(-0.05, 3)
  })

  it('cumulative modifiers at 750 SP', () => {
    const mods = computeRewardTrackModifiers(750, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.085, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.085, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.085, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.085, 3)
    expect(mods.spYield).toBeCloseTo(0.075, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.05, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.06, 3)
    expect(mods.repairCost).toBeCloseTo(-0.05, 3)
  })

  it('cumulative modifiers at 1000 SP', () => {
    const mods = computeRewardTrackModifiers(1000, MILESTONES)
    expect(mods.movementSpeed).toBeCloseTo(0.095, 3)
    expect(mods.analysisSpeed).toBeCloseTo(0.095, 3)
    expect(mods.powerConsumption).toBeCloseTo(-0.095, 3)
    expect(mods.heaterDraw).toBeCloseTo(-0.095, 3)
    expect(mods.spYield).toBeCloseTo(0.085, 3)
    expect(mods.inventorySpace).toBeCloseTo(0.05, 3)
    expect(mods.instrumentAccuracy).toBeCloseTo(0.06, 3)
    expect(mods.repairCost).toBeCloseTo(-0.05, 3)
  })
})

describe('milestonesUnlockedBetween', () => {
  it('returns the 150-SP milestone for range (140, 155]', () => {
    const unlocked = milestonesUnlockedBetween(140, 155, MILESTONES)
    expect(unlocked).toHaveLength(1)
    expect(unlocked[0].id).toBe('data-yield')
    expect(unlocked[0].sp).toBe(150)
  })

  it('returns nothing when prevSp === nextSp (non-inclusive lower bound)', () => {
    const unlocked = milestonesUnlockedBetween(50, 50, MILESTONES)
    expect(unlocked).toHaveLength(0)
  })
})

describe('perksUnlockedAt', () => {
  it('returns second-wind and night-vision at 200 SP', () => {
    const perks = perksUnlockedAt(200, MILESTONES)
    expect(perks).toEqual(new Set(['second-wind', 'night-vision']))
  })

  it('returns only second-wind at 199 SP', () => {
    const perks = perksUnlockedAt(199, MILESTONES)
    expect(perks).toEqual(new Set(['second-wind']))
  })
})
