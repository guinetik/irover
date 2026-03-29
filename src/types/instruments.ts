// src/types/instruments.ts
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { InstrumentTier } from '@/lib/hazards'

export interface InstrumentHelpImage {
  /** Path to screenshot, e.g. "/images/help/dan-panel.jpg". Player-sourced. */
  src: string
  /** Describes exactly what screenshot to capture — shown as caption in dialog. */
  alt: string
}

export interface InstrumentHelpSection {
  /** Uppercase heading, e.g. "OPERATION", "WATCH FOR", "POWER BUDGET" */
  heading: string
  /** Plain text body — no HTML. */
  body: string
}

export interface InstrumentHelp {
  /** One-line gameplay summary shown at the top of the help dialog. */
  summary: string
  sections: InstrumentHelpSection[]
  images?: InstrumentHelpImage[]
}

export interface InstrumentUpgradeDef {
  name: string
  desc: string
  req: string
}

export interface InstrumentStatDef {
  /**
   * Key into ProfileModifiers — ties this stat to every buff/nerf source:
   * archetype, foundation, patron, reward track.
   * Must match a key on the ProfileModifiers interface exactly.
   */
  key: keyof ProfileModifiers
  /** Display label shown in the overlay stat panel, e.g. "DRILL SPEED", "ACCURACY" */
  label: string
}

export interface InstrumentPassiveBonus {
  /**
   * Which ProfileModifiers key is buffed when this instrument's passive
   * subsystem is active (e.g. REMS active → spYield gets +5%).
   */
  key: keyof ProfileModifiers
  /** Additive percentage offset, e.g. 0.05 = +5%, -0.05 = -5% */
  value: number
  /** Label shown in other instruments' buff breakdown, e.g. "REMS ACTIVE" */
  label: string
}

export interface InstrumentChainBonus {
  /**
   * ProfileModifiers key that buffs this chain effect via reward track / archetypes.
   * e.g. "chainDrillBonus" for MastCam → drill speed, "chainLootBonus" for ChemCam → sample weight.
   * APXS trace elements use "instrumentAccuracy" — already wired in DrillController.
   */
  key: keyof ProfileModifiers
  /**
   * Base effect magnitude expressed as a positive benefit.
   * 0.4 = "40% faster", 0.3 = "+30% weight", 2 = "up to 2 drops".
   */
  baseValue: number
  /** Display label shown in instrument panel, e.g. "DRILL BONUS", "LOOT YIELD" */
  label: string
  /** One-line description, e.g. "Tagged rocks drill 40% faster" */
  description: string
}

export interface InstrumentDef {
  /** Stable lowercase identifier, e.g. "dan", "chemcam" */
  id: string
  /** Matches slot keys in InstrumentOverlay (1–14) */
  slot: number
  icon: string
  name: string
  /** Subtitle shown in overlay header */
  type: string
  /** Short description shown in overlay body */
  desc: string
  /** Display string for power draw, e.g. "10W" or "6W / 100W drilling" */
  power: string
  /** Hazard vulnerability tier — determines storm/radiation penalty severity. */
  tier: InstrumentTier
  /** Base idle power draw in watts when instrument is selected/active. */
  idlePowerW: number
  /** Key into CONTROLLER_REGISTRY */
  controllerType: string
  /** Key into TICK_HANDLER_REGISTRY (populated in Plan B) */
  tickHandlerType: string
  upgrade: InstrumentUpgradeDef
  help: InstrumentHelp
  /** Keyboard/usage hint shown at bottom of instrument card. */
  hint: string
  /** Optional temperature warning shown on instrument card (e.g. ChemCam cold penalty). */
  tempWarning?: string
  /**
   * Ordered list of modifier-driven stats this instrument exposes.
   * Order controls display order in the overlay stat panel (Plan B).
   * Empty array = instrument has no modifier-driven stats (LGA, UHF, Mic).
   */
  stats: InstrumentStatDef[]
  /**
   * Passive bonuses this instrument emits to all other instruments when its
   * passive subsystem is enabled. Collected by Plan B's computed layer and
   * stacked into modifier resolution for every other instrument.
   * Most instruments omit this field.
   */
  provides?: InstrumentPassiveBonus[]
  /**
   * Effects granted to a rock target when this instrument has been used on it,
   * realized when that target is subsequently drilled. Buffable via ProfileModifiers.
   * Plan B wires these into DrillController and LaserDrill.
   */
  chainBonuses?: InstrumentChainBonus[]
}
