import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as THREE from 'three'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext } from '../SiteFrameContext'
import { createPassiveSystemsAudioTickHandler } from '../PassiveSystemsAudioTickHandler'

function makeFctx(overrides: Partial<SiteFrameContext> = {}): SiteFrameContext {
  return {
    sceneDelta: 0.016,
    skyDelta: 0.016,
    simulationTime: 0,
    camera: new THREE.PerspectiveCamera(),
    siteScene: {
      rover: { position: new THREE.Vector3() },
      terrain: { heightAt: () => 0 },
      scene: new THREE.Scene(),
    } as unknown as SiteFrameContext['siteScene'],
    rover: null,
    roverReady: true,
    isSleeping: false,
    nightFactor: 0,
    thermalZone: 'OPTIMAL',
    marsSol: 1,
    marsTimeOfDay: 0.25,
    totalSP: 0,
    activeInstrumentSlot: null,
    windMs: 3,
    dustStormPhase: 'none',
    dustStormLevel: null,
    radiationLevel: 0,
    ...overrides,
  }
}

function makeHandle(): AudioPlaybackHandle {
  return {
    soundId: 'test',
    stop: vi.fn(),
    playing: () => true,
    progress: () => 0,
    duration: () => 0,
    setVolume: vi.fn(),
  }
}

