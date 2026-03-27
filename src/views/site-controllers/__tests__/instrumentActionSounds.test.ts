import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as THREE from 'three'
import type { SiteFrameContext } from '../SiteFrameContext'
import { createChemCamTickHandler } from '../ChemCamTickHandler'
import { createAPXSTickHandler } from '../APXSTickHandler'
import { createDrillTickHandler } from '../DrillTickHandler'
import { createDanTickHandler } from '../DanTickHandler'
import { createMastCamTickHandler } from '../MastCamTickHandler'
import { ChemCamController } from '@/three/instruments/ChemCamController'
import { APXSController } from '@/three/instruments/APXSController'
import { DrillController } from '@/three/instruments/DrillController'
import { DANController } from '@/three/instruments/DANController'
import { MastCamController } from '@/three/instruments/MastCamController'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'

function makeFrameContext(activeInstrument: object, overrides: Partial<SiteFrameContext> = {}): SiteFrameContext {
  const rover = {
    mode: 'active',
    activeInstrument,
    instruments: [activeInstrument],
    heading: 0,
  } as SiteFrameContext['rover']

  return {
    sceneDelta: 0.016,
    skyDelta: 0.016,
    simulationTime: 0,
    camera: new THREE.PerspectiveCamera(),
    siteScene: {
      rover: { position: new THREE.Vector3() },
      terrain: {
        heightAt: () => 0,
        getSmallRocks: () => [],
      },
      scene: new THREE.Scene(),
    } as unknown as SiteFrameContext['siteScene'],
    rover,
    roverReady: true,
    isSleeping: false,
    nightFactor: 0,
    thermalZone: 'OPTIMAL',
    marsSol: 1,
    marsTimeOfDay: 0.25,
    totalSP: 0,
    activeInstrumentSlot: (activeInstrument as { slot?: number }).slot ?? null,
    windMs: 0,
    dustStormPhase: 'none' as const,
    dustStormLevel: null,
    ...overrides,
  }
}

function makeHandle(): AudioPlaybackHandle {
  return {
    soundId: 'held',
    stop: vi.fn<() => void>(),
    playing: () => true,
    progress: () => 0,
    duration: () => 0,
  }
}

