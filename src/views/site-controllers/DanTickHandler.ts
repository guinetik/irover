import type { Ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
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
import { computeStormPerformancePenalty } from '@/lib/hazards'

/** Public URL for the DAN drill-site marker (replaces procedural cone). */
const DAN_DRILL_MARKER_GLB = '/dan.glb'
/** Target largest axis length in scene units (~meters); matches prior cone height 0.5. */
const DAN_DRILL_MARKER_TARGET_SIZE = 0.5

let danDrillMarkerTemplate: THREE.Group | null = null
let danDrillMarkerLoadPromise: Promise<THREE.Group> | null = null

/**
 * Loads and caches `dan.glb` as a template; each confirmed-water site gets a deep `clone()`.
 */
function loadDanDrillMarkerTemplate(): Promise<THREE.Group> {
  if (danDrillMarkerTemplate) return Promise.resolve(danDrillMarkerTemplate)
  if (!danDrillMarkerLoadPromise) {
    danDrillMarkerLoadPromise = new GLTFLoader()
      .loadAsync(DAN_DRILL_MARKER_GLB)
      .then((gltf) => {
        danDrillMarkerTemplate = gltf.scene
        return gltf.scene
      })
  }
  return danDrillMarkerLoadPromise
}

/**
 * Disposes geometries and materials under a cloned GLB root (meshes only).
 */
function disposeDrillMarkerRoot(root: THREE.Object3D): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
}

/**
 * Scales a cloned marker so its axis-aligned bounds match {@link DAN_DRILL_MARKER_TARGET_SIZE},
 * then places its bottom on the terrain at (x, z) with a small lift like the old disc plane.
 */
function placeDanDrillMarkerInstance(
  marker: THREE.Object3D,
  x: number,
  z: number,
  groundY: number,
): void {
  marker.position.set(0, 0, 0)
  marker.scale.set(1, 1, 1)
  marker.rotation.set(0, 0, 0)
  marker.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(marker)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
  const s = DAN_DRILL_MARKER_TARGET_SIZE / maxDim
  marker.scale.setScalar(s)
  marker.updateMatrixWorld(true)

  const boxWorld = new THREE.Box3().setFromObject(marker)
  const lift = 0.05
  marker.position.set(x, groundY + lift - boxWorld.min.y, z)
}

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
 * - Disc + `/dan.glb` drill-site marker placement and archiving
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
  let danDrillMarker: THREE.Object3D | null = null
  const danCompletedDiscs: THREE.Mesh[] = []
  let vfxInitialised = false
  let heldDanPlayback: AudioPlaybackHandle | null = null
  let heldDanProspectingPlayback: AudioPlaybackHandle | null = null
  /** False after `dispose` — suppresses late GLB load callbacks. */
  let tickHandlerActive = true

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
      void loadDanDrillMarkerTemplate().catch(() => {
        /* non-fatal — marker loads again on confirm if needed */
      })
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
    const { rover: controller, siteScene, sceneDelta, isSleeping, marsSol, dustStormPhase, dustStormLevel } = fctx

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
    const danStormPenalty = dustStormPhase === 'active' ? computeStormPerformancePenalty(dustStormLevel ?? 0, danInst.tier) : 1
    danInst.accuracyMod = playerMod('instrumentAccuracy') / danStormPenalty
    danInst.analysisSpeedMod = playerMod('analysisSpeed') / danStormPenalty
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
          const prospectDurationSec = (DAN_PROSPECT_DURATION_MARS_HOURS * 60 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION * danStormPenalty / playerMod('analysisSpeed')
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
              const conePos = danDiscMesh?.position.clone() ?? hitPos.clone()
              const gx = conePos.x
              const gz = conePos.z
              const groundY = siteScene?.terrain
                ? siteScene.terrain.heightAt(gx, gz)
                : conePos.y - 0.05

              const sceneRef = siteScene?.scene
              if (danDrillMarker && sceneRef) {
                sceneRef.remove(danDrillMarker)
                disposeDrillMarkerRoot(danDrillMarker)
                danDrillMarker = null
              }

              void loadDanDrillMarkerTemplate().then((template) => {
                if (!tickHandlerActive || !sceneRef) return
                const marker = template.clone(true)
                placeDanDrillMarkerInstance(marker, gx, gz, groundY)
                sceneRef.add(marker)
                danDrillMarker = marker
              })

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
    tickHandlerActive = false
    syncDanScanPlayback(false)
    syncDanProspectingPlayback(false)
    if (danDiscMesh) {
      danDiscMesh.geometry.dispose()
      ;(danDiscMesh.material as THREE.Material).dispose()
      danDiscMesh = null
    }
    if (danDrillMarker) {
      danDrillMarker.parent?.remove(danDrillMarker)
      disposeDrillMarkerRoot(danDrillMarker)
      danDrillMarker = null
    }
    for (const disc of danCompletedDiscs) {
      disc.geometry.dispose()
      ;(disc.material as THREE.Material).dispose()
    }
    danCompletedDiscs.length = 0
  }

  return { tick, dispose, handleDanProspect, initIfReady }
}
