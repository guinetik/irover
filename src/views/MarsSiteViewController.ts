import type { Ref } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { createCameraFillLight, syncCameraFillLight } from '@/three/cameraFillLight'
import { createMarsEnvironment } from '@/three/MarsEnvironment'
import { createDustAtmospherePass } from '@/three/DustAtmospherePass'
import { isSitePostProcessingEnabled } from '@/lib/sitePostProcessing'
import { isSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
import { installOrbitalDropDebugApi } from '@/lib/orbitalDropDebug'
import { installMarsDevDebugApi } from '@/lib/marsDevDebug'
import { listOrbitalDropItemIds } from '@/types/orbitalDrop'
import type { GeologicalFeature, Landmark } from '@/types/landmark'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'
import { devSpawnRandomInventoryItems } from '@/composables/useInventory'
import { devAwardSciencePoints } from '@/composables/useSciencePoints'
import {
  type InstrumentPowerLineInput,
  type PowerTickInput,
  type RoverPowerProfile,
} from '@/composables/useMarsPower'
import type { ThermalTickInput, ThermalZone } from '@/composables/useMarsThermal'
import type { RemsHudSnapshot, RemsWeatherTickInput } from '@/composables/useSiteRemsWeather'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type SampleToast from '@/components/SampleToast.vue'
import type { SamQueueEntry } from '@/composables/useSamQueue'
import type { APXSQueueEntry } from '@/composables/useAPXSQueue'
import type { SPGain } from '@/composables/useSciencePoints'
import {
  MastCamController,
  ChemCamController,
  DrillController,
  APXSController,
  DANController,
  SAMController,
  RTGController,
  HeaterController,
  REMSController,
  RADController,
  AntennaLGController,
  AntennaUHFController,
  RoverWheelsController,
  type RTGConservationState,
} from '@/three/instruments'

import type { SiteFrameContext } from './site-controllers/SiteFrameContext'
import { createRoverVfxTickHandler } from './site-controllers/RoverVfxTickHandler'
import { createDanTickHandler } from './site-controllers/DanTickHandler'
import { createDrillTickHandler } from './site-controllers/DrillTickHandler'
import { createMastCamTickHandler } from './site-controllers/MastCamTickHandler'
import { createChemCamTickHandler } from './site-controllers/ChemCamTickHandler'
import { createOrbitalDropTickHandler } from './site-controllers/OrbitalDropTickHandler'
import { createAntennaTickHandler, type AntennaTickRefs } from './site-controllers/AntennaTickHandler'
import { createAPXSTickHandler } from './site-controllers/APXSTickHandler'
import { useSciencePoints } from '@/composables/useSciencePoints'

/** Seconds to hold position before DAN prospecting begins. */
export const DAN_INITIATE_DURATION_SEC = 4
/** Mars-hours duration for subsurface prospect simulation. */
export const DAN_PROSPECT_DURATION_MARS_HOURS = 2

/**
 * Formats RTG power-shunt cooldown for HUD copy.
 * @param seconds Remaining cooldown seconds
 */
export function formatRtgShuntCooldownLabel(seconds: number): string {
  if (seconds <= 0) return ''
  const m = Math.ceil(seconds / 60)
  return m >= 2 ? `~${m} min until shunt ready` : `${Math.max(1, Math.ceil(seconds))}s until shunt ready`
}

/**
 * Builds per-instrument main-bus power lines for {@link useMarsPower}'s tick.
 */
export function buildInstrumentPowerLines(
  roverCtl: RoverController | null,
  roverReady: boolean,
  roverAwake: boolean,
): InstrumentPowerLineInput[] {
  const lines: InstrumentPowerLineInput[] = []
  if (!roverCtl) return lines

  if (roverReady && roverAwake) {
    for (const inst of roverCtl.instruments) {
      if (!inst.billsPassiveBackgroundPower) continue
      const w = inst.getPassiveBackgroundPowerW()
      if (w > 1e-6) {
        lines.push({ id: `${inst.id}-bg`, label: inst.name, w })
      }
    }
  }

  const mode = roverCtl.mode
  const focused = roverCtl.activeInstrument
  if (
    roverAwake
    && (mode === 'instrument' || mode === 'active')
    && focused
    && focused.id !== 'heater'
  ) {
    const phase = mode === 'active' ? 'active' : 'instrument'
    const w = focused.getInstrumentBusPowerW(phase)
    if (w > 1e-6) {
      lines.push({ id: focused.id, label: focused.name, w })
    }
  }

  const cc = roverCtl.instruments.find((i): i is ChemCamController => i instanceof ChemCamController)
  if (roverAwake && cc?.isSequenceAdvancing) {
    const chemCamFocused =
      focused?.id === 'chemcam' && (mode === 'instrument' || mode === 'active')
    if (!chemCamFocused) {
      const w = Math.max(ChemCamController.BUS_IDLE_W, cc.powerDrawW)
      if (w > 1e-6) {
        lines.push({ id: 'chemcam', label: 'ChemCam', w })
      }
    }
  }

  return lines
}

/**
 * Stable numeric seed from a string (terrain / rock placement).
 * @param s Input string
 */
export function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 1000 + 1
}

