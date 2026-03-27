import type { Ref } from 'vue'
import * as THREE from 'three'
import { MARS_SOL_CLOCK_MINUTES, SOL_DURATION } from '@/lib/marsTimeConstants'
import { DANController } from '@/three/instruments'
import type { TerrainParams } from '@/types/terrain'
import { danSignalQualityLabel } from '@/lib/neutron/danSampling'
import type { SPGain } from '@/composables/useSciencePoints'
import type SampleToast from '@/components/SampleToast.vue'
import { DAN_INITIATE_DURATION_SEC, DAN_PROSPECT_DURATION_MARS_HOURS } from '@/views/MarsSiteViewController'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'

export interface DanTickRefs {
  siteTerrainParams: Ref<TerrainParams | null>
  danTotalSamples: Ref<number>
  danHitAvailable: Ref<boolean>
  danProspectPhase: Ref<string>
  danProspectProgress: Ref<number>
  danSignalStrength: Ref<number>
  danWaterResult: Ref<boolean | null>
  danDialogVisible: Ref<boolean>
  passiveUiRevision: Ref<number>
  siteLat: Ref<number>
  siteLon: Ref<number>
  roverWorldX: Ref<number>
  roverWorldZ: Ref<number>
  roverSpawnXZ: Ref<{ x: number; z: number }>
}

export interface DanTickCallbacks {
  siteId: string
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  playerMod: (key: keyof ProfileModifiers) => number
  awardDAN: (reason: string) => SPGain | null
  startHeldActionSound: (soundId: 'sfx.danScan') => AudioPlaybackHandle
  startHeldProspectingSound: (soundId: 'sfx.danProspecting') => AudioPlaybackHandle
  triggerDanAchievement: (event: string) => void
  archiveDanProspect: (params: {
    capturedSol: number
    siteId: string
    siteLatDeg: number
    siteLonDeg: number
    roverWorldX: number
    roverWorldZ: number
    roverSpawnX: number
    roverSpawnZ: number
    siteUnitsPerMeter?: number
    signalStrength: number
    quality: 'Weak' | 'Moderate' | 'Strong'
    waterConfirmed: boolean
    reservoirQuality: number
  }) => void
}

export interface DanTickHandler extends SiteTickHandler {
  /** Initiates a DAN prospect from the current pending hit. Called from the Vue template. */
  handleDanProspect(fctx: SiteFrameContext): void
  /** Lazily initialises DAN particle VFX once the rover is ready. */
  initIfReady(fctx: SiteFrameContext): void
}

/**
 * Creates a tick handler for the DAN (Dynamic Albedo of Neutrons) instrument:
 * - Passive scanning, VFX dots, and hit detection
 * - Full prospect state machine (drive-to-zone -> initiating -> prospecting -> complete)
 * - Disc/cone marker placement and archiving
 */
