import type * as THREE from 'three'
import type { SiteScene } from '@/three/SiteScene'
import type { RoverController } from '@/three/RoverController'
import type { ThermalZone } from '@/composables/useMarsThermal'
import type { InstrumentEnvironment } from '@/lib/instrumentPerformance'

/**
 * Per-frame snapshot built by the orchestrator and passed to every {@link SiteTickHandler}.
 * Contains only values that change each frame — stable references (Vue refs, callbacks)
 * are captured at handler construction time.
 */
export interface SiteFrameContext {
  sceneDelta: number
  skyDelta: number
  simulationTime: number
  camera: THREE.PerspectiveCamera
  siteScene: SiteScene
  rover: RoverController | null
  roverReady: boolean
  isSleeping: boolean
  nightFactor: number
  thermalZone: ThermalZone
  marsSol: number
  marsTimeOfDay: number
  totalSP: number
  activeInstrumentSlot: number | null
  /** Wind speed in m/s from site weather model. */
  windMs: number
  /** 'none' | 'incoming' | 'active' */
  dustStormPhase: 'none' | 'incoming' | 'active'
  /** Storm intensity 1–5, or null when no storm. */
  dustStormLevel: number | null
  /** Radiation scalar at rover position (0.0–1.2), 0 when RAD not yet initialized. */
  radiationLevel: number
  /** Pre-built instrument environment for resolveInstrumentPerformance — built once per frame. */
  env: InstrumentEnvironment
}

/**
 * Contract for sub-controllers that run each frame inside the site animation loop.
 * The orchestrator calls {@link tick} with a fresh {@link SiteFrameContext} every frame,
 * and {@link dispose} once when the view unmounts.
 */
export interface SiteTickHandler {
  tick(fctx: SiteFrameContext): void
  dispose(): void
}
