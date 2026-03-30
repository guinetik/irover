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
import type { MeteorCrater } from './MeteorController'
import type { VentType, CraterDiscovery } from '@/lib/meteor/craterDiscovery'
import { rollCraterDiscovery } from '@/lib/meteor/craterDiscovery'

/** Pending crater discovery awaiting player acknowledgment. */
export interface PendingCraterResult {
  discovery: CraterDiscovery
  ventPlaced: boolean
  crater: MeteorCrater
}
import type { ArchivedVent } from '@/types/ventArchive'
import { createBioCapsule, disposeBioCapsule } from '@/three/DanCapsuleModel'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { DanDrillSiteScene } from '@/lib/neutron/danDrillSitePersistence'

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

/**
 * Ground ring for a finished water prospect — same style as post-confirmation, hidden until DAN selected.
 */
function createCompletedDanDiscMesh(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(5, 32)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  return new THREE.Mesh(geo, mat)
}

export interface PendingWaterDeploy {
  x: number
  z: number
  groundY: number
}

export interface DanHudRefs {
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
  danCraterModeAvailable: Ref<boolean>
  /** Set by tick handler when crater scan completes; Vue reads this to show result dialog. */
  pendingCraterResult: Ref<PendingCraterResult | null>
  /** Set by tick handler when water is confirmed — Vue shows deploy-or-skip decision dialog. */
  pendingWaterDeploy: Ref<PendingWaterDeploy | null>
}

export interface DanHudCallbacks {
  siteId: string
  siteTier: number
  /** Count of inconclusive (waterConfirmed: false) prospects in the archive — boosts detection */
  getInconclusiveCount: () => number
  /**
   * Attempt to consume one DAN extractor from inventory.
   * Returns true if deducted successfully, false if none available.
   */
  consumeDanExtractor: () => boolean
  /**
   * Persist drill-site coordinates for the latest water-confirmed prospect on this site.
   * Called after player confirms deploy — NOT at prospect-complete time.
   */
  updateDanProspectDrillSite: (x: number, y: number, z: number) => void
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
    drillSite?: { x: number; y: number; z: number }
  }) => void
  getLatestPersistedDanDrillSite: (siteId: string) => DanDrillSiteScene | null
  notifyDanScanCompleted: () => void
  getCraterAtPosition: (x: number, z: number) => MeteorCrater | null
  hasCraterBeenScanned: (x: number, z: number) => boolean
  hasActiveVent: (ventType: VentType) => boolean
  onCraterDiscovery: (params: {
    discovery: { id: string; name: string; sp: number; ventType: VentType | null }
    ventPlaced: boolean
    crater: MeteorCrater
  }) => void
  getVentsForSite: (siteId: string) => ArchivedVent[]
}

export interface DanHudController extends SiteTickHandler {
  /** Initiates a DAN prospect from the current pending hit. Called from the Vue template. */
  handleDanProspect(fctx: SiteFrameContext): void
  /** Lazily initialises DAN particle VFX once the rover is ready. */
  initIfReady(fctx: SiteFrameContext): void
  /** Confirms crater scanning mode after user acknowledges the crater-confirm dialog. */
  confirmCraterMode(fctx: SiteFrameContext): void
  /** Cancels crater scanning mode, returning to idle. */
  cancelCraterMode(fctx: SiteFrameContext): void
  /** Places a bio capsule buildable at the given world position, colored by fluid type. */
  placeVentMarker(x: number, z: number, fluidType: 'water' | 'co2' | 'methane'): void
  /** Player chose to deploy a DAN extractor at the confirmed water site. Consumes one extractor. */
  confirmWaterDeploy(fctx: SiteFrameContext): void
  /** Player skipped the deploy decision — no extractor consumed, no capsule placed. */
  skipWaterDeploy(): void
}

