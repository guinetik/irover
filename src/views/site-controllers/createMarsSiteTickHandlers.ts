import type { MarsSiteViewContext } from '@/views/MarsSiteViewController'
import { createRoverVfxTickHandler } from './RoverVfxTickHandler'
import { createDanTickHandler } from './DanTickHandler'
import { createDrillTickHandler } from './DrillTickHandler'
import { createMastCamTickHandler } from './MastCamTickHandler'
import { createChemCamTickHandler } from './ChemCamTickHandler'
import { createOrbitalDropTickHandler, type OrbitalDropTickHandler } from './OrbitalDropTickHandler'
import { createAntennaTickHandler } from './AntennaTickHandler'
import { createAPXSTickHandler } from './APXSTickHandler'
import { createMicTickHandler } from './MicTickHandler'
import { createPassiveSystemsAudioTickHandler } from './PassiveSystemsAudioTickHandler'
import { createRoverMovementSoundHandler } from './RoverMovementSoundHandler'

/**
 * All per-frame subsystems created for the Mars site view, plus a single {@link disposeAll} for teardown.
 * Keeps {@link createMarsSiteViewController} focused on Three.js lifecycle and the animation loop.
 */
export interface MarsSiteTickHandlers {
  roverVfxHandler: ReturnType<typeof createRoverVfxTickHandler>
  danHandler: ReturnType<typeof createDanTickHandler>
  drillHandler: ReturnType<typeof createDrillTickHandler>
  mastCamHandler: ReturnType<typeof createMastCamTickHandler>
  chemCamHandler: ReturnType<typeof createChemCamTickHandler>
  apxsHandler: ReturnType<typeof createAPXSTickHandler>
  orbitalDropHandler: OrbitalDropTickHandler
  antennaHandler: ReturnType<typeof createAntennaTickHandler>
  micHandler: ReturnType<typeof createMicTickHandler>
  passiveSystemsAudioHandler: ReturnType<typeof createPassiveSystemsAudioTickHandler>
  roverMovementSoundHandler: ReturnType<typeof createRoverMovementSoundHandler>
  /** Disposes handlers in a stable order (matches previous inline disposal). */
  disposeAll: () => void
}

/**
 * Wires Vue refs and view callbacks into focused tick handlers. Construction order is not semantically
 * significant; disposal order is preserved for symmetry with historical behavior.
 * @param ctx View context from the Mars site SFC
 */
export function createMarsSiteTickHandlers(ctx: MarsSiteViewContext): MarsSiteTickHandlers {
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
  } = refs

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

  const danHandler = createDanTickHandler(
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
    },
    {
      siteId: ctx.siteId,
      sampleToastRef: ctx.sampleToastRef,
      playerMod: ctx.playerMod,
      awardDAN: ctx.awardDAN,
      startHeldActionSound: () => ctx.startInstrumentActionLoop('sfx.danScan'),
      startHeldProspectingSound: () => ctx.startInstrumentActionLoop('sfx.danProspecting'),
      triggerDanAchievement: ctx.triggerDanAchievement,
      archiveDanProspect: ctx.archiveDanProspect,
    },
  )

  const drillHandler = createDrillTickHandler(
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

  const mastCamHandler = createMastCamTickHandler(
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
    },
  )

  const chemCamHandler = createChemCamTickHandler(
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
    },
  )

  const apxsHandler = createAPXSTickHandler(
    {
      crosshairVisible: refs.crosshairVisible,
      crosshairColor: refs.crosshairColor,
      crosshairX: refs.crosshairX,
      crosshairY: refs.crosshairY,
      apxsCountdown: refs.apxsCountdown,
      apxsState: refs.apxsState,
    },
    {
      onLaunchMinigame: ctx.onAPXSLaunchMinigame,
      onBlockedByCold: ctx.onAPXSBlockedByCold,
      playerMod: ctx.playerMod,
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
      sampleToastRef: ctx.sampleToastRef,
      awardTransmission: ctx.awardTransmission,
      playerMod: ctx.playerMod,
      onDSNTransmissionsReceived: ctx.onDSNTransmissionsReceived,
      playUhfLock: () => ctx.playInstrumentActionSound('sfx.uhfLock'),
      startUhfUplinkLoop: () => ctx.startInstrumentActionLoop('sfx.uhfUplink'),
      playLgaUplink: () => ctx.playInstrumentActionSound('sfx.lgaUplink'),
    },
  )

  const micHandler = createMicTickHandler(
    {
      micEnabled,
    },
    {
      playAmbientLoop: ctx.playAmbientLoop,
      setAmbientVolume: ctx.setAmbientVolume,
    },
  )

  const passiveSystemsAudioHandler = createPassiveSystemsAudioTickHandler(
    {
      descending: refs.descending,
      deploying: refs.deploying,
      heaterHeatBoostActive: refs.heaterHeatBoostActive,
      heaterEffectiveW: refs.heaterEffectiveW,
      remsSurveying: refs.remsSurveying,
    },
    {
      playAmbientLoop: ctx.playAmbientLoop,
      playActionSound: ctx.playInstrumentActionSound,
      setAmbientVolume: ctx.setAmbientVolume,
      showToast: (msg) => ctx.sampleToastRef.value?.showComm?.(msg),
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
    disposeAll,
  }
}