/**
 * Resolves {@link TerrainParams} for the current landing site from landmark data.
 * @param siteId Active site id
 * @param landmarks Loaded landmark list
 */
export function getTerrainParamsForSite(siteId: string, landmarks: Ref<readonly Landmark[]>): TerrainParams {
  const site = landmarks.value.find((l) => l.id === siteId)
  if (site && site.type === 'geological') {
    const geo = site as GeologicalFeature
    return {
      roughness: geo.roughness,
      craterDensity: geo.craterDensity,
      dustCover: geo.dustCover,
      elevation: Math.min(1, Math.max(0, (geo.elevationKm + 8) / 30)),
      ironOxide: geo.ironOxideIndex,
      basalt: geo.basaltIndex,
      seed: hashString(geo.id) + Math.floor(Date.now() / 1000),
      siteId: geo.id,
      featureType: geo.featureType,
      waterIceIndex: geo.waterIceIndex,
      silicateIndex: geo.silicateIndex,
      temperatureMaxK: geo.temperatureMaxK,
      temperatureMinK: geo.temperatureMinK,
      latDeg: geo.lat,
      lonDeg: geo.lon,
    }
  }
  // Landing sites also have lat/lon
  const latLon = site ? { latDeg: site.lat, lonDeg: site.lon } : {}
  return {
    roughness: 0.4,
    craterDensity: 0.3,
    dustCover: 0.6,
    elevation: 0.5,
    ironOxide: 0.6,
    basalt: 0.5,
    seed: hashString(siteId) + Math.floor(Date.now() / 1000),
    siteId: siteId,
    featureType: 'plain' as const,
    waterIceIndex: 0.1,
    silicateIndex: 0.3,
    temperatureMaxK: 280,
    temperatureMinK: 160,
    ...latLon,
  }
}

/** Vue-facing refs and handlers wired from {@link MartianSiteView.vue}. */
export interface MarsSiteViewRefs {
  siteLat: Ref<number>
  siteLon: Ref<number>
  siteTerrainParams: Ref<TerrainParams | null>
  roverHeading: Ref<number>
  roverIsMoving: Ref<boolean>
  controlsHintDismissed: Ref<boolean>
  roverWorldX: Ref<number>
  roverWorldZ: Ref<number>
  roverSpawnXZ: Ref<{ x: number; z: number }>
  passiveUiRevision: Ref<number>
  isInstrumentActive: Ref<boolean>
  samDialogVisible: Ref<boolean>
  rtgPhase: Ref<'idle' | 'overdrive' | 'cooldown' | 'recharging'>
  rtgPhaseProgress: Ref<number>
  rtgConservationMode: Ref<RTGConservationState>
  rtgConservationProgress01: Ref<number>
  rtgOverdriveReady: Ref<boolean>
  rtgConservationReady: Ref<boolean>
  rtgConservationCdLabel: Ref<string>
  rtgConservationCooldownTitle: Ref<string>
  heaterOverdriveReady: Ref<boolean>
  heaterHeatBoostActive: Ref<boolean>
  heaterHeatBoostProgressElapsed01: Ref<number>
  crosshairVisible: Ref<boolean>
  crosshairColor: Ref<'green' | 'red'>
  crosshairX: Ref<number>
  crosshairY: Ref<number>
  drillProgress: Ref<number>
  isDrilling: Ref<boolean>
  mastcamFilterLabel: Ref<string>
  mastcamScanning: Ref<boolean>
  mastcamScanProgress: Ref<number>
  chemCamUnreadCount: Ref<number>
  chemcamPhase: Ref<string>
  chemcamShotsRemaining: Ref<number>
  chemcamShotsMax: Ref<number>
  chemcamProgressPct: Ref<number>
  chemCamOverlaySequenceActive: Ref<boolean>
  chemCamOverlaySequenceProgress: Ref<number>
  chemCamOverlaySequenceLabel: Ref<string>
  chemCamOverlaySequencePulse: Ref<boolean>
  marsTimeOfDay: Ref<number>
  currentNightFactor: Ref<number>
  marsSol: Ref<number>
  mastPan: Ref<number>
  mastTilt: Ref<number>
  mastFov: Ref<number>
  mastTargetRange: Ref<number>
  descending: Ref<boolean>
  deploying: Ref<boolean>
  deployProgress: Ref<number>
  activeInstrumentSlot: Ref<number | null>
  danTotalSamples: Ref<number>
  danHitAvailable: Ref<boolean>
  danProspectPhase: Ref<string>
  danProspectProgress: Ref<number>
  danSignalStrength: Ref<number>
  danWaterResult: Ref<boolean | null>
  danDialogVisible: Ref<boolean>
  internalTempC: Ref<number>
  ambientEffectiveC: Ref<number>
  heaterW: Ref<number>
  heaterEffectiveW: Ref<number>
  thermalZone: Ref<ThermalZone>
  samIsProcessing: Ref<boolean>
  apxsCountdown: Ref<number>
  apxsState: Ref<'idle' | 'counting' | 'launching' | 'playing'>
  // Antenna system refs
  uhfPassActive: Ref<boolean>
  uhfTransmitting: Ref<boolean>
  uhfCurrentOrbiter: Ref<string>
  uhfTransmissionProgress: Ref<number>
  uhfQueueLength: Ref<number>
  uhfWindowRemainingSec: Ref<number>
  uhfNextPassInSec: Ref<number>
  uhfTransmittedThisPass: Ref<number>
  lgaUnreadCount: Ref<number>
  /** Sol clock ambient segment — null when REMS not surveying. */
  solClockAmbientC: Ref<number | null>
  remsHud: Ref<RemsHudSnapshot>
  remsStormIncomingText: Ref<string | null>
  remsStormActiveText: Ref<string | null>
  /** REMS passive surveying — drives ambient air HUD availability. */
  remsSurveying: Ref<boolean>
}

