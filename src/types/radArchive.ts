import type { RadEventId, RadEventRarity, RadQualityGrade, RadParticleType } from '@/lib/radiation'

export interface ArchivedRADEvent {
  archiveId: string
  /** The actual event that was spawned. */
  eventId: RadEventId
  /** What the catch composition classified as. */
  classifiedAs: RadEventId
  eventName: string
  rarity: RadEventRarity
  /** Was classification confidence >= 0.70? */
  resolved: boolean
  confidence: number
  /** Particle catch stats. */
  caught: number
  total: number
  /** Caught breakdown by particle type. */
  caughtComposition?: Record<RadParticleType, number>
  grade: RadQualityGrade
  spEarned: number
  sideProducts: Array<{ itemId: string; quantity: number }>
  capturedSol: number
  capturedAtMs: number
  siteId: string
  latitudeDeg: number
  longitudeDeg: number
  queuedForTransmission: boolean
  transmitted: boolean
}
