import type { Ref } from 'vue'
import * as THREE from 'three'
import { RADController } from '@/three/instruments'
import {
  sampleRadiationAt,
  classifyZone,
  computeZoneThresholds,
  radiationToDoseRate,
  RAD_NIGHT_DOSE_MULTIPLIER,
  RAD_SPAWN_CONFIG,
  pickWeightedEvent,
  ZONE_CONFIG,
} from '@/lib/radiation'
import type { RadiationZone } from '@/lib/radiation'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import type SampleToast from '@/components/SampleToast.vue'

export interface RadTickRefs {
  radZone: Ref<RadiationZone>
  radLevel: Ref<number>
  radDoseRate: Ref<number>
  radCumulativeDose: Ref<number>
  radParticleRate: Ref<number>
  radEnabled: Ref<boolean>
  radEventAlertPending: Ref<boolean>
  radActiveEventId: Ref<string | null>
  radDecoding: Ref<boolean>
}

export interface RadTickCallbacks {
  radiationIndex: number
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  playEventSting?: () => void
  getRadiationTolerance?: () => number
  /** True when 'storm-chaser' perk is unlocked — event spawn interval halved. */
  hasStormChaser?: () => boolean
  /** True when 'lead-lined' perk is unlocked — radiation hazard decay halved. */
  hasLeadLined?: () => boolean
}

export interface RadTickHandler extends SiteTickHandler {
  /** Set the radiation scalar field after terrain generation. */
  setField(field: Float32Array, gridSize: number, terrainScale: number): void
  /** Dismiss a pending radiation event alert. */
  dismissEvent(): void
  /** Begin decode minigame for the active event. */
  startDecode(): void
  /** End decode minigame. */
  endDecode(): void
}

/**
 * Creates a tick handler for the RAD (Radiation Assessment Detector) instrument:
 * - Samples radiation field at rover position each frame
 * - Classifies zone and computes dose/particle rates
 * - Updates RADController live state and Vue refs for HUD
 * - Shows zone-transition toasts
 * - Spawns radiation events on a randomised timer
 */
