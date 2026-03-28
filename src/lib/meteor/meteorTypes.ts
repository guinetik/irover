export type ShowerSeverity = 'light' | 'moderate' | 'heavy'

export interface MeteorShower {
  id: string
  severity: ShowerSeverity
  meteorCount: number
  startSol: number
  /** When during the sol the shower triggers (0.2–0.8) */
  triggerAtSolFraction: number
}

export type MeteorFallPhase = 'marker' | 'falling' | 'impacted'

export interface MeteorFall {
  id: string
  showerId: string
  /** GLB mesh variant: 'Lp01'–'Lp10' */
  variant: string
  targetX: number
  targetZ: number
  groundY: number
  /** Seconds the marker is visible before the fall begins (10–20) */
  markerDuration: number
  /** Entry angle in radians (30–70 degrees from horizontal) */
  entryAngle: number
  /** Azimuth in radians (0–2pi) — direction the meteor comes from */
  azimuth: number
  phase: MeteorFallPhase
  /** Time accumulated in the current phase (seconds) */
  elapsed: number
  /** Stagger offset in seconds — delays this fall's marker relative to shower start */
  staggerOffset: number
}
