import type { MarsSiteViewContext } from '@/views/MarsSiteViewController'
import { useMarsData } from '@/composables/useMarsData'
import { useDanArchive } from '@/composables/useDanArchive'
import { useVentArchive } from '@/composables/useVentArchive'
import { useCraterArchive } from '@/composables/useCraterArchive'
import type { VentType } from '@/lib/meteor/craterDiscovery'
import { createRoverVfxTickHandler } from './RoverVfxTickHandler'
import { createDanHudController } from './DanHudController'
import { useInventory } from '@/composables/useInventory'
import { createDrillHudController } from './DrillHudController'
import { createMastCamHudController } from './MastCamHudController'
import { createChemCamHudController } from './ChemCamHudController'
import { createOrbitalDropTickHandler, type OrbitalDropTickHandler } from './OrbitalDropTickHandler'
import { createAntennaHudController } from './AntennaHudController'
import { createAPXSHudController } from './APXSHudController'
import { createMicTickHandler } from './MicTickHandler'
import { createPassiveSystemsAudioTickHandler } from './PassiveSystemsAudioTickHandler'
import { createRoverMovementSoundHandler } from './RoverMovementSoundHandler'
import { createRadHudController } from './RadHudController'
import { createMeteorController } from './MeteorController'
import { useAudio } from '@/audio/useAudio'
import { useMeteorArchive } from '@/composables/useMeteorArchive'
import * as THREE from 'three'

/**
 * All per-frame subsystems created for the Mars site view, plus a single {@link disposeAll} for teardown.
 * Keeps {@link createMarsSiteViewController} focused on Three.js lifecycle and the animation loop.
 */
export interface MarsSiteHudControllers {
  roverVfxHandler: ReturnType<typeof createRoverVfxTickHandler>
  danHandler: ReturnType<typeof createDanHudController>
  drillHandler: ReturnType<typeof createDrillHudController>
  mastCamHandler: ReturnType<typeof createMastCamHudController>
  chemCamHandler: ReturnType<typeof createChemCamHudController>
  apxsHandler: ReturnType<typeof createAPXSHudController>
  orbitalDropHandler: OrbitalDropTickHandler
  antennaHandler: ReturnType<typeof createAntennaHudController>
  micHandler: ReturnType<typeof createMicTickHandler>
  passiveSystemsAudioHandler: ReturnType<typeof createPassiveSystemsAudioTickHandler>
  roverMovementSoundHandler: ReturnType<typeof createRoverMovementSoundHandler>
  radHandler: ReturnType<typeof createRadHudController>
  meteorHandler: ReturnType<typeof createMeteorController>
  /** Disposes handlers in a stable order (matches previous inline disposal). */
  disposeAll: () => void
}

/**
 * Wires Vue refs and view callbacks into focused tick handlers. Construction order is not semantically
 * significant; disposal order is preserved for symmetry with historical behavior.
 * @param ctx View context from the Mars site SFC
 */