describe('PassiveSystemsAudioTickHandler', () => {
  it('starts heater but delays RTG until the intro sequence is complete', () => {
    const handles = [makeHandle(), makeHandle()]
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const handler = createPassiveSystemsAudioTickHandler(
      { descending: ref(false), deploying: ref(true), heaterHeatBoostActive: ref(false), heaterEffectiveW: ref(0), remsSurveying: ref(false), radSurveying: ref(false) },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume: vi.fn(), showToast: vi.fn() },
    )

    handler.tick(makeFctx({ roverReady: true }))

    expect(playAmbientLoop).toHaveBeenCalledTimes(1)
    expect(playAmbientLoop).toHaveBeenCalledWith('ambient.heater')
  })

  it('waits until the rover is ready before starting passive system audio', () => {
    const playAmbientLoop = vi.fn()
    const handler = createPassiveSystemsAudioTickHandler(
      { descending: ref(false), deploying: ref(false), heaterHeatBoostActive: ref(false), heaterEffectiveW: ref(0), remsSurveying: ref(false), radSurveying: ref(false) },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume: vi.fn(), showToast: vi.fn() },
    )

    handler.tick(makeFctx({ roverReady: false }))

    expect(playAmbientLoop).not.toHaveBeenCalled()
  })

  it('keeps passive ambients silent while intro cinematic covers the site', () => {
    const playAmbientLoop = vi.fn()
    const handler = createPassiveSystemsAudioTickHandler(
      { descending: ref(false), deploying: ref(false), heaterHeatBoostActive: ref(false), heaterEffectiveW: ref(0), remsSurveying: ref(false), radSurveying: ref(false) },
      {
        playAmbientLoop,
        playActionSound: vi.fn(),
        setAmbientVolume: vi.fn(),
        showToast: vi.fn(),
        passiveAmbienceAudible: () => false,
      },
    )

    handler.tick(makeFctx({ roverReady: true }))

    expect(playAmbientLoop).not.toHaveBeenCalled()
  })

  it('keeps a quiet constant RTG bed even with heater off', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createPassiveSystemsAudioTickHandler(
      { descending: ref(false), deploying: ref(false), heaterHeatBoostActive: ref(false), heaterEffectiveW: ref(0), remsSurveying: ref(false), radSurveying: ref(false) },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume, showToast: vi.fn() },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx())
    }

    const rtgCalls = setAmbientVolume.mock.calls.filter(
      (_call, idx: number) => idx % 2 === 0,
    )
    const heaterCalls = setAmbientVolume.mock.calls.filter(
      (_call, idx: number) => idx % 2 === 1,
    )
    const lastRtgVolume = rtgCalls[rtgCalls.length - 1][1] as number
    const lastHeaterVolume = heaterCalls[heaterCalls.length - 1][1] as number

    expect(lastRtgVolume).toBeGreaterThan(0.06)
    expect(lastHeaterVolume).toBe(0)
  })

  it('raises heater volume when effective heater wattage is active', () => {
    const setAmbientVolume = vi.fn()
    const heaterEffectiveW = ref(12)
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createPassiveSystemsAudioTickHandler(
      { descending: ref(false), deploying: ref(false), heaterHeatBoostActive: ref(false), heaterEffectiveW, remsSurveying: ref(false), radSurveying: ref(false) },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume, showToast: vi.fn() },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx())
    }

    const heaterCalls = setAmbientVolume.mock.calls.filter(
      (_call, idx: number) => idx % 2 === 1,
    )
    const lastHeaterVolume = heaterCalls[heaterCalls.length - 1][1] as number

    expect(lastHeaterVolume).toBeGreaterThan(0.15)
  })

  it('stops both passive loops on dispose', () => {
    const handles = [makeHandle(), makeHandle()]
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const handler = createPassiveSystemsAudioTickHandler(
      { descending: ref(false), deploying: ref(false), heaterHeatBoostActive: ref(false), heaterEffectiveW: ref(0), remsSurveying: ref(false), radSurveying: ref(false) },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume: vi.fn(), showToast: vi.fn() },
    )

    handler.tick(makeFctx())
    handler.dispose()

    expect(handles[0].stop).toHaveBeenCalled()
    expect(handles[1].stop).toHaveBeenCalled()
  })

  it('starts RTG once deploying and descending are both finished', () => {
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const descending = ref(false)
    const deploying = ref(true)
    const handler = createPassiveSystemsAudioTickHandler(
      { descending, deploying, heaterHeatBoostActive: ref(false), heaterEffectiveW: ref(0), remsSurveying: ref(false), radSurveying: ref(false) },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume: vi.fn(), showToast: vi.fn() },
    )

    handler.tick(makeFctx({ roverReady: true }))
    deploying.value = false
    handler.tick(makeFctx({ roverReady: true }))

    expect(playAmbientLoop).toHaveBeenNthCalledWith(1, 'ambient.heater')
    expect(playAmbientLoop).toHaveBeenNthCalledWith(2, 'ambient.rtg')
  })

  it('keeps the heater hum alive while heater overdrive heat boost is active', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createPassiveSystemsAudioTickHandler(
      {
        descending: ref(false),
        deploying: ref(false),
        heaterHeatBoostActive: ref(true),
        heaterEffectiveW: ref(0),
        remsSurveying: ref(false),
        radSurveying: ref(false),
      },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume, showToast: vi.fn() },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx())
    }

    const heaterCalls = setAmbientVolume.mock.calls.filter(
      (_call, idx: number) => idx % 2 === 1,
    )
    const lastHeaterVolume = heaterCalls[heaterCalls.length - 1][1] as number

    expect(lastHeaterVolume).toBeGreaterThan(0.06)
  })

  it('plays the heater off cue when heater audio falls silent', () => {
    const setAmbientVolume = vi.fn()
    const playActionSound = vi.fn()
    const heaterEffectiveW = ref(12)
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createPassiveSystemsAudioTickHandler(
      {
        descending: ref(false),
        deploying: ref(false),
        heaterHeatBoostActive: ref(false),
        heaterEffectiveW,
        remsSurveying: ref(false),
        radSurveying: ref(false),
      },
      { playAmbientLoop, playActionSound, setAmbientVolume, showToast: vi.fn() },
    )

    handler.tick(makeFctx())
    expect(playActionSound).not.toHaveBeenCalled()

    heaterEffectiveW.value = 0
    handler.tick(makeFctx())

    expect(playActionSound).toHaveBeenCalledTimes(1)
    expect(playActionSound).toHaveBeenCalledWith('sfx.heaterOff')
  })

  it('starts and stops the REMS ambient loop with surveying state', () => {
    const handles = [makeHandle(), makeHandle(), makeHandle()]
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const remsSurveying = ref(false)
    const handler = createPassiveSystemsAudioTickHandler(
      {
        descending: ref(false),
        deploying: ref(false),
        heaterHeatBoostActive: ref(false),
        heaterEffectiveW: ref(0),
        remsSurveying,
        radSurveying: ref(false),
      },
      { playAmbientLoop, playActionSound: vi.fn(), setAmbientVolume: vi.fn(), showToast: vi.fn() },
    )

    handler.tick(makeFctx())
    expect(playAmbientLoop).toHaveBeenCalledTimes(2)

    remsSurveying.value = true
    handler.tick(makeFctx())
    expect(playAmbientLoop).toHaveBeenCalledTimes(3)
    expect(playAmbientLoop).toHaveBeenLastCalledWith('ambient.rems')

    remsSurveying.value = false
    handler.tick(makeFctx())
    expect(handles[2].stop).toHaveBeenCalledTimes(1)
  })
})
