/** A hazard source currently affecting the rover. */
export interface HazardEvent {
  source: string
  active: boolean
  level: number
}

/** Instrument durability tier — determines vulnerability to hazards. */
export type InstrumentTier = 'rugged' | 'standard' | 'sensitive'