export function createMarsSiteHudControllers(ctx: MarsSiteViewContext): MarsSiteHudControllers {
  const { refs } = ctx
  const {
    siteTerrainParams,
    passiveUiRevision,
    siteLat,
    siteLon,
    roverWorldX,
    roverWorldZ,
    roverSpawnXZ,
    uhfPassActive,
    uhfTransmitting,
    uhfCurrentOrbiter,
    uhfTransmissionProgress,
    uhfQueueLength,
    uhfWindowRemainingSec,
    uhfNextPassInSec,
    uhfTransmittedThisPass,
    lgaUnreadCount,
    micEnabled,
    danCraterModeAvailable,
    pendingCraterResult,
    pendingWaterDeploy,
    danDockEnabled,
    pendingExtractorDock,
  } = refs

  // Track which instruments have been used on each meteorite rock (by mesh UUID)
  const meteoriteWorkup = new Map<string, Set<string>>()
  function stampMeteoriteWorkup(rockUuid: string, instrument: string): void {
    let set = meteoriteWorkup.get(rockUuid)
    if (!set) { set = new Set(); meteoriteWorkup.set(rockUuid, set) }
    set.add(instrument)
    if (set.has('mastcam') && set.has('chemcam') && set.has('apxs')) {
      ctx.triggerMeteorAchievement('full-meteorite-workup')
    }
  }

  const roverVfxHandler = createRoverVfxTickHandler({
    rtgPhase: refs.rtgPhase,
    rtgPhaseProgress: refs.rtgPhaseProgress,
    rtgConservationMode: refs.rtgConservationMode,
    rtgConservationProgress01: refs.rtgConservationProgress01,
    rtgOverdriveReady: refs.rtgOverdriveReady,
    rtgConservationReady: refs.rtgConservationReady,
    rtgConservationCdLabel: refs.rtgConservationCdLabel,
    rtgConservationCooldownTitle: refs.rtgConservationCooldownTitle,
    heaterOverdriveReady: refs.heaterOverdriveReady,
    heaterHeatBoostActive: refs.heaterHeatBoostActive,
    heaterHeatBoostProgressElapsed01: refs.heaterHeatBoostProgressElapsed01,
  })

  const meteorHandler = createMeteorController({
    meteorRisk: useMarsData().landmarks.value.find(l => l.id === ctx.siteId)?.meteorRisk ?? 0.25,
    audioManager: useAudio(),
    remsMeteorIncomingText: refs.remsMeteorIncomingText,
    remsMeteorActiveText: refs.remsMeteorActiveText,
    shockWhiteoutActive: refs.meteorShockWhiteout,
    onGameOver: ctx.onMeteorGameOver,
    triggerMeteorAchievement: ctx.triggerMeteorAchievement,
    meteorSenseBonus: ctx.hasPerk('meteor-sense') ? 5 : 0,
  })

  const danHandler = createDanHudController(
    {
      siteTerrainParams,
      danTotalSamples: refs.danTotalSamples,
      danHitAvailable: refs.danHitAvailable,
      danProspectPhase: refs.danProspectPhase,
      danProspectProgress: refs.danProspectProgress,
      danSignalStrength: refs.danSignalStrength,
      danWaterResult: refs.danWaterResult,
      danDialogVisible: refs.danDialogVisible,
      passiveUiRevision,
      siteLat,
      siteLon,
      roverWorldX,
      roverWorldZ,
      roverSpawnXZ,
      danCraterModeAvailable,
      pendingCraterResult,
      pendingWaterDeploy,
      danDockEnabled,
      pendingExtractorDock,
    },
    {
      siteId: ctx.siteId,
      siteTier: useMarsData().landmarks.value.find(l => l.id === ctx.siteId)?.tier ?? 2,
      getInconclusiveCount: () => useDanArchive().prospects.value.filter(p => !p.waterConfirmed).length,
      sampleToastRef: ctx.sampleToastRef,
      playerMod: ctx.playerMod,
      awardDAN: ctx.awardDAN,
      startHeldActionSound: () => ctx.startInstrumentActionLoop('sfx.danScan'),
      startHeldProspectingSound: () => ctx.startInstrumentActionLoop('sfx.danProspecting'),
      triggerDanAchievement: ctx.triggerDanAchievement,
      archiveDanProspect: ctx.archiveDanProspect,
      getLatestPersistedDanDrillSite: ctx.getLatestPersistedDanDrillSite,
      notifyDanScanCompleted: ctx.notifyDanScanCompleted,
      getCraterAtPosition: (x, z) => meteorHandler.getCraterAtPosition(x, z),
      hasCraterBeenScanned: (x, z) => {
        const { discoveries } = useCraterArchive()
        return discoveries.value.some(d =>
          Math.abs(d.craterX - x) < 2 && Math.abs(d.craterZ - z) < 2,
        )
      },
      hasActiveVent: (ventType: VentType) => useVentArchive().hasActiveVent(ctx.siteId, ventType),
      onCraterDiscovery: ({ discovery, ventPlaced, crater }) => {
        if (ventPlaced) {
          meteorHandler.unregisterMeteoriteRockFromCrater(crater)
          meteorHandler.removeCrater(crater.id)
        }
        if (ventPlaced && discovery.ventType) {
          useVentArchive().archiveVent({
            siteId: ctx.siteId,
            ventType: discovery.ventType,
            placedSol: refs.marsSol.value,
            x: crater.x,
            z: crater.z,
          })
        }
      },
      getVentsForSite: (siteId) => useVentArchive().getVentsForSite(siteId),
      consumeDanExtractor: () => useInventory().consumeItem('dan-extractor', 1).ok,
      updateDanProspectDrillSite: (x, y, z) => useDanArchive().updateDrillSite(ctx.siteId, x, y, z),
      getAllExtractorsForSite: (sid) => {
        const danTargets = useDanArchive().getWaterExtractorsForSite(sid)
        const ventTargets = useVentArchive().getExtractorTargetsForSite(sid)
        return [...danTargets, ...ventTargets]
      },
      updateExtractorStorage: (archiveId, archiveType, storedKg, lastChargedSol) => {
        if (archiveType === 'dan') {
          useDanArchive().updateExtractorStorage(archiveId, storedKg, lastChargedSol)
        } else {
          useVentArchive().updateExtractorStorage(archiveId, storedKg, lastChargedSol)
        }
      },
      addInventoryItem: (itemId, qty) => useInventory().addComponent(itemId, qty),
      playDockSound: () => {},  // placeholder — sfx.danDock not yet in audio manifest
      setDanDockEnabled: (v: boolean) => { danDockEnabled.value = v },
      getCurrentSol: () => ctx.refs.marsSol?.value ?? 0,
      deductRTGPower: (watts) => ctx.deductRTGPower?.(watts),
    },
  )

  const drillHandler = createDrillHudController(
    {
      crosshairVisible: refs.crosshairVisible,
      crosshairColor: refs.crosshairColor,
      crosshairX: refs.crosshairX,
      crosshairY: refs.crosshairY,
      drillProgress: refs.drillProgress,
      isDrilling: refs.isDrilling,
    },
    {
      sampleToastRef: ctx.sampleToastRef,
      playerMod: ctx.playerMod,
      awardSP: ctx.awardSP,
      startHeldActionSound: () => ctx.startInstrumentActionLoop('sfx.drillStart'),
      startHeldMovementSound: () => ctx.startInstrumentActionLoop('sfx.mastMove'),
    },
  )

  const mastCamHandler = createMastCamHudController(
    {
      mastcamFilterLabel: refs.mastcamFilterLabel,
      mastcamScanning: refs.mastcamScanning,
      mastcamScanProgress: refs.mastcamScanProgress,
      mastPan: refs.mastPan,
      mastTilt: refs.mastTilt,
      mastFov: refs.mastFov,
      mastTargetRange: refs.mastTargetRange,
      crosshairVisible: refs.crosshairVisible,
      crosshairColor: refs.crosshairColor,
      crosshairX: refs.crosshairX,
      crosshairY: refs.crosshairY,
      isDrilling: refs.isDrilling,
      drillProgress: refs.drillProgress,
    },
    {
      sampleToastRef: ctx.sampleToastRef,
      awardSP: ctx.awardSP,
      playerMod: ctx.playerMod,
      startHeldActionSound: () => ctx.startInstrumentActionLoop('sfx.mastcamTag'),
      startHeldMovementSound: () => ctx.startInstrumentActionLoop('sfx.cameraMove'),
      onMeteoriteTagged: (rock: THREE.Mesh, _rockType: string) => {
        ctx.triggerMeteorAchievement('first-meteorite-scan')
        stampMeteoriteWorkup(rock.uuid, 'mastcam')
        const { archiveObservation } = useMeteorArchive()
        // Weight from iron-meteorite range (0.5–1.5 kg) scaled by mesh size
        const baseWeight = 0.5 + Math.random() * 1.0
        const weightKg = Math.round(baseWeight * (rock.scale.x || 1) * 100) / 100
        archiveObservation({
          siteId: ctx.siteId,
          capturedSol: refs.marsSol.value,
          roverWorldX: roverWorldX.value,
          roverWorldZ: roverWorldZ.value,
          showerId: (rock.userData.showerId as string) ?? '',
          meteoriteVariant: (rock.userData.meteoriteVariant as string) ?? '',
          weightKg,
          sp: 20,
        })
      },
    },
  )

  const chemCamHandler = createChemCamHudController(
    {
      chemCamUnreadCount: refs.chemCamUnreadCount,
      chemcamPhase: refs.chemcamPhase,
      chemcamShotsRemaining: refs.chemcamShotsRemaining,
      chemcamShotsMax: refs.chemcamShotsMax,
      chemcamProgressPct: refs.chemcamProgressPct,
      chemCamOverlaySequenceActive: refs.chemCamOverlaySequenceActive,
      chemCamOverlaySequenceProgress: refs.chemCamOverlaySequenceProgress,
      chemCamOverlaySequenceLabel: refs.chemCamOverlaySequenceLabel,
      chemCamOverlaySequencePulse: refs.chemCamOverlaySequencePulse,
      mastPan: refs.mastPan,
      mastTilt: refs.mastTilt,
      mastFov: refs.mastFov,
      mastTargetRange: refs.mastTargetRange,
      crosshairVisible: refs.crosshairVisible,
      crosshairColor: refs.crosshairColor,
      crosshairX: refs.crosshairX,
      crosshairY: refs.crosshairY,
      isDrilling: refs.isDrilling,
      drillProgress: refs.drillProgress,
    },
    {
      sampleToastRef: ctx.sampleToastRef,
      playerMod: ctx.playerMod,
      awardSP: ctx.awardSP,
      startHeldActionSound: () => ctx.startInstrumentActionLoop('sfx.chemcamFire'),
      startHeldMovementSound: () => ctx.startInstrumentActionLoop('sfx.cameraMove'),
      onReadoutComplete: (rockUuid, rockType) => {
        if (rockType === 'iron-meteorite') stampMeteoriteWorkup(rockUuid, 'chemcam')
      },
    },
  )

  const apxsHandler = createAPXSHudController(
    {
      crosshairVisible: refs.crosshairVisible,
      crosshairColor: refs.crosshairColor,
      crosshairX: refs.crosshairX,
      crosshairY: refs.crosshairY,
      apxsCountdown: refs.apxsCountdown,
      apxsState: refs.apxsState,
    },
    {
      onLaunchMinigame: (rockUuid, rockType, rockLabel, durationSec) => {
        ctx.onAPXSLaunchMinigame(rockUuid, rockType, rockLabel, durationSec)
        if (rockType === 'iron-meteorite') stampMeteoriteWorkup(rockUuid, 'apxs')
      },
      onBlockedByCold: ctx.onAPXSBlockedByCold,
      playActionSound: () => ctx.playInstrumentActionSound('sfx.apxsContact'),
      startHeldMovementSound: () => ctx.startInstrumentActionLoop('sfx.mastMove'),
    },
  )

  const orbitalDropHandler = createOrbitalDropTickHandler({
    orbitalDrops: ctx.orbitalDrops,
    sampleToastRef: ctx.sampleToastRef,
    roverWorldX,
    roverWorldZ,
    upsertPoi: ctx.upsertPoi,
    removePoi: ctx.removePoi,
    setFocusPoi: ctx.setFocusPoi,
    focusPoiId: ctx.focusPoiId,
    startThrusterLoop: () => ctx.startInstrumentActionLoop('sfx.thrusters'),
  })

  const antennaHandler = createAntennaHudController(
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
      sampleToastRef: ctx.sampleToastRef,
      awardTransmission: ctx.awardTransmission,
      onDSNTransmissionsReceived: ctx.onDSNTransmissionsReceived,
      playUhfLock: () => ctx.playInstrumentActionSound('sfx.uhfLock'),
      startUhfUplinkLoop: () => ctx.startInstrumentActionLoop('sfx.uhfUplink'),
      playLgaUplink: () => {
        if (!ctx.commCuesAudible()) return
        ctx.playInstrumentActionSound('sfx.lgaUplink')
      },
    },
  )

  const micHandler = createMicTickHandler(
    {
      micEnabled,
    },
    {
      playAmbientLoop: ctx.playAmbientLoop,
      setAmbientVolume: ctx.setAmbientVolume,
      setAmbientStereo: (handle, pan) => handle.setStereo(pan),
    },
  )

  const radHandler = createRadHudController(
    {
      radZone: refs.radZone,
      radLevel: refs.radLevel,
      radDoseRate: refs.radDoseRate,
      radCumulativeDose: refs.radCumulativeDose,
      radParticleRate: refs.radParticleRate,
      radEnabled: refs.radEnabled,
      radEventAlertPending: refs.radEventAlertPending,
      radActiveEventId: refs.radActiveEventId,
      radDecoding: refs.radDecoding,
    },
    {
      radiationIndex: refs.siteTerrainParams.value?.radiationIndex ?? 0.25,
      sampleToastRef: ctx.sampleToastRef,
      playEventSting: () => ctx.playInstrumentActionSound('sfx.radEventSting' as any),
      hasStormChaser: () => ctx.hasPerk('storm-chaser'),
      hasLeadLined: () => ctx.hasPerk('lead-lined'),
    },
  )

  const passiveSystemsAudioHandler = createPassiveSystemsAudioTickHandler(
    {
      descending: refs.descending,
      deploying: refs.deploying,
      heaterHeatBoostActive: refs.heaterHeatBoostActive,
      heaterEffectiveW: refs.heaterEffectiveW,
      remsSurveying: refs.remsSurveying,
      radSurveying: refs.radEnabled,
    },
    {
      playAmbientLoop: ctx.playAmbientLoop,
      playActionSound: ctx.playInstrumentActionSound,
      setAmbientVolume: ctx.setAmbientVolume,
      setAmbientStereo: (handle, pan) => handle.setStereo(pan),
      showToast: (msg) => ctx.sampleToastRef.value?.showComm?.(msg),
      passiveAmbienceAudible: () => ctx.descentSfxAudible(),
      getGeigerSafePan: () => radHandler.getSafePan(),
      getGeigerSafeDist: () => radHandler.getSafeDist(),
    },
  )

  const roverMovementSoundHandler = createRoverMovementSoundHandler({
    startDriveLoop: () => ctx.startInstrumentActionLoop('sfx.roverDrive'),
    startTurnLoop: () => ctx.startInstrumentActionLoop('sfx.roverTurn'),
    playTurnOut: () => ctx.playInstrumentActionSound('sfx.roverTurnOut'),
  })

  function disposeAll(): void {
    roverVfxHandler.dispose()
    danHandler.dispose()
    drillHandler.dispose()
    apxsHandler.dispose()
    mastCamHandler.dispose()
    chemCamHandler.dispose()
    orbitalDropHandler.dispose()
    antennaHandler.dispose()
    micHandler.dispose()
    passiveSystemsAudioHandler.dispose()
    roverMovementSoundHandler.dispose()
    radHandler.dispose()
    meteorHandler.dispose()
  }

  return {
    roverVfxHandler,
    danHandler,
    drillHandler,
    mastCamHandler,
    chemCamHandler,
    apxsHandler,
    orbitalDropHandler,
    antennaHandler,
    micHandler,
    passiveSystemsAudioHandler,
    roverMovementSoundHandler,
    radHandler,
    meteorHandler,
    disposeAll,
  }
}
