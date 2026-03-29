// src/types/instruments.ts

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
  /** Key into CONTROLLER_REGISTRY */
  controllerType: string
  /** Key into TICK_HANDLER_REGISTRY (populated in Plan B) */
  tickHandlerType: string
  upgrade: InstrumentUpgradeDef
  help: InstrumentHelp
}
