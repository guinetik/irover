import type { Ref } from 'vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { AudioSoundId, InstrumentActionSoundId } from '@/audio/audioManifest'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface PassiveSystemsAudioRefs {
  descending: Ref<boolean>
  deploying: Ref<boolean>
  heaterHeatBoostActive: Ref<boolean>
  heaterEffectiveW: Ref<number>
  remsSurveying: Ref<boolean>
  radSurveying: Ref<boolean>
}

export interface PassiveSystemsAudioCallbacks {
  playAmbientLoop: (soundId: AudioSoundId) => AudioPlaybackHandle
  playActionSound: (soundId: InstrumentActionSoundId) => void
  setAmbientVolume: (handle: AudioPlaybackHandle, volume: number) => void
  setAmbientStereo: (handle: AudioPlaybackHandle, pan: number) => void
  showToast: (message: string) => void
  /**
   * When false (intro video overlay), keep RTG/heater/REMS beds silent — matches site simulation hold.
   * Defaults to audible when omitted.
   */
  passiveAmbienceAudible?: () => boolean
  /**
   * Stereo pan toward nearest safe radiation zone (-1 left, 0 center, 1 right).
   * Null when no safe zone found or RAD field not initialized.
   */
  getGeigerSafePan?: () => number | null
}

interface PassiveLayer {
  id: AudioSoundId
  handle: AudioPlaybackHandle | null
  currentVol: number
}

const LERP_SPEED = 3.0
const RTG_VOLUME = 0.07
const REMS_VOLUME = 0.2
const HEATER_ON_THRESHOLD_W = 0.5
const MAX_EFFECTIVE_HEATER_W = 24
const HEATER_MIN_VOLUME = 0.088
const HEATER_MAX_VOLUME = 0.308

/**
 * Smooths current volume toward target using an exponential-style per-frame lerp.
 */
function lerp(current: number, target: number, speed: number, dt: number): number {
  const t = Math.min(speed * dt, 1)
  return current + (target - current) * t
}

/**
 * Maps effective heater bus watts to a low ambient hum volume.
 */
function heaterVolume(effectiveW: number): number {
  if (effectiveW <= HEATER_ON_THRESHOLD_W) return 0
  const t = Math.min(effectiveW / MAX_EFFECTIVE_HEATER_W, 1)
  return HEATER_MIN_VOLUME + t * (HEATER_MAX_VOLUME - HEATER_MIN_VOLUME)
}

/**
 * Keeps RTG and heater passive audio running from the site view rather than instrument selection.
 */
export function createPassiveSystemsAudioTickHandler(
  refs: PassiveSystemsAudioRefs,
  callbacks: PassiveSystemsAudioCallbacks,
): SiteTickHandler {
  const { descending, deploying, heaterHeatBoostActive, heaterEffectiveW, remsSurveying, radSurveying } = refs
  const { playAmbientLoop, playActionSound, setAmbientVolume, setAmbientStereo, showToast, passiveAmbienceAudible } = callbacks

  const rtgLayer: PassiveLayer = { id: 'ambient.rtg' as AudioSoundId, handle: null, currentVol: 0 }
  const heaterLayer: PassiveLayer = { id: 'ambient.heater' as AudioSoundId, handle: null, currentVol: 0 }
  const remsLayer: PassiveLayer = { id: 'ambient.rems' as AudioSoundId, handle: null, currentVol: 0 }
  const geigerLayer: PassiveLayer = { id: 'ambient.geiger' as any, handle: null, currentVol: 0 }
  const radHitLayer: PassiveLayer = { id: 'ambient.radHit' as any, handle: null, currentVol: 0 }
  let heaterWasAudible = false

  /**
   * Starts a passive system loop when its gate opens.
   */
  function startLayer(layer: PassiveLayer): void {
    if (layer.handle) return
    layer.handle = playAmbientLoop(layer.id)
    layer.currentVol = 0
  }

  /**
   * Stops a passive system loop and clears its owned handle state.
   */
  function stopLayer(layer: PassiveLayer): void {
    layer.handle?.stop()
    layer.handle = null
    layer.currentVol = 0
  }

  /**
   * Stops all owned passive system loops on teardown or when the rover is not ready.
   */
  function stopAll(): void {
    stopLayer(rtgLayer)
    stopLayer(heaterLayer)
    stopLayer(remsLayer)
    stopLayer(geigerLayer)
    stopLayer(radHitLayer)
    heaterWasAudible = false
  }

  /**
   * Drives one passive layer toward its target, starting or stopping the loop as needed.
   */
  function syncLayer(layer: PassiveLayer, enabled: boolean, target: number, dt: number): void {
    if (!enabled) {
      stopLayer(layer)
      return
    }

    startLayer(layer)
    layer.currentVol = lerp(layer.currentVol, target, LERP_SPEED, dt)
    if (layer.currentVol < 0.005 && target === 0) {
      layer.currentVol = 0
    }
    if (layer.handle) {
      setAmbientVolume(layer.handle, layer.currentVol)
    }
  }

  function tick(fctx: SiteFrameContext): void {
    if (!fctx.roverReady) {
      stopAll()
      return
    }

    if (passiveAmbienceAudible && !passiveAmbienceAudible()) {
      stopAll()
      return
    }

    const introSequenceComplete = !descending.value && !deploying.value
    const heaterTargetVolume = heaterHeatBoostActive.value
      ? Math.max(HEATER_MIN_VOLUME, heaterVolume(heaterEffectiveW.value))
      : heaterVolume(heaterEffectiveW.value)
    const heaterAudible = heaterTargetVolume > 0

    if (!heaterWasAudible && heaterAudible) {
      showToast('Heater ON — thermostat engaged')
    }
    if (heaterWasAudible && !heaterAudible) {
      playActionSound('sfx.heaterOff')
      showToast('Heater OFF')
    }
    heaterWasAudible = heaterAudible

    syncLayer(rtgLayer, introSequenceComplete, RTG_VOLUME, fctx.sceneDelta)
    syncLayer(heaterLayer, true, heaterTargetVolume, fctx.sceneDelta)
    syncLayer(remsLayer, remsSurveying.value, REMS_VOLUME, fctx.sceneDelta)

    const GEIGER_BASE_VOL = 0.6
    const GEIGER_MAX_VOL = 1.0
    const geigerVol = radSurveying.value
      ? GEIGER_BASE_VOL + Math.min(GEIGER_MAX_VOL - GEIGER_BASE_VOL, fctx.radiationLevel * 0.6)
      : 0
    syncLayer(geigerLayer, radSurveying.value, geigerVol, fctx.sceneDelta)

    // Stereo pan toward nearest safe zone — audio dowsing
    const safePan = callbacks.getGeigerSafePan?.() ?? null
    if (geigerLayer.handle && radSurveying.value && safePan !== null) {
      setAmbientStereo(geigerLayer.handle, safePan)
    }

    // Rad-hit confirmation loop — plays when heading roughly toward safe zone
    const onTrack = radSurveying.value && safePan !== null && Math.abs(safePan) < 0.35
    const radHitVol = onTrack ? 0.6 + (0.35 - Math.abs(safePan)) * 1.0 : 0
    syncLayer(radHitLayer, onTrack, radHitVol, fctx.sceneDelta)
  }

  function dispose(): void {
    stopAll()
  }

  return { tick, dispose }
}
