import type { ComputedRef, Ref } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import type { InstrumentActionSoundId } from '@/audio/audioManifest'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { createCameraFillLight, syncCameraFillLight } from '@/three/cameraFillLight'
import { createMarsEnvironment } from '@/three/MarsEnvironment'
import { createDustAtmospherePass } from '@/three/DustAtmospherePass'
import { isSitePostProcessingEnabled } from '@/lib/sitePostProcessing'
import { computeDecayMultiplier } from '@/lib/hazards'
import type { HazardEvent } from '@/lib/hazards'
import { isSiteIntroSequenceSkipped, setSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
import { installOrbitalDropDebugApi } from '@/lib/orbitalDropDebug'
import { installMarsDevDebugApi } from '@/lib/marsDevDebug'
import { listOrbitalDropItemIds } from '@/types/orbitalDrop'
import type { GeologicalFeature, Landmark } from '@/types/landmark'
import type { TerrainParams } from '@/types/terrain'
import type { TerrainGeneratorType } from '@/three/terrain/TerrainGenerator'
import { GLB_TERRAIN_SITES } from '@/three/terrain/GlbTerrainGenerator'
import { devSpawnRandomInventoryItems } from '@/composables/useInventory'
import { devAwardSciencePoints } from '@/composables/useSciencePoints'
import {
  type InstrumentPowerLineInput,
  type PowerTickInput,
  type RoverPowerProfile,
} from '@/composables/useMarsPower'
import type { ThermalTickInput, ThermalZone } from '@/composables/useMarsThermal'
import type { RemsHudSnapshot, RemsWeatherTickInput } from '@/composables/useSiteRemsWeather'
import type { SiteWeatherSnapshot } from '@/lib/weather/siteWeather'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
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
  MicController,
  MIC_SLOT,
  type RTGConservationState,
} from '@/three/instruments'

import type { SiteFrameContext } from './site-controllers/SiteFrameContext'
import { createMarsSiteTickHandlers } from './site-controllers/createMarsSiteTickHandlers'
import { useInstrumentDurability } from '@/composables/useInstrumentDurability'
import {
  grantMissionCatalogProgressForDevUpTo,
  resetMissionProgressForDev,
  useMissions,
} from '@/composables/useMissions'
import { useDSNArchive } from '@/composables/useDSNArchive'
import { useSiteMissionPois } from '@/composables/useSiteMissionPois'
import { useLGAMailbox } from '@/composables/useLGAMailbox'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { secondsPerSol } from '@/lib/missionTime'
import { updateWaypointMarkers, setWaypointMarkerProgress, clearWaypointMarkers } from '@/three/WaypointMarkers'
import { tickPoiArrivals, getPoiDwellProgress } from '@/composables/usePoiArrival'

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
      elevationKm: geo.elevationKm,
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
    elevationKm: 0,
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

type ActiveInstrumentAudioOwner = 'apxs' | 'chemcam' | 'drill' | 'mastcam'

export interface ActiveInstrumentAudioState {
  mode: 'driving' | 'instrument' | 'active' | null
  instrumentId: string | null
}

const ACTIVE_INSTRUMENT_EXIT_SOUND_IDS: Record<ActiveInstrumentAudioOwner, readonly InstrumentActionSoundId[]> = {
  apxs: ['sfx.apxsContact', 'sfx.mastMove'],
  chemcam: ['sfx.chemcamFire', 'sfx.cameraMove'],
  drill: ['sfx.drillStart', 'sfx.mastMove'],
  mastcam: ['sfx.mastcamTag', 'sfx.cameraMove'],
}

/**
 * Resolves which sound ids must be force-stopped when an active instrument loses focus.
 *
 * This covers hard exits like `Escape` and direct instrument switches. The per-instrument handlers
 * still stop their owned playback handles, but this gives the view a second hard boundary so stale
 * queued or overlapping instrument audio cannot survive beyond the active instrument transition.
 */
