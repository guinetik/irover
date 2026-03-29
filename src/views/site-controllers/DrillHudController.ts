import type { Ref } from 'vue'
import { DrillController, MastCamController } from '@/three/instruments'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import { resolveInstrumentPerformance } from '@/lib/instrumentPerformance'
import { useInstrumentProvider } from '@/composables/useInstrumentProvider'

export interface DrillHudRefs {
  crosshairVisible: Ref<boolean>
  crosshairColor: Ref<'green' | 'red'>
  crosshairX: Ref<number>
  crosshairY: Ref<number>
  drillProgress: Ref<number>
  isDrilling: Ref<boolean>
}

export interface DrillHudCallbacks {
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  playerMod: (key: keyof ProfileModifiers) => number
  awardSP: (source: 'mastcam' | 'chemcam' | 'drill', rockMeshUuid: string, label: string) => SPGain | null
  startHeldActionSound: (soundId: 'sfx.drillStart') => AudioPlaybackHandle
  startHeldMovementSound: (soundId: 'sfx.mastMove') => AudioPlaybackHandle
}

export interface DrillHudResult {
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
export function createDrillHudController(
  refs: DrillHudRefs,
  callbacks: DrillHudCallbacks,
): SiteTickHandler & { lastResult: DrillHudResult; initIfReady(fctx: SiteFrameContext): void } {
  const { crosshairVisible, crosshairColor, crosshairX, crosshairY, drillProgress, isDrilling } = refs
  const { sampleToastRef, playerMod, awardSP, startHeldActionSound, startHeldMovementSound } = callbacks
  const { defBySlot } = useInstrumentProvider()

  const lastResult: DrillHudResult = { rockDrilling: false }
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
    const { rover: controller, siteScene, camera } = fctx

    if (controller?.mode === 'active' && controller.activeInstrument instanceof DrillController) {
      const drill = controller.activeInstrument
      const drillDef = defBySlot(drill.slot)
      const perf = resolveInstrumentPerformance(drillDef?.tier ?? drill.tier, drill.durabilityFactor, fctx.env, playerMod('analysisSpeed'), playerMod('instrumentAccuracy'))
      drill.drillDurationMultiplier = 1 / perf.speedFactor
      drill.accuracyMod = perf.accuracyFactor
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

  }

  function dispose(): void {
    heldDrillPlayback?.stop()
    heldDrillPlayback = null
    heldMovementPlayback?.stop()
    heldMovementPlayback = null
  }

  return { tick, dispose, lastResult, initIfReady }
}