export function createRadTickHandler(
  refs: RadTickRefs,
  callbacks: RadTickCallbacks,
): RadTickHandler {
  const {
    radZone, radLevel, radDoseRate, radCumulativeDose,
    radParticleRate, radEnabled, radEventAlertPending,
    radActiveEventId, radDecoding,
  } = refs
  const { radiationIndex, sampleToastRef } = callbacks

  // Radiation field state — set after terrain generates
  let field: Float32Array | null = null
  let gridSize = 0
  let terrainScale = 1

  // Zone thresholds based on site radiation index
  const thresholds = computeZoneThresholds(radiationIndex)

  // Zone transition tracking
  let prevZone: RadiationZone = 'safe'
  let zoneInitialised = false

  // Event spawn timer
  let eventTimer = randomEventInterval()
  let eventCooldown = 0

  function randomEventInterval(): number {
    const base = RAD_SPAWN_CONFIG.baseIntervalSecMin +
      Math.random() * (RAD_SPAWN_CONFIG.baseIntervalSecMax - RAD_SPAWN_CONFIG.baseIntervalSecMin)
    // Storm Chaser perk halves the spawn interval
    return callbacks.hasStormChaser?.() ? base * 0.5 : base
  }

  function setField(f: Float32Array, gs: number, ts: number): void {
    field = f
    gridSize = gs
    terrainScale = ts
  }

  function dismissEvent(): void {
    const radInst = getRadFromLastCtx()
    if (radInst) {
      radInst.eventAlertPending = false
      radInst.activeEvent = null
    }
    radEventAlertPending.value = false
    radActiveEventId.value = null
    eventCooldown = RAD_SPAWN_CONFIG.cooldownAfterEventSec
  }

  function startDecode(): void {
    const radInst = getRadFromLastCtx()
    if (radInst) radInst.decoding = true
    radDecoding.value = true
  }

  function endDecode(): void {
    const radInst = getRadFromLastCtx()
    if (radInst) radInst.decoding = false
    radDecoding.value = false
    dismissEvent()
  }

  // Keep a reference to the last-seen RoverController for out-of-tick calls
  let lastRover: SiteFrameContext['rover'] = null

  function getRadFromLastCtx(): RADController | undefined {
    return lastRover?.instruments.find(i => i.id === 'rad') as RADController | undefined
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, sceneDelta, nightFactor, marsSol } = fctx
    lastRover = controller

    const radInst = controller?.instruments.find(i => i.id === 'rad') as RADController | undefined
    if (!radInst || !fctx.roverReady) return

    // Sync enabled state
    radEnabled.value = radInst.passiveSubsystemEnabled

    // ─── ALWAYS ACTIVE (independent of RAD being enabled) ───
    // The radiation environment exists whether or not the player has turned
    // on the RAD instrument.  VFX, hazard decay, and instrument blocking
    // are driven by radLevel which must always reflect the true field value.

    if (!field) {
      radLevel.value = 0
      radZone.value = 'safe'
      return
    }

    // --- Sample radiation at rover position ---
    const roverPos = siteScene.rover?.position ?? new THREE.Vector3()
    const rawLevel = sampleRadiationAt(field, gridSize, terrainScale, roverPos.x, roverPos.z)
    const level = rawLevel

    // --- Apply player's radiation tolerance — reduces effective level for zone/blocking ---
    const tolerance = callbacks.getRadiationTolerance?.() ?? 0
    const effectiveLevel = Math.max(0, level - tolerance)
    // Hard cap: raw level >= 0.90 ALWAYS counts as hazardous regardless of tolerance
    const HARD_CAP_LEVEL = 0.90
    const zoneLevelForClassification = level >= HARD_CAP_LEVEL ? level : effectiveLevel

    // --- Classify zone ---
    const zone = classifyZone(zoneLevelForClassification, thresholds)

    // --- Compute dose rate with night modulation (uses raw level — physical dose unchanged) ---
    const nightMod = nightFactor > 0.5 ? RAD_NIGHT_DOSE_MULTIPLIER : 1.0
    const doseRate = radiationToDoseRate(level) * nightMod

    // --- Particle rate (counts per minute) — linear from level ---
    const particleRate = Math.round(level * 120)

    // --- Update controller state (always, for hazard pipeline) ---
    radInst.radiationLevel = level
    radInst.zone = zone
    radInst.doseRate = doseRate
    radInst.particleRate = particleRate

    // --- Update radLevel/radZone (drives VFX pass + instrument blocking) ---
    radLevel.value = zoneLevelForClassification
    radZone.value = zone

    // ─── RAD-GATED (only when player has activated the instrument) ───
    // The HUD overlay, dose accumulation, zone toasts, and event spawning
    // require the player to opt-in by activating RAD.

    if (!radInst.passiveSubsystemEnabled) {
      radDoseRate.value = 0
      radParticleRate.value = 0
      radCumulativeDose.value = 0
      return
    }

    // --- Accumulate dose ---
    radInst.accumulateDose(doseRate, sceneDelta, marsSol)

    // --- Update HUD refs ---
    radDoseRate.value = doseRate
    radCumulativeDose.value = radInst.cumulativeDoseSol
    radParticleRate.value = particleRate

    // --- Zone transition toasts ---
    if (!zoneInitialised) {
      prevZone = zone
      zoneInitialised = true
    } else if (zone !== prevZone) {
      const config = ZONE_CONFIG[zone]
      sampleToastRef.value?.showComm?.(`RAD: Entering ${config.label} radiation zone`)
      prevZone = zone
    }

    // --- Radiation event spawning ---
    if (eventCooldown > 0) {
      eventCooldown -= sceneDelta
    } else if (!radInst.activeEvent && !radInst.eventAlertPending) {
      eventTimer -= sceneDelta
      if (eventTimer <= 0) {
        const eventId = pickWeightedEvent()
        radInst.activeEvent = eventId
        radInst.eventAlertPending = true
        radEventAlertPending.value = true
        radActiveEventId.value = eventId
        callbacks.playEventSting?.()
        eventTimer = randomEventInterval()
      }
    }
  }

  function dispose(): void {
    field = null
    lastRover = null
  }

  return { tick, dispose, setField, dismissEvent, startDecode, endDecode }
}
