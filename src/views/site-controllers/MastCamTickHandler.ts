import type { Ref } from 'vue'
import * as THREE from 'three'
import { MastCamController } from '@/three/instruments'
import { ROCK_TYPES } from '@/three/terrain/RockTypes'
import { recordMastCamTag } from '@/composables/useMastCamTags'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface MastCamTickRefs {
  mastcamFilterLabel: Ref<string>
  mastcamScanning: Ref<boolean>
  mastcamScanProgress: Ref<number>
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

export interface MastCamTickCallbacks {
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  awardSP: (source: 'mastcam' | 'chemcam' | 'drill', rockMeshUuid: string, label: string) => SPGain | null
  playerMod: (key: keyof ProfileModifiers) => number
}

/**
 * Creates a tick handler for the MastCam instrument:
 * - Lazy `initSurvey` with scene mesh collection and `onScanComplete` wiring
 * - Survey mode entry + overlay rebuild on activation
 * - Tag marker animation (always, even when not in active mode)
 * - HUD state: filter label, scan progress, crosshair, telemetry
 */
export function createMastCamTickHandler(
  refs: MastCamTickRefs,
  callbacks: MastCamTickCallbacks,
): SiteTickHandler & { initIfReady(fctx: SiteFrameContext): void } {
  const {
    mastcamFilterLabel, mastcamScanning, mastcamScanProgress,
    mastPan, mastTilt, mastFov, mastTargetRange,
    crosshairVisible, crosshairColor, crosshairX, crosshairY,
    isDrilling, drillProgress,
  } = refs
  const { sampleToastRef, awardSP, playerMod } = callbacks

  let surveyInitialised = false

  function initIfReady(fctx: SiteFrameContext): void {
    if (surveyInitialised) return
    const mc = fctx.rover?.instruments.find(i => i.id === 'mastcam')
    if (
      mc instanceof MastCamController
      && mc.attached
      && !mc['overlayScene']
      && fctx.roverReady
      && fctx.siteScene.rover
    ) {
      const smallRocks = new Set(fctx.siteScene.terrain.getSmallRocks())
      const sceneMeshes: THREE.Mesh[] = []
      fctx.siteScene.terrain.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && !smallRocks.has(child as THREE.Mesh)) {
          sceneMeshes.push(child as THREE.Mesh)
        }
      })
      fctx.siteScene.rover.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) sceneMeshes.push(child as THREE.Mesh)
      })
      mc.initSurvey(fctx.siteScene.scene, fctx.siteScene.terrain.getSmallRocks(), sceneMeshes)
      mc.onScanComplete = (rock, rockType) => {
        const label = ROCK_TYPES[rockType]?.label ?? 'Unknown'
        const gain = awardSP('mastcam', rock.uuid, label)
        if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        recordMastCamTag(rockType)
      }
      surveyInitialised = true
    }
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, camera, simulationTime } = fctx

    // Enter survey mode when MastCam is active
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      mc.durationMultiplier = 1 / (playerMod('analysisSpeed') * Math.max(0.1, mc.durabilityFactor))
      if (mc['overlayMeshes'].length === 0) {
        mc.enterSurveyMode()
        mc.rebuildOverlays()
      }
    }

    // Animate tag markers (always, not just in active mode)
    const mcInst = controller?.instruments.find(i => i.id === 'mastcam')
    if (mcInst instanceof MastCamController) {
      mcInst.surveyRange = 5 * playerMod('instrumentAccuracy') * Math.max(0.1, mcInst.durabilityFactor)
      mcInst.updateTagMarkers(simulationTime)
    }

    // HUD state + crosshair + telemetry
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      mastcamFilterLabel.value = mc.filterLabel
      mastcamScanning.value = mc.isScanning
      mastcamScanProgress.value = mc.scanProgressValue

      mastPan.value = mc.panAngle
      mastTilt.value = mc.tiltAngle
      mastFov.value = mc.fov
      mastTargetRange.value = mc.scanTarget
        ? mc.mastWorldPos.distanceTo(mc.scanTargetWorldPos)
        : -1

      crosshairVisible.value = true
      const hasTarget = mc.scanTarget !== null
      const alreadyScanned = mc.scanTarget?.userData.mastcamScanned === true
      crosshairColor.value = hasTarget && !alreadyScanned ? 'green' : 'red'
      isDrilling.value = mc.isScanning
      drillProgress.value = mc.scanProgressValue

      if (camera) {
        const projected = mc.scanTargetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }
    } else {
      mastcamScanning.value = false
    }
  }

  function dispose(): void {
    // No owned resources
  }

  return { tick, dispose, initIfReady }
}
