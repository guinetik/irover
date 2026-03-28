import type { Ref } from 'vue'
import { DrillController, MastCamController } from '@/three/instruments'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
import { computeStormPerformancePenalty } from '@/lib/hazards'
import type { SpeedBreakdown, SpeedBreakdownInput } from '@/lib/instrumentSpeedBreakdown'

export interface DrillTickRefs {
  crosshairVisible: Ref<boolean>
  crosshairColor: Ref<'green' | 'red'>
  crosshairX: Ref<number>
  crosshairY: Ref<number>
  drillProgress: Ref<number>
  isDrilling: Ref<boolean>
  speedBreakdown: Ref<SpeedBreakdown | null>
}

export interface DrillTickCallbacks {
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  playerMod: (key: keyof ProfileModifiers) => number
  awardSP: (source: 'mastcam' | 'chemcam' | 'drill', rockMeshUuid: string, label: string) => SPGain | null
  startHeldActionSound: (soundId: 'sfx.drillStart') => AudioPlaybackHandle
  startHeldMovementSound: (soundId: 'sfx.mastMove') => AudioPlaybackHandle
  getSpeedBreakdownBase: () => Omit<SpeedBreakdownInput, 'thermalZone' | 'extras' | 'speedPctOverride'>
}

export interface DrillTickResult {
  /** True when the drill is actively boring into a rock this frame. Used by the power tick. */
  rockDrilling: boolean
}

/**
 * Creates a tick handler for the drill instrument's active-mode HUD:
 * - Crosshair tracking + color (green = valid target, red = no target)
 * - Drill progress bar sync
 * - Collection toasts, SP awards, trace-element drops
 * - Lazy `initGameplay` call on first ready frame
 */
export function createDrillTickHandler(
  refs: DrillTickRefs,
  callbacks: DrillTickCallbacks,
): SiteTickHandler & { lastResult: DrillTickResult; initIfReady(fctx: SiteFrameContext): void } {
  const { crosshairVisible, crosshairColor, crosshairX, crosshairY, drillProgress, isDrilling, speedBreakdown } = refs
  const { sampleToastRef, playerMod, awardSP, startHeldActionSound, startHeldMovementSound, getSpeedBreakdownBase } = callbacks

  const lastResult: DrillTickResult = { rockDrilling: false }
  let gameplayInitialised = false
  let cargoFullToastCooldown = 0
  let heldDrillPlayback: AudioPlaybackHandle | null = null
  let heldMovementPlayback: AudioPlaybackHandle | null = null

  function initIfReady(fctx: SiteFrameContext): void {
    if (gameplayInitialised) return
    const drillInst = fctx.rover?.instruments.find(i => i.id === 'drill')
    if (
      drillInst instanceof DrillController
      && drillInst.attached
      && !drillInst.targeting
      && fctx.roverReady
      && fctx.siteScene.rover
    ) {
      drillInst.initGameplay(fctx.siteScene.scene, fctx.camera, fctx.siteScene.terrain.getSmallRocks())
      gameplayInitialised = true
    }
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, camera, thermalZone } = fctx

    if (controller?.mode === 'active' && controller.activeInstrument instanceof DrillController) {
      const drill = controller.activeInstrument
      const z = thermalZone
      const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
      const stormPenalty = fctx.dustStormPhase === 'active' ? computeStormPerformancePenalty(fctx.dustStormLevel ?? 0, drill.tier) : 1
      drill.drillDurationMultiplier = (thermalMult * stormPenalty) / (playerMod('analysisSpeed') * Math.max(0.1, drill.durabilityFactor))

      drill.accuracyMod = playerMod('instrumentAccuracy') * drill.durabilityFactor / stormPenalty
      drill.setRoverPosition(siteScene.rover!.position)
      crosshairVisible.value = true
      crosshairColor.value = drill.hasTarget && drill.canCollectCurrentTarget ? 'green' : 'red'
      drillProgress.value = drill.drillProgress
      isDrilling.value = drill.isDrilling
      lastResult.rockDrilling = drill.isDrilling
      if (drill.isArmActuating) {
        heldMovementPlayback ??= startHeldMovementSound('sfx.mastMove')
      } else if (heldMovementPlayback) {
        heldMovementPlayback.stop()
        heldMovementPlayback = null
      }
      if (drill.isDrilling) {
        heldDrillPlayback ??= startHeldActionSound('sfx.drillStart')
      } else if (heldDrillPlayback) {
        heldDrillPlayback.stop()
        heldDrillPlayback = null
      }

      // Toast when player tries to drill a rock but cargo is full
      cargoFullToastCooldown = Math.max(0, cargoFullToastCooldown - fctx.sceneDelta)
      if (drill.hasTarget && !drill.canCollectCurrentTarget && drill['drilling'] && cargoFullToastCooldown <= 0) {
        sampleToastRef.value?.showError('Cargo full — dump items to drill')
        cargoFullToastCooldown = 3
      }

      if (camera) {
        const projected = drill.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }

      if (drill.lastInventoryError) {
        sampleToastRef.value?.showError(drill.lastInventoryError)
        drill.lastInventoryError = null
      }
      if (drill.lastCollected) {
        const s = drill.lastCollected
        sampleToastRef.value?.show(s.rockType, s.displayLabel, s.weightKgThisSample)
        const gain = awardSP('drill', s.rockMeshUuid, s.displayLabel)
        if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        if (drill.lastTraceDrops) {
          for (const drop of drill.lastTraceDrops) {
            sampleToastRef.value?.showTrace(drop.element, drop.label)
          }
          drill.lastTraceDrops = null
        }
        const mcSurvey = controller?.instruments.find(i => i.id === 'mastcam')
        if (mcSurvey instanceof MastCamController && mcSurvey['overlayMeshes']?.length > 0) {
          mcSurvey.rebuildOverlays()
        }
        drill.lastCollected = null
      }
    } else {
      heldDrillPlayback?.stop()
      heldDrillPlayback = null
      heldMovementPlayback?.stop()
      heldMovementPlayback = null
      crosshairVisible.value = false
      isDrilling.value = false
      drillProgress.value = 0
      lastResult.rockDrilling = false
    }

    // Speed breakdown — show whenever drill card is visible (not just active mode)
    const drillInst = controller?.instruments.find(i => i.id === 'drill')
    if (drillInst instanceof DrillController) {
      const z = thermalZone
      const scanBuff = drillInst.mastcamScanDrillSpeedMult < 1
      const extras = scanBuff
        ? [{ label: 'MASTCAM SCAN', value: '+40%', color: '#5dc9a5' }]
        : undefined
      const activeStormLevel = fctx.dustStormPhase === 'active' ? (fctx.dustStormLevel ?? 0) : 0
      speedBreakdown.value = buildSpeedBreakdown({
        ...getSpeedBreakdownBase(),
        thermalZone: z as 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL',
        stormLevel: activeStormLevel,
        instrumentTier: drillInst.tier,
        extras,
      })
    } else {
      speedBreakdown.value = null
    }
  }

  function dispose(): void {
    heldDrillPlayback?.stop()
    heldDrillPlayback = null
    heldMovementPlayback?.stop()
    heldMovementPlayback = null
  }

  return { tick, dispose, lastResult, initIfReady }
}