export function createDanTickHandler(
  refs: DanTickRefs,
  callbacks: DanTickCallbacks,
): DanTickHandler {
  const {
    siteTerrainParams, danTotalSamples, danHitAvailable, danProspectPhase,
    danProspectProgress, danSignalStrength, danWaterResult, danDialogVisible,
    passiveUiRevision, siteLat, siteLon, roverWorldX, roverWorldZ, roverSpawnXZ,
  } = refs
  const {
    siteId,
    sampleToastRef,
    playerMod,
    awardDAN,
    startHeldActionSound,
    startHeldProspectingSound,
    triggerDanAchievement,
    archiveDanProspect,
  } = callbacks

  let danDiscMesh: THREE.Mesh | null = null
  let danConeMesh: THREE.Mesh | null = null
  const danCompletedDiscs: THREE.Mesh[] = []
  let vfxInitialised = false
  let heldDanPlayback: AudioPlaybackHandle | null = null
  let heldDanProspectingPlayback: AudioPlaybackHandle | null = null

  /**
   * Keeps the DAN scan loop owned by this handler and tied to the passive subsystem state.
   */
  function syncDanScanPlayback(enabled: boolean): void {
    if (enabled) {
      heldDanPlayback ??= startHeldActionSound('sfx.danScan')
      return
    }
    heldDanPlayback?.stop()
    heldDanPlayback = null
  }

  /**
   * Keeps the DAN prospecting loop owned by this handler and tied to the active prospect phase.
   */
  function syncDanProspectingPlayback(enabled: boolean): void {
    if (enabled) {
      heldDanProspectingPlayback ??= startHeldProspectingSound('sfx.danProspecting')
      return
    }
    heldDanProspectingPlayback?.stop()
    heldDanProspectingPlayback = null
  }

  function initIfReady(fctx: SiteFrameContext): void {
    if (vfxInitialised) return
    const danInit = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (danInit && fctx.siteScene) {
      danInit.initVFX(fctx.siteScene.scene)
      vfxInitialised = true
    }
  }

  function handleDanProspect(fctx: SiteFrameContext): void {
    const danInst = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst?.pendingHit) return

    const hit = danInst.pendingHit

    if (!danDiscMesh) {
      const geo = new THREE.CircleGeometry(5, 32)
      geo.rotateX(-Math.PI / 2)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x44aaff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false,
      })
      danDiscMesh = new THREE.Mesh(geo, mat)
      fctx.siteScene?.scene.add(danDiscMesh)
    }
    const groundY = fctx.siteScene?.terrain
      ? fctx.siteScene.terrain.heightAt(hit.worldPosition.x, hit.worldPosition.z)
      : hit.worldPosition.y
    danDiscMesh.position.set(hit.worldPosition.x, groundY + 0.05, hit.worldPosition.z)
    danDiscMesh.visible = true

    danInst.prospectStrength = hit.signalStrength
    danInst.prospectPhase = 'drive-to-zone'
    danProspectPhase.value = 'drive-to-zone'
    danProspectProgress.value = 0
    danWaterResult.value = null
    danDialogVisible.value = true
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, sceneDelta, isSleeping, marsSol } = fctx

    const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst || !fctx.roverReady) {
      syncDanScanPlayback(false)
      syncDanProspectingPlayback(false)
      return
    }

    danInst.setRoverState(
      siteScene.rover?.position ?? new THREE.Vector3(),
      controller?.isMoving ?? false,
    )
    if (siteTerrainParams.value) {
      danInst.waterIceIndex = siteTerrainParams.value.waterIceIndex ?? 0.1
      danInst.featureType = siteTerrainParams.value.featureType ?? 'plain'
    }
    danInst.accuracyMod = playerMod('instrumentAccuracy')
    danInst.update(sceneDelta)

    danTotalSamples.value = danInst.totalSamples
    danHitAvailable.value = danInst.pendingHit !== null

    // VFX: always tick so dots hide when deselected
    const danSelected = controller?.activeInstrument?.id === 'dan'
    danInst.vfxVisible = !!danSelected
    const rp = siteScene.rover?.position
    const groundY = rp && siteScene.terrain ? siteScene.terrain.heightAt(rp.x, rp.z) : 0
    danInst.updateVFX(sceneDelta, groundY)

    for (const disc of danCompletedDiscs) disc.visible = !!danSelected

    // Hit detection -> toast + SP
    if (danInst.pendingHit && !danInst.hitConsumed) {
      if (danHitAvailable.value) {
        sampleToastRef.value?.showDAN('New hydrogen signal — previous marker updated')
      }
      const hit = danInst.pendingHit
      const qual = danSignalQualityLabel(hit.signalStrength)
      sampleToastRef.value?.showDAN(`Hydrogen signal — ${qual} (${Math.round(hit.signalStrength * 100)}%)`)
      const gain = awardDAN('DAN signal hit')
      if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN SIGNAL', gain.bonus)
      danSignalStrength.value = hit.signalStrength
      danInst.hitConsumed = true
      danHitAvailable.value = true
      triggerDanAchievement('first-hit')
    }

    // Sleep mode safety
    if (isSleeping && danInst.passiveSubsystemEnabled) {
      danInst.forceOff()
      sampleToastRef.value?.showDAN('Prospect interrupted — insufficient power')
      if (danDiscMesh) danDiscMesh.visible = false
      danProspectPhase.value = 'idle'
      danProspectProgress.value = 0
      passiveUiRevision.value++
    }
    syncDanScanPlayback(danInst.passiveSubsystemEnabled)

    // --- Prospect phase state machine ---
    if (danInst.prospectPhase !== 'idle' && danInst.prospectPhase !== 'complete') {
      const rpPos = siteScene?.rover?.position
      const hitPos = danDiscMesh?.position
      if (rpPos && hitPos) {
        const distToZone = new THREE.Vector2(rpPos.x - hitPos.x, rpPos.z - hitPos.z).length()

        if (danInst.prospectPhase === 'drive-to-zone') {
          if (distToZone < 5) {
            danInst.prospectPhase = 'initiating'
            danProspectPhase.value = 'initiating'
            danProspectProgress.value = 0
          }
        } else if (danInst.prospectPhase === 'initiating') {
          if (distToZone >= 5) {
            danInst.prospectPhase = 'drive-to-zone'
            danProspectPhase.value = 'drive-to-zone'
            danProspectProgress.value = 0
          } else {
            danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / DAN_INITIATE_DURATION_SEC)
            danInst.prospectProgress = danProspectProgress.value
            if (danProspectProgress.value >= 1) {
              danInst.prospectPhase = 'prospecting'
              danProspectPhase.value = 'prospecting'
              danProspectProgress.value = 0
              if (controller) controller.config.moveSpeed = 0
            }
          }
        } else if (danInst.prospectPhase === 'prospecting') {
          const prospectDurationSec = (DAN_PROSPECT_DURATION_MARS_HOURS * 60 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION
          danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / prospectDurationSec)
          danInst.prospectProgress = danProspectProgress.value

          if (danProspectProgress.value >= 1) {
            danInst.prospectPhase = 'complete'
            danProspectPhase.value = 'complete'
            danInst.prospectComplete = true
            danInst.rollUsageDecay()
            triggerDanAchievement('first-prospect')

            const gain = awardDAN('DAN prospect complete')
            if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN PROSPECT', gain.bonus)

            const hasWater = danInst.rollWater()
            danInst.waterConfirmed = hasWater
            danWaterResult.value = hasWater

            archiveDanProspect({
              capturedSol: marsSol,
              siteId,
              siteLatDeg: siteLat.value,
              siteLonDeg: siteLon.value,
              roverWorldX: roverWorldX.value,
              roverWorldZ: roverWorldZ.value,
              roverSpawnX: roverSpawnXZ.value.x,
              roverSpawnZ: roverSpawnXZ.value.z,
              signalStrength: danInst.prospectStrength,
              quality: danSignalQualityLabel(danInst.prospectStrength),
              waterConfirmed: hasWater,
              reservoirQuality: danInst.prospectStrength,
            })

            if (hasWater) {
              // Place cone marker only for confirmed water
              const conePos = danDiscMesh?.position.clone() ?? hitPos.clone()
              const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 8)
              const coneMat = new THREE.MeshBasicMaterial({ color: 0x44aaff })
              danConeMesh = new THREE.Mesh(coneGeo, coneMat)
              danConeMesh.position.copy(conePos)
              danConeMesh.position.y += 0.25
              siteScene?.scene.add(danConeMesh)
              danInst.drillSitePosition = conePos.clone()
              danInst.reservoirQuality = danInst.prospectStrength

              sampleToastRef.value?.showDAN('Subsurface ice confirmed — marking drill site')
              triggerDanAchievement('water-confirmed')
              const bonusGain = awardDAN('DAN water confirmed')
              if (bonusGain) sampleToastRef.value?.showSP(bonusGain.amount, 'WATER CONFIRMED', bonusGain.bonus)

              // Keep disc as a completed water site marker
              if (danDiscMesh) {
                danDiscMesh.visible = false
                ;(danDiscMesh.material as THREE.MeshBasicMaterial).color.set(0x44aaff)
                ;(danDiscMesh.material as THREE.MeshBasicMaterial).opacity = 0.15
                danCompletedDiscs.push(danDiscMesh)
                danDiscMesh = null
              }
            } else {
              // Inconclusive — clear everything and reset so a new prospect can start
              sampleToastRef.value?.showDAN('Analysis inconclusive — hydrogen likely mineral-bound. Keep searching.')

              if (danDiscMesh) {
                siteScene?.scene.remove(danDiscMesh)
                danDiscMesh.geometry.dispose()
                ;(danDiscMesh.material as THREE.Material).dispose()
                danDiscMesh = null
              }
              danInst.prospectPhase = 'idle'
              danInst.prospectComplete = false
              danProspectPhase.value = 'idle'
              danProspectProgress.value = 0
            }

            danInst.pendingHit = null
            danHitAvailable.value = false
            if (controller) controller.config.moveSpeed = 5
          }
        }
      }
    }
    syncDanProspectingPlayback(danInst.prospectPhase === 'prospecting')
  }

  function dispose(): void {
    syncDanScanPlayback(false)
    syncDanProspectingPlayback(false)
    if (danDiscMesh) {
      danDiscMesh.geometry.dispose()
      ;(danDiscMesh.material as THREE.Material).dispose()
      danDiscMesh = null
    }
    if (danConeMesh) {
      danConeMesh.geometry.dispose()
      ;(danConeMesh.material as THREE.Material).dispose()
      danConeMesh = null
    }
    for (const disc of danCompletedDiscs) {
      disc.geometry.dispose()
      ;(disc.material as THREE.Material).dispose()
    }
    danCompletedDiscs.length = 0
  }

  return { tick, dispose, handleDanProspect, initIfReady }
}
