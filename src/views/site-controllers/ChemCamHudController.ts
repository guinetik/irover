import type { Ref } from 'vue'
import { ChemCamController } from '@/three/instruments'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface ChemCamHudRefs {
  chemCamUnreadCount: Ref<number>
  chemcamPhase: Ref<string>
  chemcamShotsRemaining: Ref<number>
  chemcamShotsMax: Ref<number>
  chemcamProgressPct: Ref<number>
  chemCamOverlaySequenceActive: Ref<boolean>
  chemCamOverlaySequenceProgress: Ref<number>
  chemCamOverlaySequenceLabel: Ref<string>
  chemCamOverlaySequencePulse: Ref<boolean>
  mastPan: Ref<number>
  mastTilt: Ref<number>
  mastFov: Ref<number>
  mastTargetRange: Ref<number>
  crosshairVisible: Ref<boolean>
  crosshairColor: Ref<'green' | 'red'>
  crosshairX: Ref<number>
  crosshairY: Ref<number>
  isDrilling: Ref<boolean>
  drillProgress: Ref<number>
}

export interface ChemCamHudCallbacks {
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  playerMod: (key: keyof ProfileModifiers) => number
  awardSP: (source: 'mastcam' | 'chemcam' | 'drill', rockMeshUuid: string, label: string) => SPGain | null
  startHeldActionSound: (soundId: 'sfx.chemcamFire') => AudioPlaybackHandle
  startHeldMovementSound: (soundId: 'sfx.cameraMove') => AudioPlaybackHandle
  onReadoutComplete?: (rockMeshUuid: string, rockType: string) => void
}

/**
 * Creates a tick handler for the ChemCam instrument:
 * - Lazy `initTargeting` + `onReady` callback wiring
 * - Unread badge count, SP/sol injection, thermal duration multiplier
 * - Instrument-card overlay sequence progress (firing / integrating when not in active view)
 * - Active-mode HUD: phase, shots, crosshair, telemetry
 */
export function createChemCamHudController(
  refs: ChemCamHudRefs,
  callbacks: ChemCamHudCallbacks,
): SiteTickHandler & { initIfReady(fctx: SiteFrameContext): void } {
  const {
    chemCamUnreadCount, chemcamPhase, chemcamShotsRemaining, chemcamShotsMax, chemcamProgressPct,
    chemCamOverlaySequenceActive, chemCamOverlaySequenceProgress, chemCamOverlaySequenceLabel, chemCamOverlaySequencePulse,
    mastPan, mastTilt, mastFov, mastTargetRange,
    crosshairVisible, crosshairColor, crosshairX, crosshairY,
    isDrilling, drillProgress,
  } = refs
  const { sampleToastRef, playerMod, awardSP, startHeldActionSound, startHeldMovementSound } = callbacks

  let targetingInitialised = false
  let heldFirePlayback: AudioPlaybackHandle | null = null
  let heldMovementPlayback: AudioPlaybackHandle | null = null

  function initIfReady(fctx: SiteFrameContext): void {
    if (targetingInitialised) return
    const cc = fctx.rover?.instruments.find(i => i.id === 'chemcam')
    if (
      cc instanceof ChemCamController
      && cc.attached
      && !cc['scene']
      && fctx.roverReady
      && fctx.siteScene.rover
    ) {
      cc.initTargeting(fctx.siteScene.scene, fctx.siteScene.terrain.getSmallRocks())
      cc.onReady = (readout) => {
        sampleToastRef.value?.showChemCam(readout.rockType, readout.rockLabel)
        const gain = awardSP('chemcam', readout.rockMeshUuid, readout.rockLabel)
        if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        callbacks.onReadoutComplete?.(readout.rockMeshUuid, readout.rockType)
      }
      targetingInitialised = true
    }
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, camera, marsSol, totalSP, activeInstrumentSlot } = fctx

    const ccInst = controller?.instruments.find(i => i.id === 'chemcam')
    const chemCamIsActiveInstrument =
      controller?.mode === 'active' && controller.activeInstrument instanceof ChemCamController
    const shouldPlayHeldFire =
      controller?.mode === 'active'
      && controller.activeInstrument instanceof ChemCamController
      && controller.activeInstrument.phase === 'PULSE_TRAIN'
      && controller.activeInstrument.isFireTriggerHeld
    const shouldPlayMovement =
      controller?.mode === 'active'
      && controller.activeInstrument instanceof ChemCamController
      && controller.activeInstrument.isMastActuating
    if (shouldPlayHeldFire) {
      heldFirePlayback ??= startHeldActionSound('sfx.chemcamFire')
    } else if (heldFirePlayback) {
      heldFirePlayback.stop()
      heldFirePlayback = null
    }
    if (shouldPlayMovement) {
      heldMovementPlayback ??= startHeldMovementSound('sfx.cameraMove')
    } else if (heldMovementPlayback) {
      heldMovementPlayback.stop()
      heldMovementPlayback = null
    }
    if (ccInst instanceof ChemCamController) {
      chemCamUnreadCount.value = ccInst.unreadCount
      ccInst.currentSP = totalSP
      ccInst.currentSol = marsSol
      // durationMultiplier is now set by the domain tick handler (ChemCamTickHandler)
      const showCardProgress =
        activeInstrumentSlot === 2 && !chemCamIsActiveInstrument
        && (ccInst.phase === 'PULSE_TRAIN' || ccInst.phase === 'INTEGRATING')
      if (showCardProgress) {
        chemCamOverlaySequenceActive.value = true
        chemCamOverlaySequencePulse.value = ccInst.phase === 'PULSE_TRAIN'
        chemCamOverlaySequenceProgress.value = ccInst.phase === 'PULSE_TRAIN'
          ? ccInst.pulseProgress * 100
          : ccInst.integrateProgress * 100
        chemCamOverlaySequenceLabel.value = ccInst.phase === 'PULSE_TRAIN' ? 'FIRING...' : 'INTEGRATING...'
      } else {
        chemCamOverlaySequenceActive.value = false
      }

    } else {
      chemCamOverlaySequenceActive.value = false
    }

    if (controller?.mode === 'active' && controller.activeInstrument instanceof ChemCamController) {
      const cc = controller.activeInstrument
      cc.currentSP = totalSP
      cc.currentSol = marsSol
      // accuracyMod is now set by the domain tick handler (ChemCamTickHandler)
      chemcamPhase.value = cc.phase
      chemcamShotsRemaining.value = cc.shotsRemaining
      chemcamShotsMax.value = cc.shotsMax
      chemcamProgressPct.value = cc.phase === 'PULSE_TRAIN'
        ? cc.pulseProgress * 100
        : cc.integrateProgress * 100

      mastPan.value = cc.panAngle
      mastTilt.value = cc.tiltAngle
      mastFov.value = cc.fov
      mastTargetRange.value = cc.currentTarget
        ? cc.mastWorldPos.distanceTo(cc.targetWorldPos)
        : -1

      crosshairVisible.value = true
      crosshairColor.value = cc.targetValid ? 'green' : 'red'
      isDrilling.value = cc.phase === 'PULSE_TRAIN'
      drillProgress.value = cc.pulseProgress

      if (camera) {
        const projected = cc.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }
    }
  }

  function dispose(): void {
    heldFirePlayback?.stop()
    heldFirePlayback = null
    heldMovementPlayback?.stop()
    heldMovementPlayback = null
  }

  return { tick, dispose, initIfReady }
}