/** Services and callbacks supplied by the view — no Vue imports in the loop beyond ref reads. */
export interface MarsSiteViewContext {
  siteId: string
  canvasRef: Ref<HTMLCanvasElement | null>
  loadLandmarks: () => Promise<Landmark[]>
  landmarks: Ref<readonly Landmark[]>
  gameClock: ReturnType<typeof import('@/composables/useMarsGameClock').useMarsGameClock>
  orbitalDrops: ReturnType<typeof import('@/composables/useOrbitalDrops').useOrbitalDrops>
  isSleeping: Ref<boolean>
  roverPowerProfile: RoverPowerProfile
  playerMod: (key: keyof ProfileModifiers) => number
  hasPerk: (perkId: string) => boolean
  tickPower: (deltaSeconds: number, input: PowerTickInput) => void
  tickThermal: (deltaSeconds: number, input: ThermalTickInput) => void
  tickRemsWeather: (input: RemsWeatherTickInput) => void
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  upsertPoi: (poi: { id: string; label: string; x: number; z: number; color: string }) => void
  removePoi: (id: string) => void
  setFocusPoi: (id: string | null) => void
  focusPoiId: Ref<string | null>
  awardSP: (source: 'mastcam' | 'chemcam' | 'drill', rockMeshUuid: string, label: string) => SPGain | null
  awardDAN: (reason: string) => SPGain | null
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
  samTick: (deltaSec: number) => SamQueueEntry | null
  apxsTick: (deltaSec: number) => APXSQueueEntry | null
  totalSP: Ref<number>
  triggerDanAchievement: (event: string) => void
  awardTransmission: (archiveId: string, baseSP: number, label: string) => import('@/composables/useSciencePoints').SPGain | null
  onAPXSLaunchMinigame: (rockMeshUuid: string, rockType: string, rockLabel: string, durationSec: number) => void
  onAPXSBlockedByCold: () => void
  onInstrumentActivateRequest: () => void
  onGlobalKeyDown: (e: KeyboardEvent) => void
  clearPois: () => void
  devSpawnRandomInventoryItems: typeof devSpawnRandomInventoryItems
  devSpawnInventoryItemById: typeof import('@/composables/useInventory').devSpawnInventoryItem
  refs: MarsSiteViewRefs
}

/** Handle returned by {@link createMarsSiteViewController}. */
export interface MarsSiteViewControllerHandle {
  mount: () => Promise<void>
  dispose: () => void
  resize: () => void
  readonly rover: RoverController | null
  readonly siteScene: SiteScene | null
  spawnOrbitalDropItem: (
    itemId: string,
    options?: { x?: number; z?: number; quantity?: number },
  ) => string
  spawnRandomOrbitalDrop: (options?: { x?: number; z?: number; quantity?: number }) => string
  handleDanProspect: () => void
}

/**
 * Orchestrates the Mars site view by delegating per-frame work to focused tick handlers.
 * Owns Three.js renderer/camera/scene lifecycle and the top-level animation loop.
 * The Vue SFC wires refs/composables via {@link MarsSiteViewContext} and calls {@link MarsSiteViewControllerHandle.mount}.
 */