describe('instrument action sounds', () => {
  it('stops the mastcam shutter sound when leaving active mode', () => {
    const heldHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => heldHandle)
    const mastCam = new MastCamController()
    const mastCamPrivate = mastCam as unknown as Record<string, unknown>
    mastCamPrivate.scanning = true
    mastCamPrivate.scanTarget = { userData: {} }

    const handler = createMastCamTickHandler(
      {
        mastcamFilterLabel: ref('ALL TYPES'),
        mastcamScanning: ref(false),
        mastcamScanProgress: ref(0),
        mastPan: ref(0),
        mastTilt: ref(0),
        mastFov: ref(0),
        mastTargetRange: ref(0),
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        isDrilling: ref(false),
        drillProgress: ref(0),
      },
      {
        sampleToastRef: ref(null),
        awardSP: () => null,
        playerMod: () => 1,
        startHeldActionSound,
      },
    )

    const activeCtx = makeFrameContext(mastCam)
    handler.tick(activeCtx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)

    const drivingRover = { ...activeCtx.rover!, mode: 'driving' } as SiteFrameContext['rover']
    handler.tick(makeFrameContext(mastCam, { rover: drivingRover }))
    expect(heldHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('starts the mastcam shutter sound while tagging and stops it on release', () => {
    const heldHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => heldHandle)
    const mastCam = new MastCamController()
    const mastCamPrivate = mastCam as unknown as Record<string, unknown>
    mastCamPrivate.scanning = false
    mastCamPrivate.scanTarget = null

    const handler = createMastCamTickHandler(
      {
        mastcamFilterLabel: ref('ALL TYPES'),
        mastcamScanning: ref(false),
        mastcamScanProgress: ref(0),
        mastPan: ref(0),
        mastTilt: ref(0),
        mastFov: ref(0),
        mastTargetRange: ref(0),
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        isDrilling: ref(false),
        drillProgress: ref(0),
      },
      {
        sampleToastRef: ref(null),
        awardSP: () => null,
        playerMod: () => 1,
        startHeldActionSound,
      },
    )

    const fctx = makeFrameContext(mastCam)
    handler.tick(fctx)
    expect(startHeldActionSound).not.toHaveBeenCalled()

    mastCamPrivate.scanning = true
    mastCamPrivate.scanTarget = { userData: {} }
    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)
    expect(startHeldActionSound).toHaveBeenCalledWith('sfx.mastcamTag')

    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)

    mastCamPrivate.scanning = false
    mastCamPrivate.scanTarget = null
    handler.tick(fctx)
    expect(heldHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('starts the chemcam sound while firing and stops it on release', () => {
    const heldHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => heldHandle)
    const chemCam = new ChemCamController()
    chemCam.phase = 'ARMED'

    const handler = createChemCamTickHandler(
      {
        chemCamUnreadCount: ref(0),
        chemcamPhase: ref('IDLE'),
        chemcamShotsRemaining: ref(0),
        chemcamShotsMax: ref(0),
        chemcamProgressPct: ref(0),
        chemCamOverlaySequenceActive: ref(false),
        chemCamOverlaySequenceProgress: ref(0),
        chemCamOverlaySequenceLabel: ref(''),
        chemCamOverlaySequencePulse: ref(false),
        mastPan: ref(0),
        mastTilt: ref(0),
        mastFov: ref(0),
        mastTargetRange: ref(0),
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        isDrilling: ref(false),
        drillProgress: ref(0),
      },
      {
        sampleToastRef: ref(null),
        playerMod: () => 1,
        awardSP: () => null,
        startHeldActionSound,
      },
    )

    const fctx = makeFrameContext(chemCam)
    handler.tick(fctx)
    expect(startHeldActionSound).not.toHaveBeenCalled()

    chemCam.phase = 'PULSE_TRAIN'
    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)
    expect(startHeldActionSound).toHaveBeenCalledWith('sfx.chemcamFire')

    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)

    chemCam.phase = 'COOLDOWN'
    handler.tick(fctx)
    expect(heldHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('stops the chemcam sound when leaving active mode', () => {
    const heldHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => heldHandle)
    const chemCam = new ChemCamController()
    chemCam.phase = 'PULSE_TRAIN'

    const handler = createChemCamTickHandler(
      {
        chemCamUnreadCount: ref(0),
        chemcamPhase: ref('IDLE'),
        chemcamShotsRemaining: ref(0),
        chemcamShotsMax: ref(0),
        chemcamProgressPct: ref(0),
        chemCamOverlaySequenceActive: ref(false),
        chemCamOverlaySequenceProgress: ref(0),
        chemCamOverlaySequenceLabel: ref(''),
        chemCamOverlaySequencePulse: ref(false),
        mastPan: ref(0),
        mastTilt: ref(0),
        mastFov: ref(0),
        mastTargetRange: ref(0),
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        isDrilling: ref(false),
        drillProgress: ref(0),
      },
      {
        sampleToastRef: ref(null),
        playerMod: () => 1,
        awardSP: () => null,
        startHeldActionSound,
      },
    )

    const activeCtx = makeFrameContext(chemCam)
    handler.tick(activeCtx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)

    const drivingRover = { ...activeCtx.rover!, mode: 'driving' } as SiteFrameContext['rover']
    handler.tick(makeFrameContext(chemCam, { rover: drivingRover }))
    expect(heldHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('plays the APXS contact sound when countdown starts', () => {
    const playActionSound = vi.fn()
    const mastHandle = makeHandle()
    const startHeldMovementSound = vi.fn(() => mastHandle)
    const apxs = new APXSController()
    const apxsPrivate = apxs as unknown as Record<string, unknown>
    apxsPrivate.currentTarget = {
      rock: { userData: {} },
      point: new THREE.Vector3(),
    }

    const handler = createAPXSTickHandler(
      {
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        apxsCountdown: ref(0),
        apxsState: ref<'idle' | 'counting' | 'launching' | 'playing'>('idle'),
      },
      {
        onLaunchMinigame: vi.fn(),
        onBlockedByCold: vi.fn(),
        playerMod: () => 1,
        playActionSound,
        startHeldMovementSound,
      },
    )

    handler.tick(makeFrameContext(apxs))
    expect(playActionSound).toHaveBeenCalledTimes(1)
    expect(playActionSound).toHaveBeenCalledWith('sfx.apxsContact')
    expect(startHeldMovementSound).not.toHaveBeenCalled()

    handler.tick(makeFrameContext(apxs, { sceneDelta: 3.1 }))
    expect(playActionSound).toHaveBeenCalledTimes(1)

    apxsPrivate.swingAngle = 0
    apxsPrivate.targetSwing = 0.5
    handler.tick(makeFrameContext(apxs))
    expect(startHeldMovementSound).toHaveBeenCalledTimes(1)
    expect(startHeldMovementSound).toHaveBeenCalledWith('sfx.mastMove')

    apxsPrivate.swingAngle = 0.5
    apxsPrivate.targetSwing = 0.5
    handler.tick(makeFrameContext(apxs))
    expect(mastHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('starts the drill sound while drilling and stops it on release', () => {
    const heldHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => heldHandle)
    const mastHandle = makeHandle()
    const startHeldMovementSound = vi.fn(() => mastHandle)
    const drill = new DrillController()
    const drillPrivate = drill as unknown as Record<string, unknown>
    drillPrivate.drilling = false
    drillPrivate.drill = {
      isDrilling: false,
      progress: 0,
    }

    const handler = createDrillTickHandler(
      {
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        drillProgress: ref(0),
        isDrilling: ref(false),
      },
      {
        sampleToastRef: ref(null),
        playerMod: () => 1,
        awardSP: () => null,
        startHeldActionSound,
        startHeldMovementSound,
      },
    )

    const fctx = makeFrameContext(drill)
    handler.tick(fctx)
    expect(startHeldActionSound).not.toHaveBeenCalled()

    drillPrivate.drilling = true
    ;(drillPrivate.drill as { isDrilling: boolean }).isDrilling = true
    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)
    expect(startHeldActionSound).toHaveBeenCalledWith('sfx.drillStart')

    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)

    drillPrivate.drilling = false
    ;(drillPrivate.drill as { isDrilling: boolean }).isDrilling = false
    handler.tick(fctx)
    expect(heldHandle.stop).toHaveBeenCalledTimes(1)

    drillPrivate.swingAngle = 0
    drillPrivate.targetSwing = 0.5
    handler.tick(fctx)
    expect(startHeldMovementSound).toHaveBeenCalledTimes(1)
    expect(startHeldMovementSound).toHaveBeenCalledWith('sfx.mastMove')

    drillPrivate.swingAngle = 0.5
    drillPrivate.targetSwing = 0.5
    handler.tick(fctx)
    expect(mastHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('stops all drill-owned sounds when leaving active mode', () => {
    const drillHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => drillHandle)
    const mastHandle = makeHandle()
    const startHeldMovementSound = vi.fn(() => mastHandle)
    const drill = new DrillController()
    const drillPrivate = drill as unknown as Record<string, unknown>
    drillPrivate.drilling = true
    drillPrivate.drill = {
      isDrilling: true,
      progress: 0.4,
    }
    drillPrivate.swingAngle = 0
    drillPrivate.targetSwing = 0.5

    const handler = createDrillTickHandler(
      {
        crosshairVisible: ref(false),
        crosshairColor: ref<'green' | 'red'>('red'),
        crosshairX: ref(0),
        crosshairY: ref(0),
        drillProgress: ref(0),
        isDrilling: ref(false),
      },
      {
        sampleToastRef: ref(null),
        playerMod: () => 1,
        awardSP: () => null,
        startHeldActionSound,
        startHeldMovementSound,
      },
    )

    const activeCtx = makeFrameContext(drill)
    handler.tick(activeCtx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)
    expect(startHeldMovementSound).toHaveBeenCalledTimes(1)

    const instrumentRover = { ...activeCtx.rover!, mode: 'instrument' } as SiteFrameContext['rover']
    handler.tick(makeFrameContext(drill, { rover: instrumentRover }))
    expect(drillHandle.stop).toHaveBeenCalledTimes(1)
    expect(mastHandle.stop).toHaveBeenCalledTimes(1)
  })

  it('starts the DAN sound while passive scanning is enabled and stops it when disabled', () => {
    const heldHandle = makeHandle()
    const startHeldActionSound = vi.fn(() => heldHandle)
    const dan = new DANController()

    const handler = createDanTickHandler(
      {
        siteTerrainParams: ref(null),
        danTotalSamples: ref(0),
        danHitAvailable: ref(false),
        danProspectPhase: ref('idle'),
        danProspectProgress: ref(0),
        danSignalStrength: ref(0),
        danWaterResult: ref(null),
        danDialogVisible: ref(false),
        passiveUiRevision: ref(0),
        siteLat: ref(0),
        siteLon: ref(0),
        roverWorldX: ref(0),
        roverWorldZ: ref(0),
        roverSpawnXZ: ref({ x: 0, z: 0 }),
      },
      {
        siteId: 'test-site',
        sampleToastRef: ref(null),
        playerMod: () => 1,
        awardDAN: () => null,
        triggerDanAchievement: () => null,
        archiveDanProspect: () => null,
        startHeldActionSound,
      },
    )

    const fctx = makeFrameContext(dan)
    handler.tick(fctx)
    expect(startHeldActionSound).not.toHaveBeenCalled()

    dan.passiveSubsystemEnabled = true
    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)
    expect(startHeldActionSound).toHaveBeenCalledWith('sfx.danScan')

    handler.tick(fctx)
    expect(startHeldActionSound).toHaveBeenCalledTimes(1)

    dan.passiveSubsystemEnabled = false
    handler.tick(fctx)
    expect(heldHandle.stop).toHaveBeenCalledTimes(1)
  })
})
