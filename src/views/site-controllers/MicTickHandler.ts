// src/views/site-controllers/MicTickHandler.ts
import type { Ref } from 'vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { AudioSoundId } from '@/audio/audioManifest'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface MicTickRefs {
  micEnabled: Ref<boolean>
}

export interface MicTickCallbacks {
  playAmbientLoop: (soundId: AudioSoundId) => AudioPlaybackHandle
  setAmbientVolume: (handle: AudioPlaybackHandle, volume: number) => void
}

/** Smoothing rate per second — higher = faster convergence. */
const LERP_SPEED = 3.0

/** Map wind m/s (0–15+) to volume (0.05–0.6). */
function windVolume(windMs: number): number {
  const t = Math.min(windMs / 15, 1)
  return 0.05 + t * 0.55
}

/** Map storm level (1–5) to volume (0.3–0.8) during active phase. */
function stormVolume(level: number | null, phase: string): number {
  if (phase !== 'active' || level == null) return 0
  return 0.3 + (Math.min(level, 5) - 1) * 0.125
}

/** Map storm level 4–5 to quake volume (0.4–0.7). */
function quakeVolume(level: number | null, phase: string): number {
  if (phase !== 'active' || level == null || level < 4) return 0
  return level >= 5 ? 0.7 : 0.4
}

function lerp(current: number, target: number, speed: number, dt: number): number {
  const t = Math.min(speed * dt, 1)
  return current + (target - current) * t
}

interface AmbientLayer {
  id: AudioSoundId
  handle: AudioPlaybackHandle | null
  currentVol: number
}

/**
 * Creates a tick handler that manages 6 ambient audio layers driven by Mars weather state.
 * Volumes lerp per-frame toward targets derived from nightFactor, windMs, and storm state.
 */
export function createMicTickHandler(
  refs: MicTickRefs,
  callbacks: MicTickCallbacks,
): SiteTickHandler {
  const { micEnabled } = refs
  const { playAmbientLoop, setAmbientVolume } = callbacks

  const layers: AmbientLayer[] = [
    { id: 'ambient.base' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.day' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.night' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.winds' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.storm' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.quake' as AudioSoundId, handle: null, currentVol: 0 },
  ]

  let active = false

  function startAll(): void {
    for (const layer of layers) {
      layer.handle = playAmbientLoop(layer.id)
      layer.currentVol = 0
    }
    active = true
  }

  function stopAll(): void {
    for (const layer of layers) {
      layer.handle?.stop()
      layer.handle = null
      layer.currentVol = 0
    }
    active = false
  }

  function computeTargets(fctx: SiteFrameContext): number[] {
    const { nightFactor, windMs, dustStormPhase, dustStormLevel } = fctx
    return [
      0.15,                                              // ambient.base
      nightFactor < 0.5 ? 1.0 - nightFactor * 2 : 0,   // ambient.day
      nightFactor >= 0.5 ? (nightFactor - 0.5) * 2 : 0, // ambient.night
      windVolume(windMs),                                 // ambient.winds
      stormVolume(dustStormLevel, dustStormPhase),        // ambient.storm
      quakeVolume(dustStormLevel, dustStormPhase),        // ambient.quake
    ]
  }

  function tick(fctx: SiteFrameContext): void {
    if (!micEnabled.value) {
      if (active) stopAll()
      return
    }

    if (!active) startAll()

    const targets = computeTargets(fctx)
    const dt = fctx.sceneDelta

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      const target = targets[i]
      layer.currentVol = lerp(layer.currentVol, target, LERP_SPEED, dt)

      // Snap to zero below threshold to avoid inaudible playback overhead
      if (layer.currentVol < 0.005 && target === 0) {
        layer.currentVol = 0
      }

      if (layer.handle) {
        setAmbientVolume(layer.handle, layer.currentVol)
      }
    }
  }

  function dispose(): void {
    stopAll()
  }

  return { tick, dispose }
}