export function getExitedActiveInstrumentSoundIds(
  previous: ActiveInstrumentAudioState,
  next: ActiveInstrumentAudioState,
): readonly InstrumentActionSoundId[] {
  if (previous.mode !== 'active' || previous.instrumentId == null) return []
  if (next.mode === 'active' && next.instrumentId === previous.instrumentId) return []
  if (!(previous.instrumentId in ACTIVE_INSTRUMENT_EXIT_SOUND_IDS)) return []
  return ACTIVE_INSTRUMENT_EXIT_SOUND_IDS[previous.instrumentId as ActiveInstrumentAudioOwner]
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
  lgaUnreadCount: Ref<number> | ComputedRef<number>
  /** Sol clock ambient segment — null when REMS not surveying. */
  solClockAmbientC: Ref<number | null>
  remsHud: Ref<RemsHudSnapshot>
  remsStormIncomingText: Ref<string | null>
  remsStormActiveText: Ref<string | null>
  /** Always-live weather state — updates regardless of REMS instrument toggle. */
  siteWeather: Ref<SiteWeatherSnapshot>
  /** REMS passive surveying — drives ambient air HUD availability. */
  remsSurveying: Ref<boolean>
  /** Mic passive subsystem enabled state — drives ambient audio layers. */
  micEnabled: Ref<boolean>
  drillSpeedBreakdown: Ref<SpeedBreakdown | null>
  chemCamSpeedBreakdown: Ref<SpeedBreakdown | null>
  mastCamSpeedBreakdown: Ref<SpeedBreakdown | null>
  apxsSpeedBreakdown: Ref<SpeedBreakdown | null>
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
  /** Profile source definitions for speed breakdown display. */
  profileSources: {
    archetype: import('@/lib/instrumentSpeedBreakdown').ProfileSource | null
    foundation: import('@/lib/instrumentSpeedBreakdown').ProfileSource | null
    patron: import('@/lib/instrumentSpeedBreakdown').ProfileSource | null
  }
  /** Accumulated reward track modifiers for speed breakdown display. */
  trackModifiers: Ref<Partial<ProfileModifiers>>
  hasPerk: (perkId: string) => boolean
  tickPower: (deltaSeconds: number, input: PowerTickInput) => void
  tickThermal: (deltaSeconds: number, input: ThermalTickInput) => void
  tickRemsWeather: (input: RemsWeatherTickInput) => void
  /** Dev: force-trigger a dust storm at level 1-5. */
  triggerStorm: (level: number) => void
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
  playInstrumentActionSound: (soundId: InstrumentActionSoundId) => void
  startInstrumentActionLoop: (
    soundId: InstrumentActionSoundId,
  ) => import('@/audio/audioTypes').AudioPlaybackHandle
  stopInstrumentActionSound: (soundId: InstrumentActionSoundId) => void
  onInstrumentActivateRequest: () => void
  onDSNTransmissionsReceived?: (transmissions: import('@/types/dsnArchive').DSNTransmission[]) => void
  onGlobalKeyDown: (e: KeyboardEvent) => void
  playAmbientLoop: (soundId: import('@/audio/audioManifest').AudioSoundId) => import('@/audio/audioTypes').AudioPlaybackHandle
  playSoundWithHandle: (soundId: import('@/audio/audioManifest').AudioSoundId) => import('@/audio/audioTypes').AudioPlaybackHandle
  setAmbientVolume: (handle: import('@/audio/audioTypes').AudioPlaybackHandle, volume: number) => void
  /**
   * When false, suppress LGA “incoming message” SFX so they do not play over the intro video.
   * The view should defer DSN receive cues until this is true as well.
   */
  commCuesAudible: () => boolean
  /**
   * When false, intro MP4 is showing: site simulation (descent, deploy, sky, ticks) and descent SFX stay off.
   */
  descentSfxAudible: () => boolean
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
    samTick,
    apxsTick,
    totalSP,
    onInstrumentActivateRequest,
    stopInstrumentActionSound,
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
    heaterEffectiveW,
    thermalZone,
    samIsProcessing,
    remsHud,
    remsSurveying,
    siteWeather,
    micEnabled,
  } = ctx.refs

  const { syncFromControllers } = useInstrumentDurability()
  const missions = useMissions()
  const { loadCatalog, wireArchiveCheckers, checkAllObjectives, tickTransmit } = missions
  const { pois: missionPoisRef } = useSiteMissionPois()
  const { pushMessage } = useLGAMailbox()
  const { profile: playerProfile } = usePlayerProfile()

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
  let lastActiveInstrumentAudioState: ActiveInstrumentAudioState = { mode: null, instrumentId: null }
  let roverSpawnCaptured = false
  let firstMissionDelivered = false
  let landingSoundPlayed = false
  /** After rover is ready once, persist intro-skip so the next visit loads deployed. */
  let siteIntroSkipPersisted = false
  let landingSoundHandle: import('@/audio/audioTypes').AudioPlaybackHandle | null = null
  let landingSoundFadeVol = 0
  let thrusterSoundHandle: import('@/audio/audioTypes').AudioPlaybackHandle | null = null

  const tickHandlers = createMarsSiteTickHandlers(ctx)
  const {
    roverVfxHandler,
    danHandler,
    drillHandler,
    mastCamHandler,
    chemCamHandler,
    apxsHandler,
    orbitalDropHandler,
    antennaHandler,
  } = tickHandlers

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

    const terrainType: TerrainGeneratorType = GLB_TERRAIN_SITES.has(siteId) ? 'glb' : 'default'
    siteScene = new SiteScene(terrainType)
    await siteScene.init(terrainParams, { skipIntroSequence: isSiteIntroSequenceSkipped() })

    // Adjust camera far plane to match terrain scale (default 800 → 1200, GLB 2000 → 3000)
    camera.far = siteScene.terrain.scale * 1.5
    camera.updateProjectionMatrix()

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
      new MicController(),
    ]
    if (controller) {
      controller.instruments = instrumentControllers
    }

    // --- Mission system init ---
    const missionsData = await fetch('/data/missions.json').then((r) => r.json())
    loadCatalog(missionsData)
    wireArchiveCheckers()

    // --- DSN Archive init ---
    const dsnData = await fetch('/data/dsn-transmissions.json').then((r) => r.json())
    const { loadCatalog: loadDSNCatalog } = useDSNArchive()
    loadDSNCatalog(dsnData)

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
        setMissionForDev: (index: number) => {
          gameClock.missionCooldowns.clearAll()
          const list = missions.catalog.value
          if (list.length === 0) {
            return { ok: false as const, message: 'Mission catalog is not loaded yet.' }
          }
          const n = Number(index)
          if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n >= list.length) {
            return {
              ok: false as const,
              message: `Invalid index (0..${list.length - 1}).`,
            }
          }
          const def = list[n]
          resetMissionProgressForDev()
          const priorCompletedIds = grantMissionCatalogProgressForDevUpTo(n, marsSol.value)
          pushMessage({
            direction: 'received',
            sol: marsSol.value,
            timeOfDay: marsTimeOfDay.value,
            subject: def.name,
            body: def.briefing,
            type: 'mission',
            from: def.patron ?? 'Mission Control',
            missionId: def.id,
          })
          return {
            ok: true as const,
            missionId: def.id,
            name: def.name,
            priorCompletedIds,
          }
        },
        triggerStorm: (level: number) => ctx.triggerStorm(level),
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
      /**
       * Intro video runs first; sky-crane / deploy / sol progression stay frozen until it finishes
       * (see MartianSiteView `descentSfxAudible` ↔ intro overlay visible).
       */
      const introSimulationHold = !ctx.descentSfxAudible()
      const effSceneDelta = introSimulationHold ? 0 : sceneDelta
      const effSkyDelta = introSimulationHold ? 0 : skyDelta
      const solDelta = effSceneDelta / secondsPerSol()

      gameClock.missionCooldowns.tick(effSceneDelta)
      simulationTime += effSceneDelta

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
        sceneDelta: effSceneDelta,
        skyDelta: effSkyDelta,
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
        windMs: siteWeather.value.windMs,
        dustStormPhase: siteWeather.value.dustStormPhase,
        dustStormLevel: siteWeather.value.dustStormLevel,
      }

      const nextActiveInstrumentAudioState: ActiveInstrumentAudioState = {
        mode: controller?.mode ?? null,
        instrumentId: controller?.activeInstrument?.id ?? null,
      }
      for (const soundId of getExitedActiveInstrumentSoundIds(
        lastActiveInstrumentAudioState,
        nextActiveInstrumentAudioState,
      )) {
        stopInstrumentActionSound(soundId)
      }
      lastActiveInstrumentAudioState = nextActiveInstrumentAudioState

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
        const wheelsCtrl = controller.instruments.find(i => i.id === 'wheels')
        const wheelsDurability = Math.max(0.1, wheelsCtrl?.durabilityFactor ?? 1.0)
        const swNow = siteWeather.value
        const stormPenalty = swNow.dustStormPhase === 'active'
          ? 1.0 - (swNow.dustStormLevel! * 0.12)
          : 1.0
        controller.config.moveSpeed = 1.5 * nightPenalty * stormPenalty * rtgBoost * speedMult * wheelsDurability
        controller.config.turnSpeed = 0.75 * nightPenalty * stormPenalty * rtgBoost * speedMult * wheelsDurability
      }

      // --- Core rover update + position sync ---
      if (controller) {
        controller.criticalPowerMobilitySuspended = isSleeping.value
      }
      controller?.update(effSceneDelta)
      if (controller) {
        const sw = siteWeather.value
        const dustStormEvent: HazardEvent = {
          source: 'dust-storm',
          active: sw.dustStormPhase === 'active',
          level: sw.dustStormLevel ?? 0,
        }
        const hazardEvents = [dustStormEvent]
        for (const inst of controller.instruments) {
          inst.hazardDecayMultiplier = computeDecayMultiplier(hazardEvents, inst.tier)
          inst.applyPassiveDecay(solDelta)
        }
      }
      if (controller) {
        syncFromControllers(controller.instruments)
      }
      roverHeading.value = controller?.cameraHeading ?? 0
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

      // --- POI dwell detection + mission objective checks ---
      tickPoiArrivals(roverWorldX.value, roverWorldZ.value, missionPoisRef.value, effSceneDelta)
      // Update waypoint marker colors based on dwell progress
      for (const poi of missionPoisRef.value) {
        const progress = getPoiDwellProgress(poi.id)
        if (progress > 0) setWaypointMarkerProgress(poi.id, progress)
      }
      checkAllObjectives(
        roverWorldX.value,
        roverWorldZ.value,
        missionPoisRef.value,
        marsSol.value,
      )
      tickTransmit(effSceneDelta, marsSol.value)
      updateWaypointMarkers(simulationTime)

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
          const completed = samTick(effSceneDelta)
          if (completed) {
            sampleToastRef.value?.showDAN(`SAM: ${completed.modeName} complete`)
          }
        }
      }
      {
        // APXS queue processing
        const apxsCompleted = apxsTick(effSceneDelta)
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
      tickHandlers.micHandler.tick(fctx)

      drillHandler.tick(fctx)
      apxsHandler.tick(fctx)

      // --- Thermal + heater ---
      if (siteTerrainParams.value) {
        tickThermal(effSceneDelta, {
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
      tickHandlers.passiveSystemsAudioHandler.tick(fctx)
      tickHandlers.roverMovementSoundHandler.tick(fctx)

      const remsInst = controller?.instruments.find((i) => i.id === 'rems') as REMSController | undefined
      const remsOn = remsInst?.passiveSubsystemEnabled ?? false
      remsSurveying.value = remsOn

      const micInst = controller?.instruments.find(i => i.id === 'mic') as import('@/three/instruments').MicController | undefined
      if (micInst) {
        micEnabled.value = micInst.passiveSubsystemEnabled
      }
      tickRemsWeather({
        deltaSeconds: effSceneDelta,
        timeOfDay: siteScene.sky?.timeOfDay ?? 0.5,
        sol: marsSol.value,
        simulationTime,
        terrain: siteTerrainParams.value,
        remsOn,
        ambientEffectiveC: ambientEffectiveC.value,
      })
      // Wind affects dust particles regardless of REMS instrument state
      siteScene.dust?.setWind(siteWeather.value.windMs, siteWeather.value.windDirDeg)
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
        tickPower(effSceneDelta, {
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
        const descentAudioOk = ctx.descentSfxAudible()
        if (descentAudioOk) {
          if (!landingSoundPlayed) {
            landingSoundHandle = ctx.playSoundWithHandle('sfx.landing')
            landingSoundHandle.setVolume(0)
            thrusterSoundHandle = ctx.startInstrumentActionLoop('sfx.thrusters')
            landingSoundPlayed = true
            landingSoundFadeVol = 0
          }
          if (landingSoundHandle && landingSoundFadeVol < 0.7) {
            landingSoundFadeVol = Math.min(0.7, landingSoundFadeVol + effSceneDelta * 0.35)
            landingSoundHandle.setVolume(landingSoundFadeVol)
          }
        } else {
          thrusterSoundHandle?.stop()
          thrusterSoundHandle = null
          landingSoundHandle?.stop()
          landingSoundHandle = null
          landingSoundPlayed = false
          landingSoundFadeVol = 0
        }
        descending.value = true
        deploying.value = false
        if (siteScene.touchedDown) {
          if (descentAudioOk) {
            ctx.playInstrumentActionSound('sfx.contact')
          }
          thrusterSoundHandle?.stop()
          thrusterSoundHandle = null
        }
      } else if (siteScene.roverState === 'deploying') {
        descending.value = false
        deploying.value = true
        deployProgress.value = siteScene.deployProgress
      } else if (roverReady && (deploying.value || descending.value)) {
        descending.value = false
        deploying.value = false
        deployProgress.value = 1
      }

      if (roverReady && !siteIntroSkipPersisted) {
        siteIntroSkipPersisted = true
        setSiteIntroSequenceSkipped(true)
      }

      if (roverReady && !gameClock.roverClockRunning.value) {
        gameClock.notifyRoverReady()
      }

      // --- First mission delivery (one-shot, works with skip-intro too) ---
      if (roverReady && !firstMissionDelivered) {
        firstMissionDelivered = true
        if (
          !playerProfile.sandbox &&
          missions.activeMissions.value.length === 0 &&
          missions.completedMissions.value.length === 0
        ) {
          const firstDef = missions.catalog.value[0]
          if (firstDef) {
            pushMessage({
              direction: 'received',
              sol: marsSol.value,
              timeOfDay: marsTimeOfDay.value,
              subject: firstDef.name,
              body: firstDef.briefing,
              type: 'mission',
              from: firstDef.patron ?? 'Mission Control',
              missionId: firstDef.id,
            })
          }
        }
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

      // --- Sync instrument gating from mission unlocks ---
      if (controller && !playerProfile.sandbox) {
        const ALWAYS_ALLOWED = ['rad', 'heater', 'wheels', 'antenna-lg', 'mic']
        const allowed = new Set([...ALWAYS_ALLOWED, ...missions.unlockedInstruments.value])
        controller.allowedInstrumentIds = allowed
      } else if (controller) {
        controller.allowedInstrumentIds = null // sandbox: everything allowed
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

      // --- Trails + scene update + render (no tracks during active storms) ---
      const stormActive = siteWeather.value.dustStormPhase === 'active'
      if (siteScene.rover && siteScene.trails && !stormActive) {
        siteScene.trails.update(siteScene.rover.position, controller?.heading ?? 0)
      }

      siteScene.update(simulationTime, effSceneDelta, camera.position, effSkyDelta)

      // Weather drives sky atmosphere and fog (storm *visuals* only in FSM `active`; `incoming` is REMS warning only)
      const sw = siteWeather.value
      if (siteScene.sky) {
        siteScene.sky.setWeather(
          sw.renderWindMs,
          sw.renderDustStormLevel,
          sw.renderWindDirDeg,
          simulationTime,
        )
      }
      siteScene.setAtmosphere(sw.renderWindMs, sw.renderDustStormLevel)

      // Moon orbital positions
      if (siteScene.moons && siteScene.sky) {
        siteScene.moons.update(
          siteScene.sky.timeOfDay,
          marsSol.value,
          siteScene.sky.nightFactor,
          sw.renderDustStormLevel,
          siteScene.sky.sunDirection,
        )
      }

      if (dustPass) {
        dustPass.uniforms.uTime.value = simulationTime
        dustPass.setWeather(sw.renderWindMs, sw.renderDustStormLevel)

        // Storm-reactive glitch: derive composite intensity from live weather.
        // glitchIntensity — 0 when idle/cooldown, stormLevel/5 when active.
        // incomingFactor  — 1.0 during the FSM `incoming` warning phase.
        const glitchIntensity = sw.dustStormPhase === 'active' && sw.dustStormLevel != null
          ? sw.dustStormLevel / 5
          : 0
        const incomingFactor = sw.dustStormPhase === 'incoming' ? 1.0 : 0.0
        dustPass.setStormGlitch(glitchIntensity, incomingFactor)
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
      windMs: 0,
      dustStormPhase: 'none' as const,
      dustStormLevel: null,
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

    tickHandlers.disposeAll()

    controller?.dispose()
    if (siteScene) {
      clearWaypointMarkers(siteScene.scene)
    }
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
