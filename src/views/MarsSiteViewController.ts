import type { Ref } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { MARS_SOL_CLOCK_MINUTES, SOL_DURATION } from '@/three/MarsSky'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { createCameraFillLight, syncCameraFillLight } from '@/three/cameraFillLight'
import { createDustAtmospherePass } from '@/three/DustAtmospherePass'
import { isSitePostProcessingEnabled } from '@/lib/sitePostProcessing'
import { isSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
import { installOrbitalDropDebugApi } from '@/lib/orbitalDropDebug'
import { installMarsDevDebugApi } from '@/lib/marsDevDebug'
import { resolveRandomOrbitalDropPosition } from '@/lib/orbitalDropSpawn'
import type { GeologicalFeature, Landmark } from '@/types/landmark'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'
import { getInventoryItemDef } from '@/types/inventory'
import { isOrbitalDropItemId, listOrbitalDropItemIds } from '@/types/orbitalDrop'
import { ROCK_TYPES } from '@/three/terrain/RockTypes'
import { devSpawnRandomInventoryItems } from '@/composables/useInventory'
import {
  type InstrumentPowerLineInput,
  type PowerTickInput,
  type RoverPowerProfile,
} from '@/composables/useMarsPower'
import type { ThermalTickInput, ThermalZone } from '@/composables/useMarsThermal'
import type { ProfileModifiers } from '@/composables/usePlayerProfile'
import type SampleToast from '@/components/SampleToast.vue'
import type { SamQueueEntry } from '@/composables/useSamQueue'
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
  instrumentSelectionEmissiveIntensity,
  type RTGConservationState,
} from '@/three/instruments'

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
  if ((mode === 'instrument' || mode === 'active') && focused && focused.id !== 'heater') {
    const phase = mode === 'active' ? 'active' : 'instrument'
    const w = focused.getInstrumentBusPowerW(phase)
    if (w > 1e-6) {
      lines.push({ id: focused.id, label: focused.name, w })
    }
  }

  const cc = roverCtl.instruments.find((i): i is ChemCamController => i instanceof ChemCamController)
  if (cc?.isSequenceAdvancing) {
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
      seed: hashString(geo.id),
      siteId: geo.id,
      featureType: geo.featureType,
      waterIceIndex: geo.waterIceIndex,
      silicateIndex: geo.silicateIndex,
      temperatureMaxK: geo.temperatureMaxK,
      temperatureMinK: geo.temperatureMinK,
    }
  }
  return {
    roughness: 0.4,
    craterDensity: 0.3,
    dustCover: 0.6,
    elevation: 0.5,
    ironOxide: 0.6,
    basalt: 0.5,
    seed: hashString(siteId),
    siteId: siteId,
    featureType: 'plain' as const,
    waterIceIndex: 0.1,
    silicateIndex: 0.3,
    temperatureMaxK: 280,
    temperatureMinK: 160,
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
  thermalZone: Ref<ThermalZone>
  samIsProcessing: Ref<boolean>
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
  tickPower: (deltaSeconds: number, input: PowerTickInput) => void
  tickThermal: (deltaSeconds: number, input: ThermalTickInput) => void
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
  totalSP: Ref<number>
  triggerDanAchievement: (event: string) => void
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
 * Owns Three.js site scene, rover simulation, and per-frame game logic for the martian site view.
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
    tickPower,
    tickThermal,
    sampleToastRef,
    upsertPoi,
    removePoi,
    setFocusPoi,
    focusPoiId,
    awardSP,
    awardDAN,
    archiveDanProspect,
    samTick,
    totalSP,
    triggerDanAchievement,
    onInstrumentActivateRequest,
    onGlobalKeyDown,
    clearPois,
    devSpawnRandomInventoryItems,
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
    rtgPhase,
    rtgPhaseProgress,
    rtgConservationMode,
    rtgConservationProgress01,
    rtgOverdriveReady,
    rtgConservationReady,
    rtgConservationCdLabel,
    rtgConservationCooldownTitle,
    crosshairVisible,
    crosshairColor,
    crosshairX,
    crosshairY,
    drillProgress,
    isDrilling,
    mastcamFilterLabel,
    mastcamScanning,
    mastcamScanProgress,
    chemCamUnreadCount,
    chemcamPhase,
    chemcamShotsRemaining,
    chemcamShotsMax,
    chemcamProgressPct,
    chemCamOverlaySequenceActive,
    chemCamOverlaySequenceProgress,
    chemCamOverlaySequenceLabel,
    chemCamOverlaySequencePulse,
    marsTimeOfDay,
    currentNightFactor,
    marsSol,
    mastPan,
    mastTilt,
    mastFov,
    mastTargetRange,
    descending,
    deploying,
    deployProgress,
    activeInstrumentSlot,
    danTotalSamples,
    danHitAvailable,
    danProspectPhase,
    danProspectProgress,
    danSignalStrength,
    danWaterResult,
    danDialogVisible,
    internalTempC,
    ambientEffectiveC,
    heaterW,
    thermalZone,
    samIsProcessing,
  } = ctx.refs

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

  let danDiscMesh: THREE.Mesh | null = null
  let danConeMesh: THREE.Mesh | null = null
  const danCompletedDiscs: THREE.Mesh[] = []

  let lastSkyTimeOfDay = -1
  let roverSpawnCaptured = false

  function resolveOrbitalDropPosition(options?: { x?: number; z?: number }): { x: number; z: number } {
    return {
      x: options?.x ?? roverWorldX.value + 18,
      z: options?.z ?? roverWorldZ.value - 12,
    }
  }

  function spawnOrbitalDropItem(
    itemId: string,
    options?: { x?: number; z?: number; quantity?: number },
  ): string {
    if (!siteScene) throw new Error('Site scene not ready.')
    if (!isOrbitalDropItemId(itemId)) {
      throw new Error(`Orbital drops currently support component items only: ${itemId}`)
    }
    const quantity = Math.max(1, Math.floor(options?.quantity ?? 1))
    const position = resolveOrbitalDropPosition(options)
    const id = orbitalDrops.spawnDrop(siteScene.scene, {
      itemStacks: [{ itemId, quantity }],
      position,
      heightAt: (x, z) => siteScene!.terrain.heightAt(x, z),
    })
    sampleToastRef.value?.showPayloadStatus('Payload inbound')
    return id
  }

  function spawnRandomOrbitalDrop(options?: { x?: number; z?: number; quantity?: number }): string {
    const itemIds = listOrbitalDropItemIds()
    const itemId = itemIds[Math.floor(Math.random() * itemIds.length)]
    const position = resolveRandomOrbitalDropPosition(
      { x: roverWorldX.value, z: roverWorldZ.value },
      { x: options?.x, z: options?.z },
    )
    return spawnOrbitalDropItem(itemId, {
      ...options,
      x: position.x,
      z: position.z,
    })
  }

  function handleDanProspect(): void {
    const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst?.pendingHit) return

    const hit = danInst.pendingHit

    if (!danDiscMesh) {
      const geo = new THREE.CircleGeometry(5, 32)
      geo.rotateX(-Math.PI / 2)
      const mat = new THREE.MeshBasicMaterial({
        color: 0x44aaff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false,
      })
      danDiscMesh = new THREE.Mesh(geo, mat)
      siteScene?.scene.add(danDiscMesh)
    }
    const groundY = siteScene?.terrain
      ? siteScene.terrain.heightAt(hit.worldPosition.x, hit.worldPosition.z)
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

  siteScene = new SiteScene()
  await siteScene.init(terrainParams, { skipIntroSequence: isSiteIntroSequenceSkipped() })

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

  // Create instrument controllers
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
      dropItem: spawnOrbitalDropItem,
      dropRandom: spawnRandomOrbitalDrop,
      listComponentItems: listOrbitalDropItemIds,
    })
    disposeMarsDevDebugApi = installMarsDevDebugApi({
      spawnRandomInventoryItems: devSpawnRandomInventoryItems,
      spawnInventoryItemById: devSpawnInventoryItemById,
    })
  }

  // Post-processing (dust-atmosphere / “drone feed” pass); optional via URL, env, or localStorage
  if (isSitePostProcessingEnabled()) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(siteScene.scene, camera))
    dustPass = createDustAtmospherePass(terrainParams.dustCover)
    composer.addPass(dustPass)
  }

  clock = new THREE.Clock()

  /** Accumulated simulation time (stops when `gameClock` is paused). */
  let simulationTime = 0

  function animate() {
    animationId = requestAnimationFrame(animate)
    if (!camera || !clock || !siteScene || !renderer) return

    const rawDelta = clock.getDelta()
    const sceneDelta = gameClock.getSceneDelta(rawDelta)
    const skyDelta = gameClock.getSkyDelta(rawDelta)
    gameClock.missionCooldowns.tick(sceneDelta)
    simulationTime += sceneDelta

    // Sleep mode — kill movement + force-deactivate instruments
    if (isSleeping.value && controller) {
      if (controller.activeInstrument) {
        controller.activateInstrument(null)
      }
      controller.config.moveSpeed = 0
      controller.config.turnSpeed = 0
    } else if (controller && siteScene.sky) {
      // Night penalty — halve speed when dark. RTG overdrive doubles speed.
      const nightPenalty = 1.0 - siteScene.sky.nightFactor * 0.5
      const rtg = controller.instruments.find(i => i.id === 'rtg') as RTGController | undefined
      const rtgBoost = rtg?.speedMultiplier ?? 1.0
      const speedMult = playerMod('movementSpeed')
      controller.config.moveSpeed = 1.2 * nightPenalty * rtgBoost * speedMult
      controller.config.turnSpeed = 0.5 * nightPenalty * rtgBoost * speedMult
    }

    controller?.update(sceneDelta)
    roverHeading.value = controller?.heading ?? 0
    {
      const moving =
        siteScene.roverState === 'ready' && controller ? (controller.isMoving ?? false) : false
      if (moving !== roverIsMoving.value) roverIsMoving.value = moving
      if (moving) controlsHintDismissed.value = true
    }
    const wheelsInst = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
    if (wheelsInst) wheelsInst.baseDriveW = roverPowerProfile.baseDriveW
    if (siteScene?.rover) {
      roverWorldX.value = siteScene.rover.position.x
      roverWorldZ.value = siteScene.rover.position.z
    }
    if (
      siteScene
      && siteScene.roverState === 'ready'
      && siteScene.rover
      && !roverSpawnCaptured
    ) {
      roverSpawnXZ.value = {
        x: siteScene.rover.position.x,
        z: siteScene.rover.position.z,
      }
      roverSpawnCaptured = true
    }

    if (siteScene.rover) {
      orbitalDrops.updateDrops(sceneDelta, siteScene.rover.position)
    }
    if (orbitalDrops.lastLandedDrop.value) {
      const landed = orbitalDrops.lastLandedDrop.value
      upsertPoi({
        id: landed.id,
        label: 'Payload box',
        x: landed.position.x,
        z: landed.position.z,
        color: '#ffd27a',
      })
      setFocusPoi(landed.id)
      sampleToastRef.value?.showPayloadStatus('Payload landed')
      orbitalDrops.lastLandedDrop.value = null
    }
    if (orbitalDrops.lastOpenedDrop.value) {
      const opened = orbitalDrops.lastOpenedDrop.value
      for (const applied of opened.applied) {
        const itemDef = getInventoryItemDef(applied.itemId)
        sampleToastRef.value?.showPayloadItem(itemDef?.label ?? applied.itemId, applied.quantity)
      }
      if (opened.ok) {
        removePoi(opened.dropId)
        if (focusPoiId.value === opened.dropId) setFocusPoi(null)
      } else {
        sampleToastRef.value?.showError('Cargo full — payload retained')
        setFocusPoi(opened.dropId)
      }
      orbitalDrops.lastOpenedDrop.value = null
    }

    if (camera && cameraFillLight) {
      syncCameraFillLight(
        cameraFillLight,
        camera,
        siteScene.sky?.nightFactor ?? 0,
      )
    }

    isInstrumentActive.value = controller?.mode === 'active'
    // SAM dialog: open covers on activate, show dialog when covers finish opening
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

    // --- SAM queue tick ---
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

    // Track RTG overdrive state + glow effect
    const rtg = controller?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
    if (rtg) {
      rtgPhase.value = rtg.phase
      rtgPhaseProgress.value = rtg.phaseProgress
      rtgConservationMode.value = rtg.conservationMode
      rtgConservationProgress01.value = rtg.conservationProgress01
      rtgOverdriveReady.value = rtg.canActivateOverdrive
      rtgConservationReady.value = rtg.canActivateConservation
      rtgConservationCdLabel.value = formatRtgShuntCooldownLabel(rtg.conservationCooldownRemainingSec)
      rtgConservationCooldownTitle.value = rtg.conservationMode === 'cooldown'
        ? `Shunt recharging — ${formatRtgShuntCooldownLabel(rtg.conservationCooldownRemainingSec)}`
        : ''

      // Glow on RTG mesh only while overdrive is active (materials cloned in RTGController.attach).
      // Cooldown / recharge use UI banners — no chassis emissive so we do not tint the whole rover.
      if (rtg.node && rtg.phase === 'overdrive') {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            mat.emissive = mat.emissive || new THREE.Color()
            mat.emissive.setHex(0xff6600)
            mat.emissiveIntensity = 0.3 + Math.sin(simulationTime * 4) * 0.15
          }
        })
      } else if (rtg.node) {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (mat.emissiveIntensity > 0) {
              mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.5)
            }
          }
        })
      }
    }

    // Sleep mode visual — slow red pulse on entire rover
    if (siteScene.rover) {
      siteScene.rover.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (!mat.emissive) return
          if (isSleeping.value) {
            mat.emissive.setHex(0xff1100)
            mat.emissiveIntensity = 0.08 + Math.sin(simulationTime * 1.5) * 0.06
          } else if (rtgPhase.value === 'idle' && mat.emissiveIntensity > 0) {
            // Fade out only if RTG isn't also glowing
            mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.3)
          }
        }
      })
    }

    // Instrument focus — cyan emissive on each tool’s GLTF subtree while selected (see InstrumentController.selectionHighlightColor + clone in attach).
    const activeInst = controller?.activeInstrument ?? null
    const instrumentViewActive =
      Boolean(controller && (controller.mode === 'instrument' || controller.mode === 'active'))
    const glowIntensity = instrumentSelectionEmissiveIntensity(simulationTime)
    for (const inst of controller?.instruments ?? []) {
      const hex = inst.selectionHighlightColor
      if (hex == null || !inst.node) continue
      if (inst instanceof RTGController && inst.phase === 'overdrive') continue
      const focused =
        instrumentViewActive && activeInst === inst && !isSleeping.value
      inst.node.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
        if (!mat.emissive) return
        if (focused) {
          mat.emissive.setHex(hex)
          mat.emissiveIntensity = glowIntensity
        }
      })
    }

    if (siteScene.sky) {
      marsTimeOfDay.value = siteScene.sky.timeOfDay
      currentNightFactor.value = siteScene.sky.nightFactor
      if (lastSkyTimeOfDay >= 0 && siteScene.sky.timeOfDay < lastSkyTimeOfDay - 0.25) {
        marsSol.value++
      }
      lastSkyTimeOfDay = siteScene.sky.timeOfDay
    }

    let rockDrilling = false
    if (controller?.mode === 'active' && controller.activeInstrument instanceof DrillController) {
      const drill = controller.activeInstrument
      // Thermal effect + player analysisSpeed buff/nerf
      // analysisSpeed > 1 = faster analysis = lower duration multiplier
      const z = thermalZone.value
      const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
      drill.drillDurationMultiplier = thermalMult / playerMod('analysisSpeed')
      drill.setRoverPosition(siteScene.rover!.position)
      crosshairVisible.value = true
      crosshairColor.value = drill.hasTarget && drill.canCollectCurrentTarget ? 'green' : 'red'
      drillProgress.value = drill.drillProgress
      isDrilling.value = drill.isDrilling
      rockDrilling = drill.isDrilling

      // Project 3D target position to screen for crosshair overlay
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
        // Trace element drops from ChemCam-buffed mining
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
      crosshairVisible.value = false
      isDrilling.value = false
      drillProgress.value = 0
    }

    // Thermal tick (before power so heaterW is current)
    if (siteTerrainParams.value) {
      tickThermal(sceneDelta, {
        timeOfDay: siteScene.sky?.timeOfDay ?? 0.5,
        temperatureMinK: siteTerrainParams.value.temperatureMinK,
        temperatureMaxK: siteTerrainParams.value.temperatureMaxK,
      })
    }

    // Update HeaterController state for overlay display
    const heaterInst = controller?.instruments.find(i => i.id === 'heater') as HeaterController | undefined
    if (heaterInst) {
      heaterInst.internalTempC = internalTempC.value
      heaterInst.ambientC = ambientEffectiveC.value
      heaterInst.heaterW = heaterW.value
      heaterInst.zone = thermalZone.value
    }

    // --- DAN frame update ---
    const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (danInst && siteScene.roverState === 'ready') {
      danInst.setRoverState(
        siteScene.rover?.position ?? new THREE.Vector3(),
        controller?.isMoving ?? false,
      )
      if (siteTerrainParams.value) {
        danInst.waterIceIndex = siteTerrainParams.value.waterIceIndex ?? 0.1
        danInst.featureType = siteTerrainParams.value.featureType ?? 'plain'
      }
      danInst.update(sceneDelta)

      danTotalSamples.value = danInst.totalSamples
      danHitAvailable.value = danInst.pendingHit !== null

      // VFX: always tick so dots hide when deselected
      const danSelected = controller?.activeInstrument?.id === 'dan'
      danInst.vfxVisible = !!danSelected
      const rp = siteScene.rover?.position
      const groundY = rp && siteScene.terrain ? siteScene.terrain.heightAt(rp.x, rp.z) : 0
      danInst.updateVFX(sceneDelta, groundY)

      // Show completed prospect site discs when DAN is selected
      for (const disc of danCompletedDiscs) disc.visible = !!danSelected

      // Hit detection → toast + SP
      if (danInst.pendingHit && !danInst.hitConsumed) {
        if (danHitAvailable.value) {
          sampleToastRef.value?.showDAN('New hydrogen signal — previous marker updated')
        }
        const hit = danInst.pendingHit
        const qual = DANController.qualityLabel(hit.signalStrength)
        sampleToastRef.value?.showDAN(`Hydrogen signal — ${qual} (${Math.round(hit.signalStrength * 100)}%)`)
        const gain = awardDAN('DAN signal hit')
        if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN SIGNAL', gain.bonus)
        danSignalStrength.value = hit.signalStrength
        danInst.hitConsumed = true
        danHitAvailable.value = true
        triggerDanAchievement('first-hit')
      }

      // Sleep mode safety
      if (isSleeping.value && danInst.passiveSubsystemEnabled) {
        danInst.forceOff()
        sampleToastRef.value?.showDAN('Prospect interrupted — insufficient power')
        if (danDiscMesh) danDiscMesh.visible = false
        danProspectPhase.value = 'idle'
        danProspectProgress.value = 0
        passiveUiRevision.value++
      }
    }

    // --- DAN prospect phase tick ---
    if (danInst && danInst.prospectPhase !== 'idle' && danInst.prospectPhase !== 'complete') {
      const rp = siteScene?.rover?.position
      const hitPos = danDiscMesh?.position
      if (rp && hitPos) {
        const distToZone = new THREE.Vector2(rp.x - hitPos.x, rp.z - hitPos.z).length()

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
            triggerDanAchievement('first-prospect')

            const gain = awardDAN('DAN prospect complete')
            if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN PROSPECT', gain.bonus)

            const hasWater = danInst.rollWater()
            danInst.waterConfirmed = hasWater
            danWaterResult.value = hasWater

            // Place cone marker at prospect site
            const conePos = danDiscMesh?.position.clone() ?? hitPos.clone()
            const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 8)
            const coneMat = new THREE.MeshBasicMaterial({ color: hasWater ? 0x44aaff : 0xaaaaaa })
            danConeMesh = new THREE.Mesh(coneGeo, coneMat)
            danConeMesh.position.copy(conePos)
            danConeMesh.position.y += 0.25
            siteScene?.scene.add(danConeMesh)
            danInst.drillSitePosition = conePos.clone()
            danInst.reservoirQuality = danInst.prospectStrength

            if (hasWater) {
              sampleToastRef.value?.showDAN('Subsurface ice confirmed — marking drill site')
              triggerDanAchievement('water-confirmed')
              const bonusGain = awardDAN('DAN water confirmed')
              if (bonusGain) sampleToastRef.value?.showSP(bonusGain.amount, 'WATER CONFIRMED', bonusGain.bonus)
            } else {
              sampleToastRef.value?.showDAN('Analysis inconclusive — hydrogen likely mineral-bound')
            }

            // Archive to science log
            archiveDanProspect({
              capturedSol: marsSol.value,
              siteId,
              siteLatDeg: siteLat.value,
              siteLonDeg: siteLon.value,
              roverWorldX: roverWorldX.value,
              roverWorldZ: roverWorldZ.value,
              roverSpawnX: roverSpawnXZ.value.x,
              roverSpawnZ: roverSpawnXZ.value.z,
              signalStrength: danInst.prospectStrength,
              quality: DANController.qualityLabel(danInst.prospectStrength) as 'Weak' | 'Moderate' | 'Strong',
              waterConfirmed: hasWater,
              reservoirQuality: danInst.prospectStrength,
            })

            // Keep disc as a completed site marker (hidden by default, shown when DAN selected)
            if (danDiscMesh) {
              danDiscMesh.visible = false
              // Recolor: blue for water, dim gray for inconclusive
              ;(danDiscMesh.material as THREE.MeshBasicMaterial).color.set(hasWater ? 0x44aaff : 0x666688)
              ;(danDiscMesh.material as THREE.MeshBasicMaterial).opacity = 0.15
              danCompletedDiscs.push(danDiscMesh)
              danDiscMesh = null  // next prospect creates a fresh disc
            }
            danInst.pendingHit = null
            danHitAvailable.value = false
            if (controller) controller.config.moveSpeed = 5
          }
        }
      }
    }

    const instrumentLines = buildInstrumentPowerLines(
      controller,
      siteScene.roverState === 'ready',
      !isSleeping.value,
    )

    const rtgForPower = controller?.instruments.find(i => i.id === 'rtg')
    const powerLoadFactor = rtgForPower instanceof RTGController ? rtgForPower.powerLoadFactor : 1

    const wheelsForPower = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
    const driveMotorW =
      wheelsForPower && (controller?.isMoving ?? false) ? wheelsForPower.getDrivePowerW() : 0

    tickPower(sceneDelta, {
      nightFactor: siteScene.sky?.nightFactor ?? 0,
      roverInSunlight: siteScene.roverInSunlight,
      moving: controller?.isMoving ?? false,
      rockDrilling,
      driveMotorW,
      driveMotorHudLabel: 'Rover wheels',
      instrumentLines,
      heaterW: heaterW.value,
      powerLoadFactor,
    })

    // Track descent → deployment → ready states
    if (siteScene.roverState === 'descending') {
      descending.value = true
      deploying.value = false
    } else if (siteScene.roverState === 'deploying') {
      descending.value = false
      deploying.value = true
      deployProgress.value = siteScene.deployProgress
    } else if (siteScene.roverState === 'ready' && (deploying.value || descending.value)) {
      descending.value = false
      deploying.value = false
      deployProgress.value = 1
    }

    if (siteScene.roverState === 'ready' && !gameClock.roverClockRunning.value) {
      gameClock.notifyRoverReady()
    }

    // Attach instruments once ready (idempotent — attach() checks its own flag)
    if (siteScene.roverState === 'ready' && siteScene.rover && controller && !controller.instruments[0]?.attached) {
      controller.instruments.forEach(i => {
        if (i instanceof SAMController) {
          i.attachWithBindPoses(siteScene!.rover!, siteScene!.coverBindQuats)
        } else {
          i.attach(siteScene!.rover!)
        }
      })
    }

    if (siteScene.roverState === 'ready' && siteScene.rover && camera) {
      const drillInst = controller?.instruments.find(i => i.id === 'drill')
      if (drillInst instanceof DrillController && drillInst.attached && !drillInst.targeting) {
        drillInst.initGameplay(siteScene.scene, camera, siteScene.terrain.getSmallRocks())
      }
      const mc = controller?.instruments.find(i => i.id === 'mastcam')
      if (mc instanceof MastCamController && mc.attached && !mc['overlayScene']) {
        // Collect scene meshes to wireframe during survey — exclude small rocks (handled separately)
        const smallRocks = new Set(siteScene.terrain.getSmallRocks())
        const sceneMeshes: THREE.Mesh[] = []
        siteScene.terrain.group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && !smallRocks.has(child as THREE.Mesh)) {
            sceneMeshes.push(child as THREE.Mesh)
          }
        })
        if (siteScene.rover) {
          siteScene.rover.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) sceneMeshes.push(child as THREE.Mesh)
          })
        }
        mc.initSurvey(siteScene.scene, siteScene.terrain.getSmallRocks(), sceneMeshes)
        mc.onScanComplete = (rock, rockType) => {
          const label = ROCK_TYPES[rockType]?.label ?? 'Unknown'
          const gain = awardSP('mastcam', rock.uuid, label)
          if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        }
      }
      const cc = controller?.instruments.find(i => i.id === 'chemcam')
      if (cc instanceof ChemCamController && cc.attached && !cc['scene']) {
        cc.initTargeting(siteScene.scene, siteScene.terrain.getSmallRocks())
        cc.onReady = (readout) => {
          sampleToastRef.value?.showChemCam(readout.rockType, readout.rockLabel)
          const gain = awardSP('chemcam', readout.rockMeshUuid, readout.rockLabel)
          if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        }
      }
      const danInit = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
      if (danInit && siteScene) danInit.initVFX(siteScene.scene)
    }

    // Enter survey mode when MastCam is active
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      if (mc['overlayMeshes'].length === 0) {
        mc.enterSurveyMode()
        mc.rebuildOverlays()
      }
    }

    // Animate MastCam tag markers (always, not just in active mode)
    const mcInst = controller?.instruments.find(i => i.id === 'mastcam')
    if (mcInst instanceof MastCamController) {
      mcInst.updateTagMarkers(simulationTime)
    }

    // Track active instrument for toolbar
    activeInstrumentSlot.value = controller?.activeInstrument?.slot ?? null

    // MastCam HUD state + crosshair + telemetry
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      mastcamFilterLabel.value = mc.filterLabel
      mastcamScanning.value = mc.isScanning
      mastcamScanProgress.value = mc.scanProgressValue

      // Telemetry
      mastPan.value = mc.panAngle
      mastTilt.value = mc.tiltAngle
      mastFov.value = mc.fov
      mastTargetRange.value = mc.scanTarget
        ? mc.mastWorldPos.distanceTo(mc.scanTargetWorldPos)
        : -1

      // Show crosshair at target rock position
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

    // ChemCam HUD state + crosshair + badge + instrument-card sequence progress
    const ccInst = controller?.instruments.find(i => i.id === 'chemcam')
    const chemCamIsActiveInstrument =
      controller?.mode === 'active' && controller.activeInstrument instanceof ChemCamController
    if (ccInst instanceof ChemCamController) {
      chemCamUnreadCount.value = ccInst.unreadCount
      ccInst.currentSP = totalSP.value
      ccInst.currentSol = marsSol.value
      if (ccInst.isSequenceAdvancing) {
        const z = thermalZone.value
        const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
        ccInst.durationMultiplier = thermalMult / playerMod('analysisSpeed')
      }
      const showCardProgress =
        activeInstrumentSlot.value === 2 && !chemCamIsActiveInstrument
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
      cc.currentSP = totalSP.value
      cc.currentSol = marsSol.value
      chemcamPhase.value = cc.phase
      chemcamShotsRemaining.value = cc.shotsRemaining
      chemcamShotsMax.value = cc.shotsMax
      chemcamProgressPct.value = cc.phase === 'PULSE_TRAIN'
        ? cc.pulseProgress * 100
        : cc.integrateProgress * 100

      // Telemetry
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

    if (siteScene.rover && siteScene.trails) {
      siteScene.trails.update(siteScene.rover.position, controller?.heading ?? 0)
    }

    siteScene.update(simulationTime, sceneDelta, camera.position, skyDelta)

    // Update dust pass time
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

  function dispose(): void {
    clearPois()
    orbitalDrops.disposeAllDrops()
    disposeOrbitalDropDebugApi?.()
    disposeOrbitalDropDebugApi = null
    disposeMarsDevDebugApi?.()
    disposeMarsDevDebugApi = null
    if (animationId) cancelAnimationFrame(animationId)
    window.removeEventListener('keydown', onGlobalKeyDown)
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
    spawnOrbitalDropItem,
    spawnRandomOrbitalDrop,
    handleDanProspect,
  }
}