export function createMarsSiteViewController(ctx: MarsSiteViewContext): MarsSiteViewControllerHandle {
  const {
    siteId,
    canvasRef,
    loadLandmarks,
    landmarks,
    gameClock,
    orbitalDrops,
    isSleeping,
    roverPowerProfile,
    playerMod,
    hasPerk,
    tickPower,
    tickThermal,
    tickRemsWeather,
    sampleToastRef,
    upsertPoi,
    removePoi,
    setFocusPoi,
    focusPoiId,
    awardDAN,
    awardSP,
    archiveDanProspect,
    samTick,
    apxsTick,
    totalSP,
    triggerDanAchievement,
    awardTransmission,
    onInstrumentActivateRequest,
    onGlobalKeyDown,
    clearPois,
    devSpawnRandomInventoryItems: devSpawnRandom,
    devSpawnInventoryItemById,
  } = ctx

  const {
    siteLat,
    siteLon,
    siteTerrainParams,
    roverHeading,
    roverIsMoving,
    controlsHintDismissed,
    roverWorldX,
    roverWorldZ,
    roverSpawnXZ,
    passiveUiRevision,
    isInstrumentActive,
    samDialogVisible,
    marsTimeOfDay,
    currentNightFactor,
    marsSol,
    descending,
    deploying,
    deployProgress,
    activeInstrumentSlot,
    internalTempC,
    ambientEffectiveC,
    heaterW,
    heaterEffectiveW,
    thermalZone,
    samIsProcessing,
    // Antenna system refs
    uhfPassActive,
    uhfTransmitting,
    uhfCurrentOrbiter,
    uhfTransmissionProgress,
    uhfQueueLength,
    uhfWindowRemainingSec,
    uhfNextPassInSec,
    uhfTransmittedThisPass,
    lgaUnreadCount,
    remsHud,
    remsSurveying,
  } = ctx.refs

  // --- Three.js core ---
  let renderer: THREE.WebGLRenderer | null = null
  let camera: THREE.PerspectiveCamera | null = null
  let composer: EffectComposer | null = null
  let siteScene: SiteScene | null = null
  let controller: RoverController | null = null
  let clock: THREE.Clock | null = null
  let dustPass: ReturnType<typeof createDustAtmospherePass> | null = null
  let animationId = 0
  let cameraFillLight: THREE.DirectionalLight | null = null
  let disposeOrbitalDropDebugApi: (() => void) | null = null
  let disposeMarsDevDebugApi: (() => void) | null = null

  let lastSkyTimeOfDay = -1
  let roverSpawnCaptured = false

  // --- Tick handlers ---
  const roverVfxHandler = createRoverVfxTickHandler({
    rtgPhase: ctx.refs.rtgPhase,
    rtgPhaseProgress: ctx.refs.rtgPhaseProgress,
    rtgConservationMode: ctx.refs.rtgConservationMode,
    rtgConservationProgress01: ctx.refs.rtgConservationProgress01,
    rtgOverdriveReady: ctx.refs.rtgOverdriveReady,
    rtgConservationReady: ctx.refs.rtgConservationReady,
    rtgConservationCdLabel: ctx.refs.rtgConservationCdLabel,
    rtgConservationCooldownTitle: ctx.refs.rtgConservationCooldownTitle,
    heaterOverdriveReady: ctx.refs.heaterOverdriveReady,
    heaterHeatBoostActive: ctx.refs.heaterHeatBoostActive,
    heaterHeatBoostProgressElapsed01: ctx.refs.heaterHeatBoostProgressElapsed01,
  })

  const danHandler = createDanTickHandler(
    {
      siteTerrainParams,
      danTotalSamples: ctx.refs.danTotalSamples,
      danHitAvailable: ctx.refs.danHitAvailable,
      danProspectPhase: ctx.refs.danProspectPhase,
      danProspectProgress: ctx.refs.danProspectProgress,
      danSignalStrength: ctx.refs.danSignalStrength,
      danWaterResult: ctx.refs.danWaterResult,
      danDialogVisible: ctx.refs.danDialogVisible,
      passiveUiRevision,
      siteLat,
      siteLon,
      roverWorldX,
      roverWorldZ,
      roverSpawnXZ,
    },
    { siteId, sampleToastRef, playerMod, awardDAN, triggerDanAchievement, archiveDanProspect },
  )

  const drillHandler = createDrillTickHandler(
    {
      crosshairVisible: ctx.refs.crosshairVisible,
      crosshairColor: ctx.refs.crosshairColor,
      crosshairX: ctx.refs.crosshairX,
      crosshairY: ctx.refs.crosshairY,
      drillProgress: ctx.refs.drillProgress,
      isDrilling: ctx.refs.isDrilling,
    },
    { sampleToastRef, playerMod, awardSP },
  )

  const mastCamHandler = createMastCamTickHandler(
    {
      mastcamFilterLabel: ctx.refs.mastcamFilterLabel,
      mastcamScanning: ctx.refs.mastcamScanning,
      mastcamScanProgress: ctx.refs.mastcamScanProgress,
      mastPan: ctx.refs.mastPan,
      mastTilt: ctx.refs.mastTilt,
      mastFov: ctx.refs.mastFov,
      mastTargetRange: ctx.refs.mastTargetRange,
      crosshairVisible: ctx.refs.crosshairVisible,
      crosshairColor: ctx.refs.crosshairColor,
      crosshairX: ctx.refs.crosshairX,
      crosshairY: ctx.refs.crosshairY,
      isDrilling: ctx.refs.isDrilling,
      drillProgress: ctx.refs.drillProgress,
    },
    { sampleToastRef, awardSP, playerMod },
  )

  const chemCamHandler = createChemCamTickHandler(
    {
      chemCamUnreadCount: ctx.refs.chemCamUnreadCount,
      chemcamPhase: ctx.refs.chemcamPhase,
      chemcamShotsRemaining: ctx.refs.chemcamShotsRemaining,
      chemcamShotsMax: ctx.refs.chemcamShotsMax,
      chemcamProgressPct: ctx.refs.chemcamProgressPct,
      chemCamOverlaySequenceActive: ctx.refs.chemCamOverlaySequenceActive,
      chemCamOverlaySequenceProgress: ctx.refs.chemCamOverlaySequenceProgress,
      chemCamOverlaySequenceLabel: ctx.refs.chemCamOverlaySequenceLabel,
      chemCamOverlaySequencePulse: ctx.refs.chemCamOverlaySequencePulse,
      mastPan: ctx.refs.mastPan,
      mastTilt: ctx.refs.mastTilt,
      mastFov: ctx.refs.mastFov,
      mastTargetRange: ctx.refs.mastTargetRange,
      crosshairVisible: ctx.refs.crosshairVisible,
      crosshairColor: ctx.refs.crosshairColor,
      crosshairX: ctx.refs.crosshairX,
      crosshairY: ctx.refs.crosshairY,
      isDrilling: ctx.refs.isDrilling,
      drillProgress: ctx.refs.drillProgress,
    },
    { sampleToastRef, playerMod, awardSP },
  )

  const apxsHandler = createAPXSTickHandler(
    {
      crosshairVisible: ctx.refs.crosshairVisible,
      crosshairColor: ctx.refs.crosshairColor,
      crosshairX: ctx.refs.crosshairX,
      crosshairY: ctx.refs.crosshairY,
      apxsCountdown: ctx.refs.apxsCountdown,
      apxsState: ctx.refs.apxsState,
    },
    {
      onLaunchMinigame: ctx.onAPXSLaunchMinigame,
      onBlockedByCold: ctx.onAPXSBlockedByCold,
      playerMod,
    },
  )

  const orbitalDropHandler = createOrbitalDropTickHandler({
    orbitalDrops,
    sampleToastRef,
    roverWorldX,
    roverWorldZ,
    upsertPoi,
    removePoi,
    setFocusPoi,
    focusPoiId,
  })

  const antennaHandler = createAntennaTickHandler(
    {
      uhfPassActive,
      uhfTransmitting,
      uhfCurrentOrbiter,
      uhfTransmissionProgress,
      uhfQueueLength,
      uhfWindowRemainingSec,
      uhfNextPassInSec,
      uhfTransmittedThisPass,
      lgaUnreadCount,
      passiveUiRevision,
    },
    {
      sampleToastRef,
      awardTransmission,
    },
  )

  // --- Resize ---

  function onResize(): void {
    const canvas = canvasRef.value
    if (!canvas || !renderer || !camera) return
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    composer?.setSize(canvas.clientWidth, canvas.clientHeight)
    if (dustPass) {
      dustPass.uniforms.uResolution.value.set(canvas.clientWidth, canvas.clientHeight)
    }
  }

  // --- Mount ---

  async function mount(): Promise<void> {
    const canvas = canvasRef.value
    if (!canvas) return

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15

    camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1200,
    )

    await loadLandmarks()
    const site = landmarks.value.find((l) => l.id === siteId)
    if (site) {
      siteLat.value = site.lat
      siteLon.value = site.lon
    }
    const terrainParams = getTerrainParamsForSite(siteId, landmarks)
    siteTerrainParams.value = terrainParams

    siteScene = new SiteScene('elevation')
    await siteScene.init(terrainParams, { skipIntroSequence: isSiteIntroSequenceSkipped() })

    // Procedural Mars environment map — gives PBR metals something to reflect
    siteScene.scene.environment = createMarsEnvironment(renderer)
    siteScene.scene.environmentIntensity = 0.6

    cameraFillLight = createCameraFillLight()
    siteScene.scene.add(cameraFillLight)
    siteScene.scene.add(cameraFillLight.target)

    if (siteScene.rover) {
      controller = new RoverController(
        siteScene.rover,
        camera,
        canvas,
        (x, z) => siteScene!.terrain.heightAt(x, z),
        (x, z) => siteScene!.terrain.normalAt(x, z),
        { moveSpeed: 1.2, turnSpeed: 0.5, instrumentZoomDelaySeconds: 5 },
        siteScene,
      )
      controller.onInstrumentActivateRequest = onInstrumentActivateRequest
    }

    const instrumentControllers = [
      new MastCamController(),
      new ChemCamController(),
      new DrillController(),
      new APXSController(),
      new DANController(),
      new SAMController(),
      new RTGController(),
      new HeaterController(),
      new REMSController(),
      new RADController(),
      new RoverWheelsController(),
      new AntennaLGController(),
      new AntennaUHFController(),
    ]
    if (controller) {
      controller.instruments = instrumentControllers
    }

    if (import.meta.env.DEV) {
      disposeOrbitalDropDebugApi = installOrbitalDropDebugApi({
        dropItem: (itemId, opts) => orbitalDropHandler.spawnOrbitalDropItem(buildFrameContext()!, itemId, opts),
        dropRandom: (opts) => orbitalDropHandler.spawnRandomOrbitalDrop(buildFrameContext()!, opts),
        listComponentItems: listOrbitalDropItemIds,
      })
      disposeMarsDevDebugApi = installMarsDevDebugApi({
        spawnRandomInventoryItems: devSpawnRandom,
        spawnInventoryItemById: devSpawnInventoryItemById,
        addSciencePoints: (amount: number) => {
          const gain = devAwardSciencePoints(amount)
          if (!gain) {
            return { ok: false as const, message: 'Invalid amount (use a positive integer).' }
          }
          sampleToastRef.value?.showSP(gain.amount, 'DEV', gain.bonus)
          return { ok: true as const, amount: gain.amount }
        },
      })
    }

    if (isSitePostProcessingEnabled()) {
      composer = new EffectComposer(renderer)
      composer.addPass(new RenderPass(siteScene.scene, camera))
      dustPass = createDustAtmospherePass(terrainParams.dustCover)
      composer.addPass(dustPass)
    }

    clock = new THREE.Clock()

    let simulationTime = 0
    let wasSleeping = false

    function animate() {
      animationId = requestAnimationFrame(animate)
      if (!camera || !clock || !siteScene || !renderer) return

      const rawDelta = clock.getDelta()
      const sceneDelta = gameClock.getSceneDelta(rawDelta)
      const skyDelta = gameClock.getSkyDelta(rawDelta)
      gameClock.missionCooldowns.tick(sceneDelta)
      simulationTime += sceneDelta

      const roverReady = siteScene.roverState === 'ready'
      const nightFactor = siteScene.sky?.nightFactor ?? 0

      if (isSleeping.value && !wasSleeping && controller) {
        samIsProcessing.value = false
        controller.shutdownInstrumentsForSleep()
        passiveUiRevision.value++
      }
      wasSleeping = isSleeping.value

      // --- Build per-frame context ---
      const fctx: SiteFrameContext = {
        sceneDelta,
        skyDelta,
        simulationTime,
        camera,
        siteScene,
        rover: controller,
        roverReady,
        isSleeping: isSleeping.value,
        nightFactor,
        thermalZone: thermalZone.value,
        marsSol: marsSol.value,
        marsTimeOfDay: marsTimeOfDay.value,
        totalSP: totalSP.value,
        activeInstrumentSlot: activeInstrumentSlot.value,
      }

      // --- Sleep / speed control ---
      if (isSleeping.value && controller) {
        controller.config.moveSpeed = 0
        controller.config.turnSpeed = 0
      } else if (controller && siteScene.sky) {
        const nightPenaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
        const nightPenalty = 1.0 - nightFactor * nightPenaltyFactor
        const rtg = controller.instruments.find(i => i.id === 'rtg') as RTGController | undefined
        const rtgBoost = rtg?.speedMultiplier ?? 1.0
        const speedMult = playerMod('movementSpeed')
        controller.config.moveSpeed = 1.5 * nightPenalty * rtgBoost * speedMult
        controller.config.turnSpeed = 0.75 * nightPenalty * rtgBoost * speedMult
      }

      // --- Core rover update + position sync ---
      if (controller) {
        controller.criticalPowerMobilitySuspended = isSleeping.value
      }
      controller?.update(sceneDelta)
      roverHeading.value = controller?.heading ?? 0
      {
        const moving = roverReady && controller ? (controller.isMoving ?? false) : false
        if (moving !== roverIsMoving.value) roverIsMoving.value = moving
        if (moving) controlsHintDismissed.value = true
      }
      const wheelsInst = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
      if (wheelsInst) wheelsInst.baseDriveW = roverPowerProfile.baseDriveW
      if (siteScene?.rover) {
        roverWorldX.value = siteScene.rover.position.x
        roverWorldZ.value = siteScene.rover.position.z
      }
      if (siteScene && roverReady && siteScene.rover && !roverSpawnCaptured) {
        roverSpawnXZ.value = {
          x: siteScene.rover.position.x,
          z: siteScene.rover.position.z,
        }
        roverSpawnCaptured = true
      }

      // --- Delegated ticks ---
      orbitalDropHandler.tick(fctx)

      if (camera && cameraFillLight) {
        syncCameraFillLight(cameraFillLight, camera, nightFactor)
      }

      // --- SAM dialog + queue ---
      isInstrumentActive.value = controller?.mode === 'active'
      {
        const samCtl = controller?.instruments.find(i => i.id === 'sam') as SAMController | undefined
        const samActive = controller?.mode === 'active' && controller?.activeInstrument instanceof SAMController
        if (samActive && samCtl) {
          samCtl.openCovers()
          samDialogVisible.value = samCtl.coversOpen
        } else {
          if (samCtl && samCtl.coversOpen) samCtl.closeCovers()
          samDialogVisible.value = false
        }
      }
      {
        const samCtl2 = controller?.instruments.find(i => i.id === 'sam') as SAMController | undefined
        if (samCtl2) {
          samCtl2.experimentRunning = samIsProcessing.value
          const completed = samTick(sceneDelta)
          if (completed) {
            sampleToastRef.value?.showDAN(`SAM: ${completed.modeName} complete`)
          }
        }
      }
      {
        // APXS queue processing
        const apxsCompleted = apxsTick(sceneDelta)
        if (apxsCompleted) {
          sampleToastRef.value?.showDAN('APXS analysis complete')
        }
      }

      roverVfxHandler.tick(fctx)

      // --- Sol / sky clock sync ---
      if (siteScene.sky) {
        marsTimeOfDay.value = siteScene.sky.timeOfDay
        currentNightFactor.value = siteScene.sky.nightFactor
        if (lastSkyTimeOfDay >= 0 && siteScene.sky.timeOfDay < lastSkyTimeOfDay - 0.25) {
          marsSol.value++
        }
        lastSkyTimeOfDay = siteScene.sky.timeOfDay
        // Update frame context with fresh sol/time values
        fctx.marsSol = marsSol.value
        fctx.marsTimeOfDay = marsTimeOfDay.value
      }

      antennaHandler.tick(fctx)

      drillHandler.tick(fctx)
      apxsHandler.tick(fctx)

      // --- Thermal + heater ---
      if (siteTerrainParams.value) {
        tickThermal(sceneDelta, {
          timeOfDay: siteScene.sky?.timeOfDay ?? 0.5,
          temperatureMinK: siteTerrainParams.value.temperatureMinK,
          temperatureMaxK: siteTerrainParams.value.temperatureMaxK,
        })
      }
      {
        const heaterInst = controller?.instruments.find(i => i.id === 'heater') as HeaterController | undefined
        if (heaterInst) {
          heaterInst.internalTempC = internalTempC.value
          heaterInst.ambientC = ambientEffectiveC.value
          heaterInst.heaterW = heaterEffectiveW.value
          heaterInst.zone = thermalZone.value
        }
      }

      const remsInst = controller?.instruments.find((i) => i.id === 'rems') as REMSController | undefined
      const remsOn = remsInst?.passiveSubsystemEnabled ?? false
      remsSurveying.value = remsOn
      tickRemsWeather({
        deltaSeconds: sceneDelta,
        timeOfDay: siteScene.sky?.timeOfDay ?? 0.5,
        sol: marsSol.value,
        simulationTime,
        terrain: siteTerrainParams.value,
        remsOn,
        ambientEffectiveC: ambientEffectiveC.value,
      })
      if (remsInst && remsOn && remsHud.value.available) {
        const h = remsHud.value
        remsInst.temperature = h.tempC
        remsInst.windSpeed = h.windMs
        remsInst.windDirectionDeg = h.windDirDeg
        remsInst.pressure = h.pressureHpa
        remsInst.humidity = Math.min(0.5, Math.max(0, h.humidityPct / 100))
        remsInst.uvIndex = h.uvIndex
      }

      danHandler.tick(fctx)

      // --- Power tick ---
      {
        const instrumentLines = buildInstrumentPowerLines(controller, roverReady, !isSleeping.value)
        const rtgForPower = controller?.instruments.find(i => i.id === 'rtg')
        const powerLoadFactor = rtgForPower instanceof RTGController ? rtgForPower.powerLoadFactor : 1
        const wheelsForPower = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
        const awakeForPower = !isSleeping.value
        const driveMotorW =
          awakeForPower && wheelsForPower && (controller?.isMoving ?? false)
            ? wheelsForPower.getDrivePowerW()
            : 0
        tickPower(sceneDelta, {
          nightFactor,
          roverInSunlight: siteScene.roverInSunlight,
          moving: awakeForPower && (controller?.isMoving ?? false),
          rockDrilling: awakeForPower && drillHandler.lastResult.rockDrilling,
          driveMotorW,
          driveMotorHudLabel: 'Rover wheels',
          instrumentLines,
          heaterW: heaterEffectiveW.value,
          powerLoadFactor,
        })
      }

      // --- Deploy state machine ---
      if (siteScene.roverState === 'descending') {
        descending.value = true
        deploying.value = false
      } else if (siteScene.roverState === 'deploying') {
        descending.value = false
        deploying.value = true
        deployProgress.value = siteScene.deployProgress
      } else if (roverReady && (deploying.value || descending.value)) {
        descending.value = false
        deploying.value = false
        deployProgress.value = 1
      }

      if (roverReady && !gameClock.roverClockRunning.value) {
        gameClock.notifyRoverReady()
      }

      // --- Instrument attach (idempotent) ---
      if (roverReady && siteScene.rover && controller && !controller.instruments[0]?.attached) {
        controller.instruments.forEach(i => {
          if (i instanceof SAMController) {
            i.attachWithBindPoses(siteScene!.rover!, siteScene!.coverBindQuats)
          } else {
            i.attach(siteScene!.rover!)
          }
        })
      }

      // --- Lazy instrument init (delegated to handlers) ---
      if (roverReady && siteScene.rover && camera) {
        drillHandler.initIfReady(fctx)
        mastCamHandler.initIfReady(fctx)
        chemCamHandler.initIfReady(fctx)
        danHandler.initIfReady(fctx)
        apxsHandler.initIfReady(fctx)
      }

      mastCamHandler.tick(fctx)
      chemCamHandler.tick(fctx)

      activeInstrumentSlot.value = controller?.activeInstrument?.slot ?? null

      // --- Trails + scene update + render ---
      if (siteScene.rover && siteScene.trails) {
        siteScene.trails.update(siteScene.rover.position, controller?.heading ?? 0)
      }

      siteScene.update(simulationTime, sceneDelta, camera.position, skyDelta)

      if (dustPass) {
        dustPass.uniforms.uTime.value = simulationTime
      }

      if (composer) {
        composer.render()
      } else {
        renderer.render(siteScene.scene, camera)
      }
    }
    animate()

    window.addEventListener('keydown', onGlobalKeyDown)
    window.addEventListener('resize', onResize)
  }

  /**
   * Builds a {@link SiteFrameContext} snapshot for out-of-loop calls (debug API spawn).
   * Returns null if the scene is not yet initialised.
   */
  function buildFrameContext(): SiteFrameContext | null {
    if (!camera || !siteScene) return null
    return {
      sceneDelta: 0,
      skyDelta: 0,
      simulationTime: 0,
      camera,
      siteScene,
      rover: controller,
      roverReady: siteScene.roverState === 'ready',
      isSleeping: isSleeping.value,
      nightFactor: siteScene.sky?.nightFactor ?? 0,
      thermalZone: thermalZone.value,
      marsSol: marsSol.value,
      marsTimeOfDay: marsTimeOfDay.value,
      totalSP: totalSP.value,
      activeInstrumentSlot: activeInstrumentSlot.value,
    }
  }

  // --- Dispose ---

  function dispose(): void {
    clearPois()
    orbitalDrops.disposeAllDrops()
    disposeOrbitalDropDebugApi?.()
    disposeOrbitalDropDebugApi = null
    disposeMarsDevDebugApi?.()
    disposeMarsDevDebugApi = null
    if (animationId) cancelAnimationFrame(animationId)
    window.removeEventListener('keydown', onGlobalKeyDown)

    // Dispose handlers
    roverVfxHandler.dispose()
    danHandler.dispose()
    drillHandler.dispose()
    apxsHandler.dispose()
    mastCamHandler.dispose()
    chemCamHandler.dispose()
    orbitalDropHandler.dispose()
    antennaHandler.dispose()

    controller?.dispose()
    if (cameraFillLight && siteScene) {
      siteScene.scene.remove(cameraFillLight.target)
      siteScene.scene.remove(cameraFillLight)
      cameraFillLight.dispose()
      cameraFillLight = null
    }
    siteScene?.dispose()
    composer?.dispose()
    renderer?.dispose()
    window.removeEventListener('resize', onResize)
  }

  return {
    mount,
    dispose,
    resize: onResize,
    get rover() {
      return controller
    },
    get siteScene() {
      return siteScene
    },
    spawnOrbitalDropItem: (itemId, options) => {
      const fctx = buildFrameContext()
      if (!fctx) throw new Error('Site scene not ready.')
      return orbitalDropHandler.spawnOrbitalDropItem(fctx, itemId, options)
    },
    spawnRandomOrbitalDrop: (options) => {
      const fctx = buildFrameContext()
      if (!fctx) throw new Error('Site scene not ready.')
      return orbitalDropHandler.spawnRandomOrbitalDrop(fctx, options)
    },
    handleDanProspect: () => {
      const fctx = buildFrameContext()
      if (fctx) danHandler.handleDanProspect(fctx)
    },
  }
}