/**
 * Creates a tick handler for the DAN (Dynamic Albedo of Neutrons) instrument:
 * - Passive scanning, VFX dots, and hit detection
 * - Full prospect state machine (drive-to-zone -> initiating -> prospecting -> complete)
 * - Disc + `/dan.glb` drill-site marker placement and archiving
 */
export function createDanHudController(
  refs: DanHudRefs,
  callbacks: DanHudCallbacks,
): DanHudController {
  const {
    siteTerrainParams, danTotalSamples, danHitAvailable, danProspectPhase,
    danProspectProgress, danSignalStrength, danWaterResult, danDialogVisible,
    passiveUiRevision, siteLat, siteLon, roverWorldX, roverWorldZ, roverSpawnXZ,
    danCraterModeAvailable, pendingCraterResult, pendingWaterDeploy,
  } = refs
  const {
    siteId,
    siteTier,
    getInconclusiveCount,
    sampleToastRef,
    playerMod,
    awardDAN,
    startHeldActionSound,
    startHeldProspectingSound,
    triggerDanAchievement,
    archiveDanProspect,
    getLatestPersistedDanDrillSite,
    notifyDanScanCompleted,
    getCraterAtPosition,
    hasCraterBeenScanned,
    hasActiveVent,
    onCraterDiscovery,
    getVentsForSite,
    consumeDanExtractor,
    updateDanProspectDrillSite,
  } = callbacks

  // Cache inconclusive count — refreshed each prospect completion, cheap to read each frame
  let inconclusiveCount = getInconclusiveCount()

  let danDiscMesh: THREE.Mesh | null = null
  let danDrillMarker: THREE.Object3D | null = null
  const danCompletedDiscs: THREE.Mesh[] = []
  let vfxInitialised = false
  let heldDanPlayback: AudioPlaybackHandle | null = null
  let heldDanProspectingPlayback: AudioPlaybackHandle | null = null
  /** False after `dispose` — suppresses late GLB load callbacks. */
  let tickHandlerActive = true
  /** Ensures we only hydrate drill art from localStorage once per handler lifetime. */
  let drillSiteHydratedFromStorage = false

  let activeCrater: MeteorCrater | null = null
  /** Crater scan base duration — same conversion as normal DAN prospect (2 mars-hours → ~15 scene seconds). */
  const DAN_CRATER_SCAN_DURATION_SEC = (DAN_PROSPECT_DURATION_MARS_HOURS * 60 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION
  /** Tracks vent GLB markers placed in the scene for disposal. */
  const ventMarkers: THREE.Object3D[] = []
  /** Last siteScene reference from tick — used by placeVentMarker called outside tick. */
  let lastSiteScene: SiteFrameContext['siteScene'] | null = null

  /**
   * Rebuilds completed disc + GLB from the persisted DAN archive after a full reload.
   */
  function hydratePersistedDrillSite(fctx: SiteFrameContext, danInst: DANController, snap: DanDrillSiteScene): void {
    const scene = fctx.siteScene?.scene
    if (!scene) return
    const gx = snap.x
    const gz = snap.z
    const groundY = fctx.siteScene?.terrain?.heightAt(gx, gz) ?? snap.y - 0.05

    const disc = createCompletedDanDiscMesh()
    disc.position.set(gx, groundY + 0.05, gz)
    disc.visible = false
    scene.add(disc)
    danCompletedDiscs.push(disc)

    if (danDrillMarker) {
      scene.remove(danDrillMarker)
      disposeBioCapsule(danDrillMarker)
      danDrillMarker = null
    }
    void createBioCapsule('water', gx, gz, groundY, scene).then((instance) => {
      if (!instance || !tickHandlerActive) return
      danDrillMarker = instance
    })

    danInst.drillSitePosition = new THREE.Vector3(snap.x, snap.y, snap.z)
    danInst.waterConfirmed = true
    danInst.reservoirQuality = snap.reservoirQuality
    danInst.prospectStrength = snap.signalStrength
    danWaterResult.value = true
  }

  /**
   * When DAN standby (user toggle or sleep/power), tear down any in-flight hydrogen hit or prospect
   * disc so the rover cannot finish a prospect while the subsystem is off.
   */
  function abandonDanInvestigationOnStandby(
    danInst: DANController,
    controller: NonNullable<SiteFrameContext['rover']>,
    siteScene: SiteFrameContext['siteScene'],
    isSleeping: boolean,
  ): void {
    const hadDisc = danDiscMesh !== null
    const hadProspectPipeline =
      danInst.prospectPhase === 'drive-to-zone'
      || danInst.prospectPhase === 'initiating'
      || danInst.prospectPhase === 'prospecting'
    const hadPending = danInst.pendingHit !== null

    if (!hadDisc && !hadProspectPipeline && !hadPending) return

    if (danDiscMesh) {
      siteScene?.scene.remove(danDiscMesh)
      danDiscMesh.geometry.dispose()
      ;(danDiscMesh.material as THREE.Material).dispose()
      danDiscMesh = null
    }

    danInst.pendingHit = null
    danInst.hitConsumed = false
    danInst.prospectPhase = 'idle'
    danInst.prospectProgress = 0
    danInst.prospectComplete = false
    danProspectPhase.value = 'idle'
    danProspectProgress.value = 0
    danDialogVisible.value = false
    danWaterResult.value = null
    controller.criticalPowerMobilitySuspended = false
    controller.config.moveSpeed = 5

    activeCrater = null
    danCraterModeAvailable.value = false
    pendingCraterResult.value = null

    syncDanProspectingPlayback(false)
    passiveUiRevision.value++

    sampleToastRef.value?.showDAN(
      isSleeping
        ? 'Prospect interrupted — insufficient power'
        : 'DAN standby — prospect cancelled',
    )
  }

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
      if (!drillSiteHydratedFromStorage) {
        const snap = getLatestPersistedDanDrillSite(siteId)
        if (snap) {
          drillSiteHydratedFromStorage = true
          hydratePersistedDrillSite(fctx, danInit, snap)
        }
      }

      // Restore persisted vent buildables (bio capsule colored by type)
      const siteVents = getVentsForSite(siteId)
      for (const vent of siteVents) {
        const sceneRef = fctx.siteScene?.scene
        const terrainRef = fctx.siteScene?.terrain
        if (!sceneRef) continue
        const groundY = terrainRef ? terrainRef.terrainHeightAt(vent.x, vent.z) : 0
        void createBioCapsule(vent.ventType, vent.x, vent.z, groundY, sceneRef).then((instance) => {
          if (!instance || !tickHandlerActive) return
          ventMarkers.push(instance)
        })
      }
    }
  }

  function handleDanProspect(fctx: SiteFrameContext): void {
    const danInst = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst?.passiveSubsystemEnabled) return

    // Crater detection — does NOT require a pending hit. If rover is in a crater, offer crater mode immediately.
    const roverPos = fctx.siteScene?.rover?.position
    if (roverPos) {
      const crater = getCraterAtPosition(roverPos.x, roverPos.z)
      if (crater && crater.rockMesh && !hasCraterBeenScanned(crater.x, crater.z)) {
        activeCrater = crater
        danInst.prospectPhase = 'crater-confirm'
        danProspectPhase.value = 'crater-confirm'
        danCraterModeAvailable.value = true
        return // Don't start normal prospect
      }
    }

    // Normal prospect requires a pending hit
    if (!danInst.pendingHit) return
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

  function confirmCraterMode(fctx: SiteFrameContext): void {
    const danInst = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst || !activeCrater) return

    danInst.prospectPhase = 'crater-scanning'
    danProspectPhase.value = 'crater-scanning'
    danProspectProgress.value = 0
    danCraterModeAvailable.value = false

    // Immobilize rover — suspend mobility (blocks WASD turn + move, same as critical sleep)
    if (fctx.rover) fctx.rover.criticalPowerMobilitySuspended = true
  }

  function cancelCraterMode(fctx: SiteFrameContext): void {
    const danInst = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst) return

    activeCrater = null
    danInst.prospectPhase = 'idle'
    danProspectPhase.value = 'idle'
    danProspectProgress.value = 0
    danCraterModeAvailable.value = false
  }

  function placeVentMarker(x: number, z: number, fluidType: 'water' | 'co2' | 'methane'): void {
    const sceneRef = lastSiteScene?.scene
    const terrainRef = lastSiteScene?.terrain
    if (!sceneRef) return
    const groundY = terrainRef ? terrainRef.terrainHeightAt(x, z) : 0
    void createBioCapsule(fluidType, x, z, groundY, sceneRef).then((instance) => {
      if (!instance || !tickHandlerActive) return
      ventMarkers.push(instance)
    })
  }

  function tick(fctx: SiteFrameContext): void {
    const { rover: controller, siteScene, sceneDelta, isSleeping, marsSol } = fctx
    lastSiteScene = siteScene

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
      danInst.siteTier = siteTier
      danInst.totalSP = fctx.totalSP
      danInst.inconclusiveCount = inconclusiveCount
    }
    // accuracyMod and analysisSpeedMod are now set by the domain tick handler (DANTickHandler)
    // Suppress passive sampling during crater mode — rover is stationary, scan is fixed-duration
    if (danInst.prospectPhase !== 'crater-confirm' && danInst.prospectPhase !== 'crater-scanning') {
      danInst.update(sceneDelta)
    }

    danTotalSamples.value = danInst.totalSamples

    if (isSleeping && danInst.passiveSubsystemEnabled) {
      danInst.forceOff()
    }

    if (!danInst.passiveSubsystemEnabled && controller) {
      abandonDanInvestigationOnStandby(danInst, controller, siteScene, isSleeping)
    }

    danHitAvailable.value = danInst.pendingHit !== null

    // Auto-detect crater when DAN is active and idle — show confirmation immediately
    if (
      danInst.passiveSubsystemEnabled
      && danInst.prospectPhase === 'idle'
      && !activeCrater
      && !danCraterModeAvailable.value
    ) {
      const rp2 = siteScene.rover?.position
      if (rp2) {
        const crater = getCraterAtPosition(rp2.x, rp2.z)
        if (crater && crater.rockMesh && !hasCraterBeenScanned(crater.x, crater.z)) {
          activeCrater = crater
          danInst.prospectPhase = 'crater-confirm'
          danProspectPhase.value = 'crater-confirm'
          danCraterModeAvailable.value = true
        }
      }
    }

    // VFX: always tick so dots hide when deselected
    const danSelected = controller?.activeInstrument?.id === 'dan'
    danInst.vfxVisible = !!danSelected
    const rp = siteScene.rover?.position
    const groundY = rp && siteScene.terrain ? siteScene.terrain.heightAt(rp.x, rp.z) : 0
    danInst.updateVFX(sceneDelta, groundY)

    for (const disc of danCompletedDiscs) disc.visible = !!danSelected

    // Hit detection -> toast + SP (only while DAN subsystem is powered / active)
    if (danInst.passiveSubsystemEnabled && danInst.pendingHit && !danInst.hitConsumed) {
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
      notifyDanScanCompleted()
    }

    syncDanScanPlayback(danInst.passiveSubsystemEnabled)

    // --- Crater scanning phase (parallel branch — never crosses normal prospect flow) ---
    if (danInst.prospectPhase === 'crater-scanning' && activeCrater) {
      const adjustedDuration = DAN_CRATER_SCAN_DURATION_SEC / danInst.analysisSpeedMod
      danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / adjustedDuration)
      danInst.prospectProgress = danProspectProgress.value

      syncDanProspectingPlayback(true)

      if (danProspectProgress.value >= 1) {
        const discovery = rollCraterDiscovery(danInst.scanRadiusMod - 1)
        const wantVent = discovery.ventType !== null && !hasActiveVent(discovery.ventType)

        // Store pending result — Vue shows the result dialog, user must acknowledge
        pendingCraterResult.value = { discovery, ventPlaced: wantVent, crater: activeCrater }

        // Cleanup — deactivate DAN, unlock rover, return to idle
        syncDanProspectingPlayback(false)
        danInst.forceOff()
        danInst.prospectPhase = 'idle'
        danInst.prospectComplete = false
        danProspectPhase.value = 'idle'
        danProspectProgress.value = 0
        activeCrater = null
        if (controller) {
          controller.criticalPowerMobilitySuspended = false
          controller.config.moveSpeed = 5
        }
        danInst.pendingHit = null
        danHitAvailable.value = false
      }
      return // Skip normal prospect state machine
    }

    // --- Prospect phase state machine (freezes if DAN standby — abandon clears in-flight work above) ---
    if (
      danInst.passiveSubsystemEnabled
      && danInst.prospectPhase !== 'idle'
      && danInst.prospectPhase !== 'complete'
    ) {
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
          const prospectDurationSec = (DAN_PROSPECT_DURATION_MARS_HOURS * 60 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION / danInst.analysisSpeedMod
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

            const hitCenter = danDiscMesh?.position.clone() ?? hitPos.clone()

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
              // drillSite deliberately omitted — stored only after player confirms deploy
            })

            // Refresh inconclusive count — each failed prospect makes the next detection easier
            inconclusiveCount = getInconclusiveCount()

            if (hasWater) {
              const gx = hitCenter.x
              const gz = hitCenter.z
              const groundY = siteScene?.terrain
                ? siteScene.terrain.heightAt(gx, gz)
                : hitCenter.y - 0.05

              danInst.drillSitePosition = hitCenter.clone()
              danInst.reservoirQuality = danInst.prospectStrength

              // Surface the deploy decision to the player — no capsule placed until confirmed
              pendingWaterDeploy.value = { x: gx, z: gz, groundY }
              danDialogVisible.value = true // (Re-)open dialog in case user dismissed it during prospect

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
    syncDanProspectingPlayback(
      danInst.passiveSubsystemEnabled && danInst.prospectPhase === 'prospecting',
    )
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
      disposeBioCapsule(danDrillMarker)
      danDrillMarker = null
    }
    for (const disc of danCompletedDiscs) {
      disc.geometry.dispose()
      ;(disc.material as THREE.Material).dispose()
    }
    danCompletedDiscs.length = 0
    for (const vm of ventMarkers) {
      vm.parent?.remove(vm)
      disposeBioCapsule(vm)
    }
    ventMarkers.length = 0
  }

  function confirmWaterDeploy(fctx: SiteFrameContext): void {
    const pending = pendingWaterDeploy.value
    if (!pending) return
    if (!consumeDanExtractor()) {
      sampleToastRef.value?.showDAN('No DAN extractor in inventory — deploy cancelled')
      pendingWaterDeploy.value = null
      return
    }
    pendingWaterDeploy.value = null
    const { x: gx, z: gz, groundY } = pending
    // Persist drillSite now that deploy is confirmed
    updateDanProspectDrillSite(gx, groundY, gz)
    const sceneRef = fctx.siteScene?.scene
    if (danDrillMarker && sceneRef) {
      sceneRef.remove(danDrillMarker)
      disposeBioCapsule(danDrillMarker)
      danDrillMarker = null
    }
    if (sceneRef) {
      void createBioCapsule('water', gx, gz, groundY, sceneRef).then((instance) => {
        if (!instance || !tickHandlerActive) return
        danDrillMarker = instance
      })
    }
  }

  function skipWaterDeploy(): void {
    pendingWaterDeploy.value = null
  }

  return { tick, dispose, handleDanProspect, initIfReady, confirmCraterMode, cancelCraterMode, placeVentMarker, confirmWaterDeploy, skipWaterDeploy }
}
